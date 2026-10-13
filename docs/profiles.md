# Profiles

A profile sets the **parent** model and effort, plus the default model for subagents that have no `model` of their own (general-purpose, teammates, workflow agents). Delivery of that default through a settings `env` block is not yet verified live (anthropics/claude-code#43869 reports it being ignored); the eval in docs/local-validation.md will record what happens. OmniClaude's workers keep their own tiers in every profile.

| Profile | Parent | Effort | Unassigned subagents | When |
|---|---|---|---|---|
| `omni:economy` | sonnet | medium | inherit (Sonnet) | routine work, tight budgets |
| `omni:balanced` | opus | medium | sonnet | recommended start; equals Claude Code's default parent |
| `omni:quality` | opus | high | inherit (Opus) | consequential changes |
| `omni:max` | fable | high | opus | hardest work; plan-gated |
| `omni:auto` | unchanged | unchanged | unchanged | policy only: route each phase by risk |

## CLI

Profiles are settings files layered for one session with `--settings`. A top-level `effortLevel` passed this way applies to every model, including Opus 5.5:

```sh
claude --settings /path/to/balanced.settings.json
```

`--model` and the `ANTHROPIC_MODEL` environment variable override a profile's model. `CLAUDE_CODE_EFFORT_LEVEL` overrides every effort setting, including each worker's, so do not set it while using OmniClaude.

## Desktop app

The desktop app has no `--settings` equivalent. Pick the parent with `/model <alias>` and the effort with `/effort <level>`. Pressing `s` in either picker keeps the change for this session only. Changing the parent model mid-session re-reads the whole conversation without cache. Changing effort keeps the cache on the 5.5 models and Fable 5.1.

## Naming

`omni:max` is not effort `max` and not the Max plan. `omni:auto` is not `/effort auto` and not the auto permission mode.
