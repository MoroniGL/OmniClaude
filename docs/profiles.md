# Profiles

A profile sets what the OmniClaude mod applies in a session: the **parent's** model and effort, the tier of the subagents the mod routes, and whether `astra-expert` needs your consent. OmniClaude's own workers keep their tiers in every profile. Where the mod is off, profiles are only the `--settings` files below.

Choose a profile with `/omni <profile>` (this session), `/omni save <profile>` (the plugin's own store, not `settings.json`), the `OMNICLAUDE_PROFILE` environment variable, or the `/config` picker "Routing profile". The profile in force is, in order:

1. the session override (`/omni <profile>`);
2. the saved profile (`/omni save <profile>`);
3. the environment variable `OMNICLAUDE_PROFILE`, else `EVAL_OMNICLAUDE_PROFILE`;
4. the `/config` picker "Routing profile";
5. `auto`.

Notes:

- `/omni save <profile>` applies now when no session override stands in front of it, and in future sessions. With an override, the saved profile waits until `/omni reset`.
- A value in either environment variable that names no profile counts as unset. The environment outranks the picker, whose manifest default is `auto`. `EVAL_OMNICLAUDE_PROFILE` is what a `claude plugin eval` with-plugin session inherits.
- Prompts from `claude -p`, the SDK and `plugin eval` reportedly do not come from the composer, so `auto` never classifies them. Pick a fixed profile for such runs, for example `OMNICLAUDE_PROFILE=economy claude -p "..."`.

## Enforced by the mod

| Profile | Parent (every main-loop request) | Explore | Plan, general-purpose and other routed subagents | astra-expert |
|---|---|---|---|---|
| `omni:economy` | Sonnet / medium | Haiku | Sonnet | denied until `/omni astra allow` |
| `omni:balanced` | Opus / medium | Sonnet | Sonnet | denied until `/omni astra allow` |
| `omni:quality` | Opus / high | Sonnet | Opus | denied until `/omni astra allow` |
| `omni:max` | Fable / high | Opus | Opus | allowed; `max` sets the consent flag |
| `omni:auto` (default) | chosen per prompt (below); Opus / medium until the first prompt is classified | as `balanced` | as `balanced` | denied until `/omni astra allow` |

Rules:

- **Model ids.** The engine rejects aliases in `turn.step`; the mod sends full model ids (live-verified 2026-10-14): `claude-haiku-5-5`, `claude-sonnet-5-5`, `claude-opus-5-5`, `claude-fable-5-1`.
- **Main loop.** A step whose model is already on the profile's tier keeps the engine's own id and gets the profile's effort; a step on another tier is rewritten to the tier's id. When the engine's model carries a `[1m]` suffix, a rewritten Opus or Sonnet id keeps it. Fable and Haiku have no 1M form, so `max` sends plain `claude-fable-5-1`. (The `[1m]` form of a full id has not been live-tested.)
- **OmniClaude workers.** A worker's own frontmatter tier is applied as it is (luna Haiku, terra Sonnet, sol Opus, astra Fable). If a caller passes a `model` above that tier, or one the mod cannot place, the mod replaces it with the tier's id, except under `max`, where the request stands. A `model` at or below the tier stands.
- **Other agents.** Explore gets the profile's explore tier. Plan and general-purpose get the profile's general tier (Plan follows the general tier), and so does any other routed agent: other plugins' agents are routed by profile; agents of your own are routed only if the engine reports them as non-engine-provided (not live-verified). With no request, the profile's tier applies. With an explicit `model` request, a request above the profile's tier (or one the mod cannot place) is replaced by the tier's id and one at or below it stands; under `max` the request stands. The mod cannot read a custom agent's own frontmatter model, so a routed custom agent gets the profile's tier whatever its frontmatter says.
- **Engine built-ins.** Among the engine's own agents only Explore, Plan and general-purpose are routed. Others (claude-code-guide, statusline-setup and the like) keep their own model.
- **Not routed.** Forks, teammates and workflow agents are not rewritten. The consent gate below still applies to a teammate or workflow agent of type `astra-expert`.
- **Effort** on subagent loops is not rewritten; the worker's own effort applies.
- **astra-expert consent.** `omniclaude:astra-expert` (under any plugin name) is denied with `astra-expert needs your agreement: run /omni astra allow` unless the consent flag is true. The flag is set by:
  - `/omni astra allow`;
  - `/omni max`;
  - `/omni save max`, when `max` becomes the effective profile;
  - `/omni reset` back to a saved `max`;
  - session start, when the resolved profile is `max` (also through `OMNICLAUDE_PROFILE=max`).

  Consent that `max` sets is cleared when you leave `max` via `/omni` (a `/config` change or another session's save does not clear it); consent you gave with `/omni astra allow` survives profile changes. `/omni astra deny` clears the flag and keeps astra-expert denied even under `max`. Fable may bill usage credits on some plans.
- **Records and failures.** The mod records the last spawn it decided (`/omni status`, "last spawn": the agent type and the id it set, or `unchanged`). The record never denies a spawn. If the spawn guard itself fails before it passes the spawn on, the spawn is refused. If `turn.step` fails, the step runs unchanged and the badge reads `not applied (hook error)`.

Every row says what the mod **applies**. What the API reports back is shown separately, as "verified" in `/omni status`.

Live-verified on 2026-10-14 (engine 2.1.295, headless runs): the alias rejection and the full ids above; under `economy` the parent answered on `claude-sonnet-5-5` and an Explore subagent on `claude-haiku-5-5`; under `balanced` the parent answered on `claude-opus-5-5`. See [local validation](local-validation.md). Not yet live-verified: the `quality`, `max` and `auto` profiles, Plan and general-purpose routing, the clamps, the astra refusal in a live session, and `/omni` in a desktop session (the mod's tests cover them).

## `omni:auto`

On each prompt you type in the composer, the mod runs one small model call (`$.model.classify`) with four labels. Notifications, prompts from other agents, and headless or eval prompts are not classified.

| Class | Effort | Model |
|---|---|---|
| `trivial` (one-file edits, questions, formatting) | low | Sonnet |
| `routine` (ordinary feature or bug work) | medium | Sonnet |
| `complex` (multi-module design, difficult debugging) | medium | Opus |
| `critical` (security, data integrity, concurrency, architecture) | high | Opus |

Cache rule. Switching the parent model drops the prompt cache; changing effort keeps it (on the 5.5 models and Fable 5.1).

- Effort follows the class on every prompt.
- The parent model is chosen at the first classified prompt. The model auto last ran on comes from the steps applied under `auto` (before any such step, from the plan); a step run under a fixed profile does not count.
- A later upgrade (Sonnet to Opus) happens only when the class asks for it and the context is below 40,000 tokens. Otherwise the model is kept, effort is raised to `high`, and the reason `kept <model> to preserve the cache` is recorded. If the context size cannot be read, it counts as full and the model is kept.
- The model is never downgraded mid-session.
- The classifier gets 2.5 s. If it names no label, its request fails, or it times out, the previous plan stays and `/omni status` says which (`classifier gave no label; plan kept`, `classifier request failed; plan kept`, `classifier timed out; plan kept`).
- Switching to another profile drops auto's plan and its last classification.
- The last classification shows in `/omni status`; the status-line badge reads `omni:auto · <class> → <model>/<effort>` during a turn.

Its cost is one small completion per prompt you type, waiting at most 2.5 s. Not yet live-verified: the actual latency of the classifier call on a real session.

## Requested, applied, verified

| Level | Source | Shown |
|---|---|---|
| requested | the profile table or the `auto` plan | `/omni status`, "requested parent" |
| applied | what the mod sent for the step | `/omni status`, "applied (last step)"; "engine requested (last step)" is what the engine was about to send |
| verified | `turn.complete.usage.model`, the model id the API reports | `/omni status`, "verified (last turn, API-reported)"; the badge shows a check mark when the verified tier matches the applied tier, and `≠ <model>` otherwise |

Verified covers the main conversation. For subagents, `/tasks` and their transcripts are the evidence; "last spawn" in `/omni status` is what the mod set on the spawn, not what answered.

## Sessions without the mod

If `/omni` is missing, the mod is off (`--bare`, `--safe-mode`, `disableAllHooks`, `allowManagedModsOnly`, a remote rollout switch, or an engine older than 2.1.287). Routing is then advisory: the `routing` skill, the seven workers, and these `--settings` files.

| File | Parent | Effort | `CLAUDE_CODE_SUBAGENT_MODEL` |
|---|---|---|---|
| `economy.settings.json` | Sonnet | medium | not set |
| `balanced.settings.json` | Opus | medium | Sonnet |
| `quality.settings.json` | Opus | high | not set |
| `max.settings.json` | Fable | high | Opus |

There is no file for `auto`. Delivery of `CLAUDE_CODE_SUBAGENT_MODEL` through a settings `env` block is not yet verified live (anthropics/claude-code#43869 reports it being ignored).

### CLI

Profiles are settings files layered for one session with `--settings`. A top-level `effortLevel` passed this way applies to every model, including Opus 5.5:

```sh
claude --settings /path/to/balanced.settings.json
```

`--model` and the `ANTHROPIC_MODEL` environment variable override a profile's model. `CLAUDE_CODE_EFFORT_LEVEL` overrides every effort setting, including each worker's, so do not set it while using OmniClaude.

### Desktop app

The desktop app has no `--settings` equivalent. With the mod on, use `/omni`. With it off, pick the parent with `/model <alias>` and the effort with `/effort <level>`. Pressing `s` in either picker keeps the change for this session only. Changing the parent model mid-session re-reads the whole conversation without cache. Changing effort keeps the cache on the 5.5 models and Fable 5.1.

## Optional: the advisor

Claude Code has an experimental advisor feature (official docs at https://code.claude.com/docs/en/advisor, checked 2026-10-14). The advisor is optional and OmniClaude does not configure or automate it; it is not measured: a manual arm recorded no advisor use on these small prompts.

- A stronger model that the main model can consult. Set it with `/advisor opus`, the `advisorModel` setting, or `--advisor`.
- Anthropic API only (subscriptions included). Claude decides when to consult it; on each call the advisor reads the whole conversation, billed at the advisor's own rates.
- A Sonnet 5.5 parent accepts Fable, Opus 5 or later, and Sonnet 5.5 advisors. Subagents inherit the advisor. Fable as an advisor needs usage-credit consent.

A combination you could try is `economy` plus `/advisor opus`: a Sonnet parent that consults Opus for consequential reasoning, a rough analogue of OmniCodex's "Terra control plane, Sol for consequential reasoning". Its effect on cost and quality is not measured, and because each consultation re-reads the conversation it may cost more than a single-model setup.

## Naming

`omni:max` is not effort `max` and not the Max plan. `omni:auto` is not `/effort auto` and not the auto permission mode.
