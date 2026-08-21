#!/usr/bin/env python3
"""Unit tests for the deterministic log-coverage scorer.

The score gates nothing, but it feeds a committed baseline — so the classifier
has to stay honest. These tests pin the judgment calls that are easy to break:
brace matching through strings and templates, error context that must not be
satisfied by a message string, and finding ids that survive line shifts.
"""
from __future__ import annotations

import tempfile
import unittest
import unittest.mock
from pathlib import Path

import audit

# A representative scope, not any particular app's. The scorer must not assume a
# repository layout, so the tests must not either.
SCOPE = ("node/clients/**/*.ts", "node/middlewares/**/*.ts")
TRIGGERS = ("scripts/log_coverage/audit.py",)


def scan_snippet(source: str) -> list[dict]:
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "sample.ts"
        path.write_text(source, encoding="utf-8")
        handlers = audit.scan_file(path, "sample.ts")

    audit.assign_ids(handlers)

    return handlers


class MaskSourceTest(unittest.TestCase):
    def test_preserves_offsets_and_newlines(self) -> None:
        source = "const a = 'xy'\n// comment\n"
        masked = audit.mask_source(source)

        self.assertEqual(len(masked), len(source))
        self.assertEqual(masked.count("\n"), source.count("\n"))

    def test_blanks_braces_inside_strings(self) -> None:
        masked = audit.mask_source("const a = '}'")

        self.assertNotIn("}", masked)

    def test_blanks_braces_inside_comments(self) -> None:
        masked = audit.mask_source("// }\n/* } */")

        self.assertNotIn("}", masked)

    def test_keeps_template_interpolation_braces_balanced(self) -> None:
        masked = audit.mask_source("const a = `x ${ y } z`")

        self.assertEqual(masked.count("{"), 1)
        self.assertEqual(masked.count("}"), 1)

    def test_blanks_template_text_but_not_interpolated_code(self) -> None:
        masked = audit.mask_source("const a = `lit ${error} lit`")

        self.assertIn("error", masked)
        self.assertNotIn("lit", masked)

    def test_blanks_regex_literal_content(self) -> None:
        masked = audit.mask_source("const a = /}{/.test(b)")

        self.assertNotIn("}", masked)
        self.assertIn(".test(b)", masked)

    def test_division_is_not_treated_as_regex(self) -> None:
        source = "const a = (b) / c\nconst d = { e: 1 }"
        masked = audit.mask_source(source)

        self.assertIn("{ e: 1 }", masked)


class ClassifyTest(unittest.TestCase):
    def test_log_with_error_object_is_covered(self) -> None:
        body = "logger.warn({ message: 'nope', error: error.message })"

        self.assertEqual(audit.classify(body), audit.STATUS_COVERED)

    def test_nested_logger_path_is_recognized(self) -> None:
        body = "ctx.vtex.logger.error({ err })"

        self.assertEqual(audit.classify(body), audit.STATUS_COVERED)

    def test_rethrow_is_covered_even_without_a_log(self) -> None:
        body = "throw new UserInputError('bad')"

        self.assertEqual(audit.classify(body), audit.STATUS_COVERED)

    def test_log_without_error_context_is_insufficient(self) -> None:
        body = "logger.warn({ message: 'something happened', unitId })"

        self.assertEqual(audit.classify(body), audit.STATUS_INSUFFICIENT)

    def test_error_word_inside_a_message_string_does_not_count(self) -> None:
        source = "try { a() } catch { logger.warn({ message: 'error parsing' }) }"
        handlers = scan_snippet(source)

        self.assertEqual(handlers[0]["status"], audit.STATUS_INSUFFICIENT)

    def test_silent_swallow_is_missing(self) -> None:
        body = "return null"

        self.assertEqual(audit.classify(body), audit.STATUS_MISSING)


