# OmniClaude

**Cost-aware model routing and multi-agent orchestration for Claude Code.**
The Claude Code edition of [OmniCodex](https://github.com/MoroniGL/Omnicodex).

> Use the right intelligence, at the right time.

Unofficial; not affiliated with Anthropic.

**v0.1.0-alpha.1 — Stage 1 (core), experimental.** It ships seven tiered workers and a routing skill as a native Claude Code plugin. It installs no hooks and makes no settings changes. This is not a savings guarantee: see [measured results](docs/local-validation.md).

## What it does

OmniClaude keeps planning and acceptance in your main conversation, and lets Claude delegate bounded phases to the cheapest capable worker:

| Worker | Tier | Model / effort | Use |
|---|---|---|---|
| `omniclaude:luna-researcher` | luna | Haiku / medium | read-only search, docs lookup, extraction, verification |
| `omniclaude:terra-explorer` | terra | Sonnet / low | read-only code mapping and call sites |
| `omniclaude:terra-implementer` | terra | Sonnet / medium | bounded implementation, bug fixes, tests |
| `omniclaude:sol-planner` | sol | Opus / medium | architecture and decomposition (no edits) |
| `omniclaude:sol-reviewer` | sol | Opus / medium | independent review (no edits) |
| `omniclaude:sol-debugger` | sol | Opus / high | difficult debugging |
| `omniclaude:astra-expert` | astra | Fable / low | exceptional escalation, only after you agree |

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

Work as usual. On substantial tasks, Claude loads the routing skill and delegates. You can also ask for a worker directly, for example *"use omniclaude:terra-explorer to map the checkout flow"* or `@agent-omniclaude:sol-reviewer`.

`/tasks` shows the model and effort each subagent actually ran with.

## Profiles

A profile sets the parent model and effort. Worker tiers are the same in every profile. See [profiles](docs/profiles.md).

| Profile | Parent | Effort | Unassigned subagents |
|---|---|---|---|
| `omni:economy` | Sonnet | medium | inherit |
| `omni:balanced` | Opus | medium | Sonnet |
| `omni:quality` | Opus | high | inherit |
| `omni:max` | Fable | high | Opus |

**CLI:** copy a profile file from `plugins/omniclaude/profiles/` to a stable location, then run:

```sh
claude --settings ~/omniclaude-profiles/balanced.settings.json
```

**Desktop app:** it has no `--settings` equivalent. Choose the parent with `/model`, and the effort with `/effort` (Ctrl+Shift+E). Persisted profiles and in-session `/omni` control are planned for Stage 2.

`omni:max` is a profile name. It does not mean effort `max` or the Max plan.

## Honest limits

- **Tiers are requested, not enforced.** Claude can pass its own model or effort on an Agent call.
- **Delegation is Claude's choice.** It depends on Claude choosing to delegate, and the delegation rate is measured, not assumed.
- **Multi-model setups can cost more** than one model at lower effort. OmniClaude claims savings only from a measured eval.
- **Other providers degrade the tiers.** On Bedrock, Vertex and Foundry the aliases map to older models, some without effort support.
- **Fable bills usage credits** on Pro and Team Standard seats. `astra-expert` never runs without your explicit agreement.

## Differences from OmniCodex

- Same worker names and roles.
- luna runs at medium effort, because Haiku 5.5 stops early at low.
- astra starts at low effort and re-runs at high on failure, following Anthropic's "next tier at low effort" guidance.
- astra-expert always asks for your agreement first, even after a sol worker fails.
- No in-session `omni …` control yet; that is Stage 2.
- No Gemini context offload yet; that is phase 2.

## Sources

The runtime behavior described here (subagent model precedence, effort levels, pricing, Haiku 5.5 behavior) comes from the official docs, checked on 2026-10-13:

- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/model-config
- https://code.claude.com/docs/en/settings-reference
- https://code.claude.com/docs/en/plugins/components
- https://code.claude.com/docs/en/costs

## Development

```sh
python -m unittest discover -s tests -v
claude plugin validate . --strict
claude plugin validate plugins/omniclaude --strict
```

The eval suite under `plugins/omniclaude/evals/` compares runs with and without the plugin. See [local validation](docs/local-validation.md).

## License

MIT; see [LICENSE](LICENSE).
