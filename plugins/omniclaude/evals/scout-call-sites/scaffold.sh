#!/usr/bin/env bash
set -euo pipefail
mkdir -p shop/api shop/jobs shop/admin shop/validation shop/catalog shop/legacy tests docs
cat > shop/validation/orders.py <<'EOF'
"""Order validation rules."""


class OrderError(ValueError):
    pass


def validate_order(order):
    """Reject orders with no items, non-positive quantities, or a missing customer."""
    if not order.get("customer_id"):
        raise OrderError("missing customer")
    items = order.get("items") or []
    if not items:
        raise OrderError("empty order")
    for item in items:
        if item.get("quantity", 0) <= 0:
            raise OrderError("bad quantity")
    return True
EOF
cat > shop/api/checkout.py <<'EOF'
from shop.validation.orders import validate_order


def submit_checkout(order, gateway):
    validate_order(order)
    return gateway.charge(order)
EOF
cat > shop/jobs/reconcile.py <<'EOF'
from shop.validation import orders


def reconcile_pending(pending):
    accepted = []
    for order in pending:
        try:
            orders.validate_order(order)
        except orders.OrderError:
            continue
        accepted.append(order)
    return accepted
EOF
cat > shop/admin/tools.py <<'EOF'
from shop.validation.orders import validate_order as check


def force_resubmit(order, queue):
    check(order)
    queue.put(order)
EOF
cat > shop/legacy/old_flow.py <<'EOF'
def validate_order_v1(order):
    """Deprecated: kept for reference, not called anywhere."""
    return bool(order)
EOF
cat > tests/test_orders.py <<'EOF'
from shop.validation.orders import validate_order


def test_valid():
    assert validate_order({"customer_id": 1, "items": [{"quantity": 1}]})
EOF
cat > docs/orders.md <<'EOF'
# Orders

Checkout calls validate_order before charging the card.
EOF
for i in $(seq 1 40); do
  cat > "shop/catalog/module_${i}.py" <<EOF
"""Catalog helpers, part ${i}."""


def price_${i}(base, tax):
    return round(base * (1 + tax), 2)


def label_${i}(name):
    return f"{name} #${i}"
EOF
done
