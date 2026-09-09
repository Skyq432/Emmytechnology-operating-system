# EmmyTech Operations Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/modules/operations` into a working internal Operations workspace with independent inventory, internal orders, team handovers/timeline, and optional website-product linking.

**Architecture:** Keep website catalogue (`public.products`) and Operations inventory (`ops_inventory_items`) independent, connected only through an optional link table. Operations orders own internal execution and handovers. Sensitive state changes will be implemented through server-side code / database functions, while history is append-oriented.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase/PostgreSQL, existing EmmyTech UI primitives.

**Spec:** `docs/superpowers/specs/2026-08-29-emmytech-operations-foundation.md`

## Global Constraints

- Work only on `ambassador-development`; never modify `main`.
- Do not restructure existing `public.products`, CRM, Ambassador, Spin Wheel, or Finance tables.
- All new Operations database objects use the `ops_` prefix.
- All new Operations tables have RLS enabled from day one.
- Website products and Operations inventory remain independently creatable.
- Operations-to-website linking is optional and does not imply full physical-stock synchronization.
- Database changes are additive and include rollback notes.
- Preserve the existing EmmyTech login and shell; no separate app or auth system.

---

### Task 1: Order workflow domain rules

**Files:**
- Create: `src/lib/operations/domain.ts`
- Create: `src/lib/operations/domain.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `ORDER_STATUS_SEQUENCE`, `OrderStatus`, `canTransitionOrderStatus(current, next)`, `getOrderStatusLabel(status)`.

- [ ] Write failing tests for valid forward movement, hold/cancel transitions, terminal completed/cancelled states, and forbidden backwards movement.
- [ ] Run `npm run test:operations` and verify the test fails because the domain implementation is missing.
- [ ] Implement the minimal workflow helpers.
- [ ] Run `npm run test:operations` and verify all domain tests pass.
- [ ] Commit the domain rules.

### Task 2: Additive Operations database foundation

**Files:**
- Create: `supabase/migrations/20260829090000_operations_foundation.sql`
- Create: `docs/operations/operations-foundation-rollback.sql`

**Interfaces:**
- Produces tables: `ops_locations`, `ops_inventory_items`, `ops_stock_movements`, `ops_website_product_links`, `ops_orders`, `ops_order_items`, `ops_order_events`, `ops_order_handoffs`.
- Produces RPCs: `ops_create_order`, `ops_change_order_status`, `ops_create_stock_movement`, `ops_create_handover`, `ops_acknowledge_handover`.

- [ ] Define enum/check constraints and foreign keys without changing existing tables.
- [ ] Add RLS to every new table with admin-only first-release policies based on `public.users.id = auth.uid()` and `role = 'admin'`.
- [ ] Make stock movement insertion append-only through RPC; do not expose unrestricted client writes.
- [ ] Make order status changes create an `ops_order_events` row in the same transaction.
- [ ] Make handover creation and acknowledgement append timeline events.
- [ ] Add rollback SQL that drops only the new Operations functions/tables in dependency-safe order.
- [ ] Apply the migration to the live EmmyTech Supabase project only after code review of the SQL.
- [ ] Run security advisor after applying and confirm no new Operations table is reported with RLS disabled.
- [ ] Commit the migration and rollback document.

### Task 3: Operations server data layer

**Files:**
- Create: `src/lib/operations/types.ts`
- Create: `src/lib/operations/server.ts`

**Interfaces:**
- Produces: `getOperationsOverview()`, `getOperationsOrders()`, `getOperationsInventory()`, `getWebsiteProductLinks()`, `createOperationsOrder(input)`, `changeOperationsOrderStatus(orderId, status, note?)`, `createOperationsHandover(input)`, `acknowledgeOperationsHandover(handoverId, note?)`, `createInventoryItem(input)`, `createWebsiteProductLink(input)`.

- [ ] Add strict TypeScript types matching the migration schema.
- [ ] Use the existing server Supabase client and authenticated user.
- [ ] Read overview counts, latest orders and low-stock inventory.
- [ ] Route sensitive writes through RPC functions.
- [ ] Return structured `{ success, message, data? }` results for UI actions.
- [ ] Verify TypeScript with `npm run build` or `npx tsc --noEmit`.
- [ ] Commit the server layer.

### Task 4: Operations workspace shell and overview

**Files:**
- Create: `src/app/modules/operations/layout.tsx`
- Create: `src/app/modules/operations/page.tsx`
- Create: `src/components/operations/operations-shell.tsx`
- Create: `src/components/operations/operations-overview.tsx`
- Create: `src/components/operations/operations.module.css`

**Interfaces:**
- Consumes: `getOperationsOverview()`.
- Produces navigation for Overview, Orders, Inventory, Website Links.

- [ ] Replace the generic Operations placeholder route with a dedicated module route.
- [ ] Reuse EmmyTech blue/gold visual language rather than copying either open-source UI.
- [ ] Show total open orders, urgent/due orders, inventory items, low-stock items, orders awaiting dispatch, and recent activity.
- [ ] Add clear empty states for a fresh Operations database.
- [ ] Verify page renders locally after migration.
- [ ] Commit the workspace shell.

### Task 5: Internal Orders command centre

**Files:**
- Create: `src/app/modules/operations/orders/page.tsx`
- Create: `src/components/operations/orders/orders-client.tsx`
- Create: `src/components/operations/orders/order-create-dialog.tsx`
- Create: `src/components/operations/orders/order-detail-panel.tsx`

**Interfaces:**
- Consumes: order server functions from Task 3 and workflow helpers from Task 1.

- [ ] List orders with code, source, customer/reference, priority, current status, current owner/team, due date and updated time.
- [ ] Add search and status/priority filters.
- [ ] Create manual/internal orders with free-text items or linked inventory/website products.
- [ ] Show order detail timeline.
- [ ] Allow only valid workflow transitions from `canTransitionOrderStatus`.
- [ ] Add handover creation and acknowledgement UI.
- [ ] Verify order creation, status movement and handover timeline end-to-end with marked TEST data.
- [ ] Commit Orders.

### Task 6: Internal Inventory

**Files:**
- Create: `src/app/modules/operations/inventory/page.tsx`
- Create: `src/components/operations/inventory/inventory-client.tsx`
- Create: `src/components/operations/inventory/inventory-item-dialog.tsx`

**Interfaces:**
- Consumes: inventory server functions from Task 3.

- [ ] List internal inventory independently of `public.products`.
- [ ] Support internal SKU, name, category, unit, serial-tracked flag, reorder level and active status.
- [ ] Show on-hand quantity derived from stock movements and low-stock state.
- [ ] Support additive stock movement entry through `ops_create_stock_movement`.
- [ ] Ensure internal-only items never appear in `public.products` unless explicitly linked.
- [ ] Verify stock movement history and totals with TEST inventory.
- [ ] Commit Inventory.

### Task 7: Optional Website Product Links

**Files:**
- Create: `src/app/modules/operations/website-links/page.tsx`
- Create: `src/components/operations/website-links/website-links-client.tsx`

**Interfaces:**
- Consumes: `ops_inventory_items`, `public.products`, `ops_website_product_links`.

- [ ] Show linked and unlinked inventory items.
- [ ] Allow linking an inventory item to an existing website product.
- [ ] Support relationship type: stocked, preorder, on_demand, dropship, service, display_only.
- [ ] Support optional website allocation and `stock_sync_enabled` flag, default false.
- [ ] Show website products that have no inventory link without treating them as errors.
- [ ] Verify both independent directions: website-only product and inventory-only item.
- [ ] Commit Website Links.

### Task 8: Verification and handoff

**Files:**
- Modify: `OPEN_SOURCE_NOTES.md`

**Interfaces:**
- Produces a tested Operations Foundation checkpoint.

- [ ] Add BoviliusMeidi/inventory-management and infiniteoo/wms attribution/reference notes.
- [ ] Run `npm run test:operations`.
- [ ] Run `npm run lint` on changed files if possible.
- [ ] Run `npm run build`.
- [ ] Run Supabase security advisor and inspect Operations RLS.
- [ ] Create marked TEST order/inventory/link data and exercise full workflow locally.
- [ ] Clean up TEST records after verification.
- [ ] Compare `ambassador-development` against the pre-Operations checkpoint.
- [ ] Commit final verification/docs checkpoint.