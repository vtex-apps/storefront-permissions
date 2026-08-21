#!/usr/bin/env python3
"""Deterministic log-coverage scorer for TypeScript/JavaScript repositories.

Scores failure-handling paths (`try/catch` blocks and `.catch(...)` callbacks) in
the audited scope. Every handler is classified as covered / insufficient /
missing, and the score is `covered / total`.

This is a proxy metric, and it is deterministic on purpose: the same tree always
yields the same number, which is what makes baseline comparison meaningful. It is
deliberately *not* the same number a model produces when it judges log coverage
by hand, which also weighs validation aborts and cross-function context.

Everything repository-specific lives in `.log-coverage.json` at the repo root, so
this file is identical across apps. See the `log-coverage-setup` skill for the
config contract.

Subcommands:
  scan     Scan the scope and print metrics (json or text).
  report   Write the per-PR report folder and refresh the baseline (run locally).
  check    Emit a markdown PR-comment body comparing head against the base
           baseline, and gate on the committed report. With `--strict`, exits
           non-zero when a required report is missing or stale.
"""
from __future__ import annotations

import argparse
import functools
import hashlib
import json
import os
import re
import subprocess
import sys
from collections.abc import Iterable
from datetime import date
from pathlib import Path, PurePosixPath

CONFIG_FILENAME = ".log-coverage.json"

# Everything below is repository-specific and is replaced by `configure()` from
# .log-coverage.json before any command runs. They stay module-level because the
# whole call graph reads them, and because tests patch them directly.
REPO_ROOT = Path.cwd()
SCOPE: tuple[str, ...] = ()
EXCLUDED_PARTS: tuple[str, ...] = ("__tests__", "node_modules", "dist", "build")
BASELINE_PATH = Path("docs/log-coverage/baseline.json")
REPORTS_DIR = Path("docs/log-coverage/reports")
JUDGED_AUDIT_GLOBS: tuple[str, ...] = ()
# Paths that demand a fresh report even though they are not audited sources —
# typically this script itself, since editing it can move the metrics.
REPORT_TRIGGERS: tuple[str, ...] = ()

CONFIG_DEFAULTS = {
    "exclude": list(EXCLUDED_PARTS),
    "baseline": BASELINE_PATH.as_posix(),
    "reportsDir": REPORTS_DIR.as_posix(),
    "judgedAuditGlobs": [],
    "reportTriggers": [],
    # Shown to developers in the PR comment. `{pr}` is substituted. Repos with the
    # Makefile targets installed override this with `make log-coverage-report PR={pr}`.
    "reportCommand": "python3 scripts/log_coverage/audit.py report --pr {pr}",
    # Optional in-repo doc to link from the comment. Omitted when empty.
    "docsPath": "",
}

REPORT_COMMAND = CONFIG_DEFAULTS["reportCommand"]
DOCS_PATH = ""


def report_command(pr: str | None) -> str:
    return REPORT_COMMAND.format(pr=pr or "<number>")

SCHEMA_VERSION = 1
SUPPRESSION_MARKER = "log-coverage-ignore"
# Lets the workflow find and update its own comment instead of stacking new ones.
COMMENT_MARKER = "<!-- log-coverage-report -->"

REPORT_NOT_REQUIRED = "not-required"
REPORT_MISSING = "missing"
REPORT_STALE = "stale"
REPORT_FRESH = "fresh"
BLOCKING_REPORT_STATES = (REPORT_MISSING, REPORT_STALE)

CATCH_BLOCK_RE = re.compile(r"\bcatch\s*(?:\([^()]*\)\s*)?\{")
DOT_CATCH_RE = re.compile(r"\.\s*catch\s*\(")

# `ctx.vtex.logger.warn(` matches on the `logger.warn(` tail: `\b` holds between
# the dot and the identifier.
LOG_CALL_RE = re.compile(
    r"\b(?:console|log|logger|[A-Za-z_$][\w$]*[Ll]og(?:ger)?)"
    r"\s*\.\s*(info|warn|warning|error|debug|trace|fatal)\s*\("
)
ERROR_CONTEXT_RE = re.compile(
    r"\berr(?:or)?\w*\b|\bexception\b|\bstack\b|\.message\b", re.IGNORECASE
)
RETHROW_RE = re.compile(r"\bthrow\b")

