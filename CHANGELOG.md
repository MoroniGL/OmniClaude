# Changelog

## Unreleased

## 0.2.0-alpha.1 — Stage 2 (enforcing mod), experimental

- A mod (hooks module, `plugins/omniclaude/hooks/`) that applies the routing profile in the session instead of only recommending it. Needs Claude Code engine 2.1.287 or later; where the mod is off, the Stage 1 skill, agents and profile files still work (advisory only).
- `/omni` session control: `status`, `<profile>`, `save <profile>`, `reset`, `astra allow|deny`, `doctor`. Answers are text only; nothing enters the model's context.
- Enforcement of the parent: model and effort applied on every main-loop request, with the 1M-context alias kept for a `[1m]` Opus or Sonnet parent.
- Enforcement of subagent tiers: Explore, Plan, general-purpose and any subagent whose caller did not pin a model get the profile's tier; explicit `model` requests are clamped to the tier except under `max`; OmniClaude workers keep their frontmatter tier. Forks, teammates and workflow agents are not rewritten.
- astra-expert consent: denied with `astra-expert needs your agreement: run /omni astra allow` unless you ran that command or the profile is `max`; consent that `max` grants is cleared when you leave `max`.
- `omni:auto` classifier: each prompt you type is classified (trivial, routine, complex, critical) by a small model call; effort follows the class; the model is chosen at the first classified prompt and upgraded only below 40,000 context tokens, never downgraded.
- Verified model: `turn.complete.usage.model` (the id the API reports) is shown in `/omni status` and as a check mark in the status line when it matches the applied tier. Requested, applied and verified are reported separately.
- A short routing-policy section added to the system prompt (`omniclaude:policy`, session-scoped).
- Saved profile in the plugin's own store; the `/config` picker "Routing profile" (`userConfig.profile`) is the default when nothing is saved.
- Eval cases gain two indicators, `agent-used` and `skill-fired` (`tool_used`, `min: 0`, with-plugin arm), so delegation and skill use are counted in every case.
- Stage 1 `setup.py`/persisted-settings plans dropped: the plugin's own store replaces them.
- Known: alias acceptance in `turn.step` (strings such as `opus` or `sonnet[1m]`) and the Stage 2 measurement are not yet live-verified. No savings claim.

## 0.1.0-alpha.1 — Stage 1 (core), experimental

- Plugin marketplace `moronigl` with the `omniclaude` plugin.
- Seven tiered workers ported from OmniCodex (luna, terra, sol, astra), all unable to spawn nested subagents.
- `routing` skill with on-demand routing and efficiency references.
- CLI profile files for `claude --settings` (economy, balanced, quality, max).
- Offline asset tests, CI, and a `claude plugin eval` suite with a no-plugin baseline.
- `docs/local-validation.md` records the local install and explicit-dispatch evidence.
- No hooks, no settings written by the plugin itself (installing records it in settings, as any plugin does), no savings claims.
- Stage 1 eval (4 synthetic cases, Opus 5.5 parent): identical grader scores (1.00, the ceiling) with and without the plugin, higher cost with it in all four cases (+3% to +66% per run), no OmniClaude-worker dispatch in the 8 counted with-plugin runs (6 uncounted), routing skill not invoked in the 2 traced runs. Recorded in docs/local-validation.md; no savings claim.
