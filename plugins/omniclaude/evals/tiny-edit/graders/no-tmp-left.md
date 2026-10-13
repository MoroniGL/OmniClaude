---
type: regex
pattern: "\\btmp\\b"
match: not_contains
target: { source: file, path: calc.py }
---