# A `/` opens a regex literal only where a value cannot already have ended.
REGEX_PREV_KEYWORDS = frozenset(
    (
        "return",
        "typeof",
        "case",
        "in",
        "of",
        "new",
        "delete",
        "void",
        "throw",
        "do",
        "else",
        "yield",
        "await",
    )
)
REGEX_PREV_PUNCTUATION = frozenset("(,=:[!&|?{};+-*/%~^<>")

STATUS_COVERED = "covered"
STATUS_INSUFFICIENT = "insufficient"
STATUS_MISSING = "missing"


# --------------------------------------------------------------------------- #
# Source masking
# --------------------------------------------------------------------------- #


def _regex_allowed(masked: list[str], index: int) -> bool:
    """Whether a `/` at `index` can start a regex literal rather than divide."""
    cursor = index - 1
    while cursor >= 0 and masked[cursor] in " \t\r\n":
        cursor -= 1

    if cursor < 0:
        return True

    char = masked[cursor]

    if char in REGEX_PREV_PUNCTUATION:
        return True

    if char.isalnum() or char in "_$":
        end = cursor + 1
        while cursor >= 0 and (masked[cursor].isalnum() or masked[cursor] in "_$"):
            cursor -= 1

        return "".join(masked[cursor + 1 : end]) in REGEX_PREV_KEYWORDS

    return False


class _SourceMasker:
    """Blanks comment, string, template and regex spans while keeping offsets.

    Brace and paren matching runs on the mask, so a `}` inside a string or a
    comment can never terminate a handler body. Newlines survive masking, so line
    numbers still line up with the original source. Template interpolations keep
    their braces: `${` becomes ` {`, which balances against the closing `}`.
    """

    def __init__(self, source: str) -> None:
        self.source = source
        self.out = list(source)
        self.length = len(source)
        self.index = 0
        self.in_template = False
        self.brace_depth = 0
        self.interpolation_depths: list[int] = []

    def run(self) -> str:
        while self.index < self.length:
            if self.in_template:
                self._consume_template_char()
            else:
                self._consume_code_char()

        return "".join(self.out)

    def _blank(self, start: int, end: int) -> None:
        for cursor in range(start, min(end, self.length)):
            if self.out[cursor] != "\n":
                self.out[cursor] = " "

    def _peek(self) -> str:
        return self.source[self.index + 1] if self.index + 1 < self.length else ""

    def _consume_template_char(self) -> None:
        char = self.source[self.index]

        if char == "\\":
            self._blank(self.index, self.index + 2)
            self.index += 2
        elif char == "`":
            self._blank(self.index, self.index + 1)
            self.in_template = False
            self.index += 1
        elif char == "$" and self._peek() == "{":
            self._enter_interpolation()
        else:
            self._blank(self.index, self.index + 1)
            self.index += 1

    def _consume_code_char(self) -> None:
        char = self.source[self.index]
        following = self._peek()

        if char == "/" and following == "/":
            self._skip_line_comment()
        elif char == "/" and following == "*":
            self._skip_block_comment()
        elif char in "'\"":
            self._skip_quoted(char)
        elif char == "`":
            self._enter_template()
        elif char == "/" and _regex_allowed(self.out, self.index):
            self._skip_regex()
        else:
            self._track_brace(char)
            self.index += 1

    def _enter_interpolation(self) -> None:
        # Only the `$` is blanked: the `{` has to survive so it balances against
        # the `}` that closes the interpolation.
        self._blank(self.index, self.index + 1)
        self.interpolation_depths.append(self.brace_depth)
        self.brace_depth += 1
        self.in_template = False
        self.index += 2

    def _enter_template(self) -> None:
        self._blank(self.index, self.index + 1)
        self.in_template = True
        self.index += 1

    def _skip_line_comment(self) -> None:
        end = self.source.find("\n", self.index)
        end = self.length if end == -1 else end
        self._blank(self.index, end)
        self.index = end

    def _skip_block_comment(self) -> None:
        end = self.source.find("*/", self.index + 2)
        end = self.length if end == -1 else end + 2
        self._blank(self.index, end)
        self.index = end

    def _skip_quoted(self, quote: str) -> None:
        cursor = self.index + 1
        while cursor < self.length:
            char = self.source[cursor]
            if char == "\\":
                cursor += 2
                continue
            if char in (quote, "\n"):
                break
            cursor += 1

        self._blank(self.index, cursor + 1)
        self.index = cursor + 1

    def _skip_regex(self) -> None:
        cursor = self.index + 1
        in_character_class = False

        while cursor < self.length:
            char = self.source[cursor]
            if char == "\\":
                cursor += 2
                continue
            if char == "\n":
                break
            if char == "[":
                in_character_class = True
            elif char == "]":
                in_character_class = False
            elif char == "/" and not in_character_class:
                cursor += 1
                while cursor < self.length and self.source[cursor].isalpha():
                    cursor += 1
                break
            cursor += 1

        self._blank(self.index, cursor)
        self.index = cursor

    def _track_brace(self, char: str) -> None:
        if char == "{":
            self.brace_depth += 1
        elif char == "}":
            self.brace_depth -= 1
            if (
                self.interpolation_depths
                and self.brace_depth == self.interpolation_depths[-1]
            ):
                self.interpolation_depths.pop()
                self.in_template = True


