---
description: Read-heavy search; OmniClaude should route exploration to a cheaper worker.
tags: [routing, read-heavy]
max_turns: 40
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Agent, Skill]
---

Find where order validation is implemented in this repository and list every production call site of `validate_order`, with the file and the enclosing function for each. Exclude tests, docs, and deprecated code. Aliased imports count as call sites. Be exhaustive.
