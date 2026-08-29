# Operations Transfers, Reporting and Attribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe Draft-order Ambassador attribution, shared Operations reporting periods, and standalone/order-linked stock transfers between UI and Sango.

**Architecture:** Keep Orders, CRM, Ambassador and Inventory as separate owners linked by IDs/events. Transfers are independent inventory movements with optional Order links. Reporting reuses the existing global Reporting Period provider and computes Inventory historically from movement/reservation timestamps rather than filtering inventory-item creation dates.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase/Postgres, Tailwind, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-29-operations-transfers-reporting-attribution-design.md`

## Global Constraints

- Work only on `ambassador-development`; do not touch `main`.
- Operations remains admin-only.
- New database objects use RLS and admin-authorized RPCs.
- Do not duplicate Product or CRM customer records.
- Transfers change stock location, not total company ownership.
- Historical Inventory is computed as-of the selected period end.

---

### Task 1: Attribution and transfer domain rules

**Files:**
- Create: `src/lib/operations/transfer.ts`
- Create: `src/lib/operations/transfer.test.ts`
- Modify: `src/lib/operations/types.ts`

**Interfaces:**
- Produces transfer status/carrier types and pure rule helpers used by UI/server code.

- [ ] Write failing tests covering same-location rejection, TRANSIT destination restriction for user-created transfers, and terminal received/cancelled states.
- [ ] Run `npm run test:operations` and verify new tests fail.
- [ ] Implement minimal transfer rule helpers/types.
- [ ] Run `npm run test:operations` and verify all pass.
- [ ] Commit only transfer test/domain/type files.

### Task 2: Transfer and reporting database foundation

**Files:**
- Create: `supabase/migrations/20260829150000_operations_transfers_reporting.sql`
- Create: `docs/operations/operations-transfers-reporting-rollback.sql`

**Interfaces:**
- Produces `ops_stock_transfers`, transfer RPCs, transfer event records, and historical availability RPC/query support.

- [ ] Add transfer table with optional `order_id` / `order_item_id`, carrier fields, timestamps and RLS.
- [ ] Add admin RPC to create/start transfer; validate available stock or same-order reservation.
- [ ] Add admin RPC to receive transfer; move TRANSIT -> destination and move reservation location if order-linked.
- [ ] Add admin RPC to cancel only before receipt where safe.
- [ ] Add reporting RPC/query function for inventory as-of timestamp and movement summaries.
- [ ] Apply migration to live Supabase.
- [ ] Run clearly marked TEST transfer cases and remove all TEST rows.
- [ ] Commit migration + rollback document.

### Task 3: Draft attribution correction

**Files:**
- Modify: `src/lib/operations/server.ts`
- Modify: `src/app/modules/operations/actions.ts`
- Modify: `src/components/operations/orders/orders-client.tsx`
- Modify: `src/app/modules/operations/orders/[id]/page.tsx`

**Interfaces:**
- Draft order creation accepts explicit Admin-selected Ambassador.
- Confirm action freezes attribution and commission.

- [ ] Load active Ambassador options for Order creation.
- [ ] Preselect CRM-detected Ambassador but allow Admin override while Draft.
- [ ] Enable commission input when any Ambassador is selected.
- [ ] Show estimated commission and attribution source.
- [ ] Add Review & Confirm / Continue Order actions in the list.
- [ ] Make Next Action display the correct operational CTA.
- [ ] Run Operations tests.
- [ ] Commit Order attribution UI/server changes.

### Task 4: Shared Operations reporting period

**Files:**
- Modify: `src/app/modules/operations/layout.tsx`
- Modify: `src/components/reporting/reporting-period-panel.tsx`
- Create: `src/components/operations/operations-period-bar.tsx`
- Modify: Operations Overview/Orders/Inventory server and UI files.

**Interfaces:**
- Existing `ReportingPeriodProvider` supplies `range.startIso` and `range.endExclusiveIso` to Operations client wrappers.

- [ ] Wrap Operations layout in ReportingPeriodProvider while retaining admin-only server guard.
- [ ] Add Operations help copy to ReportingPeriodPanel.
- [ ] Add compact period bar to Overview/Orders/Inventory/Transfers.
- [ ] Filter Orders and Overview period metrics by created/event timestamps.
- [ ] Query Inventory as-of period end and movement totals inside the period.
- [ ] Add Inventory location filter.
- [ ] Run Operations tests.
- [ ] Commit reporting changes.

### Task 5: Transfers UI

**Files:**
- Create: `src/lib/operations/transfer-server.ts`
- Create: `src/app/modules/operations/transfers/page.tsx`
- Create: `src/components/operations/transfers/transfers-client.tsx`
- Modify: `src/app/modules/operations/actions.ts`
- Modify: `src/lib/operations/help.ts`
- Modify: `src/components/operations/operations-shell.tsx`

**Interfaces:**
- Uses transfer RPCs and current inventory/location data.

- [ ] Add Transfers navigation/help.
- [ ] Show standalone transfer form with From, To, Item, Quantity, carrier, reason.
- [ ] Allow optional related Order and restrict order-linked transfer to eligible reservation/item.
- [ ] Show transfer list with status and period/location filtering.
- [ ] Add Receive action for in-transit transfer.
- [ ] Run Operations tests.
- [ ] Commit Transfers UI/server changes.

### Task 6: Verification checkpoint

- [ ] Query live DB for RLS on new transfer table.
- [ ] Verify no TEST records remain.
- [ ] Verify `main` commit unchanged.
- [ ] Have user run `git pull`, `npm run test:operations`, delete `.next`, `npm run build`, then visual test locally.