def mask_source(source: str) -> str:
    return _SourceMasker(source).run()


def match_delimiter(masked: str, start: int) -> int:
    """Index of the delimiter closing the one at `start`, or -1 if unbalanced."""
    pairs = {"{": "}", "(": ")", "[": "]"}
    opener = masked[start]
    closer = pairs[opener]
    depth = 0

    for index in range(start, len(masked)):
        char = masked[index]
        if char == opener:
            depth += 1
        elif char == closer:
            depth -= 1
            if depth == 0:
                return index

    return -1


# --------------------------------------------------------------------------- #
# Classification
# --------------------------------------------------------------------------- #


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def classify(masked_body: str) -> str:
    """Bucket a handler body into covered / insufficient / missing.

    Runs on the masked body so that the word "error" inside a message string
    cannot pass as error context.
    """
    log_calls = list(LOG_CALL_RE.finditer(masked_body))

    for call in log_calls:
        args_start = call.end() - 1
        args_end = match_delimiter(masked_body, args_start)
        args = masked_body[args_start : args_end + 1 if args_end != -1 else len(masked_body)]
        if ERROR_CONTEXT_RE.search(args):
            return STATUS_COVERED

    # A rethrow reaches the @vtex/api unhandled-error path, so the failure is
    # never silent even without a log call of its own.
    if RETHROW_RE.search(masked_body):
        return STATUS_COVERED

    return STATUS_INSUFFICIENT if log_calls else STATUS_MISSING


def is_suppressed(source: str, line: int) -> bool:
    """True when the handler line or the line above carries the opt-out marker."""
    lines = source.splitlines()
    window = lines[max(0, line - 2) : line]

    return any(SUPPRESSION_MARKER in candidate for candidate in window)


def scan_file(path: Path, relative: str) -> list[dict]:
    source = path.read_text(encoding="utf-8", errors="replace")
    masked = mask_source(source)
    handlers: list[dict] = []

    candidates: list[tuple[int, str, str]] = []
    for match in CATCH_BLOCK_RE.finditer(masked):
        candidates.append((match.start(), "catch-block", "{"))
    for match in DOT_CATCH_RE.finditer(masked):
        candidates.append((match.start(), "promise-catch", "("))

    for start, kind, opener in sorted(candidates):
        delimiter = masked.index(opener, start)
        end = match_delimiter(masked, delimiter)
        if end == -1:
            continue

        body = source[delimiter + 1 : end]
        masked_body = masked[delimiter + 1 : end]
        line = source.count("\n", 0, start) + 1

        if is_suppressed(source, line):
            continue

        handlers.append(
            {
                "file": relative,
                "line": line,
                "kind": kind,
                "status": classify(masked_body),
                "snippet": normalize(body)[:140],
                "_fingerprint": normalize(body),
            }
        )

    return handlers


