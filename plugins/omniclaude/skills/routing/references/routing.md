# OmniClaude routing details

Load this reference only when profile, worker, escalation, or delegation specifics matter. The root skill intentionally stays small.

## Runtime evidence

Configured models are requests, not proof of what served the work:

- A worker's frontmatter `model` and `effort` apply unless the Agent call passes its own `model` or `effort`, which outranks frontmatter.
- `CLAUDE_CODE_SUBAGENT_MODEL` only sets the default for subagents without a `model` field, such as general-purpose. It does not change built-in Explore or Plan.
- `/tasks` names the model on each subagent's row and the effort level set for it. Subagent transcripts record the served model.

Distinguish requested configuration, local execution records, and provider responses. Missing evidence means unverified.

## Workflow boundaries

- Keep planning, dependency tracking, consequential decisions, and acceptance in the parent.
- Delegate with explicit scope, constraints, acceptance criteria, and existing evidence instead of the full conversation history.
- Parallelize only independent work. Ordered work, and changes to the same files, stay serialized.
- Escalate for a concrete capability barrier, unresolved ambiguity, or material risk, not merely because time has passed.
- Diagnose failures before retrying. Never repeat an identical failed action without a changed hypothesis.
- Completion means the requested outcome exists, the relevant validation ran, its results were inspected, and material failures are reported.

## Installed worker targets

| Worker | Model alias | Effort | Notes |
|---|---|---|---|
| haiku-researcher | haiku | medium | read-only; Haiku 5.5 stops early at low effort |
| sonnet-explorer | sonnet | low | read-only code mapping |
| sonnet-implementer | sonnet | medium | bounded implementation |
| opus-planner | opus | medium | no file edits |
| opus-reviewer | opus | medium | no file edits; request high per call for high-stakes reviews |
| opus-debugger | opus | high | difficult debugging |
| fable-expert | fable | low | exceptional only; ask the user before dispatching, even after an opus failure; re-run at high on failure; may bill usage credits |

These are the shipped targets. Do not rewrite them because a newer model exists. Compare representative tasks with `claude plugin eval` first.

## Profiles

A profile sets the parent model and effort. Worker tiers stay the same in every profile.

| Profile | Parent | Effort | Default for unassigned subagents |
|---|---|---|---|
| omni:economy | sonnet | medium | inherit |
| omni:balanced | opus | medium | sonnet |
| omni:quality | opus | high | inherit |
| omni:max | fable | high | opus |
| omni:auto | unchanged | unchanged | unchanged |

`omni:auto` is a policy, not a model: route each phase by ambiguity, reversibility, blast radius, data or security risk, and verification cost. The name `omni:max` does not mean effort `max` or the Max plan.

## Escalation ladder

    same worker, higher effort  ->  next tier at low effort  ->  fable-expert (last, with consent)

Anthropic's cost guidance reports that, for checkable work, running at low effort and re-running failures at high kept the pass rate at roughly half the cost, and that moving up a model tier should start at low effort. These figures are Anthropic's, not OmniClaude measurements, and were not independently verified.

## Route transparency

Where practical, state:

    ROUTE
    Task: <bounded task>
    Selected: <worker / effort>
    Reason: <short technical justification>
    Action: ROUTE | ESCALATE | DE-ESCALATE

If a change of parent model would help, say so and let the user switch with `/model`. Never pretend the model changed.
