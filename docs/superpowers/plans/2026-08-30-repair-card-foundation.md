# Repair Card Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the safe database/domain foundation for reusable Repair Cards, versioned quotes, repair payments, workflow gates, and automatic CRM Identity resolution for both Orders and Repairs.

**Architecture:** Keep `ops_repairs` as the repair summary/job. Add focused related tables for cards, assignments, quotes, payments, consents, events, sessions and access attempts. Reuse the existing CRM `identities` resolver and make Order/Repair creation resolve or create an Identity server-side before creating the business record.

**Tech Stack:** Next.js 16.2.6, React 19.2.4, TypeScript 5.7+, Supabase/PostgreSQL, Node built-in test runner.

**Spec:** `docs/superpowers/specs/2026-08-30-repair-card-customer-portal-design.md`

## Global Constraints

- Work only on `ambassador-development`; do not modify `main`.
- Supabase is a shared live backend; migrations must be additive/backward-compatible and TEST records must be cleaned.
- Existing `ops_repairs` rows must remain readable.
- Do not import historical workbook repairs.
- `identities` remains the canonical customer record.
- Public users receive no direct Operations-table grants.
- The four-character PIN must never appear in URLs or customer-safe API payloads.
- No automatic WhatsApp/SMS or online payment gateway in this phase.

---

## File Structure

- Create `src/lib/operations/repair-domain.ts` — pure repair statuses, quote/payment gates and labels.
- Create `src/lib/operations/repair-domain.test.ts` — domain TDD.
- Modify `src/lib/operations/identity-server.ts` — shared resolve-or-create Identity helper.
- Modify `src/lib/operations/server.ts` — Order creation always obtains an Identity.
- Create `src/lib/operations/repair-server.ts` — Admin-only repair/card/quote/payment workflow server boundary.
- Modify `src/app/modules/operations/sales-actions.ts` — temporarily route existing repair actions to the new repair server boundary until UI plan replaces them.
- Modify `src/lib/operations/types.ts` — new repair/card/quote/payment/event types.
- Create `supabase/migrations/20260830120000_repair_card_foundation.sql` — additive schema, constraints, seed and atomic RPCs.
- Create `docs/operations/repair-card-foundation-rollback.sql` — rollback for only this feature.

---

### Task 1: Repair workflow domain rules

**Files:**
- Create: `src/lib/operations/repair-domain.ts`
- Create: `src/lib/operations/repair-domain.test.ts`
- Modify: `src/lib/operations/types.ts`

**Interfaces:**
- Produces: `RepairStatus`, `RepairPaymentRequirement`, `REPAIR_STATUS_SEQUENCE`, `canStartRepair`, `requiredBeforeRepairStart`, `deriveRepairPaymentStatus`, `canBeginHandover`, `canCompleteRepairCollection`.

- [ ] **Step 1: Write failing domain tests**

```ts
// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REPAIR_STATUS_SEQUENCE,
  requiredBeforeRepairStart,
  canStartRepair,
  deriveRepairPaymentStatus,
  canBeginHandover,
  canCompleteRepairCollection,
} from './repair-domain.ts';

test('repair flow contains customer approval, quality check and rework', () => {
  assert.deepEqual(REPAIR_STATUS_SEQUENCE, [
    'received','diagnosing','awaiting_customer_approval','awaiting_payment',
    'awaiting_parts','in_progress','quality_check','ready_collection','rework','collected','cancelled',
  ]);
});

test('required-before-start follows none partial full rules', () => {
  assert.equal(requiredBeforeRepairStart('none', 45000, 0), 0);
  assert.equal(requiredBeforeRepairStart('partial', 45000, 20000), 20000);
  assert.equal(requiredBeforeRepairStart('full', 45000, 0), 45000);
});

test('repair cannot start until current quote is approved and payment gate is met', () => {
  assert.equal(canStartRepair({ quoteStatus: 'published', amountPaid: 45000, requiredBeforeStart: 0 }), false);
  assert.equal(canStartRepair({ quoteStatus: 'approved', amountPaid: 10000, requiredBeforeStart: 20000 }), false);
  assert.equal(canStartRepair({ quoteStatus: 'approved', amountPaid: 20000, requiredBeforeStart: 20000 }), true);
});

test('payment state derives from approved quote total', () => {
  assert.equal(deriveRepairPaymentStatus(45000, 0), 'unpaid');
  assert.equal(deriveRepairPaymentStatus(45000, 10000), 'partial');
  assert.equal(deriveRepairPaymentStatus(45000, 45000), 'paid');
});

test('handover requires ready collection and collection requires acceptance, zero balance and card resolution', () => {
  assert.equal(canBeginHandover('quality_check'), false);
  assert.equal(canBeginHandover('ready_collection'), true);
  assert.equal(canCompleteRepairCollection({ finalAccepted: true, balanceDue: 0, cardResolved: true }), true);
  assert.equal(canCompleteRepairCollection({ finalAccepted: false, balanceDue: 0, cardResolved: true }), false);
  assert.equal(canCompleteRepairCollection({ finalAccepted: true, balanceDue: 1000, cardResolved: true }), false);
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
node --experimental-strip-types --test src/lib/operations/repair-domain.test.ts
```

