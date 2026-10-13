---
type: llm
weight: 3
focus: { source: file, path: shop/pricing.py }
---

PASS only if apply_bulk_discount: (1) computes the total quantity across items; (2) applies the discount when that total is greater than or equal to threshold and not otherwise; (3) computes the base amount by calling subtotal(items); (4) rounds the result to 2 decimals; (5) raises ValueError when rate is below 0 or above 1. The existing subtotal and apply_coupon functions must be unchanged. FAIL otherwise.