class ScanFileTest(unittest.TestCase):
    def test_detects_bare_catch_binding_and_promise_catch(self) -> None:
        source = (
            "try { a() } catch { return null }\n"
            "try { b() } catch (error) { logger.error({ error }) }\n"
            "c().catch(() => null)\n"
        )
        handlers = scan_snippet(source)

        self.assertEqual(
            [(handler["line"], handler["kind"], handler["status"]) for handler in handlers],
            [
                (1, "catch-block", audit.STATUS_MISSING),
                (2, "catch-block", audit.STATUS_COVERED),
                (3, "promise-catch", audit.STATUS_MISSING),
            ],
        )

    def test_promise_catch_with_block_body_is_classified(self) -> None:
        source = "c().catch((err) => {\n  logger.warn({ err })\n})\n"
        handlers = scan_snippet(source)

        self.assertEqual(handlers[0]["status"], audit.STATUS_COVERED)

    def test_marker_on_the_handler_line_suppresses_it(self) -> None:
        source = "try { a() } catch { return null } // log-coverage-ignore: pure predicate\n"

        self.assertEqual(scan_snippet(source), [])

    def test_marker_on_the_line_above_suppresses_it(self) -> None:
        source = "// log-coverage-ignore: pure predicate\ntry { a() } catch { return null }\n"

        self.assertEqual(scan_snippet(source), [])

    def test_brace_in_a_string_does_not_end_the_handler_body(self) -> None:
        source = "try { a() } catch {\n  logger.warn({ message: '}', error })\n}\n"
        handlers = scan_snippet(source)

        self.assertEqual(len(handlers), 1)
        self.assertEqual(handlers[0]["status"], audit.STATUS_COVERED)


class FindingIdTest(unittest.TestCase):
    def test_id_survives_unrelated_lines_added_above(self) -> None:
        body = "try { a() } catch { return null }\n"
        original = scan_snippet(body)
        shifted = scan_snippet("const x = 1\nconst y = 2\n" + body)

        self.assertNotEqual(original[0]["line"], shifted[0]["line"])
        self.assertEqual(original[0]["id"], shifted[0]["id"])

    def test_identical_bodies_in_one_file_get_distinct_ids(self) -> None:
        source = "try { a() } catch { return null }\ntry { b() } catch { return null }\n"
        handlers = scan_snippet(source)

        self.assertEqual(len({handler["id"] for handler in handlers}), 2)


class CompareTest(unittest.TestCase):
    @staticmethod
    def metrics(*handlers: dict) -> dict:
        payload = dict(audit.EMPTY_METRICS)
        payload["handlers"] = list(handlers)
        covered = sum(1 for handler in handlers if handler["status"] == "covered")
        payload["score"] = {
            "covered": covered,
            "insufficient": 0,
            "missing": len(handlers) - covered,
            "total": len(handlers),
            "percent": round(covered / len(handlers) * 100, 1) if handlers else 0.0,
        }

        return payload

    @staticmethod
    def handler(handler_id: str, status: str) -> dict:
        return {
            "id": handler_id,
            "file": "sample.ts",
            "line": 1,
            "kind": "catch-block",
            "status": status,
            "snippet": "",
        }

    def test_newly_uncovered_handler_is_reported_as_regressed(self) -> None:
        delta = audit.compare(
            self.metrics(self.handler("a", "covered")),
            self.metrics(self.handler("a", "covered"), self.handler("b", "missing")),
        )

        self.assertEqual([handler["id"] for handler in delta["regressed"]], ["b"])
        self.assertEqual(delta["resolved"], [])

    def test_handler_that_gained_a_log_is_reported_as_resolved(self) -> None:
        delta = audit.compare(
            self.metrics(self.handler("a", "missing")),
            self.metrics(self.handler("a", "covered")),
        )

        self.assertEqual([handler["id"] for handler in delta["resolved"]], ["a"])
        self.assertEqual(delta["regressed"], [])

    def test_deleted_uncovered_handler_counts_as_resolved(self) -> None:
        delta = audit.compare(self.metrics(self.handler("a", "missing")), self.metrics())

        self.assertEqual([handler["id"] for handler in delta["resolved"]], ["a"])

    def test_percent_delta_is_signed(self) -> None:
        delta = audit.compare(
            self.metrics(self.handler("a", "missing")),
            self.metrics(self.handler("a", "covered")),
        )

        self.assertEqual(delta["percentDelta"], 100.0)


