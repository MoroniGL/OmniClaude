# Architecture

OmniClaude separates **policy**, **control plane**, **execution plane**, and **runtime evidence**. Stage 2 adds a mod (a hooks module) that implements the control plane inside the session.

## Policy
The `routing` skill decides: is this work substantial, which bounded phases exist, which is the cheapest capable worker, and is escalation justified. The skill is also what authorizes delegation, since Claude Code's built-in prompt can discourage delegation unless a `CLAUDE.md` file or a skill asks for it (observed in the 2.1.295 binary's prompt text; not a documented contract). In Stage 1 the skill did not fire in the traced runs, so the mod also adds one short, session-scoped routing-policy section to the system prompt (`omniclaude:policy`). Neither forces Claude to delegate.

## Control plane
The parent conversation owns decomposition, delegation, dependency tracking, acceptance, and escalation. A profile sets the parent's model and effort, the tier of subagents that have no model of their own, and whether `astra-expert` needs consent.

The mod applies the profile. It lives in `plugins/omniclaude/hooks/` and loads on Claude Code engine 2.1.287 or later:

| Hook | What it does |
|---|---|
| `session.start` | registers `/omni`, shows the `omni:<profile>` badge |
| `command.run` (`/omni`) | `status`, `<profile>`, `save <profile>`, `reset`, `astra allow\|deny`, `doctor`; text answers only, nothing enters the model's context |
| `prompt.submit` | under `auto`, classifies each prompt you type (`$.model.classify`) and records the plan; other origins are left alone |
| `turn.step` | rewrites model and effort of main-loop requests; subagent steps are not touched |
| `agent.spawn` | the astra consent gate, the worker-tier clamp, and the profile tier for Explore, Plan, general-purpose and any model-less subagent; forks, teammates and workflow agents are not rewritten; if the guard fails before the spawn is passed on, the spawn is refused |
| `prompt.compose` | adds the session-scoped `omniclaude:policy` section |
| `turn.complete` | records the API-reported model (`usage.model`) of the main-loop turn as "verified" |

Files: `register.ts` (hook wiring and state access), `policy.ts` (pure: profile table, clamp, auto mapping, cache rule), `omni.ts` (command parser and text), `types/index.d.ts` (the plugin state contract), and `*.test.ts` (run by `claude plugin test`). The saved profile lives in the plugin's own store (`$.store`), never in `settings.json`; session state lives in `$.state`.

Where the mod is off (`--bare`, `--safe-mode`, `disableAllHooks`, `allowManagedModsOnly`, a remote rollout switch, or an engine older than 2.1.287), this layer does not exist and routing is advisory: the skill, the workers, and the `--settings` profile files.

## Execution plane
Seven plugin agents (`omniclaude:<name>`) with pinned model aliases and effort levels. Every worker disallows the `Agent` tool, so it cannot spawn nested subagents that would bypass the tiers. The read-only workers (luna, terra-explorer) skip `CLAUDE.md` to stay lean and avoid project instructions that ask for swarms. With the mod on, a caller's `model` above a worker's tier is clamped back to the tier (except under `max`).

## Runtime evidence
Configuration is a request. OmniClaude reports three levels separately:

- **requested:** the profile table or the `auto` plan (`/omni status`, "requested parent").
- **applied:** what the mod sent for the step (`/omni status`, "applied (last step)").
- **verified:** the model id the API reports for the finished main-loop turn, `turn.complete.usage.model` (`/omni status`, "verified (last turn, API-reported)"). The status-line badge shows a check mark when the verified tier matches the applied tier, and `≠ <model>` otherwise.

For subagents, `/tasks` names each one's model and effort setting and their transcripts record the served model; the mod does not read those back. Not yet live-verified: that the engine accepts the alias strings the mod sends in a main-loop step, and the latency of the `auto` classifier call.

## Delivery
- Stage 1: agents, skill, CLI profile files, eval suite. No hooks.
- Stage 2 (this release, experimental): the mod, `/omni`, the saved profile in the plugin's own store (replacing the planned `setup.py` and persisted settings), and eval indicators for delegation and skill use. The Stage 2 measurement has not been run.
- Phase 2: Gemini context offload.

## Safety invariant
Cost optimization may change *who* performs work, but not acceptance criteria. Required tests, security checks, correctness constraints, and user requirements stay intact.