Expected: FAIL because `repair-domain.ts` does not exist.

- [ ] **Step 3: Implement the pure domain module**

```ts
export type RepairStatus =
  | 'received' | 'diagnosing' | 'awaiting_customer_approval' | 'awaiting_payment'
  | 'awaiting_parts' | 'in_progress' | 'quality_check' | 'ready_collection'
  | 'rework' | 'collected' | 'cancelled';

export type RepairPaymentRequirement = 'none' | 'partial' | 'full';
export type RepairQuoteStatus = 'draft' | 'published' | 'approved' | 'declined' | 'superseded';

export const REPAIR_STATUS_SEQUENCE: RepairStatus[] = [
  'received','diagnosing','awaiting_customer_approval','awaiting_payment',
  'awaiting_parts','in_progress','quality_check','ready_collection','rework','collected','cancelled',
];

export function requiredBeforeRepairStart(rule: RepairPaymentRequirement, quoteAmount: number, partialAmount: number) {
  if (rule === 'none') return 0;
  if (rule === 'full') return Math.max(0, quoteAmount);
  return Math.min(Math.max(0, partialAmount), Math.max(0, quoteAmount));
}

export function canStartRepair(input: { quoteStatus: RepairQuoteStatus | null; amountPaid: number; requiredBeforeStart: number }) {
  return input.quoteStatus === 'approved' && input.amountPaid >= input.requiredBeforeStart;
}

export function deriveRepairPaymentStatus(total: number, paid: number): 'unpaid' | 'partial' | 'paid' {
  if (total > 0 && paid >= total) return 'paid';
  if (paid > 0) return 'partial';
  return 'unpaid';
}

export const canBeginHandover = (status: RepairStatus) => status === 'ready_collection';

export function canCompleteRepairCollection(input: { finalAccepted: boolean; balanceDue: number; cardResolved: boolean }) {
  return input.finalAccepted && input.balanceDue <= 0 && input.cardResolved;
}
```

Move the `RepairStatus` type import in `types.ts` to this new module and add interfaces for the new records described in Task 2.

- [ ] **Step 4: Run domain tests GREEN**

```bash
node --experimental-strip-types --test src/lib/operations/repair-domain.test.ts
npm run test:operations
```

Expected: all Operations tests pass.

- [ ] **Step 5: Commit intentionally staged files**

```bash
git add src/lib/operations/repair-domain.ts src/lib/operations/repair-domain.test.ts src/lib/operations/types.ts
git commit -m "feat: define repair workflow gates"
```

---

### Task 2: Add Repair Card relational schema and seed 30 cards

**Files:**
- Create: `supabase/migrations/20260830120000_repair_card_foundation.sql`
- Create: `docs/operations/repair-card-foundation-rollback.sql`

**Interfaces:**
- Produces tables: `ops_repair_cards`, `ops_repair_card_assignments`, `ops_repair_quotes`, `ops_repair_payments`, `ops_repair_consents`, `ops_repair_events`, `ops_repair_portal_sessions`, `ops_repair_access_attempts`.
- Extends: `ops_repairs` with `current_quote_id`, `current_card_assignment_id`, `customer_email`, `accessories_received` and expanded status constraint.

- [ ] **Step 1: Add migration-level invariant checks to the migration itself**

