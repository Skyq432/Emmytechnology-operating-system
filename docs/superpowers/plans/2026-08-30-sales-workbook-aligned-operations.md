# Sales Workbook-Aligned Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend EmmyTech Operations so its data model and UI match the existing Sales Database workbook workflows without importing historical spreadsheet rows.

**Architecture:** Keep `ops_orders` as the sale/transaction, normalize item-specific details into `ops_order_items`, add payment ledger, serialized inventory units/suppliers, separate Repairs, and Solar installation execution. Reuse Identity and existing Operations links/events. Do not create duplicate Phone/Laptop/Solar sales silos.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase/PostgreSQL, Node test runner, Tailwind.

**Spec:** `docs/superpowers/specs/2026-08-30-sales-workbook-aligned-operations-design.md`

## Global Constraints

- No historical workbook data import in this phase.
- Operations remains admin-only.
- Existing Orders/Inventory/Transfers must remain backward-compatible.
- `public.products` remains website catalogue; `ops_inventory_items` remains internal inventory.
- New Operations tables use RLS and `ops_is_admin()`.
- Normal Order page stays concise; category-specific fields are progressive disclosure.
- Do not move CRM backwards.
- Do not expose supplier cost/profitability to Ambassador users.

---

### Task 1: Workbook-aligned sales domain rules

**Files:**
- Create: `src/lib/operations/sales-model.test.ts`
- Create: `src/lib/operations/sales-model.ts`

**Produces:** `ORDER_ITEM_TYPES`, `getOrderItemTypeLabel`, `getRelevantSpecFields`, `derivePaymentStatus`, `calculateBalanceDue`, `calculateRepairProfit`.

- [ ] Write failing tests proving laptop/phone/accessory/solar fields stay distinct, payment state derives from total vs paid, and repair profit = charged - parts - labour.
- [ ] Run `npm run test:operations` and verify RED because `sales-model.ts` does not exist.
- [ ] Implement the minimal pure functions/constants.
- [ ] Run `npm run test:operations` and verify all tests pass.
- [ ] Commit only the test and implementation files.

### Task 2: Additive workbook-aligned database foundation

**Files:**
- Create: `supabase/migrations/20260830030000_operations_sales_workbook_model.sql`
- Create: `docs/operations/sales-workbook-model-rollback.sql`

**Produces:** additive schema for Order item snapshots, payments, suppliers, serialized units, repairs and solar installations.

- [ ] Extend `ops_orders` with `order_type`, `sales_staff_user_id`, `sales_staff_name`, and `balance_due` while preserving defaults for existing rows.
- [ ] Extend `ops_order_items` with `item_type`, `brand`, `model`, `condition`, `unit_cost_snapshot`, `warranty_period`, `warranty_expires_at`, and `specs jsonb`.
- [ ] Create `ops_order_payments` with admin RLS and payment-method/status constraints.
- [ ] Create `ops_suppliers` with admin RLS.
- [ ] Extend `ops_inventory_items` with brand/default condition/default unit cost/default selling price/preferred supplier.
- [ ] Create `ops_inventory_units` with serial/IMEI, current location, supplier, unit status, reserve/sold links and admin RLS.
- [ ] Create `ops_repairs` with workbook-aligned repair lifecycle, customer/order/unit links, costs, warranty, technician and payment summary; admin RLS.
- [ ] Create `ops_solar_installations` linked to Order/Order Item; admin RLS.
- [ ] Add `ops_record_order_payment` RPC which locks Order, inserts payment, recalculates `amount_paid`, `balance_due`, `payment_status`, and changes pending Ambassador commission to earned only when fully paid.
- [ ] Add indexes and event records needed for lookups/history.
- [ ] Apply migration to live project only after reviewing it as additive.
- [ ] Use marked TEST records to validate payment totals, commission earned-on-full-payment, serialized unit uniqueness, repair profit values, and solar-install link; delete TEST records and verify zero remain.

### Task 3: Type/server support

**Files:**
- Modify: `src/lib/operations/types.ts`
- Modify: `src/lib/operations/server.ts`
- Modify: `src/lib/operations/tracking-server.ts`
- Modify: `src/app/modules/operations/actions.ts`

**Produces:** typed read/write functions for new fields, payments, suppliers, units, repairs and solar installations.

