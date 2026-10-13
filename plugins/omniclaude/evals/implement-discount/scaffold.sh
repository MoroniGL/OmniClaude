#!/usr/bin/env bash
set -euo pipefail
mkdir -p shop tests
: > shop/__init__.py
cat > shop/pricing.py <<'EOF'
"""Pricing helpers."""


def subtotal(items):
    return sum(item["price"] * item["quantity"] for item in items)


def apply_coupon(total, coupon):
    if coupon == "SAVE10":
        return round(total * 0.9, 2)
    return total
EOF
cat > tests/test_pricing.py <<'EOF'
from shop.pricing import subtotal


def test_subtotal():
    assert subtotal([{"price": 2.0, "quantity": 3}]) == 6.0
EOF