At the end of the transaction, include assertions that abort the migration if the seed/uniqueness assumptions fail:

```sql
do $$
begin
  if (select count(*) from public.ops_repair_cards where card_code like 'RC-%') <> 30 then
    raise exception 'Expected exactly 30 seeded Repair Cards';
  end if;
end $$;
```

- [ ] **Step 2: Create the additive tables and constraints**

The migration must use these key shapes:

```sql
create table if not exists public.ops_repair_cards (
  id uuid primary key default gen_random_uuid(),
  card_code text not null unique,
  public_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  status text not null default 'available'
    check (status in ('available','assigned','missing','retired')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ops_repair_card_assignments (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.ops_repair_cards(id) on delete restrict,
  repair_id uuid not null references public.ops_repairs(id) on delete cascade,
  identity_id uuid not null references public.identities(id) on delete restrict,
  access_pin text not null check (access_pin ~ '^[A-HJ-NP-Z2-9]{4}$'),
  pin_version integer not null default 1,
  status text not null default 'active' check (status in ('active','closed')),
  handover_started_at timestamptz,
  handover_expires_at timestamptz,
  assigned_by uuid references public.users(id) on delete set null,
  closed_by uuid references public.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  closed_at timestamptz
);

create unique index if not exists ops_repair_card_assignments_one_active_card
  on public.ops_repair_card_assignments(card_id) where status = 'active';
create unique index if not exists ops_repair_card_assignments_one_active_repair
  on public.ops_repair_card_assignments(repair_id) where status = 'active';
```

Create the quote/payment/consent/event/session/access-attempt tables using the exact statuses from the spec. Store only a SHA-256 hash of portal session tokens in `ops_repair_portal_sessions.token_hash`; never store the raw cookie token.

- [ ] **Step 3: Expand `ops_repairs` safely**

```sql
alter table public.ops_repairs
  add column if not exists customer_email text,
  add column if not exists accessories_received text,
  add column if not exists current_quote_id uuid,
  add column if not exists current_card_assignment_id uuid;

alter table public.ops_repairs drop constraint if exists ops_repairs_status_check;
alter table public.ops_repairs add constraint ops_repairs_status_check check (status in (
  'received','diagnosing','awaiting_customer_approval','awaiting_payment','awaiting_parts',
  'in_progress','quality_check','ready_collection','rework','collected','cancelled'
));
```

Add foreign keys to current quote/assignment only after their tables exist.

- [ ] **Step 4: Seed the physical cards idempotently**

```sql
insert into public.ops_repair_cards(card_code)
select 'RC-' || lpad(n::text, 2, '0')
from generate_series(1,30) n
on conflict(card_code) do nothing;
```

- [ ] **Step 5: Add RLS and revoke public table access**

For every new table:

```sql
alter table public.ops_repair_cards enable row level security;
create policy ops_repair_cards_admin_all on public.ops_repair_cards
for all to authenticated using (public.ops_is_admin()) with check (public.ops_is_admin());
revoke all on public.ops_repair_cards from anon;
grant select,insert,update,delete on public.ops_repair_cards to authenticated;
```

Repeat with table-specific policy names. Do not grant direct anonymous access to any Repair table.

- [ ] **Step 6: Add rollback script**

The rollback must drop only the new Repair Card tables/columns/constraints and restore the old seven repair statuses. It must not delete `ops_repairs` or unrelated Operations tables.

- [ ] **Step 7: Commit migration source before applying it**

```bash
git add supabase/migrations/20260830120000_repair_card_foundation.sql docs/operations/repair-card-foundation-rollback.sql
git commit -m "db: add repair card workflow foundation"
```

---

### Task 3: Resolve or create CRM Identity for every new Order and Repair

**Files:**
- Modify: `src/lib/operations/identity-server.ts`
- Modify: `src/lib/operations/server.ts`
- Modify: `src/lib/operations/repair-server.ts`
- Test: `src/lib/operations/identity-server.test.ts`

**Interfaces:**
- Produces: `buildOperationsIdentitySignals`, `resolveOrCreateOperationsIdentity`.
- Consumed by: `createOperationsOrder`, `createRepairWithCard`.

- [ ] **Step 1: Write tests for normalized signals**

