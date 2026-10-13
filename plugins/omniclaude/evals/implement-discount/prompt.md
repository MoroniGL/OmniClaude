---
description: Bounded implementation with tests; quality must hold while cost drops.
tags: [routing, implementation]
max_turns: 40
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Agent, Skill, Edit, Write]
---

In shop/pricing.py add a function `apply_bulk_discount(items, threshold, rate)`. It returns the subtotal of `items`, reduced by `rate` (for example 0.1 means 10% off) when the total quantity across all items is at least `threshold`; otherwise it returns the plain subtotal. Round the result to 2 decimals and reuse the existing `subtotal` function. Raise `ValueError` if `rate` is not between 0 and 1 inclusive.

Then add tests for it to tests/test_pricing.py that cover: below the threshold, exactly at the threshold, and an invalid rate. You cannot run commands in this environment, so review the code carefully instead.
