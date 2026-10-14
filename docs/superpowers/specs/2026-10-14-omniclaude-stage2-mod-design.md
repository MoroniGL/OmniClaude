# OmniClaude Stage 2 design: the enforcing mod

Date: 2026-10-14. Status: approved direction. Builds on the Stage 1 spec
(`2026-10-13-omniclaude-design.md`) and on the Stage 1 measurement.

## 1. Why Stage 2 exists

Stage 1 shipped the workers and a routing skill. The eval showed the core problem:
with Opus 5.5 as parent, the skill never fired in traced runs, no worker was
dispatched in any counted run, and cost was higher with the plugin in all four
cases. Advisory routing does not route.

Claude Code 2.1.287+ (desktop engine 2.1.286+) supports **mods**: a plugin can ship a
hooks module (TypeScript) whose hooks sit on the engine's own events. Verified on
this build (2.1.295) from the engine's type definitions (`claude-code.d.ts`):

| Event / noun | What it lets the mod do | Why it matters |
|---|---|---|
| `turn.step` | rewrite `model` and `effort` of every model request, main loop and subagent loops | the profile can pin the parent's model and effort, as `codex -p` does |
| `agent.spawn` | rewrite `model`, `subagentType`, `prompt`; or `{ deny }` | worker tiers become **applied**, including for built-in Explore and general-purpose; astra needs consent |
| `prompt.compose` | add a session-scoped system-prompt section | the routing policy reaches every request without the skill being invoked |
| `turn.complete` | `usage.model` is "which model answered, by the id the API reports" | a real **verified** level, per turn |
| `$.model.classify(text, labels)` | one cheap completion (default the engine's small model) | `omni:auto` becomes a real classifier |
| `command.register` / `command.run` | `/omni` answered with `{ text }` only | session control with zero model tokens |
| `$.store` / `$.state` | JSON values across sessions / within a session | persisted profile without touching `settings.json` |
| `prompt.submit` `origin.kind` | `composer` marks the person's own prompt | control messages cannot be forged by other agents or `/loop` |
| `userConfig` with `options` | a picker in `/config` | profile choice in the native settings menu |

Consequences for the Stage 1 plan: `setup.py`, the persisted `settings.json` writes
and the Python hooks are **no longer needed**. Stage 2 is the mod plus docs and
tests. Stage 1 assets stay as the fallback when the mod is off.

## 2. Goals and non-goals

Goals:

- Enforce the active profile: parent model and effort on every request, cheap tiers
  for every subagent that has no model of its own, consent before astra-expert.
- Make `omni:auto` adaptive: classify each prompt and choose tier and effort, with
  an explainable reason shown in the status line.
- Keep the honesty contract, now at three levels: **requested** (profile),
  **applied** (what the mod sent), **verified** (`turn.complete.usage.model`).
- Re-measure with the same eval suite and record the result, favorable or not.

Non-goals (this stage):

- No Gemini offload. No natural-language `omni …` parser (only `/omni`). No edits
  to `settings.json` or `CLAUDE.md`. No cross-session memory beyond the saved
  profile. No savings claim without the measurement.

## 3. Profiles (enforced)

Worker agents keep their Stage 1 frontmatter. The profile adds what the mod enforces.

| Profile | Parent (applied on every main-loop step) | Explore / Plan / general-purpose and any model-less agent | astra-expert |
|---|---|---|---|
| `economy` | sonnet / medium | Explore → haiku; others → sonnet | denied unless consented |
| `balanced` (default when saved profile is unset and auto is off) | opus / medium | Explore → sonnet; general-purpose → sonnet | denied unless consented |
| `quality` | opus / high | Explore → sonnet; general-purpose → opus | denied unless consented |
| `max` | fable / high | Explore → opus; general-purpose → opus | allowed after one consent per session |
| `auto` (default) | chosen by the classifier (section 4) | as `balanced` | denied unless consented |

Rules:

- A worker's own frontmatter tier is applied as-is. If the parent passes a `model`
  on the Agent call that is *above* the worker's tier, the mod clamps it back to
  the tier, except under `max`. A `model` below the tier is allowed.
- `omniclaude:astra-expert` is denied with the reason
  `astra-expert needs your agreement: run /omni astra allow` until
  `/omni astra allow` sets a session consent flag. `max` sets the flag once with a
  warning line.
- Effort on subagent loops is left to the worker's frontmatter (not rewritten).
- Forks always inherit; the mod does not touch `fork` spawns or teammates.

## 4. `omni:auto`

On each prompt the person types (`origin.kind === 'composer'`), the mod runs
`$.model.classify(text, ['trivial', 'routine', 'complex', 'critical'])` with a fixed
prompt. Mapping:

| Class | Effort | Model wish |
|---|---|---|
| trivial (one-file edits, questions, formatting) | low | sonnet |
| routine (ordinary feature or bug work) | medium | sonnet |
| complex (multi-module design, difficult debugging) | medium | opus |
| critical (security, data integrity, concurrency, architecture) | high | opus |

Cache rule, because switching the parent model drops the prompt cache while
changing effort keeps it:

- Effort follows the class on every turn.
- The parent **model** is chosen at the first classified prompt of the session.
- Later, an upgrade (sonnet → opus) happens only when the class is `complex` or
  `critical` **and** the context is below 40k tokens (`$.session.usage()`); otherwise
  the model stays and effort is raised to `high`, with the reason
  `kept <model> to preserve the cache`.
- The model is never downgraded mid-session.
- A classifier failure (no label, API error) leaves the previous plan in place and
  is reported in `/omni status`.

The status line shows `omni:auto · <class> → <model>/<effort>` so every decision is
explainable at a glance. Classification cost is one small completion per prompt.

## 5. Session control: `/omni`

Registered by the mod at `session.start`. Answered by `command.run` with `{ text }`
and no `context`, so nothing enters the model's context.

| Command | Effect |
|---|---|
| `/omni status` | saved profile, session override, current plan (requested/applied/verified for the last turn), consent flag, mod version |
| `/omni economy\|balanced\|quality\|max\|auto` | session override (`$.state`); takes effect from the next step |
| `/omni save <profile>` | persists to `$.store` for future sessions |
| `/omni reset` | clears the session override |
| `/omni astra allow\|deny` | sets or clears the astra consent flag for this session |
| `/omni doctor` | engine version, whether each hook is active, last classifier result, kill-switch hints |

`/omni` absent in a session means the mod is not loaded (`--bare`, `--safe-mode`,
`disableAllHooks`, `allowManagedModsOnly`, a remote rollout switch, or an engine
older than 2.1.287). Stage 1 assets still work in that case; the README says so.

The `userConfig` option `profile` (picker: auto, economy, balanced, quality, max;
default auto) is the saved default a person can set from `/config`; `/omni save`
writes the same value to `$.store`, and `$.store` wins when both exist.

## 6. Routing policy in the system prompt

`prompt.compose` adds one `session`-scoped section (`omniclaude:policy`, about 150
tokens): the active profile, the rule "delegate exploration and research to
`omniclaude:terra-explorer` or `omniclaude:luna-researcher` instead of reading many
files in the parent; keep tiny work in the parent", the astra consent rule, and a
pointer to the `routing` skill for details. The skill stays installed for the
on-demand details and for sessions without the mod.

## 7. Honesty at three levels

| Level | Source | Shown where |
|---|---|---|
| requested | profile table / classifier plan | `/omni status`, status line |
| applied | what `turn.step` and `agent.spawn` sent (`model`, `effort`) | `/omni status` |
| verified | `turn.complete.usage.model` for the main loop; subagent `turn.complete` for workers | `/omni status` (last turn), status line check mark when verified matches applied |

Docs never say "enforced" for a path the mod cannot reach (forks, teammates, sessions
where the mod is off).

## 8. Layout and files

The mod lives inside the existing plugin, so there is one install:

```
plugins/omniclaude/
  .claude-plugin/plugin.json      + "types": "./types/index.d.ts", userConfig.profile
  hooks/hooks.json                { "modules": ["./register.ts"] }
  hooks/register.ts               hook wiring only
  hooks/policy.ts                 pure: profile table, clamp, classifier mapping, cache rule
  hooks/omni-command.ts           /omni handlers (pure text builders + state access)
  hooks/*.test.ts                 claude plugin test
  types/index.d.ts                PluginState contract: profileOverride, plan, observed, astraConsent
```

If the engine refuses relative imports between module files (to be confirmed with
`claude plugin validate` in the first task), the three source files collapse into
`register.ts` with the same sections.

Development loop: the installed plugin is read from `C:\CC\omniclaude\plugins\omniclaude`
itself (folder marketplace with a relative source), so edits plus `/reload-plugins`
reload the mod in the running desktop session; `claude --debug` and
`claude plugin validate plugins/omniclaude` give the reasons for anything refused.

## 9. Tests and acceptance

Offline (`claude plugin test plugins/omniclaude`, plus the existing Python asset tests):

1. `turn.step` on the main loop under `balanced` sends `opus` / `medium`; under
   `economy` sends `sonnet` / `medium`; subagent steps are not model-rewritten.
2. `agent.spawn` of `Explore` under `economy` gets `haiku`; `general-purpose` under
   `quality` gets `opus`; `omniclaude:luna-researcher` with a parent `model: opus`
   is clamped to `haiku`; `omniclaude:astra-expert` is denied until consent.
3. `auto`: each class maps to the documented effort and model; the upgrade is refused
   above 40k context; a classifier error keeps the previous plan.
4. `/omni status|save|reset|astra allow` produce the documented text and state;
   `save` writes `$.store`.
5. `prompt.compose` adds exactly one `omniclaude:policy` section, `session`-scoped.
6. Python asset tests still pass; `claude plugin validate --strict` passes.

Live acceptance (this machine, desktop session):

7. `/omni status` works; `/omni economy` then a prompt shows `sonnet` in
   `turn.complete.usage.model` (verified level), recorded in `docs/local-validation.md`.
8. A built-in Explore dispatch under `economy` runs on Haiku (subagent transcript).
9. astra-expert is refused without consent and allowed after `/omni astra allow`.

Measurement (user-approved budget, same cap as Stage 1):

10. Re-run the Stage 1 eval suite with every case carrying a general `tool_used:
    Agent` counter and a `tool_used: Skill` indicator, under `balanced` and under
    `economy`, parent pinned as the profile says. Record WITH/W/OUT cost, scores,
    delegation rate, applied and verified models. State plainly whether cost went
    down; still no savings claim beyond the measured rows.

## 10. Risks

- Per-step model rewrite of the main loop: the value format (alias vs id) is
  documented for `agent.spawn` (alias or id) but not for `turn.step`; the first live
  test settles it.
- Prompt-cache churn under `auto` is bounded by the cache rule, not eliminated.
- Fable: the engine may show a billing consent prompt; the mod's own consent flag is
  in addition, not instead.
- Mods can be switched off remotely or by flags; the fallback is Stage 1 behavior.
- A hook runs within a time budget per dispatch; the classifier call must stay well
  inside it (cap `maxTokens`, short prompt, `timeoutMs`).
- Hooks that guard must use `.catch(($, e, next) => next.called ? next(e) : {...})`
  so a thrown hook does not silently let an astra spawn through.
- The desktop Code tab must be 2.1.286+ (it is 2.1.295 here).

## 11. Delivery order

1. Skeleton mod that registers `/omni status` and a `turn.step` logger (proves load,
   hot reload, and the `turn.step` model field format live).
2. Profiles enforced (`turn.step`, `agent.spawn`, clamp, astra consent) with tests.
3. `/omni` full command set and `$.store` persistence.
4. `prompt.compose` policy section.
5. `auto` classifier with the cache rule.
6. Docs, local validation, eval re-run, publish.

## Amendments (2026-10-14)

Rulings made during implementation, review and the first live runs that change this
spec. The sections above stay as written; where they disagree, this section wins.

1. **The astra gate reads the consent flag.** The flag is the gate's only input.
   `/omni astra allow`, `/omni max`, `/omni save max` (when `max` becomes the effective
   profile) and a session that starts on `max` set it; consent that `max` sets is cleared
   when the profile leaves `max`, while an explicit `allow` survives. `/omni astra deny`
   denies astra-expert even under `max`. (Changes section 3, "`max` sets the flag once".)
2. **Environment profile fallback.** The profile in force is the session override, else
   the plugin store (`/omni save`), else `OMNICLAUDE_PROFILE` (then
   `EVAL_OMNICLAUDE_PROFILE`), else the `/config` option, else `auto`. Eval and SDK
   prompts are not composer prompts, so `auto` never classifies them, and the engine
   always fills the option with its default; the environment picks a profile for those
   runs. (Extends section 5.)
3. **Full model ids.** `turn.step` rejects aliases (live, 2026-10-14:
   `unrecognized_model`, HTTP 404, for `opus`); the mod sends `claude-haiku-5-5`,
   `claude-sonnet-5-5`, `claude-opus-5-5` and `claude-fable-5-1`, and keeps a `[1m]`
   suffix on Opus and Sonnet ids. (Settles the first risk in section 10.)
4. **Only Explore, Plan and general-purpose are routed among engine built-ins.** Other
   engine agents keep their own model; agents from plugins (and the user's own) are
   routed by profile. (Narrows section 3, "any model-less agent".)
5. **Explicit requests on non-OmniClaude agents are clamped** to the profile's tier for
   that agent, except under `max`; a request at or below the tier stands. (Extends
   section 3, which spoke only of workers.)
6. **Plan follows the general tier** (Explore has its own).
7. **Kept-for-cache effort is `high`:** when `auto` holds the model back from the class's
   wish, it raises effort to `high`. (Fixes the effort of section 4's cache rule.)
8. **`auto`'s current model comes from the steps applied under `auto`,** and from the
   plan before any such step; a step run under a fixed profile does not count.
   Switching profile drops the plan and the last classification.
9. **`/omni save` applies now** when no session override stands in front of it; with an
   override, the saved profile waits for `/omni reset`. (Extends section 5.)
10. **Main-loop steps are rewritten only across tiers** (a step already on the target tier
    keeps the engine's own id and gets the profile's effort), and the classifier waits at
    most 2.5 s before `auto` keeps its plan. (Implements the time cap named in the classifier risk of section 10.)
