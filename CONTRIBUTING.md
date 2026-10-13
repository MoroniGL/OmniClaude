# Contributing

Contributions are welcome.

Before proposing a runtime feature, verify that the behavior is supported by the current Claude Code release or clearly mark it experimental.

For routing changes, explain:
- the task class affected;
- why the proposed tier is sufficient;
- escalation and de-escalation conditions;
- the expected quality/cost trade-off, with eval evidence when you claim a cost effect.

Keep pull requests focused and include validation steps (`python -m unittest discover -s tests -v`, `claude plugin validate . --strict`).