def assign_ids(handlers: list[dict]) -> None:
    """Give every handler an id that survives unrelated line shifts.

    The id hashes file + kind + normalized body instead of the line number, so
    editing code above a finding does not read as a new finding. Identical bodies
    in one file are disambiguated by their order of appearance.
    """
    seen: dict[str, int] = {}

    for handler in handlers:
        seed = f"{handler['file']}|{handler['kind']}|{handler.pop('_fingerprint')}"
        digest = hashlib.sha1(seed.encode("utf-8")).hexdigest()[:12]
        occurrence = seen.get(digest, 0) + 1
        seen[digest] = occurrence
        handler["id"] = digest if occurrence == 1 else f"{digest}-{occurrence}"


def resolve_files(scope: tuple[str, ...]) -> list[Path]:
    files: set[Path] = set()

    for pattern in scope:
        for path in REPO_ROOT.glob(pattern):
            if not path.is_file():
                continue
            if any(part in EXCLUDED_PARTS for part in path.relative_to(REPO_ROOT).parts):
                continue
            files.add(path)

    return sorted(files)


def scan(scope: tuple[str, ...] | None = None) -> dict:
    scope = SCOPE if scope is None else tuple(scope)
    handlers: list[dict] = []

    for path in resolve_files(scope):
        handlers.extend(scan_file(path, path.relative_to(REPO_ROOT).as_posix()))

    handlers.sort(key=lambda handler: (handler["file"], handler["line"]))
    assign_ids(handlers)

    counts = {
        STATUS_COVERED: 0,
        STATUS_INSUFFICIENT: 0,
        STATUS_MISSING: 0,
    }
    for handler in handlers:
        counts[handler["status"]] += 1

    total = len(handlers)
    percent = round(counts[STATUS_COVERED] / total * 100, 1) if total else 0.0

    return {
        "schemaVersion": SCHEMA_VERSION,
        "scope": list(scope),
        "score": {
            "covered": counts[STATUS_COVERED],
            "insufficient": counts[STATUS_INSUFFICIENT],
            "missing": counts[STATUS_MISSING],
            "total": total,
            "percent": percent,
        },
        "handlers": [
            {key: handler[key] for key in ("id", "file", "line", "kind", "status", "snippet")}
            for handler in handlers
        ],
    }


# --------------------------------------------------------------------------- #
# Comparison
# --------------------------------------------------------------------------- #

EMPTY_METRICS = {
    "schemaVersion": SCHEMA_VERSION,
    "scope": [],
    "score": {
        "covered": 0,
        "insufficient": 0,
        "missing": 0,
        "total": 0,
        "percent": 0.0,
    },
    "handlers": [],
}


def compare(baseline: dict, current: dict) -> dict:
    before = {handler["id"]: handler for handler in baseline.get("handlers", [])}
    after = {handler["id"]: handler for handler in current.get("handlers", [])}

    regressed = [
        handler
        for handler_id, handler in after.items()
        if handler["status"] != STATUS_COVERED
        and (handler_id not in before or before[handler_id]["status"] == STATUS_COVERED)
    ]
    resolved = [
        handler
        for handler_id, handler in before.items()
        if handler["status"] != STATUS_COVERED
        and (handler_id not in after or after[handler_id]["status"] == STATUS_COVERED)
    ]

    regressed.sort(key=lambda handler: (handler["file"], handler["line"]))
    resolved.sort(key=lambda handler: (handler["file"], handler["line"]))

    return {
        "baselineScore": baseline.get("score", EMPTY_METRICS["score"]),
        "currentScore": current["score"],
        "percentDelta": round(
            current["score"]["percent"]
            - baseline.get("score", EMPTY_METRICS["score"])["percent"],
            1,
        ),
        "regressed": regressed,
        "resolved": resolved,
    }