- [ ] Add TypeScript interfaces matching the migration.
- [ ] Update Order creation to accept item type/spec snapshots and sales staff.
- [ ] Add server actions/read functions for recording payment, suppliers, serialized units, repairs and solar installation records.
- [ ] Keep all writes behind current admin checks/RPCs.
- [ ] Run Operations tests.

### Task 4: Dynamic Order sales form and concise detail view

**Files:**
- Modify: `src/components/operations/orders/orders-client.tsx`
- Modify: `src/app/modules/operations/orders/[id]/page.tsx`
- Create: `src/components/operations/orders/item-spec-fields.tsx`
- Create: `src/components/operations/orders/order-payments.tsx`

**Produces:** Order Type selector, progressive category fields, payment ledger UI, sales-staff attribution and compact profitability summary for admin.

- [ ] Add `Order type` selector: Laptop, Phone, Accessory, Solar, Other.
- [ ] Render only relevant specs per selected type.
- [ ] Preserve simple primary fields and keep detailed specs collapsible/secondary.
- [ ] Show sales staff separately from Ambassador attribution.
- [ ] Add payment history with Add Payment form and current Paid/Balance/Status summary.
- [ ] Show item cost/profitability only in admin/internal section.
- [ ] Solar items expose installation summary rather than putting all installation fields in the main Order card.
- [ ] Run Operations tests and local build.

### Task 5: Suppliers and serialized inventory UI

**Files:**
- Create: `src/app/modules/operations/suppliers/page.tsx`
- Create: `src/components/operations/suppliers/suppliers-client.tsx`
- Create: `src/app/modules/operations/inventory/[id]/page.tsx`
- Create: `src/components/operations/inventory/inventory-detail.tsx`
- Modify: `src/lib/operations/help.ts`
- Modify: `src/components/operations/operations-shell.tsx`
- Modify: `src/components/operations/inventory/inventory-client.tsx`

**Produces:** supplier management and individual device/unit tracking by Serial/IMEI/location/status.

- [ ] Add Suppliers navigation/help.
- [ ] Add supplier create/list page.
- [ ] Make Inventory item row open detail page.
- [ ] Inventory detail shows quantity balances plus individual units for serialized items.
- [ ] Allow adding a serialized unit with Serial/IMEI, condition, acquisition date, supplier, unit cost and location.
- [ ] Prevent duplicate Serial/IMEI through DB constraints.
- [ ] Run Operations tests/build.

### Task 6: Repairs module

**Files:**
- Create: `src/app/modules/operations/repairs/page.tsx`
- Create: `src/app/modules/operations/repairs/[id]/page.tsx`
- Create: `src/components/operations/repairs/repairs-client.tsx`
- Modify: `src/lib/operations/help.ts`
- Modify: `src/components/operations/operations-shell.tsx`

**Produces:** workbook-aligned Repair job workflow linked to Identity/original Order/unit without duplicating CRM.

- [ ] Add Repairs navigation/help.
- [ ] Create Repair with phone/name Identity lookup, optional original Order and serialized unit.
- [ ] Capture fault, diagnosis, repair type, parts replaced, parts/labour cost, amount charged, technician, conditions and repair warranty.
- [ ] Derive repair profit and balance display.
- [ ] Track status and dates received/completed/collected.
- [ ] Keep customer history in CRM; Repair page shows only concise related links.
- [ ] Run Operations tests/build.

### Task 7: Solar installation workflow

**Files:**
- Modify: `src/app/modules/operations/orders/[id]/page.tsx`
- Create: `src/components/operations/orders/solar-installation-card.tsx`

**Produces:** installation-required/scheduling/installer/cost/capacity/status flow linked to a solar Order Item.

- [ ] Only show installation card when Order has a Solar item.
- [ ] Capture installation required, address, schedule, installer, installation cost and system capacity.
- [ ] Track pending/scheduled/in-progress/completed/cancelled.
- [ ] Keep it separate from generic fulfilment status while linked to the same Order.
- [ ] Run Operations tests/build.

### Task 8: Verification and checkpoint

- [ ] Run `npm run test:operations`.
- [ ] Run a clean `.next` build locally.
- [ ] Verify `main` unchanged.
- [ ] Verify all TEST DB records removed.
- [ ] Verify new tables have RLS enabled.
- [ ] Visually smoke test Orders, Inventory, Suppliers, Repairs, Transfers and a Solar Order.
