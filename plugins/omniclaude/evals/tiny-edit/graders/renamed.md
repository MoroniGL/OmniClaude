---
type: regex
pattern: "total = 0[\\s\\S]*total \\+= v[\\s\\S]*return total"
target: { source: file, path: calc.py }
---
