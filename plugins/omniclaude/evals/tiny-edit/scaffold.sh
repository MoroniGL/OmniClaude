#!/usr/bin/env bash
set -euo pipefail
cat > calc.py <<'EOF'
def add_all(values):
    tmp = 0
    for v in values:
        tmp += v
    return tmp
EOF
