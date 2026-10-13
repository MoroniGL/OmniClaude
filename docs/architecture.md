# Architecture

OmniClaude separates **policy**, **control plane**, **execution plane**, and **runtime evidence**.

## Policy
The `routing` skill decides: is this work substantial, which bounded phases exist, which is the cheapest capable worker, and is escalation justified. The skill is also what authorizes delegation, since Claude Code's built-in prompt discourages delegation unless a `CLAUDE.md` file or a skill asks for it.

## Control plane
The parent conversation owns decomposition, delegation, dependency tracking, acceptance, and escalation. A profile sets the parent's model and effort.

## Execution plane
Seven plugin agents (`omniclaude:<name>`) with pinned model aliases and effort levels. Every worker disallows the `Agent` tool, so it cannot spawn nested subagents that would bypass the tiers. The read-only workers (luna, terra-explorer) skip `CLAUDE.md` to stay lean and avoid project instructions that ask for swarms.

## Runtime evidence
Configuration is a request. The parent may override a worker's model or effort per call. `/tasks` and subagent transcripts show what actually ran. OmniClaude reports requested, observed, and verified separately.

## Delivery
- Stage 1 (this release): agents, skill, CLI profiles, eval suite. No hooks.
- Stage 2: `/omni` session control, persisted defaults with a reversible `setup.py`.
- Phase 2: optional mod to enforce worker tiers; Gemini context offload.

## Safety invariant
Cost optimization may change *who* performs work, but not acceptance criteria. Required tests, security checks, correctness constraints, and user requirements stay intact.