def read_baseline_from_ref(ref: str) -> dict | None:
    """Read the baseline as committed on `ref`, so re-runs stay idempotent."""
    try:
        blob = subprocess.run(
            ["git", "show", f"{ref}:{BASELINE_PATH.as_posix()}"],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            check=True,
        ).stdout
    except (subprocess.CalledProcessError, OSError):
        return None

    try:
        return json.loads(blob)
    except json.JSONDecodeError:
        return None


class ConfigError(RuntimeError):
    """Raised when .log-coverage.json is missing, malformed, or has no scope."""


def find_repo_root(explicit: str | None = None) -> Path:
    """Locate the repository root without depending on where this file sits.

    Deriving it from `__file__` would hardcode the script's install path, which
    is exactly the coupling that makes a scorer non-portable.
    """
    if explicit:
        return Path(explicit).resolve()

    try:
        top = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
        if top:
            return Path(top)
    except (subprocess.CalledProcessError, OSError):
        pass

    return Path.cwd()


def load_config(repo_root: Path) -> dict:
    path = repo_root / CONFIG_FILENAME

    if not path.is_file():
        raise ConfigError(
            f"{CONFIG_FILENAME} not found at {repo_root}. "
            "Run the log-coverage-setup skill to create it."
        )

    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise ConfigError(f"{CONFIG_FILENAME} is not valid JSON: {error}") from error

    if not isinstance(raw, dict):
        raise ConfigError(f"{CONFIG_FILENAME} must contain a JSON object.")

    scope = raw.get("scope")
    # No default scope: guessing a layout would silently scan nothing and report
    # a meaningless 0/0. Every repo declares its own audited surface.
    if not isinstance(scope, list) or not scope:
        raise ConfigError(
            f"{CONFIG_FILENAME} must declare a non-empty \"scope\" array of globs, "
            'e.g. ["node/clients/**/*.ts", "node/middlewares/**/*.ts"].'
        )

    return {**CONFIG_DEFAULTS, **raw}


def configure(repo_root_arg: str | None = None) -> dict:
    """Bind the repository-specific globals from .log-coverage.json."""
    global REPO_ROOT, SCOPE, EXCLUDED_PARTS
    global BASELINE_PATH, REPORTS_DIR, JUDGED_AUDIT_GLOBS, REPORT_TRIGGERS
    global REPORT_COMMAND, DOCS_PATH

    REPO_ROOT = find_repo_root(repo_root_arg)
    config = load_config(REPO_ROOT)

    SCOPE = tuple(config["scope"])
    EXCLUDED_PARTS = tuple(config["exclude"])
    BASELINE_PATH = Path(config["baseline"])
    REPORTS_DIR = Path(config["reportsDir"])
    JUDGED_AUDIT_GLOBS = tuple(config["judgedAuditGlobs"])
    REPORT_TRIGGERS = tuple(config["reportTriggers"])
    REPORT_COMMAND = config["reportCommand"]
    DOCS_PATH = config["docsPath"]

    return config


@functools.lru_cache(maxsize=256)
def glob_to_regex(pattern: str) -> re.Pattern[str]:
    """Translate a glob into a regex with the same semantics as `Path.glob`.

    `PurePath.match` cannot be used here: it treats `**` as `*` and is not
    recursive, so `node/clients/**/*.ts` would fail to match a direct child like
    `node/clients/lm.ts`. That mismatch is invisible with shallow globs and
    silently opens a hole in the gate as soon as a scope uses `**`.
    """
    out: list[str] = []
    index = 0

    while index < len(pattern):
        if pattern.startswith("**/", index):
            out.append("(?:[^/]+/)*")
            index += 3
        elif pattern.startswith("**", index):
            out.append(".*")
            index += 2
        elif pattern[index] == "*":
            out.append("[^/]*")
            index += 1
        elif pattern[index] == "?":
            out.append("[^/]")
            index += 1
        else:
            out.append(re.escape(pattern[index]))
            index += 1

    return re.compile(f"^{''.join(out)}$")


def matches_any(path: str, patterns: Iterable[str]) -> bool:
    """True when `path` is inside the audited surface.

    Excluded directories are applied here as well, so a broad scope such as
    `node/**/*.ts` treats `node/__tests__/x.test.ts` the same way the scanner
    does — skipped, not audited.
    """
    if any(part in EXCLUDED_PARTS for part in PurePosixPath(path).parts):
        return False

    return any(glob_to_regex(pattern).match(path) for pattern in patterns)


