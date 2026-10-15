---
name: routing
description: OmniClaude cost-aware routing. Use for substantial multi-step work (exploring many files, implementing a feature, reviewing, debugging, or research) to delegate bounded phases to the cheapest capable OmniClaude worker while the parent keeps planning and acceptance. Not needed for tiny single-file edits or quick answers.
---

# OmniClaude routing

Keep planning, consequential decisions, and final acceptance in the parent conversation. This skill asks you to delegate bounded work to OmniClaude workers when that is cheaper and does not lower quality. Never weaken correctness, permissions, tests, security, or evidence requirements to save usage.

## Decide

1. Tiny or tightly scoped work (one file, a few lines, a quick answer) stays in the parent. Do not delegate it.
2. For substantial work, delegate bounded phases to the cheapest capable worker:

| Worker | Use for |
|---|---|
| `omniclaude:haiku-researcher` | read-only search, docs lookup, extraction, log summaries, routine verification |
| `omniclaude:sonnet-explorer` | read-only code mapping, call sites, control and data flow |
| `omniclaude:sonnet-implementer` | bounded implementation, ordinary bug fixes, tests |
| `omniclaude:opus-planner` | architecture and decomposition decisions |
| `omniclaude:opus-reviewer` | independent review of consequential changes |
| `omniclaude:opus-debugger` | difficult debugging after a failed attempt |
| `omniclaude:fable-expert` | only after the user agrees; after an opus worker fails, report the blocker and ask before dispatching |

3. Parallelize only independent read-only work. Keep dependent steps, and writes to the same files, in sequence.

## Hand off

Give each worker the bounded objective, the scope (paths), constraints, acceptance criteria, and the evidence you already have. Do not forward the whole conversation. Always include today's date in haiku-researcher handoffs. Do not pass a `model` or `effort` override unless you are deliberately escalating.

## Escalate and de-escalate

For checkable work (tests, lint, a reviewer verdict):

1. On failure, diagnose first: missing context, unclear instructions, or a wrong scope.
2. Retry on the same worker at higher effort.
3. Then move up one tier at low effort. fable-expert is last, and only after the user agrees.

Return to cheaper workers once the hard phase ends.

## Verify

A worker's summary is a locator, not proof. Open the cited evidence for anything consequential, run or inspect the relevant validation, and own the final answer.

Report routing honestly. The tier you requested is not proof of the model that served it; check `/tasks` or the subagent transcript. Never claim a model switch you did not observe.

For profiles and the escalation ladder, read [routing details](references/routing.md). For compact handoffs and context budgets, read [efficiency](references/efficiency.md).
