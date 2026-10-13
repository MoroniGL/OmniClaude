---
type: llm
weight: 3
---

PASS only if the reply lists exactly these three production call sites of validate_order, in any order and format:
- shop/api/checkout.py, function submit_checkout
- shop/jobs/reconcile.py, function reconcile_pending (called as orders.validate_order)
- shop/admin/tools.py, function force_resubmit (imported under the alias check)

FAIL if any of the three is missing, or if the reply presents tests/test_orders.py, docs/orders.md, or validate_order_v1 as a production call site. Mentioning them as excluded is fine.
