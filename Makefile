.PHONY: log-coverage log-coverage-report log-coverage-test

log-coverage: ## Print the log-coverage score and open findings
	python3 scripts/log_coverage/audit.py scan --format text

log-coverage-report: ## Write the report for a PR: make log-coverage-report PR=123
	@[ -n "$(PR)" ] || { echo "usage: make log-coverage-report PR=<number>"; exit 1; }
	python3 scripts/log_coverage/audit.py report --pr $(PR)

log-coverage-test: ## Run the log-coverage scorer unit tests
	cd scripts/log_coverage && python3 -m unittest discover -p 'test_*.py'