```ts
// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOperationsIdentitySignals, normalizeOperationsPhone } from './identity-server.ts';

test('Nigerian phone forms normalize to the same value', () => {
  assert.equal(normalizeOperationsPhone('08031234567'), '+2348031234567');
  assert.equal(normalizeOperationsPhone('2348031234567'), '+2348031234567');
  assert.equal(normalizeOperationsPhone('+234 803 123 4567'), '+2348031234567');
});

test('identity signals omit blanks and use normalized phone', () => {
  assert.deepEqual(buildOperationsIdentitySignals({ name: 'Ada Obi', phone: '08031234567', email: 'ADA@EXAMPLE.COM' }), [
    { type: 'phone', value: '+2348031234567' },
    { type: 'email', value: 'ada@example.com' },
    { type: 'name', value: 'Ada Obi' },
  ]);
});
```

- [ ] **Step 2: Run test RED, then implement signal builder**

```ts
export function buildOperationsIdentitySignals(input: { name?: string | null; phone?: string | null; email?: string | null }) {
  const signals: Array<{ type: string; value: string }> = [];
  const phone = normalizeOperationsPhone(input.phone || '');
  const email = (input.email || '').trim().toLowerCase();
  const name = (input.name || '').trim();
  if (phone) signals.push({ type: 'phone', value: phone });
  if (email) signals.push({ type: 'email', value: email });
  if (name) signals.push({ type: 'name', value: name });
  return signals;
}
```

- [ ] **Step 3: Add the Admin-only resolver**

```ts
export async function resolveOrCreateOperationsIdentity(input: {
  existingIdentityId?: string | null;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  source: 'operations_order' | 'operations_repair';
}) {
  const supabase = await requireAdmin();
  if (input.existingIdentityId) return input.existingIdentityId;
  const signals = buildOperationsIdentitySignals(input);
  if (!signals.length) throw new Error('Customer name, phone or email is required.');
  const { data, error } = await supabase.rpc('upsert_identity_from_signals', {
    p_signals: signals,
    p_primary_name: input.name?.trim() || null,
    p_primary_phone: normalizeOperationsPhone(input.phone || '') || null,
    p_primary_email: input.email?.trim().toLowerCase() || null,
    p_source: input.source,
  });
  if (error || !data) throw new Error(error?.message || 'Unable to resolve customer Identity');
  return String(data);
}
```

- [ ] **Step 4: Use resolver before `ops_create_draft_order`**

In `createOperationsOrder`, resolve the Identity before the RPC and pass the resolved ID as `p_identity_id`. Preserve manually selected `leadId`, Ambassador attribution and acquisition source.

- [ ] **Step 5: Ensure new Repair creation also resolves Identity**

`createRepairWithCard` must call the same helper using source `operations_repair` before inserting/assigning.

- [ ] **Step 6: Run Operations tests and commit**

```bash
npm run test:operations
git add src/lib/operations/identity-server.ts src/lib/operations/identity-server.test.ts src/lib/operations/server.ts src/lib/operations/repair-server.ts
git commit -m "feat: resolve customer identity for orders and repairs"
```

---

### Task 4: Implement Admin repair/card/quote/payment RPCs

**Files:**
- Modify: `supabase/migrations/20260830120000_repair_card_foundation.sql` before it is applied to live Supabase.
- Create: `src/lib/operations/repair-server.ts`
- Modify: `src/app/modules/operations/sales-actions.ts`
- Modify: `src/lib/operations/types.ts`

**Interfaces:**
- Produces RPC-backed functions:
  - `createRepairWithCard(input)`
  - `publishRepairQuote(input)`
  - `recordRepairPayment(input)`
  - `regenerateRepairPin(repairId)`
  - `advanceRepairWorkflow(repairId, status, note?)`
  - `beginRepairHandover(repairId)`
  - `completeRepairCollection(input)`

- [ ] **Step 1: Add atomic SQL RPC for repair + card assignment**

The RPC must lock the selected card and fail if it is not `available`. The essential transaction shape is:

