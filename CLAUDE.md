# OmniClaude contributor instructions

## Mission
Build a reliable, cost-aware routing layer for Claude Code. Preserve output quality while minimizing unnecessary use of expensive models.

## Engineering rules
- Verify supported Claude Code behavior in the official docs or the installed CLI before depending on it.
- Do not claim model switching, enforcement, or savings unless a live test shows it.
- Prefer documented plugin mechanisms (agents, skills, hooks, manifests).
- Keep routing policy separate from runtime adapters.
- Make the smallest safe change. No production dependencies without a clear need.
- Run `python -m unittest discover -s tests -v` and `claude plugin validate . --strict` after changes.
- Never weaken correctness, security, tests, or review solely to reduce usage.

## Routing philosophy
Use the cheapest worker that can safely complete the current bounded task. Escalate only after identifying a concrete blocker. De-escalate when the expensive phase ends.

## Contribution output
For meaningful changes report: what changed; files changed; validation performed; remaining risks or unsupported assumptions.