def changed_files(ref: str) -> list[str] | None:
    """Paths changed since the merge base with `ref`, or None if git can't tell."""
    try:
        diff = subprocess.run(
            ["git", "diff", "--name-only", f"{ref}...HEAD"],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            check=True,
        ).stdout
    except (subprocess.CalledProcessError, OSError):
        return None

    return [line for line in diff.splitlines() if line]


def report_requirement(diff_ref: str | None, scope: Iterable[str]) -> tuple[bool, str]:
    """Whether this branch has to carry a report, and why.

    Without a diff ref (local runs) the report is always required. With one, it is
    required only when the change actually touches audited code — a docs-only PR
    has nothing to record. If git cannot produce the diff we fail closed and ask
    for the report, so a shallow clone can never quietly disable the gate.
    """
    if not diff_ref:
        return True, "run without a diff ref"

    changed = changed_files(diff_ref)
    if changed is None:
        return True, f"could not diff against `{diff_ref}`"

    audited = [path for path in changed if matches_any(path, tuple(scope))]
    tooling = [path for path in changed if matches_any(path, REPORT_TRIGGERS)]

    if audited:
        noun = "file" if len(audited) == 1 else "files"

        return True, f"{len(audited)} audited {noun} changed"

    # Reported separately: "audited file changed" would send the developer looking
    # for a source change that is not in the diff.
    if tooling:
        return True, f"the scorer changed (`{tooling[0]}`)"

    return False, "no audited file changed"


def evaluate_report(pr: str, metrics: dict, required: bool, reason: str) -> tuple[str, str]:
    """Classify the committed report as not-required / missing / stale / fresh."""
    path = REPO_ROOT / REPORTS_DIR / f"pr-{pr}" / "metrics.json"
    expected = f"`{REPORTS_DIR.as_posix()}/pr-{pr}/metrics.json`"
    regenerate = f"Run `{report_command(pr)}` and commit the result."

    if not required:
        return (
            REPORT_NOT_REQUIRED,
            f"Not required — {reason}, so there is nothing to record.",
        )

    if not path.is_file():
        return (
            REPORT_MISSING,
            f"**Missing** — {expected} is not committed ({reason}). {regenerate}",
        )

    # Compared parsed, not byte-for-byte: the report command may run the written
    # JSON through Prettier, which reflows short arrays.
    if json.loads(path.read_text(encoding="utf-8")) != metrics:
        return (
            REPORT_STALE,
            f"**Stale** — {expected} does not match a fresh scan of this branch. "
            f"{regenerate}",
        )

    return REPORT_FRESH, f"Up to date — {expected} matches this branch."


def resolve_baseline(ref: str | None) -> tuple[dict, str]:
    if ref:
        from_ref = read_baseline_from_ref(ref)
        if from_ref is not None:
            return from_ref, ref

    on_disk = REPO_ROOT / BASELINE_PATH
    if on_disk.is_file():
        return json.loads(on_disk.read_text(encoding="utf-8")), "working tree"

    return dict(EMPTY_METRICS), "none"


# --------------------------------------------------------------------------- #
# Rendering
# --------------------------------------------------------------------------- #


def format_score(score: dict) -> str:
    return (
        f"{score['covered']}/{score['total']} = {score['percent']}% "
        f"(missing {score['missing']}, insufficient {score['insufficient']})"
    )


def render_table(handlers: list[dict]) -> str:
    if not handlers:
        return "_none_\n"

    rows = ["| file:line | kind | status | body |", "|---|---|---|---|"]
    for handler in handlers:
        body = handler["snippet"].replace("|", "\\|")
        rows.append(
            f"| `{handler['file']}:{handler['line']}` | {handler['kind']} "
            f"| **{handler['status']}** | `{body}` |"
        )

    return "\n".join(rows) + "\n"


