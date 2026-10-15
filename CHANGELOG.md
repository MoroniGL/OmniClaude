# Changelog

## Unreleased

- Docs: `/omni status` confirmed in a new desktop Code-tab session on 2026-10-15 (status line `omni:auto`); the other `/omni` subcommands remain test-covered only in a desktop session.

## 0.2.0-alpha.1 — Stage 2 (enforcing mod), experimental

- A mod (hooks module, `plugins/omniclaude/hooks/`) that applies the routing profile in the session instead of only recommending it. Needs Claude Code engine 2.1.287 or later; where the mod is off, the Stage 1 skill, agents and profile files still work (advisory only).
- `/omni` session control: `status`, `<profile>`, `save <profile>`, `reset`, `astra allow|deny`, `doctor`. Answers are text only; nothing enters the model's context.
- Enforcement of the parent: model and effort applied on every main-loop request. The mod sends full model ids (`claude-haiku-5-5`, `claude-sonnet-5-5`, `claude-opus-5-5`, `claude-fable-5-1`) and rewrites a step's model only when its tier differs from the profile's; a `[1m]` Opus or Sonnet parent keeps the suffix.
- Enforcement of subagent tiers: Explore gets the profile's explore tier; Plan and general-purpose get its general tier, and so does any other routed agent (other plugins' agents are routed by profile; agents of your own are routed only if the engine reports them as non-engine-provided (not live-verified)); among the engine's other built-in agents nothing is rewritten. Explicit `model` requests on routed agents are clamped to the tier except under `max`; OmniClaude workers keep their frontmatter tier (a higher request is clamped back, except under `max`). Forks, teammates and workflow agents are not rewritten. This is applied by the hook; only the parent pin and Explore routing were live-verified.
- astra-expert consent: denied with `astra-expert needs your agreement: run /omni astra allow` unless the consent flag is true. `/omni astra allow`, `/omni max`, `/omni save max` (when `max` becomes the effective profile), `/omni reset` back to a saved `max`, and a session that starts on `max` set the flag; consent that `max` sets is cleared when you leave `max` via `/omni` (a `/config` change or another session's save does not clear it), and `/omni astra deny` denies astra-expert even under `max`.
- `omni:auto` classifier: each prompt you type in the composer is classified (trivial, routine, complex, critical) by a small model call that times out after 2.5 s and then keeps the plan; effort follows the class; the model is chosen at the first classified prompt and upgraded only below 40,000 context tokens, never downgraded; switching profile drops the plan.
- Verified model: `turn.complete.usage.model` (the id the API reports) is shown in `/omni status` and as a check mark in the status line when it matches the applied tier. Requested, applied and verified are reported separately; `/omni status` also shows the last subagent spawn the mod decided and the mod version.
- A short routing-policy section added to the system prompt (`omniclaude:policy`, session-scoped).
- Profile order: the session override, the saved profile (the plugin's own store; `/omni save` applies now when no override stands in front of it), `OMNICLAUDE_PROFILE` else `EVAL_OMNICLAUDE_PROFILE` (for headless and `plugin eval` runs, whose prompts reportedly do not come from the composer, so `auto` does not classify them), the `/config` picker "Routing profile" (`userConfig.profile`), then `auto`.
- Eval cases gain two indicators, `agent-used` and `skill-fired` (`tool_used`, `min: 0`, with-plugin arm), so delegation and skill use are counted in every case.
- Stage 1 `setup.py`/persisted-settings plans dropped: the plugin's own store replaces them.
- Fix from the first live run: the engine rejects aliases in `turn.step` (`unrecognized_model`), so the mod sends full model ids (`claude-sonnet-5-5` and so on). Live-verified 2026-10-14: under `economy` the parent ran on `claude-sonnet-5-5` and an Explore subagent on `claude-haiku-5-5`.
- Stage 2 measurement (4 synthetic cases, 3 runs per arm, Opus 5.5 baseline; docs/local-validation.md): `economy` cut list-price cost 24% to 47% per run and `balanced` raised it 10% to 61%, with identical grader scores (1.00, the ceiling) and zero delegation in all 24 with-plugin Stage 2 eval runs. The saving is consistent with the enforced Sonnet parent (the eval JSON records no served model; the headless check with `OMNICLAUDE_PROFILE=economy` showed `claude-sonnet-5-5`) and not with delegation; the mod's effort setting and added context were not isolated. Not a savings guarantee.
- Stage 3 ideas recorded: subagent model verification, bare `astra-expert` gating, advisor measurement.

## 0.1.0-alpha.1 — Stage 1 (core), experimental

- Plugin marketplace `moronigl` with the `omniclaude` plugin.
- Seven tiered workers ported from OmniCodex (luna, terra, sol, astra), all unable to spawn nested subagents.
- `routing` skill with on-demand routing and efficiency references.
- CLI profile files for `claude --settings` (economy, balanced, quality, max).
- Offline asset tests, CI, and a `claude plugin eval` suite with a no-plugin baseline.
- `docs/local-validation.md` records the local install and explicit-dispatch evidence.
- No hooks, no settings written by the plugin itself (installing records it in settings, as any plugin does), no savings claims.
- Stage 1 eval (4 synthetic cases, Opus 5.5 parent): identical grader scores (1.00, the ceiling) with and without the plugin, higher cost with it in all four cases (+3% to +66% per run), no OmniClaude-worker dispatch in the 8 counted with-plugin runs (6 uncounted), routing skill not invoked in the 2 traced runs. Recorded in docs/local-validation.md; no savings claim.