class GlobMatchingTest(unittest.TestCase):
    """The matcher and the scanner must agree on what is in scope.

    `PurePath.match` disagrees with `Path.glob` about `**`, which used to let a
    change to a direct child slip past the gate while still moving the score.
    """

    def test_recursive_glob_matches_a_direct_child(self) -> None:
        self.assertTrue(audit.matches_any("node/clients/lm.ts", ("node/clients/**/*.ts",)))

    def test_recursive_glob_matches_a_nested_child(self) -> None:
        self.assertTrue(
            audit.matches_any("node/modules/users/svc.ts", ("node/modules/**/*.ts",))
        )

    def test_shallow_glob_rejects_a_nested_child(self) -> None:
        self.assertFalse(
            audit.matches_any("node/modules/users/svc.ts", ("node/modules/*.ts",))
        )

    def test_star_does_not_cross_directory_separators(self) -> None:
        self.assertFalse(audit.matches_any("node/a/b.ts", ("node/*.ts",)))

    def test_extension_is_respected(self) -> None:
        self.assertFalse(audit.matches_any("node/clients/lm.tsx", ("node/clients/**/*.ts",)))

    def test_excluded_directory_is_out_of_scope_under_a_broad_glob(self) -> None:
        with unittest.mock.patch.object(audit, "EXCLUDED_PARTS", ("__tests__",)):
            self.assertFalse(
                audit.matches_any("node/__tests__/svc.test.ts", ("node/**/*.ts",))
            )

    def test_regex_metacharacters_in_paths_are_literal(self) -> None:
        self.assertFalse(audit.matches_any("nodeXclients/lm.ts", ("node/clients/**/*.ts",)))


class ReportRequirementTest(unittest.TestCase):
    def test_audited_source_change_requires_a_report(self) -> None:
        with unittest.mock.patch.object(
            audit, "changed_files", return_value=["node/middlewares/enrich.ts"]
        ):
            required, reason = audit.report_requirement("origin/main", SCOPE)

        self.assertTrue(required)
        self.assertEqual(reason, "1 audited file changed")

    def test_configured_trigger_requires_a_report(self) -> None:
        with unittest.mock.patch.object(
            audit, "changed_files", return_value=["scripts/log_coverage/audit.py"]
        ), unittest.mock.patch.object(audit, "REPORT_TRIGGERS", TRIGGERS):
            required, _ = audit.report_requirement("origin/main", SCOPE)

        self.assertTrue(required)

    def test_tooling_change_is_not_reported_as_an_audited_file(self) -> None:
        with unittest.mock.patch.object(
            audit, "changed_files", return_value=["scripts/log_coverage/audit.py"]
        ), unittest.mock.patch.object(audit, "REPORT_TRIGGERS", TRIGGERS):
            _, reason = audit.report_requirement("origin/main", SCOPE)

        self.assertIn("scorer changed", reason)
        self.assertNotIn("audited", reason)

    def test_untriggered_tooling_change_does_not_require_a_report(self) -> None:
        with unittest.mock.patch.object(
            audit, "changed_files", return_value=["scripts/log_coverage/audit.py"]
        ), unittest.mock.patch.object(audit, "REPORT_TRIGGERS", ()):
            required, _ = audit.report_requirement("origin/main", SCOPE)

        self.assertFalse(required)

    def test_docs_only_change_does_not_require_a_report(self) -> None:
        with unittest.mock.patch.object(
            audit, "changed_files", return_value=["docs/README.md", "CHANGELOG.md"]
        ):
            required, reason = audit.report_requirement("origin/main", SCOPE)

        self.assertFalse(required)
        self.assertEqual(reason, "no audited file changed")

    def test_test_file_change_does_not_require_a_report(self) -> None:
        with unittest.mock.patch.object(
            audit,
            "changed_files",
            return_value=["node/__tests__/enrich.test.ts"],
        ):
            required, _ = audit.report_requirement("origin/main", SCOPE)

        self.assertFalse(required)

    def test_unavailable_diff_fails_closed(self) -> None:
        with unittest.mock.patch.object(audit, "changed_files", return_value=None):
            required, reason = audit.report_requirement("origin/main", SCOPE)

        self.assertTrue(required)
        self.assertIn("could not diff", reason)

    def test_no_diff_ref_always_requires_a_report(self) -> None:
        required, _ = audit.report_requirement(None, SCOPE)

        self.assertTrue(required)


