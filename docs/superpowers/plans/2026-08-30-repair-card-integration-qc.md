# Repair Card Integration and QC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the Repair Card feature by integrating CRM/Identity events, cleaning the Operations help UI, validating rollback/security behavior, and proving the full workflow without touching `main`.

**Architecture:** Keep integration changes narrow. Repair remains the source of truth for repair execution; CRM receives lightweight Identity events only. UI cleanup is isolated from repair behavior. Verification includes stale-session privacy, TEST-data cleanup, migration/rollback review, full Operations tests and a production build.

**Tech Stack:** Next.js 16.2.6, React 19.2.4, TypeScript, Supabase/PostgreSQL, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-30-repair-card-customer-portal-design.md`

## Global Constraints

- Foundation, public portal and Admin UI plans must be implemented first.
- Do not duplicate Repair rows into CRM; publish Identity timeline events only.
- Do not touch `main`.
- Do not leave TEST records or altered card states behind.
- Do not claim completion without `npm run test:operations` and `npm run build` evidence.

---

### Task 1: Publish important Repair milestones to Identity timeline

**Files:**
- Modify: `src/lib/operations/repair-server.ts`
- Modify: `supabase/migrations/20260830120000_repair_card_foundation.sql` only if the migration has not yet been applied; otherwise create a new additive follow-up migration.
- Test: `src/lib/operations/repair-domain.test.ts` or a focused new integration-domain test if pure mapping logic is introduced.

**Interfaces:**
- Produces customer/CRM timeline event mapping for milestones.

- [ ] **Step 1: Define the small set of Identity milestones**

Publish only meaningful events:

```text
repair_received
repair_quote_published
repair_authorized
repair_ready_collection
repair_completed
repair_rework_requested
repair_cancelled
```

- [ ] **Step 2: Keep payloads referential, not duplicative**

Each `identity_events` entry should contain repair code/id reference, customer-safe title, status and timestamp. Do not copy internal costs, PIN or private notes.

- [ ] **Step 3: Make publication idempotent**

Use a deterministic repair-event source reference/idempotency key so retries do not duplicate Identity history.

- [ ] **Step 4: Verify the Repair remains source of truth**

CRM timeline links back to Repair detail conceptually; no second repair workflow state is maintained in CRM.

- [ ] **Step 5: Commit**

```bash
git add src/lib/operations/repair-server.ts supabase/migrations/*.sql src/lib/operations/repair-domain.test.ts
git commit -m "feat: publish repair milestones to identity history"
```

---

### Task 2: Clean Operations sidebar HelpTip UI

**Files:**
- Modify: `src/components/operations/operations-shell.tsx`
- Modify: `src/components/ui/help-tip.tsx` only if necessary to support a compact variant without changing non-sidebar callers.

**Interfaces:**
- Produces: subtle sidebar help marker with unchanged tooltip behavior.

- [ ] **Step 1: Remove the extra circular wrapper in Operations sidebar**

Replace:

```tsx
<div className={active ? 'rounded-full bg-white' : 'rounded-full bg-white/10'}>
  <HelpTip ... />
</div>
```

with the `HelpTip` directly or a non-disc alignment wrapper.

- [ ] **Step 2: Keep help target accessible**

The clickable/focusable target must retain an `aria-label` and enough hit area even if the visual `?` is smaller.

- [ ] **Step 3: Make hover/focus subtle**

No large white/blue circular background in the sidebar. Tooltip positioning and keyboard focus behavior remain functional.

- [ ] **Step 4: Run build and manually inspect active/inactive navigation rows**

```bash
npm run build
```

Check Overview, Repairs and Products rows at desktop width.

- [ ] **Step 5: Commit**

```bash
git add src/components/operations/operations-shell.tsx src/components/ui/help-tip.tsx
git commit -m "fix: simplify operations help markers"
```

---

### Task 3: Migration and rollback review

**Files:**
- Review: `supabase/migrations/20260830120000_repair_card_foundation.sql`
- Review: `docs/operations/repair-card-foundation-rollback.sql`
- Create a follow-up migration only for verified corrections after the foundation migration has already been applied.

- [ ] **Step 1: Verify migration is additive for historical Repairs**

Check that no existing row is deleted/reassigned and historical repairs without cards remain readable.

- [ ] **Step 2: Verify every new table has RLS and no anonymous direct grants**

Query `pg_policies` and privileges for all `ops_repair_*` tables.

- [ ] **Step 3: Verify uniqueness/privacy constraints**

Confirm one active assignment per card and per repair, unique public token, and valid PIN format constraint.

- [ ] **Step 4: Dry-review rollback dependency order**

Rollback must drop FKs before related tables/columns and restore the prior status constraint only when no new-status rows exist. It should refuse unsafe destructive rollback rather than silently losing workflow data.

- [ ] **Step 5: Commit only if review finds a real correction**

Do not create cosmetic migrations.

---

### Task 4: End-to-end privacy and workflow regression suite

**Files:**
- Modify: `src/lib/operations/repair-domain.test.ts`
- Modify: `src/lib/operations/repair-portal.test.ts`
- Create: `docs/operations/repair-card-test-checklist.md`

- [ ] **Step 1: Add domain regression cases**

Cover approval/payment gate, revised quote reset, rework, final acceptance and collection prerequisites.

- [ ] **Step 2: Add portal privacy regression cases**

Explicitly model:

```text
RC-07 -> Assignment A -> session A
close Assignment A
RC-07 -> Assignment B
session A validation => invalid, never Assignment B
```

- [ ] **Step 3: Write manual TEST checklist**

The checklist must include:

```text
existing CRM customer
new CRM customer auto-created
known EmmyTech device
external device
wrong PIN lockout
PIN regeneration
remote quote approval
partial payment gate
full repair/QC
handover timeout
customer problem/rework
successful final acceptance
card return
missing-card override
old browser after card reuse
```

- [ ] **Step 4: Run all Operations tests**

```bash
npm run test:operations
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/operations/repair-domain.test.ts src/lib/operations/repair-portal.test.ts docs/operations/repair-card-test-checklist.md
git commit -m "test: cover repair card end-to-end rules"
```

---

### Task 5: Full local production verification

**Files:**
- No planned source changes unless a reproducible defect is found.

- [ ] **Step 1: Start from a clean generated build directory**

On Windows PowerShell:

```powershell
if (Test-Path .next) { Remove-Item .next -Recurse -Force }
```

- [ ] **Step 2: Run test suite**

```bash
npm run test:operations
```

Expected: exit 0.

- [ ] **Step 3: Run production build**

```bash
npm run build
```

Expected: exit 0 with no TypeScript/build errors.

- [ ] **Step 4: Run local application and perform manual checklist**

```bash
npm run dev
```

Use the marked TEST repair flow from `docs/operations/repair-card-test-checklist.md`.

- [ ] **Step 5: Verify public portal from a separate/private browser session**

This is essential for cookie/session isolation and stale-session testing.

- [ ] **Step 6: Verify TEST cleanup in Supabase**

No marked TEST identities/repairs/payments/consents/sessions/events should remain. All intentionally reusable physical cards should be back in `available` state.

---

### Task 6: Final branch verification and handoff

**Files:**
- No source changes.

- [ ] **Step 1: Verify branch**

```bash
git branch --show-current
```

Expected: `ambassador-development`.

- [ ] **Step 2: Verify clean working tree**

```bash
git status --short
```

Expected: empty after all intended files are committed.

- [ ] **Step 3: Record final branch HEAD and test/build evidence**

Include commit SHA, `npm run test:operations` result, `npm run build` result, Supabase migration name and TEST cleanup result.

- [ ] **Step 4: Do not merge to `main`**

Stop with the tested `ambassador-development` branch ready for user review. Merge/deployment requires a separate explicit instruction.
