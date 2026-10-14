# OmniClaude design

Date: 2026-10-13. Status: approved direction, staged delivery.

OmniClaude is the Claude Code edition of
[OmniCodex](https://github.com/MoroniGL/Omnicodex): cost-aware model routing and
multi-agent orchestration that changes *who* does the work, never the acceptance
criteria. It is unofficial and not affiliated with Anthropic.

## 1. Goals and non-goals

Goals:

- Port OmniCodex's routing policy, profiles, and seven tiered workers to the
  mechanisms Claude Code actually supports.
- Install natively as a Claude Code plugin from its own marketplace.
- Keep every runtime claim honest: distinguish what was *requested*, what was
  *observed*, and what is *verified*.
- Windows 11 and the Claude desktop app (Code tab, local sessions) are
  first-class targets; the CLI must also work.

Non-goals (all stages):

- No savings, billing, or allowance guarantees. Independent measurements,
  including Anthropic's cost guidance, show multi-model setups can cost more
  than one model at lower effort. Savings are claimed only from a measured eval.
- No changes to permissions, sandbox, MCP servers, providers, or credentials.
- No edits to any `CLAUDE.md`.
- No support for WSL, cloud sessions, or claude.ai/code (plugins do not load there).

## 2. Verified platform facts (Claude Code 2.1.295, checked 2026-10-13)

Each fact was researched and then independently re-checked. Primary sources are under
https://code.claude.com/docs/en/.

| Fact | Source |
|---|---|
| Subagent frontmatter supports `model` (`haiku`, `sonnet`, `opus`, `fable`, full ID, `inherit`), `effort` (`low` to `max`), `tools`, `disallowedTools`, `omitClaudeMd`. Plugin agents ignore `hooks`, `mcpServers`, `permissionMode`. | sub-agents.md, plugins/components.md |
| Subagent model precedence: per-invocation parameter > frontmatter > `CLAUDE_CODE_SUBAGENT_MODEL` > main model (since v2.1.251). The env var does not affect built-in Explore or Plan. | sub-agents.md |
| The parent can pass `model`/`effort` per Agent call (v2.1.292+), so worker tiers are *requested*, not enforced. Only `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` (flattens tiers) or a mod `agent.spawn` hook enforces them. | sub-agents.md, plugins/mods/reference.md |
| Subagents can spawn subagents up to three layers deep unless `Agent` is disallowed. | sub-agents.md |
| A plugin's `settings.json` honors only `agent` and `subagentStatusLine`; plugins cannot ship model or effort defaults. | plugins/components.md |
| A top-level `effortLevel` in user settings is ignored by Opus 5.5 and later models (Sonnet 5.5, Haiku 5.5); per-model effort lives in `modelSettings["<canonical-id>"].effortLevel`. `max` is not accepted in either key. A top-level `effortLevel` passed with `--settings` applies to every model. | settings-reference.md, model-config.md |
| The desktop app has no `--settings` or `--agent` equivalent; it reads the same `~/.claude/settings.json`. Model and effort are read at session start. | desktop.md, settings.md |
| On this machine `claude` is not on PATH; the engine is the desktop-embedded copy whose path changes per version. | local `which -a claude`, `%APPDATA%\Claude\claude-code\` |
| Hook command form: exec form (`command` + `args`) spawns without a shell and needs a real `.exe` on Windows. Shell form uses Git Bash, where `python3` resolves to the Microsoft Store stub on this machine and silently fails; `py -I` runs Python 3.12.10. | hooks.md, local test |
| `${CLAUDE_PLUGIN_ROOT}` changes on every update; `${CLAUDE_PLUGIN_DATA}` persists across updates and is deleted on uninstall. | plugins/manifest-reference.md |
| `UserPromptSubmit` also fires on turns the user did not type (`/loop`, scheduled, background, cross-session) and has no origin field. `UserPromptExpansion` fires only for user-typed slash commands and can block (reason shown, no turn) or add context. | hooks.md |
| Changing the main model mid-session drops the prompt cache; changing effort on the 5.5 models and Fable 5.1 keeps it. | prompt-caching.md |
| Mods (plugin JS/TS hook modules, CLI 2.1.287+, desktop engine 2.1.286+) can change model or effort per request and pick subagent models. They can be switched off remotely and by `--bare`, `--safe-mode`, `disableAllHooks`. | plugins/mods/*.md |
| Pricing per MTok (input/output): Fable 5.1 $10/$50, Opus 5.5 $4/$20, Sonnet 5.5 $2/$10, Haiku 5.5 $0.10/$0.50 up to a 100K-token prompt and 5x above it (cache reads count). | platform pricing docs |
| Haiku 5.5 is far weaker at agentic coding (Terminal-Bench 39.2 vs Sonnet 5.5 70.6), stops early at low effort, and Anthropic recommends medium for agentic use. Opus 5.5 at medium matched Fable 5.1 at its default for about 1/5 of the cost per solved task. | Haiku 5.5 launch post and prompting guide, cost guidance |
| Shipped prompt sections can discourage delegation but exempt delegation that a `CLAUDE.md` file or a skill asks for. | local 2.1.295 binary strings |
| `claude plugin validate --strict` passes `omniclaude`, warns on `omni-claude`, rejects `claude-*`. It does not check agent names or model values. | local runs |

## 3. Name and identity

- Product: **OmniClaude**. Plugin id `omniclaude`, marketplace name `moronigl`,
  install id `omniclaude@moronigl`.
- Every manifest, the README, and the plugin description say:
  "Unofficial; not affiliated with Anthropic."
- Known risk: Anthropic's trademark guidance discourages "Claude" in product names,
  and `omniclaude` is taken on PyPI. OmniClaude is distributed only through its own
  marketplace and is not submitted to the official directory. If that changes, it is
  renamed first, using the marketplace `renames` map.

## 4. Repository layout

```
.claude-plugin/marketplace.json        name "moronigl"; one entry, source "./plugins/omniclaude"
plugins/omniclaude/
  .claude-plugin/plugin.json           the only place the version is set
  agents/                              seven tiered workers (section 5)
  skills/routing/SKILL.md              routing policy (section 7)
  skills/routing/references/           routing.md, efficiency.md (loaded on demand)
  profiles/                            economy|balanced|quality|max .settings.json (CLI --settings)
docs/                                  architecture, profiles, local validation
tests/                                 offline asset regression tests (stdlib unittest)
.github/workflows/validate.yml         tests, compileall, whitespace check
README.md  CHANGELOG.md  CONTRIBUTING.md  CLAUDE.md  LICENSE (MIT)  VERSION  .gitignore
```

The plugin lives under `plugins/` so that tests, docs, and future installers are not
copied into the user's plugin cache. The plugin ships no `settings.json` and no `bin/`.

## 5. Workers

The names are identical to OmniCodex. A tier word names a cost tier, not a model family,
so it stays honest under per-invocation overrides and future remaps. The model appears
only in frontmatter, as an alias. Every worker sets `disallowedTools: Agent`, so it
cannot spawn nested subagents that bypass the tiers.

| Agent (`omniclaude:<name>`) | Model | Effort | Tools | Notes |
|---|---|---|---|---|
| `luna-researcher` | haiku | medium | Read, Grep, Glob, WebSearch, WebFetch | read-only; `omitClaudeMd`; compact results to stay under Haiku's 100K price threshold |
| `terra-explorer` | sonnet | low | Read, Grep, Glob, Bash | read-only code mapping; `omitClaudeMd` |
| `terra-implementer` | sonnet | medium | inherited minus Agent | bounded implementation; loads project `CLAUDE.md` |
| `sol-planner` | opus | medium | inherited minus Agent, Edit, Write, NotebookEdit | architecture and decomposition |
| `sol-reviewer` | opus | medium | inherited minus Agent, Edit, Write, NotebookEdit | independent review; parent may request high per call |
| `sol-debugger` | opus | high | inherited minus Agent | root-cause debugging |
| `astra-expert` | fable | low | inherited minus Agent | exceptional escalation only, and only after the user explicitly agrees (also after a failed sol attempt); re-run at high on failure, again with agreement |

There are two deliberate differences from OmniCodex, both documented in the README:

- luna runs at medium, because Haiku 5.5 stops early at low.
- astra starts at low, following Anthropic's "next tier at low effort" guidance and the
  Opus-versus-Fable cost evidence.

Descriptions are 60 words or fewer: role first, then when to use it, then the tier.
`terra-explorer`'s Bash is limited by instructions to read-only commands. Because this
is advisory, Bash is the one non-read tool it keeps, and the docs say so.

## 6. Profiles

A profile defines the parent model and effort, plus the default model for
*unassigned* subagents (general-purpose, teammates, workflow agents). Worker tiers come
from section 5 in every profile.

| Profile | Parent | Effort | Unassigned subagents | Notes |
|---|---|---|---|---|
| `economy` | sonnet | medium | inherit (Sonnet) | Terra-first control plane |
| `balanced` | opus | medium | sonnet | equals Claude Code's native default plus routing |
| `quality` | opus | high | inherit (Opus) | xhigh left to the user per session |
| `max` | fable | high | opus | plan-gated: Fable may bill usage credits on some plans |
| `auto` | unchanged | unchanged | unchanged | policy only, recommend-only; displayed as `omni:auto` |

Docs always render `omni:max` and `omni:auto`, so the names are not confused with effort
`max`, the Max plan, `/effort auto`, or the auto permission mode.

Delivery:

- **Stage 1.** `profiles/*.settings.json` for CLI users:
  `claude --settings <path>/balanced.settings.json`. Each file sets `model`, a top-level
  `effortLevel` (valid only through `--settings`), and, where the table says so,
  `env.CLAUDE_CODE_SUBAGENT_MODEL`. Desktop users follow documented native steps
  (`/model <alias>`, `/effort <level>`).
- **Stage 2.** Persisted defaults for desktop users through `setup.py` (section 9).

Profiles never contain `CLAUDE_CODE_EFFORT_LEVEL` (it flattens every worker's effort),
`CLAUDE_CODE_SUBAGENT_MODEL_FORCE`, or `effortLevel: "max"`.

## 7. Routing skill

`skills/routing/SKILL.md` stays model-invocable, has no `model:` frontmatter, and has a
short trigger-rich description. It is the documented authorization path for
delegation, since shipped prompt text exempts delegation that a skill asks for.

The body is small, and the references load on demand. It is a port of OmniCodex's
`skills/omnicodex`:

1. Tiny or tightly scoped work stays with the parent.
2. Substantial work: delegate bounded phases to the cheapest capable worker, with
   explicit scope, constraints, acceptance criteria, and existing evidence. Do not
   forward the full conversation. Include today's date in luna handoffs.
3. Escalation ladder for checkable work:
   - On a failure, raise effort on the same model.
   - Then move to the next tier at low effort.
   - astra comes last, and only after the user explicitly agrees, including after a failed sol attempt.
4. Parallelize only independent read-only work; keep dependent chains in the parent.
5. Never claim a model switch; report requested, observed, and verified separately.
6. Compact handoff format and soft word targets, carried over from OmniCodex
   `references/efficiency.md`.

## 8. Stage 1: core (this delivery)

Stage 1 delivers:

- The layout, manifests, seven agents, routing skill and references, profile files,
  docs, offline tests, and CI.
- **No Python runtime and no hooks.** Today's date reaches luna through the routing
  skill's handoff rule instead of a hook.

Acceptance criteria:

1. `claude plugin validate --strict` passes for the marketplace and for
   `plugins/omniclaude/.claude-plugin/plugin.json`, run with the local engine.
2. `python -m unittest discover -s tests` passes. The tests check:
   - agent frontmatter: names, aliases, efforts, and `disallowedTools` containing Agent;
   - explicit tool allowlists with no Edit or Write for luna and terra-explorer;
   - description length;
   - manifest consistency, with the version in `plugin.json` matching `VERSION`;
   - the reserved-name rule;
   - that skill references resolve;
   - the profile files' keys and values, including the forbidden keys.
3. Live acceptance on this machine, recorded in `docs/local-validation.md`:
   - Install from the local marketplace.
   - In a new desktop session, `omniclaude:luna-researcher` and
     `omniclaude:terra-implementer` are callable.
   - `/tasks` and the subagent transcript show the requested model and effort.
   - `omitClaudeMd` is honored.
   - The routing skill triggers on a substantial task.
4. Measurement (**requires explicit user approval before running, because it spends
   real usage**): run `claude plugin eval` with the no-plugin baseline arm on a small
   set of representative prompts, comparing against plain Opus 5.5 at medium. Set
   `--max-cost-usd` and exclude astra. Record the results without percentages-as-claims.

## 9. Stage 2: control plane (planned after Stage 1 results)

The stage 2 outline below gets re-planned with stage 1 evidence:

- `/omni <economy|balanced|quality|max|auto|status|reset|doctor|save <profile> [--apply]>`
  is a user-only skill plus a `UserPromptExpansion` hook:
  - Profile verbs add policy context.
  - `status`, `doctor` and `save` are handled by a script and blocked, so no model turn
    runs.
  - The skill body is the fallback when hooks fail.
  - The plain-text `omni …` parser is out, because `UserPromptSubmit` fires on
    non-user turns.
- Python 3.11+ stdlib scripts, called through exec-form hooks `py -I <script>` (the
  interpreter is configurable). The script adds its own directory to `sys.path`.
- `setup.py` is preview-first, with `--apply`, `--revert` and `--uninstall`, and resolves
  `CLAUDE_CONFIG_DIR`.
  - It writes only `model` (alias), `modelSettings["<id>"].effortLevel` and, for
    `balanced`/`max`, `env.CLAUDE_CODE_SUBAGENT_MODEL`.
  - Saving `balanced` removes the owned keys, since it equals the native default.
  - It ports OmniCodex's lock, backup, journal, atomic replace and conflict detection.
  - `status` reports drift and the winning source, because native `/model` and
    `/effort` rewrite the same keys.
- State is split by lifetime:
  - Durable state lives in `~/.claude/omniclaude/`: the journal, backups and saved
    policy.
  - Ephemeral state lives in `${CLAUDE_PLUGIN_DATA}`: per-session overrides keyed by
    `sha256(session_id)` and a heartbeat.
- `SessionStart` injects the saved policy name and a pointer to the skill. It records
  the observed model. Nothing is injected on every turn.
- `/omni doctor` covers:
  - the interpreter, a hook heartbeat and the engine version;
  - env overrides (`CLAUDE_CODE_EFFORT_LEVEL`, `ANTHROPIC_MODEL`, `maxEffortLevel`);
  - alias-to-keyed-ID drift;
  - other routers registered on `UserPromptSubmit` or `SubagentStart` (for example the
    claude-flow router in `C:\CC`).
- Optional, off by default: `~/.claude/agents/Explore.md` on haiku/medium, journaled
  and reverted by `--uninstall`.

## 10. Phase 2 and later

- An optional mod enforces worker models (`agent.spawn`), lets `omni:auto` change
  effort only (`turn.step`), and sets `verified` from `result.usage.model`. The Python
  hooks stay as the fallback.
- A Gemini Direct context offload port with source-linked EvidencePacks.
- A SubagentStart/SubagentStop ledger for measured, not estimated, routing telemetry.

## 11. Safety invariants

- Cost optimization changes who does the work, never tests, review, permissions, or
  acceptance criteria.
- Configuration is not proof of the served model. Status always separates requested,
  observed, and verified.
- Nothing writes outside the plugin, docs, and tests in stage 1. Stage 2 writes only
  owned keys, previews before applying, and is fully revertible.
- No secrets in the repository, requests, prompts, or logs.

## 12. Open risks

- Routing value is unproven until the stage 1 eval runs.
- The parent may not delegate. Delegation rate is measured, not assumed; the Stage 1 eval observed no OmniClaude-worker dispatch in 8 counted with-plugin runs (6 uncounted) and no Skill invocation in the 2 traced runs.
- Issue anthropics/claude-code#43869 reports `CLAUDE_CODE_SUBAGENT_MODEL` from settings
  `env` being ignored. It is verified live before stage 2 relies on it.
- Off the Anthropic API, aliases degrade: on Bedrock and Vertex, `sonnet` maps to 4.5
  and `haiku` to 4.5 with no effort support. This is documented as unsupported for
  tier fidelity.
- Claude Code ships often. Minimum versions: 2.1.293 for the Haiku 5.5 alias, 2.1.271
  for `omitClaudeMd`, and 2.1.289 for combined validation.
- The coexisting claude-flow router in `C:\CC` can inject competing routing advice.
