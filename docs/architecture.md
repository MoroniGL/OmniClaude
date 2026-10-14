# Architecture

OmniClaude separates **policy**, **control plane**, **execution plane**, and **runtime evidence**. Stage 2 adds a mod (a hooks module) that implements the control plane inside the session.

## Policy
The `routing` skill decides: is this work substantial, which bounded phases exist, which is the cheapest capable worker, and is escalation justified. The skill is also what authorizes delegation, since Claude Code's built-in prompt can discourage delegation unless a `CLAUDE.md` file or a skill asks for it (observed in the 2.1.295 binary's prompt text; not a documented contract). In Stage 1 the skill did not fire in the traced runs, so the mod also adds one short, session-scoped routing-policy section to the system prompt (`omniclaude:policy`). Neither forces Claude to delegate.

## Control plane
The parent conversation owns decomposition, delegation, dependency tracking, acceptance, and escalation. A profile sets the parent's model and effort, the tier of subagents that have no model of their own, and whether `astra-expert` needs consent.

The mod applies the profile. It lives in `plugins/omniclaude/hooks/` and loads on Claude Code engine 2.1.287 or later. The profile in force is resolved on every hook call, in this order: the session override, the saved profile (`$.store`), the environment variable `OMNICLAUDE_PROFILE` else `EVAL_OMNICLAUDE_PROFILE` (read through `$.env`; a value that is no profile, or a failed read, counts as unset), the `/config` option, `auto`. The environment variable is how headless and `plugin eval` runs pick a profile, because their prompts are not typed in the composer and `auto` does not classify them.

| Hook | What it does |
|---|---|
| `session.start` | registers `/omni`; when the resolved profile is `max`, sets the astra consent as `/omni max` does; shows the `omni:<profile>` badge |
| `command.run` (`/omni`) | `status`, `<profile>`, `save <profile>`, `reset`, `astra allow\|deny`, `doctor`; text answers only, nothing enters the model's context; entering `max` sets the astra consent, leaving `max` clears the consent that `max` set |
| `prompt.submit` | under `auto`, classifies each prompt typed in the composer (`$.model.classify`, 2.5 s timeout) and records the plan and the class; no label, a failed request or a timeout keeps the plan; other origins are left alone |
| `turn.step` | rewrites the model (full model ids, and only across tiers) and the effort of main-loop requests; records what the engine asked for (`lastStep`) and what was applied (`applied`); subagent steps are not touched; if the hook fails, the step runs unchanged and the badge reads `not applied (hook error)` |
| `agent.spawn` | the astra consent gate (it reads only the consent flag), then the worker-tier clamp and the profile tier for Explore, Plan, general-purpose and agents that do not come from the engine; the engine's other built-in agents, forks, teammates and workflow agents are not rewritten; records the decision (`lastSpawn`), and that record never denies a spawn; if the guard fails before the spawn is passed on, the spawn is refused |
| `prompt.compose` | adds the session-scoped `omniclaude:policy` section |
| `turn.complete` | records the API-reported model (`usage.model`) of the main-loop turn as "verified"; a turn that reports no usage clears it |

Files: `register.ts` (hook wiring and all state access), `policy.ts` (pure: profile table, tier ids, spawn routing and clamp, auto mapping, cache rule, classifier timeout), `omni.ts` (command parser and text), `types/index.d.ts` (the plugin state contract), and `*.test.ts` (run by `claude plugin test`). The saved profile lives in the plugin's own store (`$.store`), never in `settings.json`; session state lives in `$.state` (`profileOverride`, `plan`, `lastClass`, `lastStep`, `applied`, `verified`, `lastSpawn`, `astraConsent`, `astraConsentFromMax`).

Where the mod is off (`--bare`, `--safe-mode`, `disableAllHooks`, `allowManagedModsOnly`, a remote rollout switch, or an engine older than 2.1.287), this layer does not exist and routing is advisory: the skill, the workers, and the `--settings` profile files.

## Execution plane
Seven plugin agents (`omniclaude:<name>`) with pinned model aliases and effort levels. Every worker disallows the `Agent` tool, so it cannot spawn nested subagents that would bypass the tiers. The read-only workers (luna, terra-explorer) skip `CLAUDE.md` to stay lean and avoid project instructions that ask for swarms. With the mod on, a caller's `model` above a worker's tier is clamped back to the tier (except under `max`). The mod sends full model ids, because the engine rejects aliases in `turn.step`.

## Runtime evidence
Configuration is a request. OmniClaude reports three levels separately:

- **requested:** the profile table or the `auto` plan (`/omni status`, "requested parent").
- **applied:** what the mod sent for the step (`/omni status`, "applied (last step)"; "engine requested (last step)" beside it is what the engine was about to send). A step the hook could not handle shows `not applied (hook error)` and leaves no applied record.
- **verified:** the model id the API reports for the finished main-loop turn, `turn.complete.usage.model` (`/omni status`, "verified (last turn, API-reported)"). The status-line badge shows a check mark when the verified tier matches the applied tier, and `≠ <model>` otherwise.

For subagents, the mod records only its own decision for the last spawn (`/omni status`, "last spawn": the agent type and the id it set, or `unchanged`). That is applied, not verified: `/tasks` names each subagent's model and effort setting and their transcripts record the served model, and the mod does not read those back.

Live-verified on 2026-10-14 (engine 2.1.295, headless runs): the engine rejects aliases in `turn.step` and the mod sends full model ids; under `economy` the parent answered on `claude-sonnet-5-5` and an Explore subagent on `claude-haiku-5-5`; under `balanced` the parent answered on `claude-opus-5-5`. Not yet live-verified: the latency of the `auto` classifier call (capped at 2.5 s), the `[1m]` form of a full id, and `/omni` in a desktop session.

## Delivery
- Stage 1: agents, skill, CLI profile files, eval suite. No hooks.
- Stage 2 (this release, experimental): the mod, `/omni`, the saved profile in the plugin's own store (replacing the planned `setup.py` and persisted settings), and eval indicators for delegation and skill use. The Stage 2 measurement is recorded in `docs/local-validation.md`: `economy` cut cost 24% to 47% per run and `balanced` raised it 10% to 61%, with identical scores and zero delegation.
- Phase 2: Gemini context offload.

## Safety invariant
Cost optimization may change *who* performs work, but not acceptance criteria. Required tests, security checks, correctness constraints, and user requirements stay intact.
