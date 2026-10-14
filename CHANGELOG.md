# Changelog

## Unreleased

## 0.1.0-alpha.1 — Stage 1 (core), experimental

- Plugin marketplace `moronigl` with the `omniclaude` plugin.
- Seven tiered workers ported from OmniCodex (luna, terra, sol, astra), all unable to spawn nested subagents.
- `routing` skill with on-demand routing and efficiency references.
- CLI profile files for `claude --settings` (economy, balanced, quality, max).
- Offline asset tests, CI, and a `claude plugin eval` suite with a no-plugin baseline.
- `docs/local-validation.md` records the local install and explicit-dispatch evidence.
- No hooks, no settings written by the plugin itself (installing records it in settings, as any plugin does), no savings claims.
- Stage 1 eval (4 synthetic cases, Opus 5.5 parent): identical grader scores (1.00, the ceiling) with and without the plugin, higher cost with it in all four cases (+3% to +66% per run), no OmniClaude-worker dispatch in the 8 counted with-plugin runs (6 uncounted), routing skill not invoked in the 2 traced runs. Recorded in docs/local-validation.md; no savings claim.