class EvaluateReportTest(unittest.TestCase):
    def setUp(self) -> None:
        self.metrics = {"score": {"covered": 1}, "handlers": []}
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        patcher = unittest.mock.patch.object(
            audit, "REPO_ROOT", Path(self.directory.name)
        )
        patcher.start()
        self.addCleanup(patcher.stop)

    def write_committed(self, payload: dict) -> None:
        path = Path(self.directory.name) / audit.REPORTS_DIR / "pr-1"
        path.mkdir(parents=True)
        (path / "metrics.json").write_text(audit.dump_json(payload), encoding="utf-8")

    def test_not_required_when_nothing_audited_changed(self) -> None:
        state, _ = audit.evaluate_report("1", self.metrics, False, "no audited file changed")

        self.assertEqual(state, audit.REPORT_NOT_REQUIRED)
        self.assertNotIn(state, audit.BLOCKING_REPORT_STATES)

    def test_missing_report_blocks(self) -> None:
        state, message = audit.evaluate_report("1", self.metrics, True, "1 audited file changed")

        self.assertEqual(state, audit.REPORT_MISSING)
        self.assertIn(state, audit.BLOCKING_REPORT_STATES)
        self.assertIn(audit.report_command("1"), message)

    def test_stale_report_blocks(self) -> None:
        self.write_committed({"score": {"covered": 0}, "handlers": []})
        state, _ = audit.evaluate_report("1", self.metrics, True, "1 audited file changed")

        self.assertEqual(state, audit.REPORT_STALE)
        self.assertIn(state, audit.BLOCKING_REPORT_STATES)

    def test_matching_report_passes(self) -> None:
        self.write_committed(self.metrics)
        state, _ = audit.evaluate_report("1", self.metrics, True, "1 audited file changed")

        self.assertEqual(state, audit.REPORT_FRESH)
        self.assertNotIn(state, audit.BLOCKING_REPORT_STATES)

    def test_prettier_reflowed_report_still_matches(self) -> None:
        metrics = {"scope": ["a", "b"], "handlers": [], "score": {"covered": 0}}
        path = Path(self.directory.name) / audit.REPORTS_DIR / "pr-1"
        path.mkdir(parents=True)
        # Prettier collapses short arrays onto one line; the parsed value is what
        # has to match, not the bytes.
        (path / "metrics.json").write_text(
            '{ "scope": ["a", "b"], "handlers": [], "score": { "covered": 0 } }',
            encoding="utf-8",
        )
        state, _ = audit.evaluate_report("1", metrics, True, "1 audited file changed")

        self.assertEqual(state, audit.REPORT_FRESH)


class TreeScanTest(unittest.TestCase):
    """Scanning is exercised against a synthetic tree, never the host repo.

    Asserting on the host repository's real score would make these tests pass or
    fail depending on which app the scorer was copied into.
    """

    def setUp(self) -> None:
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)

        nested = self.root / "node" / "modules" / "users"
        nested.mkdir(parents=True)
        (nested / "users.service.ts").write_text(
            "try { a() } catch (e) { logger.error({ error: e }) }\n"
            "try { b() } catch (e) { }\n",
            encoding="utf-8",
        )

        tests = self.root / "node" / "modules" / "__tests__"
        tests.mkdir()
        (tests / "users.test.ts").write_text(
            "try { a() } catch (e) { }\n", encoding="utf-8"
        )

        patcher = unittest.mock.patch.object(audit, "REPO_ROOT", self.root)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_deep_globs_reach_nested_directories(self) -> None:
        metrics = audit.scan(("node/modules/**/*.ts",))

        self.assertEqual(metrics["score"]["total"], 2)
        self.assertEqual(metrics["score"]["covered"], 1)
        self.assertEqual(metrics["score"]["missing"], 1)

    def test_shallow_globs_do_not_reach_nested_directories(self) -> None:
        metrics = audit.scan(("node/modules/*.ts",))

        self.assertEqual(metrics["score"]["total"], 0)

    def test_excluded_directories_are_skipped(self) -> None:
        metrics = audit.scan(("node/modules/**/*.ts",))
        files = {handler["file"] for handler in metrics["handlers"]}

        self.assertNotIn("node/modules/__tests__/users.test.ts", files)

    def test_scanning_is_deterministic(self) -> None:
        first = audit.dump_json(audit.scan(("node/modules/**/*.ts",)))
        second = audit.dump_json(audit.scan(("node/modules/**/*.ts",)))

        self.assertEqual(first, second)

    def test_totals_are_internally_consistent(self) -> None:
        score = audit.scan(("node/modules/**/*.ts",))["score"]

        self.assertEqual(
            score["total"],
            score["covered"] + score["insufficient"] + score["missing"],
        )


