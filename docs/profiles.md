# Profiles

A profile sets what the OmniClaude mod applies in a session: the **parent's** model and effort, the tier of subagents that have no model of their own, and whether `astra-expert` needs your consent. OmniClaude's own workers keep their tiers in every profile. Where the mod is off, profiles are only the `--settings` files below.

Choose a profile with `/omni <profile>` (this session), `/omni save <profile>` (future sessions, kept in the plugin's own store, not in `settings.json`), or the `/config` picker "Routing profile". The profile in force is the session override, else the saved profile, else the picker value, else `auto`. The saved profile wins over the picker.

## Enforced by the mod

| Profile | Parent (every main-loop request) | Explore | Plan, general-purpose, other model-less subagents | astra-expert |
|---|---|---|---|---|
| `omni:economy` | Sonnet / medium | Haiku | Sonnet | denied until `/omni astra allow` |
| `omni:balanced` | Opus / medium | Sonnet | Sonnet | denied until `/omni astra allow` |
| `omni:quality` | Opus / high | Sonnet | Opus | denied until `/omni astra allow` |
| `omni:max` | Fable / high | Opus | Opus | allowed; `max` counts as consent |
| `omni:auto` (default) | chosen per prompt (below); Opus / medium until the first prompt is classified | as `balanced` | as `balanced` | denied until `/omni astra allow` |

Rules:

- A worker's own frontmatter tier is applied as it is (luna Haiku, terra Sonnet, sol Opus, astra Fable). If a caller passes a `model` above that tier, the mod clamps it back to the tier, except under `max`. A `model` below the tier is allowed.
- For any other agent, an explicit `model` request is clamped to the profile's tier for it (Explore tier, or the general tier), except under `max`, where the request stands. With no request, the profile's tier applies. The mod cannot read a custom agent's own frontmatter model, so custom agents are routed this way too.
- `omniclaude:astra-expert` is denied with `astra-expert needs your agreement: run /omni astra allow` until you run that command or the profile is `max`. Consent that `max` grants is cleared when you leave `max`; consent you gave with `/omni astra allow` survives profile changes. `/omni astra deny` withdraws explicit consent. Fable may bill usage credits on some plans.
- Effort on subagent loops is not rewritten; the worker's own effort applies.
- Forks, teammates and workflow agents are not rewritten. Only the astra consent gate applies to them.
- 1M context: a parent started on a `[1m]` alias keeps `opus[1m]` or `sonnet[1m]`. Fable and Haiku have no 1M alias, so `max` sends plain `fable`.

Every row says what the mod **applies**. What the API reports back is shown separately, as "verified" in `/omni status`. Not yet live-verified: that the engine accepts the alias strings the mod sends (`opus`, `sonnet[1m]`, and so on) in a main-loop step.

## `omni:auto`

On each prompt you type, the mod runs one small model call (`$.model.classify`) with four labels. Notifications and prompts from other agents are not classified.

| Class | Effort | Model |
|---|---|---|
| `trivial` (one-file edits, questions, formatting) | low | Sonnet |
| `routine` (ordinary feature or bug work) | medium | Sonnet |
| `complex` (multi-module design, difficult debugging) | medium | Opus |
| `critical` (security, data integrity, concurrency, architecture) | high | Opus |

Cache rule. Switching the parent model drops the prompt cache; changing effort keeps it (on the 5.5 models and Fable 5.1).

- Effort follows the class on every prompt.
- The parent model is chosen at the first classified prompt.
- A later upgrade (Sonnet to Opus) happens only when the class asks for it and the context is below 40,000 tokens. Otherwise the model is kept, effort is raised to `high`, and the reason `kept <model> to preserve the cache` is recorded.
- The model is never downgraded mid-session.
- If the classifier names no label or its request fails, the previous plan stays and `/omni status` says so.
- The last classification shows in `/omni status`; the status-line badge reads `omni:auto · <class> → <model>/<effort>` during a turn.

Not yet live-verified: the latency of the classifier call on a real session. Its cost is one small completion per prompt you type.

## Requested, applied, verified

| Level | Source | Shown |
|---|---|---|
| requested | the profile table or the `auto` plan | `/omni status`, "requested parent" |
| applied | what the mod sent for the step | `/omni status`, "applied (last step)" |
| verified | `turn.complete.usage.model`, the model id the API reports | `/omni status`, "verified (last turn, API-reported)"; the badge shows a check mark when the verified tier matches the applied tier, and `≠ <model>` otherwise |

Verified covers the main conversation. For subagents, `/tasks` and their transcripts are the evidence.

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

## Optional: the advisor (not measured)

Claude Code has an experimental advisor feature (official docs at https://code.claude.com/docs/en/advisor, checked 2026-10-14). OmniClaude does not configure or automate it.

- A stronger model that the main model can consult. Set it with `/advisor opus`, the `advisorModel` setting, or `--advisor`.
- Anthropic API only (subscriptions included). Claude decides when to consult it; on each call the advisor reads the whole conversation, billed at the advisor's own rates.
- A Sonnet 5.5 parent accepts Fable, Opus 5 or later, and Sonnet 5.5 advisors. Subagents inherit the advisor. Fable as an advisor needs usage-credit consent.

A combination you could try is `economy` plus `/advisor opus`: a Sonnet parent that consults Opus for consequential reasoning, a rough analogue of OmniCodex's "Terra control plane, Sol for consequential reasoning". It has not been measured, and because each consultation re-reads the conversation it may cost more than a single-model setup.

## Naming

`omni:max` is not effort `max` and not the Max plan. `omni:auto` is not `/effort auto` and not the auto permission mode.
