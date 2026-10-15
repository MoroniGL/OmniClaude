# OmniClaude

**Cost-aware model routing and multi-agent orchestration for Claude Code.**
The Claude Code edition of [OmniCodex](https://github.com/MoroniGL/Omnicodex).

> Use the right intelligence, at the right time.

Unofficial; not affiliated with Anthropic.

**v0.3.0-alpha.1 — Stage 2 (enforcing mod), experimental.** Stage 2 adds a mod that applies the routing profile inside the session; the Stage 1 measurement of advisory routing found no savings, and this is not a savings guarantee. OmniClaude still ships seven tiered workers and a routing skill as a native Claude Code plugin; the mod adds hooks and the `/omni` command, and writes no settings of its own (installing records the plugin in your `~/.claude/settings.json`, as any plugin install does). The Stage 1 eval (4 synthetic tasks, Opus 5.5 parent) found identical grader scores (1.00, the ceiling) with and without the plugin, higher cost with it in all four cases (+3% to +66% per run), and no OmniClaude-worker dispatch in the 8 of 14 with-plugin runs where it was counted (the other 6 had no general Agent counter); the routing skill did not fire in the 2 traced runs (scout-call-sites, docs-lookup) and Skill use was not counted elsewhere; see [measured results](docs/local-validation.md). The Stage 2 measurement (the same four synthetic tasks, 3 runs per arm, list-price estimates): under `economy` cost fell 24–47% per run with identical grader scores, a saving consistent with the enforced Sonnet parent (the eval JSON records no served model; the headless check with `OMNICLAUDE_PROFILE=economy` showed `claude-sonnet-5-5`), though the mod's effort setting and added context were not isolated; under `balanced` cost rose 10–61% with identical scores, with the parent unchanged and no delegation (the overhead was not isolated). Delegation stayed at zero in all 24 with-plugin Stage 2 eval runs; see [local validation](docs/local-validation.md#stage-2-measurement).

## What it does

OmniClaude keeps planning and acceptance in your main conversation, and lets Claude delegate bounded phases to the cheapest capable worker:

| Worker | Model / effort | Use |
|---|---|---|
| `omniclaude:haiku-researcher` | Haiku / medium | read-only search, docs lookup, extraction, verification |
| `omniclaude:sonnet-explorer` | Sonnet / low | read-only code mapping and call sites |
| `omniclaude:sonnet-implementer` | Sonnet / medium | bounded implementation, bug fixes, tests |
| `omniclaude:opus-planner` | Opus / medium | architecture and decomposition (no edits) |
| `omniclaude:opus-reviewer` | Opus / medium | independent review (no edits) |
| `omniclaude:opus-debugger` | Opus / high | difficult debugging |
| `omniclaude:fable-expert` | Fable / low | exceptional escalation, only after you agree |

The `routing` skill tells Claude when to delegate, how to hand off compactly, and how to escalate:

- First the same worker at higher effort, then the next tier at low effort.
- Tiny tasks stay in the parent.
- Workers cannot spawn their own subagents, so a tier cannot be bypassed by nesting.

## Install

Requires Claude Code 2.1.293 or later. In a Claude Code session:

```text
/plugin marketplace add MoroniGL/Omniclaude
/plugin install omniclaude@moronigl
```

`/plugin install` opens the plugin panel so you can choose a scope. You can also install from a shell:

```sh
claude plugin marketplace add MoroniGL/Omniclaude
claude plugin install omniclaude@moronigl
```

Run `/reload-plugins` or start a new session afterwards.

- **Where it works:** the CLI, and the desktop app's Code tab in local and SSH sessions. Plugins do not load in WSL or cloud sessions, including claude.ai/code.
- **Updates:** third-party marketplaces do not auto-update by default. Enable it in `/plugin`, or run `claude plugin update omniclaude@moronigl`.

## Use

Work as usual. On substantial tasks the routing skill and the mod's short routing-policy text ask Claude to delegate bounded phases; whether it does is Claude's choice (see Honest limits). You can also ask for a worker directly, for example *"use omniclaude:sonnet-explorer to map the checkout flow"* or `@agent-omniclaude:opus-reviewer`.

`/tasks` names the model on each subagent's row and the effort level set for it. `/omni status` shows what the mod requested, applied and verified for the main conversation, and the last subagent spawn it decided.

## Stage 2: the enforcing mod

The plugin ships a mod: a hooks module (`plugins/omniclaude/hooks/`) that Claude Code loads on engine 2.1.287 or later. Where Stage 1 asked Claude to route, the mod sets the model and effort itself.

**What the mod applies**

- **The main conversation:** the profile's model and effort on every main-loop request. The mod sends full model ids (`claude-haiku-5-5`, `claude-sonnet-5-5`, `claude-opus-5-5`, `claude-fable-5-1`), because the engine rejects aliases in `turn.step` (live-verified 2026-10-14). A step already on the profile's tier keeps the engine's own model id (only the effort is set); a step on another tier is rewritten to the tier's id. A parent on a 1M-context id (`[1m]`) keeps the suffix on a rewritten Opus or Sonnet id; Fable and Haiku have no 1M form, so under `max` the mod sends plain `claude-fable-5-1`.
- **Subagents:** Explore gets the profile's explore tier. Plan and general-purpose get the profile's general tier (Plan follows the general tier), and so does any other routed agent: other plugins' agents are routed by profile; agents of your own are routed only if the engine reports them as non-engine-provided (not live-verified). Among the engine's other built-in agents (for example claude-code-guide or statusline-setup) nothing is rewritten. An explicit `model` request on a routed agent is clamped to the profile's tier for it, except under `max`: a request above the tier (or one the mod cannot place) becomes the tier's id, one at or below it stands. OmniClaude workers keep their frontmatter tier; a higher request is clamped back to it, except under `max`. The tables are under Profiles.
- **fable-expert consent:** denied with `fable-expert needs your agreement: run /omni fable allow` unless the consent flag is true. The flag is set by `/omni fable allow`, by `/omni max`, by `/omni save max` (when `max` becomes the effective profile), by `/omni reset` back to a saved `max`, and at session start when the resolved profile is `max` (so `OMNICLAUDE_PROFILE=max` sets it too). Consent that `max` sets is cleared when you leave `max` via `/omni` (a `/config` change or another session's save does not clear it); consent you gave with `/omni fable allow` survives profile changes. `/omni fable deny` clears the flag and keeps fable-expert denied even under `max`.
- **Routing policy:** one short, session-scoped section added to the system prompt, so the policy reaches every request without the skill being invoked. It does not force Claude to delegate.

**What the mod does not touch:** forks, teammates and workflow agents (a teammate or workflow agent of type fable-expert still meets the consent gate), the engine's other built-in agents, the effort of subagent loops (the worker's own frontmatter applies), and whether Claude chooses to delegate at all.

**`/omni` commands.** Answers are text only; nothing enters the model's context.

| Command | Effect |
|---|---|
| `/omni status` | effective profile (and the environment variable when it supplies it), saved profile, session override, requested parent, last `auto` classification, what the engine requested and the mod applied on the last step, the model the API reported for the last turn, the last subagent spawn, fable consent, mod version |
| `/omni <profile>` | session override (`economy`, `balanced`, `quality`, `max`, `auto`); takes effect from the next step; entering `max` also prints a warning that Fable may bill usage credits |
| `/omni save <profile>` | saves the profile in the plugin's own store (not in `settings.json`). It applies now unless a session override stands in front of it (then it waits for `/omni reset`), and it applies in future sessions |
| `/omni reset` | clears the session override |
| `/omni fable allow` / `deny` | sets or clears the fable-expert consent flag for this session; `deny` also denies it under `max` |
| `/omni doctor` | engine version, every hook the mod registers, and the reasons `/omni` can be missing |

The profile in force is, in order: the session override (`/omni <profile>`), the saved profile (`/omni save`), the environment variable `OMNICLAUDE_PROFILE` (else `EVAL_OMNICLAUDE_PROFILE`, which a `claude plugin eval` session inherits), the `/config` picker "Routing profile", then `auto`. A value that names no profile counts as unset. The environment outranks the picker, whose manifest default is `auto`. The saved profile wins over both.

Prompts from `claude -p`, the SDK and `plugin eval` reportedly do not come from the composer, so `auto` never classifies them. Pick a fixed profile for such runs with the environment variable, for example `OMNICLAUDE_PROFILE=economy claude -p "..."`.

**`omni:auto`** (the picker's default). Each prompt you type in the composer is classified by a small model call (`$.model.classify`) into `trivial`, `routine`, `complex` or `critical`; notifications, prompts from other agents, and headless or eval prompts, which reportedly arrive with a non-composer origin, are left alone. Until the first prompt is classified, auto runs the parent as `balanced` does (Opus / medium).

| Class | Effort | Model |
|---|---|---|
| `trivial` | low | Sonnet |
| `routine` | medium | Sonnet |
| `complex` | medium | Opus |
| `critical` | high | Opus |

- Effort follows the class on every prompt.
- Cache rule: switching the parent model drops the prompt cache, changing effort keeps it. So the model is chosen at the first classified prompt, and a later upgrade (Sonnet to Opus) happens only while the context is below 40,000 tokens. Above that, the model is kept and effort is raised to `high`. The model is never downgraded mid-session. The model auto last ran on comes from the steps applied under `auto`; a step run under a fixed profile does not count.
- The classifier gets 2.5 s. A prompt it cannot label, a failed classifier request, or a timeout keeps the previous plan, and `/omni status` says which.
- Switching to another profile drops auto's plan and its last classification.
- The last classification shows in `/omni status`. The status-line badge reads `omni:auto · <class> → <model>/<effort>` during a turn.
- Cost: one small completion per prompt you type, waiting at most 2.5 s. Its actual latency has not yet been measured on a live session.

**Three levels of honesty**

| Level | What it is | Where |
|---|---|---|
| requested | what the profile (or the `auto` plan) asks for | `/omni status`, "requested parent" |
| applied | what the mod actually sent for the step | `/omni status`, "applied (last step)" |
| verified | the model id the API reports for the finished turn (`turn.complete.usage.model`) | `/omni status`, "verified (last turn, API-reported)"; the badge ends in a check mark when the verified tier matches the applied tier, and in `≠ <model>` otherwise |

Verified covers the main conversation only. For subagents, `/tasks` and the subagent transcripts remain the evidence; `/omni status` shows only the spawn the mod last decided (`<agent> → <model id>`, or `unchanged`), which is applied, not verified. If the hook errors on a step, the step runs unchanged and the badge reads `not applied (hook error)`.

**When the mod is off.** With `--bare`, `--safe-mode`, `disableAllHooks`, `allowManagedModsOnly`, a remote rollout switch, or an engine older than 2.1.287, the mod does not load and `/omni` is absent. The Stage 1 routing skill, the seven workers and the `--settings` profile files still work, as advisory routing only.

**Live-verified (2026-10-14, engine 2.1.295, headless runs; evidence in [local validation](docs/local-validation.md)):** the engine rejects aliases in `turn.step`; the mod sends full model ids; under `economy` the parent answered on `claude-sonnet-5-5` and an Explore subagent on `claude-haiku-5-5`; under `balanced` the parent answered on `claude-opus-5-5`. On 2026-10-15, `/omni status` ran in a new desktop Code-tab session and answered with the status text (profile `auto`, saved profile none, mod version 0.2.0-alpha.1); the status line showed `omni:auto`. Only `status` was exercised there.

**Not yet live-verified:**

- the `/omni` subcommands other than `status` in a desktop session (the mod's tests cover them; the headless attempt could not run the command);
- the fable refusal in a live session, the clamps, the `quality`, `max` and `auto` profiles, Plan and general-purpose routing, and routing of other plugins' agents;
- the `[1m]` form of a full id;
- the latency of the `auto` classifier call.

## Profiles

A profile sets what the mod applies: the parent's model and effort, the tier of the subagents it routes, and whether fable-expert needs consent. Choose one with `/omni`, `/omni save`, the `OMNICLAUDE_PROFILE` environment variable (for headless runs), or the `/config` picker "Routing profile"; the order in which they apply is under Stage 2. Profile names are shown as `omni:<name>`; commands use the bare name. See [profiles](docs/profiles.md).

| Profile | Parent (every main-loop request) | Explore | Plan, general-purpose and other routed subagents | fable-expert |
|---|---|---|---|---|
| `omni:economy` | Sonnet / medium | Haiku | Sonnet | denied until `/omni fable allow` |
| `omni:balanced` | Opus / medium | Sonnet | Sonnet | denied until `/omni fable allow` |
| `omni:quality` | Opus / high | Sonnet | Opus | denied until `/omni fable allow` |
| `omni:max` | Fable / high | Opus | Opus | allowed; `max` sets the consent flag, and Fable may bill usage credits |
| `omni:auto` (default) | per prompt, from the classifier (Opus / medium until the first prompt is classified) | as `balanced` | as `balanced` | denied until `/omni fable allow` |

Worker tiers are the same in every profile (haiku, sonnet, opus, fable).

**Sessions without the mod.** The `--settings` files in `plugins/omniclaude/profiles/` remain for them. They set the parent's model and effort for one CLI session; nothing clamps subagents:

```sh
claude --settings ~/omniclaude-profiles/balanced.settings.json
```

Copy a profile file from `plugins/omniclaude/profiles/` to a stable location first. The balanced and max files also set `env.CLAUDE_CODE_SUBAGENT_MODEL` for unassigned subagents; that is not yet verified live (see anthropics/claude-code#43869). The desktop app has no `--settings` equivalent: if the mod is off, choose the parent with `/model` and the effort with `/effort` (Ctrl+Shift+E).

`omni:max` is a profile name. It does not mean effort `max` or the Max plan.

### Optional: the advisor

Optional and not automated by OmniClaude; not measured: a manual arm recorded no advisor use on these small prompts ([details](docs/local-validation.md#manual-advisor-arm-not-comparable)). Claude Code has an experimental advisor feature (official docs, checked 2026-10-14): a stronger model the main model can consult.

- Set it with `/advisor opus`, the `advisorModel` setting, or `--advisor`. It works on the Anthropic API only (subscriptions included).
- Claude decides when to consult it, and the advisor reads the whole conversation on each call, billed at its own rates.
- A Sonnet 5.5 parent accepts Fable, Opus 5 or later, and Sonnet 5.5 advisors. Subagents inherit the advisor. Fable as an advisor needs usage-credit consent.
- An advisor must rank at or above the main model, so the pairing changes with the profile: under `balanced` or `quality` (Opus parent) `/advisor opus` is an Opus-on-Opus check, and under `max` (Fable parent) an Opus or Sonnet advisor is not applied at all; only a Fable advisor is. The advisor also needs feature-flag fetching: a session with a variable such as `DISABLE_TELEMETRY` set has no advisor, and `CLAUDE_CODE_DISABLE_ADVISOR_TOOL=1` disables it entirely. Toggling the advisor does not invalidate the main model's prompt cache (official advisor page, checked 2026-10-15).

One combination you could try: `economy` (Sonnet parent) plus `/advisor opus`, a rough analogue of OmniCodex's "Terra control plane, Sol for consequential reasoning". Its effect on cost and quality is not measured, and every advisor call re-reads the conversation, so it may cost more than a single-model setup.

## Honest limits

- **Tiers are applied by the mod on every spawn it routes (Explore, Plan, general-purpose, other plugins' agents and OmniClaude workers; agents of your own only if the engine reports them as non-engine-provided, not live-verified); forks, teammates, workflow agents and the engine's other built-in agents are not rewritten; sessions where the mod is off fall back to advisory routing,** where Claude can pass its own model or effort on an Agent call and nothing clamps it.
- **Applied is not verified until the API says so.** The mod reports what it sent; the model that answered is read back for the main conversation only. The engine rejects aliases in `turn.step`; the mod sends full model ids (live-verified 2026-10-14).
- **The mod cannot read a custom subagent's own frontmatter model,** so other plugins' agents are routed by profile; agents of your own are routed only if the engine reports them as non-engine-provided (not live-verified).
- **'Read-only' and 'no edits' are instructions, not tool restrictions,** for sonnet-explorer, opus-planner and opus-reviewer, which keep Bash. Only haiku-researcher has no shell at all.
- **Delegation is still Claude's choice.** The mod adds routing-policy text and fixes tiers, but it does not force delegation. In the Stage 1 eval no OmniClaude-worker dispatch was observed in the 8 of 14 with-plugin runs that had a counter (scout-call-sites counted only `omniclaude:` matches; tiny-edit and the 2 traced diagnostics counted any Agent call; the other 6 had no general Agent counter); in the Stage 2 eval none of the 24 with-plugin runs made an Agent or Skill call. See measured results.
- **Multi-model setups can cost more** than one model at lower effort, and `auto` adds one small model call per prompt. OmniClaude claims savings only from a measured eval; the Stage 1 eval found none, and the Stage 2 eval found a cost cut only under `economy` and a cost increase under `balanced`.
- **Savings measured so far are consistent with pinning a cheaper parent model, not with delegation,** which did not happen in any measured run. The eval JSON records no served model (the headless check with `OMNICLAUDE_PROFILE=economy` showed `claude-sonnet-5-5`), and the mod's effort setting and added context were not isolated.
- **Graders sat at the 1.00 ceiling,** so a quality drop finer than pass/fail is not detectable in this eval.
- **`OMNICLAUDE_PROFILE=max` or `/omni save max` grants fable consent without a prompt** (max counts as consent).
- **Other providers degrade the tiers.** On Bedrock, Vertex and Foundry the aliases map to older models, some without effort support. The mod sends Anthropic API model ids; how it behaves there was not tested.
- **Fable may bill usage credits** on some plans (Anthropic's support article on Fable access describes Pro and Team Standard seats; check your plan). `fable-expert` does not run until you run `/omni fable allow` or the profile is `max`, which counts as consent without a prompt.

## Differences from OmniCodex

- Same worker names and roles.
- haiku runs at medium effort, because Haiku 5.5 stops early at low.
- fable starts at low effort and re-runs at high on failure (again with your agreement), following Anthropic's "next tier at low effort" guidance.
- fable-expert asks for your agreement first, even after an opus worker fails (except under `max`, which counts as consent); the mod enforces it with a denial until `/omni fable allow`.
- In-session control is the `/omni` slash command, not a natural-language `omni ...` parser.
- No Gemini context offload yet; that is phase 2.

## Sources

The runtime behavior described here (subagent model precedence, effort levels, pricing, Haiku 5.5 behavior, desktop limits) comes from the official docs, checked on 2026-10-13 (the advisor page on 2026-10-14). Statements not covered by these pages are marked unverified in the text:

- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/model-config
- https://code.claude.com/docs/en/settings-reference
- https://code.claude.com/docs/en/plugins/components
- https://code.claude.com/docs/en/costs
- https://code.claude.com/docs/en/desktop
- https://code.claude.com/docs/en/prompt-caching
- https://code.claude.com/docs/en/discover-plugins
- https://code.claude.com/docs/en/advisor
- https://platform.claude.com/docs/en/about-claude/pricing
- https://platform.claude.com/docs/en/models/overview

## Development

```sh
python -m unittest discover -s tests -v
claude plugin validate . --strict
claude plugin validate plugins/omniclaude --strict
claude plugin test plugins/omniclaude
```

`claude plugin test` runs the mod's tests (`plugins/omniclaude/hooks/*.test.ts`). The eval suite under `plugins/omniclaude/evals/` compares runs with and without the plugin. See [local validation](docs/local-validation.md).

## License

MIT; see [LICENSE](LICENSE).
