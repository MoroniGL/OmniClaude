# Changelog

## Unreleased

## 0.2.0-alpha.1 — Stage 2 (enforcing mod), experimental

- A mod (hooks module, `plugins/omniclaude/hooks/`) that applies the routing profile in the session instead of only recommending it. Needs Claude Code engine 2.1.287 or later; where the mod is off, the Stage 1 skill, agents and profile files still work (advisory only).
- `/omni` session control: `status`, `<profile>`, `save <profile>`, `reset`, `astra allow|deny`, `doctor`. Answers are text only; nothing enters the model's context.
- Enforcement of the parent: model and effort applied on every main-loop request. The mod sends full model ids (`claude-haiku-5-5`, `claude-sonnet-5-5`, `claude-opus-5-5`, `claude-fable-5-1`) and rewrites a step's model only when its tier differs from the profile's; a `[1m]` Opus or Sonnet parent keeps the suffix.
- Enforcement of subagent tiers: Explore gets the profile's explore tier; Plan, general-purpose and every agent that does not come from the engine (other plugins' agents and your own) get its general tier; among the engine's other built-in agents nothing is rewritten. Explicit `model` requests on those agents are clamped to the tier except under `max`; OmniClaude workers keep their frontmatter tier (a higher request is clamped back, except under `max`). Forks, teammates and workflow agents are not rewritten.
- astra-expert consent: denied with `astra-expert needs your agreement: run /omni astra allow` unless the consent flag is true. `/omni astra allow`, `/omni max`, `/omni save max` (when `max` becomes the effective profile) and a session that starts on `max` set the flag; consent that `max` sets is cleared when you leave `max`, and `/omni astra deny` denies astra-expert even under `max`.
- `omni:auto` classifier: each prompt you type in the composer is classified (trivial, routine, complex, critical) by a small model call that times out after 2.5 s and then keeps the plan; effort follows the class; the model is chosen at the first classified prompt and upgraded only below 40,000 context tokens, never downgraded; switching profile drops the plan.
- Verified model: `turn.complete.usage.model` (the id the API reports) is shown in `/omni status` and as a check mark in the status line when it matches the applied tier. Requested, applied and verified are reported separately; `/omni status` also shows the last subagent spawn the mod decided and the mod version.
- A short routing-policy section added to the system prompt (`omniclaude:policy`, session-scoped).
- Profile order: the session override, the saved profile (the plugin's own store; `/omni save` applies now when no override stands in front of it), `OMNICLAUDE_PROFILE` else `EVAL_OMNICLAUDE_PROFILE` (for headless and `plugin eval` runs, whose prompts `auto` does not classify), the `/config` picker "Routing profile" (`userConfig.profile`), then `auto`.
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