```sql
select * into v_card from public.ops_repair_cards where id = p_card_id for update;
if not found or v_card.status <> 'available' then raise exception 'Repair Card is not available'; end if;

insert into public.ops_repairs(identity_id, customer_name, customer_phone, customer_email, fault_reported, status, created_by, ...)
values(p_identity_id, ..., 'received', auth.uid(), ...)
returning id, repair_code into v_repair_id, v_repair_code;

insert into public.ops_repair_card_assignments(card_id, repair_id, identity_id, access_pin, assigned_by)
values(v_card.id, v_repair_id, p_identity_id, p_access_pin, auth.uid())
returning id into v_assignment_id;

update public.ops_repair_cards set status='assigned' where id=v_card.id;
update public.ops_repairs set current_card_assignment_id=v_assignment_id where id=v_repair_id;
```

Return `repair_id`, `repair_code`, `assignment_id`, `card_code`, and `access_pin` only to authenticated Admin callers.

- [ ] **Step 2: Add versioned quote RPC**

Publishing a quote must supersede a prior `published` quote but never modify an already approved quote. It must update `ops_repairs.current_quote_id`, `amount_charged`, `balance_due`, and status to `awaiting_customer_approval`.

- [ ] **Step 3: Add payment ledger RPC**

`ops_record_repair_payment` inserts one payment, sums non-void payments, calculates `amount_paid`, `balance_due`, `payment_status`, emits a repair event and changes `awaiting_payment` to the next valid state only when the start-payment gate is met.

- [ ] **Step 4: Add workflow-gated status RPC**

The database, not just UI, must reject `in_progress` unless the current quote is approved and `amount_paid >= required_before_start`.

It must reject direct `collected` transitions; only the collection RPC may set collected.

- [ ] **Step 5: Add handover and collection RPCs**

`ops_begin_repair_handover` requires `ready_collection` and sets a 15-minute window on the active assignment.

`ops_complete_repair_collection` requires:

```sql
final completion consent exists
and balance_due = 0
and (card returned = true or missing-card override reason is non-empty)
```

It atomically closes assignment, revokes sessions, changes card to `available` or `missing`, and sets repair `collected`.

- [ ] **Step 6: Add focused TypeScript wrappers**

`repair-server.ts` uses `requireAdmin()` and Supabase RPCs rather than directly scattering updates across React actions.

- [ ] **Step 7: Run source tests, inspect migration diff, commit**

```bash
npm run test:operations
git diff --check
git add supabase/migrations/20260830120000_repair_card_foundation.sql src/lib/operations/repair-server.ts src/app/modules/operations/sales-actions.ts src/lib/operations/types.ts
git commit -m "feat: add repair card workflow services"
```

---

### Task 5: Apply foundation migration and verify with isolated TEST data

**Files:**
- No source changes unless a verified defect is found.

**Interfaces:**
- Verifies live schema matches committed migration.

- [ ] **Step 1: Confirm branch head and `main` head before live migration**

Record both SHAs. Do not merge or write to `main`.

- [ ] **Step 2: Apply `20260830120000_repair_card_foundation.sql` to the EmmyTech Supabase project**

Use the connected Supabase project and apply the exact committed migration content.

- [ ] **Step 3: Verify 30 cards and constraints**

Expected queries:

```sql
select count(*) from public.ops_repair_cards;
-- 30

select card_code,status from public.ops_repair_cards order by card_code;
-- RC-01 ... RC-30, all available
```

- [ ] **Step 4: Create one marked TEST Identity/repair/card assignment through the new RPC**

Use a clearly marked customer name such as `TEST Repair Card Customer` and an available test card, preferably `RC-30`.

Verify:

- repair has `identity_id`;
- RC-30 becomes assigned;
- exactly one active assignment exists;
- PIN matches the allowed four-character set;
- duplicate assignment to RC-30 fails.

- [ ] **Step 5: Exercise quote/payment gate**

Create a TEST quote of ₦45,000 with ₦20,000 start requirement. Verify `in_progress` fails before approval/payment and succeeds only after the current quote is approved and enough TEST payments are recorded.

- [ ] **Step 6: Clean TEST repair/payment/quote/assignment/Identity data**

Do not delete the physical seeded Repair Card. Restore RC-30 to `available` and verify no TEST repair records remain.

- [ ] **Step 7: Record verification evidence in the implementation session**

Do not claim the foundation is complete without the query outputs and clean-up result.
