# Operations Location, Cash-Off & Receipts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Operations RBAC, assign trusted staff branches, redeem Cash-Off consistently across Direct Sale/Orders/Repairs, and make final receipts reliably viewable by authorised staff.

**Architecture:** Keep the existing centralized role/capability model and existing Operations locations/Cash-Off ledger/receipt document system. Add branch attribution to staff and commercial transactions, wrap Cash-Off redemption in transaction-specific SECURITY DEFINER RPCs with idempotency, and keep the sales document bucket private while moving render/signing through an authorised server path.

**Tech Stack:** Next.js 16, TypeScript, React 19, Supabase Postgres/RLS/RPC/Storage, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-12-operations-location-cashoff-receipts-design.md`

## Global Constraints
- Work only on `testing/vscode-real-life-validation-20260912`; do not merge to `main`.
- Every schema/RLS/function change must exist in `supabase/migrations/` before it is applied live.
- Reuse `ops_locations`; do not create a parallel branch table.
- Ordinary staff cannot choose their own branch.
- Super Admin and Operations Lead may override transaction branch only with a reason.
- Cash-Off redemption must be atomic, idempotent and auditable.
- Private receipt storage must remain private.

---

### Task 1: Correct Front Desk access and Operations authorization

**Files:**
- Modify: `src/lib/auth/roles.test.ts`
- Modify: `src/lib/auth/roles.ts`
- Modify: `src/lib/operations/reporting-server.ts`
- Modify: `src/lib/operations/attribution-server.ts`
- Modify: `src/app/modules/sales/page.tsx`
- Modify: `src/app/modules/operations/page.tsx`
- Test: `src/lib/auth/roles.test.ts`
- Test: `src/lib/auth/operational-server-contract.test.ts`

**Interfaces:**
- Produces: Front Desk module/nav matrix without CRM or Sales Overview; capability-based Operations reporting/attribution; role-aware default redirects.

- [ ] **Step 1: Write failing RBAC assertions**
  - Expect `accessibleModules('front_desk')` to equal `['sales','operations']`.
  - Expect `salesNavKeys('front_desk')` to exclude `overview`.
  - Add server-contract assertions that legacy literal `role === 'admin'` checks are absent from Operations reporting/attribution.
- [ ] **Step 2: Run `npm run test:auth` and verify RED.**
- [ ] **Step 3: Implement minimal role matrix and capability-based server guards.**
  - `front_desk`: Sales + Operations only.
  - Sales nav: Direct Sale, Orders, Payments, Receipts, Customers.
  - Reporting uses `requireStaffCapability('operations.read')` or equivalent centralized capability guard.
  - Attribution management uses the appropriate Operations management capability rather than literal legacy Admin role.
  - `/modules/sales` redirects Front Desk to `/modules/sales/direct`.
  - `/modules/operations` redirects Front Desk to `/modules/operations/orders`.
- [ ] **Step 4: Run auth/operations tests and verify GREEN.**
- [ ] **Step 5: Commit.**

### Task 2: Staff default branch and transaction attribution

**Files:**
- Create: `supabase/migrations/<timestamp>_staff_default_branch_and_transaction_location.sql`
- Create: `src/lib/operations/location-contract.test.ts`
- Modify: `src/app/modules/administration/page.tsx`
- Modify: `src/components/administration/staff-admin.tsx`
- Modify: `src/lib/sales/server.ts`
- Modify: `src/lib/sales/direct-sale-server.ts`
- Modify Operations order/repair creation server actions that create customer-facing records.

**Interfaces:**
- Produces DB columns `users.default_location_id`, `ops_orders.branch_location_id`, `ops_repairs.branch_location_id` plus override audit columns; staff admin branch assignment RPC; helpers to resolve required staff branch.

- [ ] **Step 1: Write failing migration contract tests** asserting the migration contains foreign keys to `ops_locations`, branch override reason/auditor fields, and an Admin-controlled staff branch setter.
- [ ] **Step 2: Run `npm run test:operations` and verify RED.**
- [ ] **Step 3: Commit the migration file before applying it.**
- [ ] **Step 4: Apply the exact committed migration to Supabase and reconcile its live timestamp/name if Supabase assigns one.**
- [ ] **Step 5: Update Administration UI to load active store locations and let Admin/Super Admin assign default staff branch.**
- [ ] **Step 6: Stamp actor + branch automatically on new Direct Sales, Orders and Repairs; block ordinary operational creation when default branch is missing.**
- [ ] **Step 7: Add Super Admin/Operations Lead branch override action with mandatory reason and event/audit record.**
- [ ] **Step 8: Run auth/operations/sales tests and verify GREEN.**
- [ ] **Step 9: Commit.**

### Task 3: Transaction-safe Cash-Off across Direct Sale, Orders and Repairs

**Files:**
- Create: `supabase/migrations/<timestamp>_commercial_cash_off_redemption.sql`
- Create: `src/lib/sales/cash-off-contract.test.ts`
- Modify: `src/lib/sales/direct-sale-server.ts`
- Modify: `src/components/sales/direct-sale-workspace.tsx`
- Modify Operations order UI/actions that edit/confirm draft orders.
- Modify: `src/components/operations/repairs/repair-admin-workspace.tsx`
- Modify: `src/app/modules/operations/sales-actions.ts`

**Interfaces:**
- Produces guarded RPCs for order/direct-sale confirmation with Cash-Off, approved-repair redemption, and cancellation reversal; returns wallet balance/redemption information to UI.

- [ ] **Step 1: Write failing contract tests** for balance recheck, `least(balance, amount_owed)` validation, stable `order_redemption:<id>` / `repair_redemption:<id>` idempotency keys, and compensating `order_refund`/repair refund reversal.
- [ ] **Step 2: Run commercial tests and verify RED.**
- [ ] **Step 3: Commit migration before live apply.**
- [ ] **Step 4: Apply exact migration live and reconcile migration filename/version.**
- [ ] **Step 5: Direct Sale UI displays available Cash-Off and requested redemption; draft does not debit; confirm does atomic debit + confirm.**
- [ ] **Step 6: Normal Order draft UI applies requested Cash-Off but debit occurs only in confirm RPC.**
- [ ] **Step 7: Repair UI permits redemption only after approved quote; redemption counts toward amount paid/start gate without pretending it is cash collected.**
- [ ] **Step 8: Cancellation path writes compensating Cash-Off credit once, never deletes history.**
- [ ] **Step 9: Run commercial tests and verify GREEN.**
- [ ] **Step 10: Commit.**

### Task 4: Authorised receipt rendering/viewing and richer receipt snapshots

**Files:**
- Create/modify migration for receipt snapshot fields/function bodies if needed, committed before apply.
- Modify: `src/lib/sales/documents/document-service.ts`
- Modify: `src/app/api/sales/documents/[id]/route.ts`
- Modify: `src/components/sales/receipts-workspace.tsx`
- Modify Direct Sale/Order/Repair detail components to expose final receipt links.
- Test: `src/lib/sales/documents/*.test.ts`

**Interfaces:**
- Produces server-authorised rendering/signing via service-role storage after caller capability checks; final receipt snapshots include branch/staff/Cash-Off and actual payment totals.

- [ ] **Step 1: Write failing document security/snapshot tests.**
- [ ] **Step 2: Run `npm run test:sales` and verify RED.**
- [ ] **Step 3: Implement caller authorization first, then use backend storage client for private bucket render/download/signing.**
- [ ] **Step 4: Extend final sales/repair receipt metadata snapshot to include branch name/code, staff name/id, gross amount, Cash-Off redeemed, amount payable and actual payments.**
- [ ] **Step 5: Expose `View Final Receipt` consistently from Direct Sale, Order, Repair and receipt centre.**
- [ ] **Step 6: Run sales tests and verify GREEN.**
- [ ] **Step 7: Commit.**

### Task 5: End-to-end verification for local real-life testing

**Files:**
- Modify/add only regression tests discovered necessary during verification.

**Interfaces:**
- Produces a testing-branch build ready for the user's VS Code localhost session.

- [ ] **Step 1: Run `npm run test:auth`.**
- [ ] **Step 2: Run `npm run test:work`.**
- [ ] **Step 3: Run `npm run test:commercial`.**
- [ ] **Step 4: Run changed-file ESLint.**
- [ ] **Step 5: Run `npm run build`.**
- [ ] **Step 6: Re-run targeted Supabase catalog checks for new functions/grants/RLS.**
- [ ] **Step 7: Report localhost test script covering Front Desk navigation, branch assignment, Direct Sale Cash-Off, Order Cash-Off, Repair Cash-Off and final receipt viewing.**