def link_from_report(pr: str | None, target: Path) -> str:
    """Relative link from a per-PR report folder to a repo path.

    Computed rather than hardcoded, because `reportsDir` is configurable and need
    not sit under `docs/`.
    """
    report_dir = REPO_ROOT / REPORTS_DIR / f"pr-{pr}"

    return PurePosixPath(
        os.path.relpath(REPO_ROOT / target, report_dir)
    ).as_posix()


def judged_audit_note(pr: str | None = None) -> str:
    audits: list[Path] = []
    for pattern in JUDGED_AUDIT_GLOBS:
        audits.extend(path for path in REPO_ROOT.glob(pattern) if path.is_file())

    if not audits:
        return ""

    links = ", ".join(
        f"[`{path.name}`]({link_from_report(pr, path.relative_to(REPO_ROOT))})"
        # Keyed on the stem, not the name: the `.md` suffix sorts after the `-r2`
        # revision marker, which would list a superseded audit ahead of the current one.
        for path in sorted(set(audits), key=lambda path: path.stem, reverse=True)[:3]
    )

    return f" Judged audits: {links}."


def docs_note(pr: str | None = None) -> str:
    if not DOCS_PATH:
        return ""

    return f" See [`{DOCS_PATH}`]({link_from_report(pr, Path(DOCS_PATH))})."


def render_delta_section(delta: dict, baseline_origin: str) -> str:
    arrow = "no change"
    if delta["percentDelta"] > 0:
        arrow = f"up {delta['percentDelta']} pp"
    elif delta["percentDelta"] < 0:
        arrow = f"down {abs(delta['percentDelta'])} pp"

    lines = [
        f"- **Baseline** ({baseline_origin}): {format_score(delta['baselineScore'])}",
        f"- **This branch**: {format_score(delta['currentScore'])}",
        f"- **Delta**: {arrow}",
        "",
        f"### New or regressed ({len(delta['regressed'])})",
        "",
        render_table(delta["regressed"]),
        f"### Resolved or removed ({len(delta['resolved'])})",
        "",
        render_table(delta["resolved"]),
    ]

    return "\n".join(lines)


def render_report(pr: str, metrics: dict, delta: dict, baseline_origin: str) -> str:
    findings = [
        handler for handler in metrics["handlers"] if handler["status"] != STATUS_COVERED
    ]

    return "\n".join(
        [
            f"# Log coverage — PR #{pr}",
            "",
            f"**Date:** {date.today().isoformat()}  ",
            f"**Scope:** {', '.join(f'`{pattern}`' for pattern in metrics['scope'])}  ",
            f"**Score:** {format_score(metrics['score'])}",
            "",
            "Deterministic proxy metric over `try/catch` and `.catch(...)` handlers. "
            "It is not a model-judged audit score, which also weighs validation "
            "aborts and cross-function context."
            f"{judged_audit_note(pr)}{docs_note(pr)}",
            "",
            "## Delta",
            "",
            render_delta_section(delta, baseline_origin),
            f"## All open findings ({len(findings)})",
            "",
            render_table(findings),
        ]
    )


def render_comment(
    pr: str | None,
    metrics: dict,
    delta: dict,
    baseline_origin: str,
    state: str,
    message: str,
) -> str:
    verdict = (
        "This check is **failing** until the report is committed."
        if state in BLOCKING_REPORT_STATES
        else "This check is **passing**."
    )

    return "\n".join(
        [
            COMMENT_MARKER,
            "## Log coverage",
            "",
            f"Deterministic proxy metric — **{format_score(metrics['score'])}**. "
            "The score itself never blocks: a regression is a review signal, not a "
            "failure. What blocks is a missing or stale report.",
            "",
            render_delta_section(delta, baseline_origin),
            "### Committed report",
            "",
            f"{message} {verdict}",
            "",
            f"<sub>Regenerate with `{report_command(pr)}`.</sub>",
        ]
    )


