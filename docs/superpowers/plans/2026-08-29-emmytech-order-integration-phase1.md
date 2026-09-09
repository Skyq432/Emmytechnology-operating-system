# EmmyTech Order Integration Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect Operations orders to EmmyTech Identity, CRM attribution, pricing, Ambassador commission, locations and inventory reservation without duplicating CRM UI or prematurely building supplier/dispatch subsystems.

**Architecture:** Operations remains the owner of fulfilment/order state. CRM, Ambassador, Spin/Cash-Off and Inventory keep their own records, while Orders link to them through stable IDs and publish important business events. Confirmation is transactional and is the only Phase-1 action that affects CRM stage, reservations and pending commission.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase/PostgreSQL, server actions, PostgreSQL RPCs, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-29-emmytech-order-integration-design.md`

## Global Constraints

- Work only on `ambassador-development`; do not touch `main`.
- `public.products` remains the single website Product catalogue.
- `ops_inventory_items` remains the internal Operations item master.
- Draft Orders do not affect inventory, commission or CRM stage.
- Order confirmation never moves CRM backward.
- Price/discount/commission snapshots are frozen per Order.
- New Operations integration data must use RLS and server-side/RPC writes.
- Do not blindly enable RLS on the 41 legacy tables currently lacking policies.
- Use additive/backward-compatible database changes and include rollback SQL.
- Do not seed inventory from `public.products.stock`.

---

### Task 1: Extend domain rules for commercial state and money calculations

**Files:**
- Create: `src/lib/operations/commercial.test.ts`
- Create: `src/lib/operations/commercial.ts`

**Interfaces:**
- Produces: `CommercialState`, `CommissionStatus`, `PaymentStatus`, `calculateOrderTotals(input)`, `canConfirmOrder(state)`, `shouldAdvanceCrmToPurchase(currentStage)`.

- [ ] **Step 1: Write failing tests** covering draft/confirmed state, discount calculation, Cash-Off/delivery arithmetic, non-negative totals, and CRM advancement only for stages below 5.
- [ ] **Step 2: Run** `npm run test:operations` and verify the new tests fail because the implementation does not exist.
- [ ] **Step 3: Implement minimal pure functions/types** in `commercial.ts`.
- [ ] **Step 4: Run** `npm run test:operations` and verify all Operations tests pass.
- [ ] **Step 5: Commit** only the commercial test and implementation files.

### Task 2: Add the Phase-1 database foundation

**Files:**
- Create: `supabase/migrations/20260829113000_operations_order_integration_phase1.sql`
- Create: `docs/operations/order-integration-phase1-rollback.sql`

**Interfaces:**
- Consumes: existing `ops_orders`, `ops_order_items`, `ops_locations`, `ops_inventory_items`, `ops_stock_movements`, CRM/Identity/Ambassador tables.
- Produces: additive columns/tables and RPCs described below.

- [ ] **Step 1: Define additive order columns**: `identity_id`, `lead_id`, `ambassador_id`, `conversion_id`, `commercial_state`, subtotal/discount/Cash-Off/delivery/total/payment fields, commission snapshot/status, attribution/source fields, confirmation metadata.
- [ ] **Step 2: Define additive order-item pricing fields** for list/unit price, discount snapshot, line total and fulfilment source/location.
- [ ] **Step 3: Add `ops_inventory_reservations`** with order/item/inventory/location/quantity/status timestamps; RLS admin policy; indexes preventing duplicate active reservations for the same order line/location combination where practical.
- [ ] **Step 4: Add automatic SKU sequence/function** producing `ET-INV-000001` style values and make inventory-item creation capable of omitting manual SKU.
- [ ] **Step 5: Add idempotent event/outbox table** `ops_business_events` with event key, type, order_id, identity_id, payload, processing status/time and unique idempotency key; RLS enabled.
- [ ] **Step 6: Add `ops_confirm_order(order_id)` RPC** that locks the draft order, validates totals, derives/locks attribution, creates reservations only when sufficient location stock exists, creates pending commission snapshot when eligible, advances CRM to Stage 5 only if below Stage 5, records `ops_order_events`, `identity_events` and `ops_business_events`, and commits atomically.
- [ ] **Step 7: Write rollback SQL** for all newly added objects/columns, preserving pre-existing foundation tables/functions.
- [ ] **Step 8: Apply migration to live Supabase** only after reviewing SQL; verify all new Operations tables have RLS enabled.
- [ ] **Step 9: Run a rollback-only transaction test** with TEST records: draft order -> confirm -> reservation -> pending commission -> CRM Stage 5 if applicable -> events; rollback and confirm zero TEST residue.
- [ ] **Step 10: Commit** migration and rollback SQL.

### Task 3: Seed operational locations safely

**Files:**
- Modify: `supabase/migrations/20260829113000_operations_order_integration_phase1.sql` before application, or create a follow-up additive migration if Task 2 is already applied.

**Interfaces:**
- Produces location codes: `SANGO`, `UI`, `TRANSIT`.

- [ ] **Step 1: Add idempotent inserts** for Sango, UI and In Transit using stable codes.
- [ ] **Step 2: Verify** repeated insert logic does not duplicate locations.
- [ ] **Step 3: Confirm** inventory balances can be grouped/filterable by these location IDs.
- [ ] **Step 4: Commit** only if a separate follow-up migration is required.

### Task 4: Add Identity search and order autofill server layer

**Files:**
- Create: `src/lib/operations/identity-server.ts`
- Modify: `src/lib/operations/types.ts`
- Modify: `src/lib/operations/server.ts`

**Interfaces:**
- Produces: `searchOperationsIdentities(query)`, `getOperationsIdentitySummary(identityId)`, Identity summary type including identity code, name, phone, email, CRM stage, original Ambassador attribution.

- [ ] **Step 1: Add focused tests** for phone normalization/matching helpers if pure logic is extracted.
- [ ] **Step 2: Implement server-side search** against canonical Identity/signals using phone first, with email/name fallback and a small result limit.
- [ ] **Step 3: Derive current CRM stage** using existing CRM manual/stage/evidence rules without creating a second funnel authority.
- [ ] **Step 4: Resolve original Ambassador** from `crm_lead_ownership`, existing lead attribution and ambassador tables.
- [ ] **Step 5: Verify** no direct client write access to legacy Identity/CRM tables is introduced.
- [ ] **Step 6: Commit** server/types changes.

### Task 5: Upgrade Order create/edit data model and UI

**Files:**
- Modify: `src/app/modules/operations/actions.ts`
- Modify: `src/components/operations/orders/orders-client.tsx`
- Modify: `src/app/modules/operations/orders/page.tsx`

**Interfaces:**
- Consumes: Identity search/summary, website products, inventory, locations.
- Produces Draft Order creation with linked Identity, multiple commercial fields and calculated totals.

- [ ] **Step 1: Change New Order UX** to start with customer phone/name search and show likely Identity matches.
- [ ] **Step 2: When a match is selected**, fill customer name/phone/email and store hidden `identity_id`, `lead_id`/`ambassador_id` when known.
- [ ] **Step 3: Keep manual customer entry** available when no match is chosen; do not auto-merge identities.
- [ ] **Step 4: Add item pricing**: normal/list price, quantity, line amount; prefill website-product price when selected but allow a frozen order price.
- [ ] **Step 5: Add discount controls**: type, amount/percentage, reason/approver where applicable.
- [ ] **Step 6: Add Cash-Off summary field and delivery charge** without redeeming Cash-Off in Phase 1.
- [ ] **Step 7: Show calculated subtotal/final total** using the shared pure calculator.
- [ ] **Step 8: Create as Draft only**; no reservation/commission/CRM mutation on creation.
- [ ] **Step 9: Run Operations tests and build locally when possible.**
- [ ] **Step 10: Commit** Orders create/edit changes.

### Task 6: Upgrade Inventory for generated SKU and location filtering

**Files:**
- Modify: `src/app/modules/operations/actions.ts`
- Modify: `src/lib/operations/server.ts`
- Modify: `src/components/operations/inventory/inventory-client.tsx`
- Modify: `src/app/modules/operations/inventory/page.tsx`

**Interfaces:**
- Consumes: `ops_locations`, `ops_stock_balances`, automatic SKU generation.

- [ ] **Step 1: Remove required manual SKU entry** from the Inventory create form.
- [ ] **Step 2: Generate SKU server-side/database-side** and return/display it after creation.
- [ ] **Step 3: Add location filter** with All Locations, Sango, UI and In Transit.
- [ ] **Step 4: Show item total on hand, reserved and available**, with per-location balance when a location filter is selected.
- [ ] **Step 5: Ensure reservation counts do not create physical stock movements.**
- [ ] **Step 6: Run Operations tests/build and commit.**

### Task 7: Add explicit Confirm Order workflow

**Files:**
- Modify: `src/app/modules/operations/actions.ts`
- Modify: `src/lib/operations/server.ts`
- Modify: `src/app/modules/operations/orders/[id]/page.tsx`

**Interfaces:**
- Consumes: `ops_confirm_order(order_id)` RPC.
- Produces: `confirmOperationsOrder(orderId)` and `confirmOrderAction(formData)`.

- [ ] **Step 1: Show commercial state** prominently but compactly on the Order detail page.
- [ ] **Step 2: For Draft Orders**, show a clear `Confirm Order` action with a confirmation summary of total, customer, attribution and stock reservation requirement.
- [ ] **Step 3: Call only the transactional RPC**; do not reproduce confirmation logic in client/server TypeScript.
- [ ] **Step 4: After confirmation**, display reservation result, pending Ambassador commission and CRM stage summary.
- [ ] **Step 5: Prevent duplicate confirmation** by state/idempotency key.
- [ ] **Step 6: Add friendly error states** for insufficient stock or attribution/data conflicts.
- [ ] **Step 7: Run Operations tests/build and commit.**

### Task 8: Make the Order detail concise but informative

**Files:**
- Modify: `src/app/modules/operations/orders/[id]/page.tsx`
- Modify: `src/lib/operations/tracking-server.ts`
- Modify: `src/components/ui/help-tip.tsx` only if additional reusable help behavior is required.

**Interfaces:**
- Produces the approved thin Order view.

- [ ] **Step 1: Customer card** with name/phone, CRM stage and one-click related Identity/lead link where route exists.
- [ ] **Step 2: Order items card** with item, quantity, source location/reservation and price.
- [ ] **Step 3: Price card** showing normal subtotal, discount, Cash-Off, delivery, final total, paid/balance.
- [ ] **Step 4: Source/Commission card** showing acquisition source, Ambassador name, frozen rate, amount and status only when relevant.
- [ ] **Step 5: Fulfilment/Delivery card** showing current location/source, current operational status and existing handoff summary.
- [ ] **Step 6: Next Action card** based on current commercial/fulfilment state using simple deterministic logic; no advanced health engine yet.
- [ ] **Step 7: Keep timeline operational only**; do not dump CRM/Spin/marketing event histories into the Order page.
- [ ] **Step 8: Add simple `?` help** to commercial/commission/reservation concepts.
- [ ] **Step 9: Run Operations tests/build and commit.**

### Task 9: Verification and documentation checkpoint

**Files:**
- Modify: `docs/operations/` documentation as needed.
- Modify: `OPEN_SOURCE_NOTES.md` to record the previously selected MIT reference repositories if still absent.

**Interfaces:**
- Produces verification evidence and operator notes.

- [ ] **Step 1: Run** `npm run test:operations` and require zero failures.
- [ ] **Step 2: Run** `npm run build` after clearing stale `.next` only if the generated-type corruption reappears.
- [ ] **Step 3: Verify GitHub branch** remains `ambassador-development` and `main` is untouched.
- [ ] **Step 4: Verify live DB** has no leftover TEST Orders/reservations/events.
- [ ] **Step 5: Verify RLS** on all newly created Operations integration tables.
- [ ] **Step 6: Document manual test script**: create draft -> select Identity -> pricing/discount -> confirm -> reservation -> CRM Stage 5 -> pending commission -> Order detail summary.
- [ ] **Step 7: Add open-source attribution notes** for `BoviliusMeidi/inventory-management` and `infiniteoo/wms` without claiming copied code.
- [ ] **Step 8: Commit verification/docs changes.**