class ConfigTest(unittest.TestCase):
    def setUp(self) -> None:
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)

    def write(self, payload: str) -> None:
        (self.root / audit.CONFIG_FILENAME).write_text(payload, encoding="utf-8")

    def test_missing_config_is_reported(self) -> None:
        with self.assertRaises(audit.ConfigError) as caught:
            audit.load_config(self.root)

        self.assertIn(audit.CONFIG_FILENAME, str(caught.exception))

    def test_malformed_config_is_reported(self) -> None:
        self.write("{ not json")

        with self.assertRaises(audit.ConfigError):
            audit.load_config(self.root)

    def test_missing_scope_is_rejected(self) -> None:
        self.write('{"baseline": "docs/log-coverage/baseline.json"}')

        with self.assertRaises(audit.ConfigError) as caught:
            audit.load_config(self.root)

        self.assertIn("scope", str(caught.exception))

    def test_empty_scope_is_rejected(self) -> None:
        self.write('{"scope": []}')

        with self.assertRaises(audit.ConfigError):
            audit.load_config(self.root)

    def test_defaults_fill_omitted_keys(self) -> None:
        self.write('{"scope": ["node/**/*.ts"]}')

        config = audit.load_config(self.root)

        self.assertEqual(config["baseline"], "docs/log-coverage/baseline.json")
        self.assertEqual(config["reportTriggers"], [])
        self.assertIn("node_modules", config["exclude"])

    def test_explicit_values_override_defaults(self) -> None:
        self.write(
            '{"scope": ["src/**/*.ts"], "baseline": "ops/base.json", '
            '"exclude": ["spec"], "reportTriggers": ["tools/audit.py"]}'
        )

        config = audit.load_config(self.root)

        self.assertEqual(config["baseline"], "ops/base.json")
        self.assertEqual(config["exclude"], ["spec"])
        self.assertEqual(config["reportTriggers"], ["tools/audit.py"])

    def test_configure_binds_module_globals(self) -> None:
        self.write('{"scope": ["src/**/*.ts"], "reportsDir": "ops/reports"}')

        try:
            audit.configure(str(self.root))

            self.assertEqual(audit.REPO_ROOT, self.root.resolve())
            self.assertEqual(audit.SCOPE, ("src/**/*.ts",))
            self.assertEqual(audit.REPORTS_DIR, Path("ops/reports"))
        finally:
            audit.SCOPE = ()

    def test_explicit_repo_root_wins_over_git(self) -> None:
        self.assertEqual(audit.find_repo_root(str(self.root)), self.root.resolve())

    def test_report_command_defaults_to_the_script(self) -> None:
        with unittest.mock.patch.object(
            audit, "REPORT_COMMAND", audit.CONFIG_DEFAULTS["reportCommand"]
        ):
            self.assertEqual(
                audit.report_command("7"),
                "python3 scripts/log_coverage/audit.py report --pr 7",
            )

    def test_report_command_is_configurable(self) -> None:
        with unittest.mock.patch.object(
            audit, "REPORT_COMMAND", "make log-coverage-report PR={pr}"
        ):
            self.assertEqual(audit.report_command("7"), "make log-coverage-report PR=7")

    def test_judged_audit_note_is_omitted_when_no_globs(self) -> None:
        with unittest.mock.patch.object(audit, "JUDGED_AUDIT_GLOBS", ()):
            self.assertEqual(audit.judged_audit_note("1"), "")

    def test_a_revision_is_listed_ahead_of_the_audit_it_supersedes(self) -> None:
        audits = self.root / "docs" / "audits"
        audits.mkdir(parents=True)
        (audits / "audit-2026-08-21.md").write_text("x", encoding="utf-8")
        (audits / "audit-2026-08-21-r2.md").write_text("x", encoding="utf-8")

        with unittest.mock.patch.object(audit, "REPO_ROOT", self.root), \
            unittest.mock.patch.object(
                audit, "JUDGED_AUDIT_GLOBS", ("docs/audits/*.md",)
            ):
            note = audit.judged_audit_note("1")

        self.assertLess(note.index("-r2.md"), note.index("21.md"))

    def test_docs_note_is_omitted_when_unset(self) -> None:
        with unittest.mock.patch.object(audit, "DOCS_PATH", ""):
            self.assertEqual(audit.docs_note("1"), "")

    def test_links_are_relative_to_the_report_folder(self) -> None:
        with unittest.mock.patch.object(audit, "REPO_ROOT", self.root), \
            unittest.mock.patch.object(audit, "REPORTS_DIR", Path("docs/lc/reports")):
            link = audit.link_from_report("9", Path("docs/audits/a.md"))

        self.assertEqual(link, "../../../audits/a.md")

    def test_links_work_outside_docs(self) -> None:
        with unittest.mock.patch.object(audit, "REPO_ROOT", self.root), \
            unittest.mock.patch.object(audit, "REPORTS_DIR", Path("ops/reports")):
            link = audit.link_from_report("9", Path("docs/audits/a.md"))

        self.assertEqual(link, "../../../docs/audits/a.md")


if __name__ == "__main__":
    unittest.main()