def render_text(metrics: dict) -> str:
    score = metrics["score"]
    lines = [
        f"log coverage (deterministic proxy)  covered {format_score(score)}",
        "",
    ]

    findings = [
        handler for handler in metrics["handlers"] if handler["status"] != STATUS_COVERED
    ]
    if not findings:
        lines.append("no findings")
    else:
        lines.append(f"findings ({len(findings)}):")
        for handler in findings:
            lines.append(
                f"  {handler['file']}:{handler['line']}  "
                f"{handler['status']:<12} {handler['kind']:<14} {handler['snippet'][:60]}"
            )

    return "\n".join(lines)


def dump_json(payload: dict) -> str:
    return json.dumps(payload, indent=2, ensure_ascii=False) + "\n"


# --------------------------------------------------------------------------- #
# Commands
# --------------------------------------------------------------------------- #


def command_scan(args: argparse.Namespace) -> int:
    metrics = scan()
    sys.stdout.write(
        dump_json(metrics) if args.format == "json" else render_text(metrics) + "\n"
    )

    return 0


def command_report(args: argparse.Namespace) -> int:
    metrics = scan()
    baseline, baseline_origin = resolve_baseline(args.baseline_ref)
    delta = compare(baseline, metrics)

    report_dir = REPO_ROOT / REPORTS_DIR / f"pr-{args.pr}"
    report_dir.mkdir(parents=True, exist_ok=True)

    # metrics.json holds no timestamp on purpose: CI compares it byte-for-byte
    # against a fresh scan to tell whether the committed report is stale.
    (report_dir / "metrics.json").write_text(dump_json(metrics), encoding="utf-8")
    (report_dir / "report.md").write_text(
        render_report(args.pr, metrics, delta, baseline_origin), encoding="utf-8"
    )
    (REPO_ROOT / BASELINE_PATH).write_text(dump_json(metrics), encoding="utf-8")

    print(f"wrote {REPORTS_DIR / f'pr-{args.pr}'}/report.md")
    print(f"wrote {REPORTS_DIR / f'pr-{args.pr}'}/metrics.json")
    print(f"refreshed {BASELINE_PATH}")
    print()
    print(render_text(metrics))

    return 0


def command_check(args: argparse.Namespace) -> int:
    metrics = scan()
    baseline, baseline_origin = resolve_baseline(args.baseline_ref)
    delta = compare(baseline, metrics)

    required, reason = report_requirement(args.diff_ref, metrics["scope"])
    state, message = evaluate_report(args.pr, metrics, required, reason)

    body = (
        render_comment(args.pr, metrics, delta, baseline_origin, state, message) + "\n"
    )

    if args.markdown_out:
        Path(args.markdown_out).write_text(body, encoding="utf-8")
    else:
        sys.stdout.write(body)

    blocking = state in BLOCKING_REPORT_STATES

    if blocking:
        print(f"log-coverage report {state}: {reason}", file=sys.stderr)

    return 1 if blocking and args.strict else 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--repo-root",
        help="repository root; defaults to `git rev-parse --show-toplevel`",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    scan_parser = subparsers.add_parser("scan", help="print metrics for the scope")
    scan_parser.add_argument("--format", choices=("json", "text"), default="text")
    scan_parser.set_defaults(handler=command_scan)

    report_parser = subparsers.add_parser("report", help="write the per-PR report")
    report_parser.add_argument("--pr", required=True, help="pull request number")
    report_parser.add_argument("--baseline-ref", default="origin/main")
    report_parser.set_defaults(handler=command_report)

    check_parser = subparsers.add_parser("check", help="gate on the committed report")
    check_parser.add_argument("--pr", required=True, help="pull request number")
    check_parser.add_argument("--baseline-ref", default="origin/main")
    check_parser.add_argument(
        "--diff-ref",
        help="require a report only when the change touches audited files, "
        "measured against this ref; omit to always require one",
    )
    check_parser.add_argument("--markdown-out")
    check_parser.add_argument(
        "--strict",
        action="store_true",
        help="exit non-zero when a required report is missing or stale",
    )
    check_parser.set_defaults(handler=command_check)

    args = parser.parse_args()

    try:
        configure(args.repo_root)
    except ConfigError as error:
        print(f"log-coverage: {error}", file=sys.stderr)

        return 2

    return args.handler(args)


if __name__ == "__main__":
    sys.exit(main())
