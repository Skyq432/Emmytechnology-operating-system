# EmmyTech Sales Commercial Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the safe Sales foundation: dedicated Sales workspace, pricing/margin rules, shared Order commercial metadata, quotation/version schema, unified payment reporting, receipt/document metadata, credit/return foundations, and server/RPC boundaries without duplicating CRM, Orders, Inventory, Repairs or canonical payment ledgers.

**Architecture:** Sales is a commercial layer over existing EmmyTech primitives. `public.identities` remains the customer master; `ops_orders` remains the transaction/order master; Operations inventory remains the stock master; `ops_order_payments` and `ops_repair_payments` remain canonical payment ledgers. New `sales_*` tables hold Sales-only concerns such as quotation versions, pricing approvals, document metadata, credit approvals and return/refund audit records. All database changes are additive and backward-compatible.

**Tech Stack:** Next.js 16.2.6, React 19.2.4, TypeScript 5.7+, Tailwind CSS 4, Supabase/PostgreSQL, `@supabase/ssr` 0.10.3, `@supabase/supabase-js` 2.106.2, Node built-in test runner.

**Spec:** `docs/superpowers/specs/2026-08-31-emmytech-sales-system-design.md`

## Global Constraints

- Work only on `ambassador-development`; do not modify `main`.
- Sales must not create a second customer, inventory, Order or mutable payment ledger.
- Every quotation/direct sale/order must resolve to `public.identities`.
- Direct Sale physical products must use real available Operations inventory.
- Quotations never reserve inventory.
- Published quotation versions are immutable and an accepted quotation converts at most once.
- Gross Margin is `(Selling Price - Cost) / Selling Price × 100` and is the official profitability measure.
- Pricing must pass both actor discount authority and the resolved minimum gross-margin floor; below-floor exceptions require Admin approval and an audit reason.
- Minimum margin resolves product override → category policy → company default.
- Cost basis resolves exact serialized-unit cost → current/weighted inventory cost → product default cost → supplier/on-demand transaction cost.
- Sales Value, Cash Collected and Outstanding are separate metrics.
- Canonical Order and Repair payment rows are projected into Sales reporting; they are not copied into another mutable payment table.
- Every canonical payment can create at most one payment receipt; every fully-paid commercial sale can create at most one final consolidated receipt.
- Phase 1 creates receipt/document metadata and idempotency constraints only; it does not enable production LaTeX rendering or outbound email.
- Full-payment is the normal physical-release gate; outstanding-balance release requires a valid Admin credit approval.
- Issued financial documents are immutable; corrections use void/reissue.
- Returns/refunds preserve original sale/receipt evidence.
- New Sales tables use RLS and server-controlled writes. Initially, existing `admin` users have full Sales authority; the schema must support salesperson/manager authority configuration later.
- Supabase is a shared live backend. Apply migrations only after repository tests/review, use additive SQL, test with explicitly marked TEST records, and clean all TEST data.
- Never use `git add .`; stage only intended files.

---

## File Structure

### New Sales domain files

- `src/lib/sales/domain.ts` — pure Gross Margin, policy resolution, price decision and metric helpers.
- `src/lib/sales/domain.test.ts` — TDD coverage for all pure Sales rules.
- `src/lib/sales/types.ts` — Sales-facing view/interface types, separate from Operations ownership types.
- `src/lib/sales/navigation.ts` — Sales sidebar configuration and labels.
- `src/lib/sales/navigation.test.ts` — stable navigation ordering/route tests.
- `src/lib/sales/server.ts` — authenticated Sales read/write boundary; reuses Operations Identity/order primitives where appropriate.
- `src/lib/sales/quotation-server.ts` — focused quotation server boundary.
- `src/lib/sales/direct-sale-server.ts` — focused direct-sale server boundary.

### New Sales routes/components

- `src/app/modules/sales/layout.tsx` — authenticated Admin Sales layout for Phase 1.
- `src/app/modules/sales/page.tsx` — Sales Overview route.
- `src/components/sales/sales-shell.tsx` — Sales navigation/header shell.
- `src/components/sales/sales-overview.tsx` — Phase 1 metrics/attention view.

### Existing shared files modified

- `package.json` — add `test:sales` and combined commercial test command.
- `src/lib/operations/types.ts` — additive Order/item fields required for shared Sales metadata; preserve existing exports.
- `src/app/modules/[slug]/page.tsx` — no behavioral rewrite is required; static `/modules/sales` route should take precedence. Modify only if local routing proves otherwise.

### Database migrations

- `supabase/migrations/20260831060000_sales_commercial_foundation.sql` — shared Order metadata, Sales authority/policies, quotation/version/acceptance/event schema and core RPCs.
- `supabase/migrations/20260831070000_sales_financial_document_foundation.sql` — unified payment projection, receipt/document metadata, credit approvals, return/refund foundations and reporting views/functions.
- `docs/sales/sales-commercial-foundation-rollback.sql` — guarded rollback for the first migration.
- `docs/sales/sales-financial-foundation-rollback.sql` — guarded rollback for the second migration.

---

### Task 1: Pure Sales pricing and reporting domain

**Files:**
- Create: `src/lib/sales/domain.ts`
- Create: `src/lib/sales/domain.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces:
  - `calculateGrossMargin(sellingPrice: number, cost: number): number`
  - `resolveMinimumMargin(input: MarginResolutionInput): MarginResolution`
  - `evaluateSalesPrice(input: SalesPriceDecisionInput): SalesPriceDecision`
  - `deriveSalesPeriodMetrics(input: SalesPeriodMetricInput[]): SalesPeriodMetrics`
  - `SalesAuthorityLevel = 'salesperson' | 'manager' | 'admin'`
  - `CostBasisSource = 'serialized_unit' | 'inventory_average' | 'product_default' | 'supplier_on_demand'`

- [ ] **Step 1: Write failing Gross Margin and policy-resolution tests**

Create `src/lib/sales/domain.test.ts` with tests equivalent to:

```ts
// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateGrossMargin,
  resolveMinimumMargin,
  evaluateSalesPrice,
  deriveSalesPeriodMetrics,
} from './domain.ts';

test('gross margin uses profit divided by selling price, not markup', () => {
  assert.equal(calculateGrossMargin(500000, 450000), 10);
  assert.equal(calculateGrossMargin(0, 450000), 0);
});

test('minimum margin resolves product then category then company default', () => {
  assert.deepEqual(resolveMinimumMargin({ productMargin: 4, categoryMargin: 7, companyMargin: 8 }), { margin: 4, source: 'product' });
  assert.deepEqual(resolveMinimumMargin({ productMargin: null, categoryMargin: 7, companyMargin: 8 }), { margin: 7, source: 'category' });
  assert.deepEqual(resolveMinimumMargin({ productMargin: null, categoryMargin: null, companyMargin: 8 }), { margin: 8, source: 'company' });
});

test('price is allowed only when discount authority and margin floor both pass', () => {
  const allowed = evaluateSalesPrice({ listPrice: 500000, requestedPrice: 485000, cost: 450000, actorDiscountLimitPercent: 3, minimumGrossMarginPercent: 5, actorLevel: 'salesperson' });
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.requiresAdminApproval, false);

  const belowMargin = evaluateSalesPrice({ listPrice: 500000, requestedPrice: 485000, cost: 490000, actorDiscountLimitPercent: 3, minimumGrossMarginPercent: 5, actorLevel: 'salesperson' });
  assert.equal(belowMargin.allowed, false);
  assert.equal(belowMargin.requiresAdminApproval, true);
  assert.equal(belowMargin.reason, 'below_margin_floor');
});

test('admin exception can approve below-floor price only when explicitly marked', () => {
  const result = evaluateSalesPrice({ listPrice: 500000, requestedPrice: 470000, cost: 490000, actorDiscountLimitPercent: 100, minimumGrossMarginPercent: 5, actorLevel: 'admin', adminExceptionApproved: true });
  assert.equal(result.allowed, true);
  assert.equal(result.isException, true);
});

test('period metrics keep sales value cash collected and outstanding separate', () => {
  assert.deepEqual(deriveSalesPeriodMetrics([
    { salesValue: 500000, cashCollected: 300000, outstanding: 200000, grossProfit: 50000 },
    { salesValue: 100000, cashCollected: 100000, outstanding: 0, grossProfit: 20000 },
  ]), {
    salesValue: 600000,
    cashCollected: 400000,
    outstanding: 200000,
    grossProfit: 70000,
    grossMargin: 11.666666666666666,
  });
});
```

- [ ] **Step 2: Run the Sales test and verify RED**

Run:

```bash
node --experimental-strip-types --test src/lib/sales/domain.test.ts
```

Expected: FAIL because `src/lib/sales/domain.ts` does not exist.

- [ ] **Step 3: Implement the pure domain module**

Create `src/lib/sales/domain.ts` with these public types/signatures:

```ts
export type SalesAuthorityLevel = 'salesperson' | 'manager' | 'admin';
export type CostBasisSource = 'serialized_unit' | 'inventory_average' | 'product_default' | 'supplier_on_demand';
export type MarginPolicySource = 'product' | 'category' | 'company';

export interface MarginResolutionInput {
  productMargin?: number | null;
  categoryMargin?: number | null;
  companyMargin: number;
}

export interface MarginResolution {
  margin: number;
  source: MarginPolicySource;
}

export interface SalesPriceDecisionInput {
  listPrice: number;
  requestedPrice: number;
  cost: number;
  actorDiscountLimitPercent: number;
  minimumGrossMarginPercent: number;
  actorLevel: SalesAuthorityLevel;
  adminExceptionApproved?: boolean;
}

export interface SalesPriceDecision {
  allowed: boolean;
  requiresAdminApproval: boolean;
  isException: boolean;
  discountAmount: number;
  discountPercent: number;
  grossProfit: number;
  grossMargin: number;
  reason: 'ok' | 'discount_authority_exceeded' | 'below_margin_floor' | 'invalid_price';
}

export function calculateGrossMargin(sellingPrice: number, cost: number) {
  const price = Math.max(0, Number(sellingPrice || 0));
  const basis = Math.max(0, Number(cost || 0));
  if (price <= 0) return 0;
  return ((price - basis) / price) * 100;
}

export function resolveMinimumMargin(input: MarginResolutionInput): MarginResolution {
  if (input.productMargin != null) return { margin: Math.max(0, Number(input.productMargin)), source: 'product' };
  if (input.categoryMargin != null) return { margin: Math.max(0, Number(input.categoryMargin)), source: 'category' };
  return { margin: Math.max(0, Number(input.companyMargin)), source: 'company' };
}
```

Implement `evaluateSalesPrice` so it:

1. rejects `requestedPrice <= 0`;
2. calculates discount against `listPrice`;
3. calculates Gross Margin against `cost`;
4. requires Admin approval if discount authority is exceeded;
5. requires Admin approval if margin floor is missed;
6. permits an explicit Admin exception only for `actorLevel === 'admin' && adminExceptionApproved === true`.

Implement `deriveSalesPeriodMetrics` by summing Sales Value, Cash Collected, Outstanding and Gross Profit; compute aggregate Gross Margin as `grossProfit / salesValue * 100`, not an average of row percentages.

- [ ] **Step 4: Run Sales test and verify GREEN**

Run:

```bash
node --experimental-strip-types --test src/lib/sales/domain.test.ts
```

Expected: all Sales domain tests PASS.

- [ ] **Step 5: Add test scripts**

Modify `package.json` scripts to include:

```json
"test:sales": "node --experimental-strip-types --test src/lib/sales/*.test.ts",
"test:commercial": "npm run test:operations && npm run test:sales"
```

Preserve the existing `test:operations` script unchanged.

- [ ] **Step 6: Run both test suites**

Run:

```bash
npm run test:commercial
```

Expected: existing Operations tests remain green and new Sales tests pass.

- [ ] **Step 7: Commit**

```bash
git add package.json src/lib/sales/domain.ts src/lib/sales/domain.test.ts
git commit -m "feat: add Sales pricing domain"
```

---

### Task 2: Sales navigation and authenticated workspace shell

**Files:**
- Create: `src/lib/sales/navigation.ts`
- Create: `src/lib/sales/navigation.test.ts`
- Create: `src/app/modules/sales/layout.tsx`
- Create: `src/app/modules/sales/page.tsx`
- Create: `src/components/sales/sales-shell.tsx`
- Create: `src/components/sales/sales-overview.tsx`

**Interfaces:**
- Consumes: existing `ReportingPeriodProvider` and Supabase auth pattern from `src/app/modules/operations/layout.tsx`.
- Produces: stable Sales routes under `/modules/sales` and a Phase 1 Overview component that accepts `SalesOverviewData` later from Task 7.

- [ ] **Step 1: Write failing navigation test**

Create `src/lib/sales/navigation.test.ts`:

```ts
// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { SALES_NAV } from './navigation.ts';

test('Sales navigation exposes the approved commercial workspace in stable order', () => {
  assert.deepEqual(SALES_NAV.map((item) => item.label), [
    'Overview', 'Direct Sale', 'Quotations', 'Orders', 'Payments', 'Receipts',
    'Customers', 'Credit & Outstanding', 'Returns & Refunds', 'Sales Team', 'Reports', 'Settings',
  ]);
  assert.equal(SALES_NAV[0].href, '/modules/sales');
  assert.equal(SALES_NAV[1].href, '/modules/sales/direct');
});
```

- [ ] **Step 2: Run test and verify RED**

Run:

```bash
node --experimental-strip-types --test src/lib/sales/navigation.test.ts
```

Expected: FAIL because `navigation.ts` does not exist.

- [ ] **Step 3: Implement `SALES_NAV`**

Create `src/lib/sales/navigation.ts` with keys/hrefs:

```ts
export const SALES_NAV = [
  { key: 'overview', label: 'Overview', href: '/modules/sales' },
  { key: 'direct', label: 'Direct Sale', href: '/modules/sales/direct' },
  { key: 'quotations', label: 'Quotations', href: '/modules/sales/quotations' },
  { key: 'orders', label: 'Orders', href: '/modules/sales/orders' },
  { key: 'payments', label: 'Payments', href: '/modules/sales/payments' },
  { key: 'receipts', label: 'Receipts', href: '/modules/sales/receipts' },
  { key: 'customers', label: 'Customers', href: '/modules/sales/customers' },
  { key: 'credit', label: 'Credit & Outstanding', href: '/modules/sales/credit' },
  { key: 'returns', label: 'Returns & Refunds', href: '/modules/sales/returns' },
  { key: 'team', label: 'Sales Team', href: '/modules/sales/team' },
  { key: 'reports', label: 'Reports', href: '/modules/sales/reports' },
  { key: 'settings', label: 'Settings', href: '/modules/sales/settings' },
] as const;
```

- [ ] **Step 4: Run navigation test and verify GREEN**

Run:

```bash
npm run test:sales
```

Expected: all Sales tests PASS.

- [ ] **Step 5: Build Phase 1 authenticated Sales layout**

Create `src/app/modules/sales/layout.tsx` following the Operations auth pattern exactly for Phase 1:

```tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { ReportingPeriodProvider } from '@/components/reporting/reporting-period-context';
import { SalesShell } from '@/components/sales/sales-shell';

export default async function SalesLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/');

  return <ReportingPeriodProvider><SalesShell>{children}</SalesShell></ReportingPeriodProvider>;
}
```

Do not prematurely grant non-Admin access in Phase 1; Task 3 creates the authority schema for later rollout.

- [ ] **Step 6: Build `SalesShell`**

Follow the current Operations shell visual language but use Sales-specific copy/iconography. Requirements:

```text
Header title: Sales
Subtitle: Commercial workspace
Sidebar: SALES_NAV
No large/double help bubbles
Mobile horizontal nav mirrors SALES_NAV
```

Keep the component focused on layout/navigation only; do not embed Overview fetching in the shell.

- [ ] **Step 7: Add initial Overview page/component**

Create `src/app/modules/sales/page.tsx` rendering `SalesOverview`. In this task, `SalesOverview` may show zero-state cards only with explicit labels:

```text
Sales Value
Cash Collected
Outstanding
Gross Profit
Gross Margin
```

Do not invent data. Task 7 wires the real read model.

- [ ] **Step 8: Verify route locally**

Run:

```bash
npm run dev
```

Open `/modules/sales` as Admin. Expected: dedicated Sales shell renders instead of the generic `[slug]` placeholder; Operations route remains unchanged.

- [ ] **Step 9: Commit**

```bash
git add src/lib/sales/navigation.ts src/lib/sales/navigation.test.ts src/app/modules/sales/layout.tsx src/app/modules/sales/page.tsx src/components/sales/sales-shell.tsx src/components/sales/sales-overview.tsx
git commit -m "feat: add Sales workspace shell"
```

---

### Task 3: Core Sales commercial schema and Order metadata

**Files:**
- Create: `supabase/migrations/20260831060000_sales_commercial_foundation.sql`
- Create: `docs/sales/sales-commercial-foundation-rollback.sql`
- Modify: `src/lib/operations/types.ts`
- Create: `src/lib/sales/types.ts`

**Interfaces:**
- Consumes: existing `ops_is_admin()`, `ops_orders`, `ops_order_items`, `ops_inventory_items`, `ops_inventory_units`, `public.identities`, `public.users`.
- Produces tables:
  - `sales_authority_profiles`
  - `sales_settings`
  - `sales_margin_policies`
  - `sales_discount_approvals`
  - `sales_quotations`
  - `sales_quotation_versions`
  - `sales_quotation_items`
  - `sales_quotation_acceptances`
  - `sales_quotation_deliveries`
  - `sales_events`
- Produces additive Order/item columns required by Sales.

- [ ] **Step 1: Write the migration with additive Order metadata**

Start the migration with guarded `add column if not exists` changes:

```sql
alter table public.ops_orders
  add column if not exists sales_channel text not null default 'order'
    check (sales_channel in ('order','direct_sale')),
  add column if not exists fulfilment_mode text not null default 'operations_fulfilment'
    check (fulfilment_mode in ('operations_fulfilment','immediate_collection')),
  add column if not exists salesperson_user_id uuid references public.users(id) on delete set null,
  add column if not exists salesperson_name text,
  add column if not exists source_quotation_id uuid,
  add column if not exists source_quotation_version_id uuid,
  add column if not exists handover_completed_at timestamptz;

alter table public.ops_order_items
  add column if not exists inventory_unit_id uuid references public.ops_inventory_units(id) on delete set null,
  add column if not exists cost_basis numeric not null default 0 check (cost_basis >= 0),
  add column if not exists cost_basis_source text
    check (cost_basis_source is null or cost_basis_source in ('serialized_unit','inventory_average','product_default','supplier_on_demand')),
  add column if not exists gross_profit numeric not null default 0,
  add column if not exists gross_margin numeric not null default 0,
  add column if not exists pricing_approval_id uuid;
```

Do not add foreign keys for quotation/pricing approval references until their target tables exist later in the same migration; add those constraints after table creation.

Existing rows default to `sales_channel='order'` and `fulfilment_mode='operations_fulfilment'`, preserving old Operations behavior.

- [ ] **Step 2: Create Sales authority/policy tables**

Create:

```sql
create table public.sales_authority_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  authority_level text not null check (authority_level in ('salesperson','manager','admin')),
  discount_limit_percent numeric not null default 0 check (discount_limit_percent >= 0 and discount_limit_percent <= 100),
  is_active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sales_settings (
  id uuid primary key default gen_random_uuid(),
  settings_key text not null unique default 'default',
  company_default_margin_percent numeric not null default 0 check (company_default_margin_percent >= 0 and company_default_margin_percent < 100),
  company_archive_email text,
  quotation_valid_days integer not null default 7 check (quotation_valid_days > 0),
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sales_margin_policies (
  id uuid primary key default gen_random_uuid(),
  policy_scope text not null check (policy_scope in ('category','product')),
  category text,
  inventory_item_id uuid references public.ops_inventory_items(id) on delete cascade,
  minimum_margin_percent numeric not null check (minimum_margin_percent >= 0 and minimum_margin_percent < 100),
  is_active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (policy_scope = 'category' and nullif(trim(category),'') is not null and inventory_item_id is null)
    or
    (policy_scope = 'product' and inventory_item_id is not null)
  )
);
```

Add unique partial indexes so only one active category policy per normalized category and one active product policy per inventory item exist.

- [ ] **Step 3: Create discount approval table**

Use an immutable decision record:

```sql
create table public.sales_discount_approvals (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.ops_orders(id) on delete cascade,
  quotation_version_id uuid,
  order_item_id uuid references public.ops_order_items(id) on delete cascade,
  quotation_item_id uuid,
  list_price numeric not null check (list_price >= 0),
  requested_price numeric not null check (requested_price >= 0),
  cost_basis numeric not null check (cost_basis >= 0),
  discount_percent numeric not null default 0,
  resulting_gross_margin numeric not null,
  decision text not null check (decision in ('approved','rejected')),
  reason text not null,
  requested_by uuid references public.users(id) on delete set null,
  approved_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
```

Require a nonblank `reason` for Admin below-floor approvals at the RPC layer.

- [ ] **Step 4: Create quotation/version schema**

Create these tables with human-readable quotation code and immutable version semantics:

```sql
create table public.sales_quotations (
  id uuid primary key default gen_random_uuid(),
  quotation_code text not null unique default ('QT-' || to_char(now(),'YYYYMMDD') || '-' || upper(substr(md5(random()::text),1,6))),
  identity_id uuid not null references public.identities(id) on delete restrict,
  customer_name text,
  customer_phone text,
  customer_email text,
  salesperson_user_id uuid references public.users(id) on delete set null,
  salesperson_name text,
  status text not null default 'draft' check (status in ('draft','published','accepted','declined','converted','cancelled')),
  current_version_id uuid,
  converted_order_id uuid references public.ops_orders(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sales_quotation_versions (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.sales_quotations(id) on delete cascade,
  version integer not null check (version > 0),
  subtotal numeric not null default 0 check (subtotal >= 0),
  discount_amount numeric not null default 0 check (discount_amount >= 0),
  total_amount numeric not null default 0 check (total_amount >= 0),
  status text not null default 'published' check (status in ('published','accepted','declined','superseded')),
  validity_expires_at timestamptz,
  customer_note text,
  terms text,
  published_by uuid references public.users(id) on delete set null,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (quotation_id, version)
);

create table public.sales_quotation_items (
  id uuid primary key default gen_random_uuid(),
  quotation_version_id uuid not null references public.sales_quotation_versions(id) on delete cascade,
  inventory_item_id uuid references public.ops_inventory_items(id) on delete set null,
  item_name text not null,
  item_type text not null default 'other',
  fulfilment_source text not null default 'manual' check (fulfilment_source in ('internal','supplier','dropship','manual')),
  quantity integer not null check (quantity > 0),
  list_price numeric not null default 0 check (list_price >= 0),
  final_unit_price numeric not null default 0 check (final_unit_price >= 0),
  line_discount_amount numeric not null default 0 check (line_discount_amount >= 0),
  cost_basis numeric not null default 0 check (cost_basis >= 0),
  cost_basis_source text check (cost_basis_source is null or cost_basis_source in ('serialized_unit','inventory_average','product_default','supplier_on_demand')),
  gross_profit numeric not null default 0,
  gross_margin numeric not null default 0,
  pricing_approval_id uuid,
  note text,
  created_at timestamptz not null default now()
);
```

Create `sales_quotation_acceptances` with:

```text
quotation_version_id UNIQUE
identity_id
acceptance_type: digital | offline
channel: secure_link | whatsapp | phone | email | in_person | other
accepted/declined decision
note/evidence_reference
actor_user_id nullable for digital customer action
accepted_at
snapshot jsonb
```

Create `sales_quotation_deliveries` with delivery method/email, version, sent_by, sent_at, state (`pending|sent|failed`) and error text.

Create `sales_events` with optional quotation/order/identity references, event type/title/note/metadata/actor/time.

- [ ] **Step 5: Add foreign keys and indexes after all target tables exist**

Add:

```sql
alter table public.sales_quotations
  add constraint sales_quotations_current_version_fk
  foreign key (current_version_id) references public.sales_quotation_versions(id) on delete set null;

alter table public.ops_orders
  add constraint ops_orders_source_quotation_fk
  foreign key (source_quotation_id) references public.sales_quotations(id) on delete set null,
  add constraint ops_orders_source_quotation_version_fk
  foreign key (source_quotation_version_id) references public.sales_quotation_versions(id) on delete set null;
```

Add pricing approval foreign keys after `sales_discount_approvals` and quotation items exist, using `ON DELETE SET NULL`.

Add indexes for quotation Identity/status, quotation versions, events, salesperson and Order sales channel.

- [ ] **Step 6: Add RLS, grants and updated-at triggers**

Enable RLS on every new Sales table. For Phase 1, authenticated access policies use `public.ops_is_admin()` for select/write. Revoke all from `anon`.

Reuse `public.ops_touch_updated_at()` for mutable Sales configuration/master tables.

Do not expose quotation acceptance tables directly to anonymous users in this migration; Phase 3 will add a narrowly scoped secure acceptance RPC/token flow.

- [ ] **Step 7: Seed one default Sales settings row idempotently**

Use:

```sql
insert into public.sales_settings (settings_key, company_default_margin_percent)
values ('default', 0)
on conflict (settings_key) do nothing;
```

Do not invent operational margin percentages during migration.

- [ ] **Step 8: Create guarded rollback file**

`docs/sales/sales-commercial-foundation-rollback.sql` must refuse destructive rollback if any quotation/order actively references Sales foundation records. It may drop only new Sales tables/constraints/columns after explicit safety assertions.

- [ ] **Step 9: Update TypeScript shared types**

In `src/lib/operations/types.ts`, add additive fields to `OperationsOrder` and `OperationsOrderItem` matching the schema. Do not rename/remove existing fields.

Create `src/lib/sales/types.ts` with focused interfaces including:

```ts
export type SalesChannel = 'order' | 'direct_sale';
export type SalesFulfilmentMode = 'operations_fulfilment' | 'immediate_collection';
export type QuotationStatus = 'draft' | 'published' | 'accepted' | 'declined' | 'converted' | 'cancelled';
export type QuotationVersionStatus = 'published' | 'accepted' | 'declined' | 'superseded';

export interface SalesQuotationSummary {
  id: string;
  quotation_code: string;
  identity_id: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  salesperson_user_id: string | null;
  salesperson_name: string | null;
  status: QuotationStatus;
  current_version_id: string | null;
  converted_order_id: string | null;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 10: Run pure tests and TypeScript/build check before DB apply**

Run:

```bash
npm run test:commercial
npm run build
```

Expected: exit 0 before applying the migration to shared Supabase.

- [ ] **Step 11: Commit repository migration/type changes**

```bash
git add supabase/migrations/20260831060000_sales_commercial_foundation.sql docs/sales/sales-commercial-foundation-rollback.sql src/lib/operations/types.ts src/lib/sales/types.ts
git commit -m "feat: add Sales commercial schema"
```

---

### Task 4: Financial document, unified payment, credit and return foundation

**Files:**
- Create: `supabase/migrations/20260831070000_sales_financial_document_foundation.sql`
- Create: `docs/sales/sales-financial-foundation-rollback.sql`
- Modify: `src/lib/sales/types.ts`

**Interfaces:**
- Consumes: `ops_order_payments`, `ops_repair_payments`, `ops_orders`, `ops_repairs`, `sales_quotations`, `public.identities`.
- Produces:
  - `sales_documents`
  - `sales_document_deliveries`
  - `sales_credit_releases`
  - `sales_returns`
  - `sales_return_items`
  - `sales_refunds`
  - `sales_unified_payments` view
  - `sales_commercial_balances` view

- [ ] **Step 1: Create immutable document metadata table**

Create `sales_documents`:

```sql
create table public.sales_documents (
  id uuid primary key default gen_random_uuid(),
  document_number text not null unique,
  document_type text not null check (document_type in ('payment_receipt','final_sales_receipt','refund_document','quotation_pdf')),
  identity_id uuid references public.identities(id) on delete set null,
  order_id uuid references public.ops_orders(id) on delete set null,
  repair_id uuid references public.ops_repairs(id) on delete set null,
  quotation_version_id uuid references public.sales_quotation_versions(id) on delete set null,
  source_payment_type text check (source_payment_type is null or source_payment_type in ('order','repair','refund')),
  source_payment_id uuid,
  snapshot jsonb not null,
  storage_path text,
  render_status text not null default 'pending' check (render_status in ('pending','rendered','failed')),
  issued_at timestamptz not null default now(),
  voided_at timestamptz,
  void_reason text,
  voided_by uuid references public.users(id) on delete set null,
  replacement_document_id uuid references public.sales_documents(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
```

Add idempotency indexes:

```sql
create unique index sales_documents_one_payment_receipt
  on public.sales_documents(source_payment_type, source_payment_id)
  where document_type = 'payment_receipt' and voided_at is null;

create unique index sales_documents_one_final_sales_receipt
  on public.sales_documents(order_id)
  where document_type = 'final_sales_receipt' and voided_at is null;
```

Do not generate PDF bytes in Phase 1.

- [ ] **Step 2: Create document delivery history**

Create `sales_document_deliveries` with document ID, recipient type (`customer|company_archive`), recipient email, delivery state (`pending|sent|failed|customer_email_missing`), attempt count, last error, sent timestamp and created timestamp.

- [ ] **Step 3: Create Admin credit-release approvals**

```sql
create table public.sales_credit_releases (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.ops_orders(id) on delete cascade,
  approved_outstanding_amount numeric not null check (approved_outstanding_amount > 0),
  due_at timestamptz not null,
  reason text not null check (length(trim(reason)) > 0),
  status text not null default 'active' check (status in ('active','revoked','settled','expired')),
  approved_by uuid not null references public.users(id) on delete restrict,
  approved_at timestamptz not null default now(),
  revoked_by uuid references public.users(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index sales_credit_releases_one_active_order
  on public.sales_credit_releases(order_id)
  where status = 'active';
```

- [ ] **Step 4: Create return/refund audit foundations**

Create:

```text
sales_returns
  order_id, identity_id, status(requested|approved|completed|rejected), reason,
  requested_by, approved_by, timestamps

sales_return_items
  return_id, order_item_id, inventory_unit_id nullable, quantity,
  returned_condition, disposition(available|faulty|inspection|retired|other), note

sales_refunds
  return_id, order_id, amount, payment_method, reference,
  status(recorded|void), refunded_at, recorded_by
```

Enforce positive quantities/amounts and exact sold-unit reference for serialized return items at RPC layer in Phase 5; Phase 1 schema must support it without mutating original receipts.

- [ ] **Step 5: Create unified payment projection**

Create a security-invoker view that UNION ALLs canonical ledgers without copying rows:

```sql
create view public.sales_unified_payments
with (security_invoker = true)
as
select
  'order'::text as source_type,
  p.id as source_payment_id,
  p.order_id as source_id,
  o.order_code as source_code,
  o.identity_id,
  p.amount,
  p.payment_method,
  p.reference,
  p.paid_at,
  p.is_void,
  p.recorded_by,
  p.created_at
from public.ops_order_payments p
join public.ops_orders o on o.id = p.order_id
union all
select
  'repair'::text as source_type,
  p.id as source_payment_id,
  p.repair_id as source_id,
  r.repair_code as source_code,
  r.identity_id,
  p.amount,
  p.payment_method,
  p.reference,
  p.paid_at,
  p.is_void,
  p.recorded_by,
  p.created_at
from public.ops_repair_payments p
join public.ops_repairs r on r.id = p.repair_id;
```

Grant select only through authenticated/RLS-safe source tables and server-side Admin access.

- [ ] **Step 6: Create commercial balance/reporting view**

Create `sales_commercial_balances` over confirmed/cancelled Orders with fields:

```text
order_id
order_code
identity_id
sales_channel
salesperson_user_id
commercial_state
sales_value = total_amount for confirmed non-cancelled transactions
cash_collected = active canonical order payments summed for that order
outstanding = greatest(total_amount - active payments, 0)
gross_profit = sum(order item gross_profit)
```

Do not include quotation value in `sales_value`.

- [ ] **Step 7: Add RLS/grants**

Enable RLS on new mutable Sales tables using Phase 1 Admin-only policies. Revoke all from anon. Views must be security-invoker or queried only through Admin server functions.

- [ ] **Step 8: Create guarded rollback**

Rollback must refuse to drop document/credit/return tables if non-TEST production records exist. The rollback may drop views first, then new tables/indexes.

- [ ] **Step 9: Extend `src/lib/sales/types.ts`**

Add focused view types:

```ts
export type SalesPaymentSource = 'order' | 'repair';
export type SalesDocumentType = 'payment_receipt' | 'final_sales_receipt' | 'refund_document' | 'quotation_pdf';

export interface SalesUnifiedPayment {
  source_type: SalesPaymentSource;
  source_payment_id: string;
  source_id: string;
  source_code: string;
  identity_id: string | null;
  amount: number;
  payment_method: string;
  reference: string | null;
  paid_at: string;
  is_void: boolean;
  recorded_by: string | null;
  created_at: string;
}
```

- [ ] **Step 10: Verify repository before live apply**

Run:

```bash
npm run test:commercial
npm run build
```

Expected: exit 0.

- [ ] **Step 11: Commit**

```bash
git add supabase/migrations/20260831070000_sales_financial_document_foundation.sql docs/sales/sales-financial-foundation-rollback.sql src/lib/sales/types.ts
git commit -m "feat: add Sales financial foundation"
```

---

### Task 5: Sales server boundary and authority resolution

**Files:**
- Create: `src/lib/sales/server.ts`
- Modify: `src/lib/sales/types.ts`

**Interfaces:**
- Consumes:
  - `createClient()` from `@/lib/supabase-server`
  - `resolveOrCreateOperationsIdentity()` from `@/lib/operations/identity-server`
  - `resolveMinimumMargin()` / `evaluateSalesPrice()` from `./domain`
- Produces:
  - `requireSalesActor()`
  - `resolveOrCreateSalesIdentity(input)`
  - `getSalesAuthority()`
  - `getSalesPricingContext(input)`
  - `validateSalesPrice(input)`

- [ ] **Step 1: Define Sales actor/pricing context types**

Add:

```ts
export interface SalesActor {
  userId: string;
  appRole: string;
  authorityLevel: 'salesperson' | 'manager' | 'admin';
  discountLimitPercent: number;
}

export interface SalesPricingContext {
  inventoryItemId: string | null;
  category: string | null;
  costBasis: number;
  costBasisSource: 'serialized_unit' | 'inventory_average' | 'product_default' | 'supplier_on_demand';
  minimumGrossMarginPercent: number;
  marginPolicySource: 'product' | 'category' | 'company';
}
```

- [ ] **Step 2: Implement `requireSalesActor()`**

Behavior:

1. authenticate with `supabase.auth.getUser()`;
2. load `users.role`;
3. if role is `admin`, return highest authority even if no Sales profile exists;
4. otherwise load an active `sales_authority_profiles` row;
5. reject unauthenticated or users without Sales authority.

Phase 1 UI remains Admin-only, but this function establishes future Sales staff access cleanly.

- [ ] **Step 3: Reuse Identity resolution**

Implement:

```ts
export async function resolveOrCreateSalesIdentity(input: {
  existingIdentityId?: string | null;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
}) {
  return resolveOrCreateOperationsIdentity({
    existingIdentityId: input.existingIdentityId,
    name: input.name,
    phone: input.phone,
    email: input.email,
    source: 'operations_order',
  });
}
```

Do not fork the normalization/upsert logic.

- [ ] **Step 4: Implement cost/margin context resolver**

`getSalesPricingContext` accepts optional exact inventory unit, inventory item, category and supplier/on-demand cost.

Cost resolution must follow:

```text
exact unit unit_cost
→ current quantity inventory cost basis/default_unit_cost when available
→ inventory item default_unit_cost
→ explicit supplier/on-demand transaction cost
```

If no trustworthy cost basis exists, return an explicit error instead of silently assuming zero for a physical product. Service/non-stock lines may use a configured/manual cost path in later UI.

Margin resolution queries active product policy, then category policy, then `sales_settings.settings_key='default'`.

- [ ] **Step 5: Implement server-side price validation**

`validateSalesPrice` combines current `SalesActor`, `SalesPricingContext`, list price and requested price using `evaluateSalesPrice`. If an Admin exception is requested, require a nonblank reason and persist `sales_discount_approvals` before returning approval ID.

Non-Admin callers may not self-create an Admin exception.

- [ ] **Step 6: Run tests/build**

Run:

```bash
npm run test:commercial
npm run build
```

Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/lib/sales/server.ts src/lib/sales/types.ts
git commit -m "feat: add Sales server authority boundary"
```

---

### Task 6: Quotation RPC and server boundaries

**Files:**
- Modify: `supabase/migrations/20260831060000_sales_commercial_foundation.sql` only if still un-applied; if already applied, create `supabase/migrations/20260831080000_sales_quotation_rpcs.sql` instead of editing history.
- Create: `src/lib/sales/quotation-server.ts`
- Modify: `src/lib/sales/types.ts`

**Interfaces:**
- Produces database functions:
  - `sales_create_quotation(...)`
  - `sales_publish_quotation_version(...)`
  - `sales_record_offline_quote_decision(...)`
  - `sales_convert_accepted_quotation(...)`
- Produces TypeScript wrappers with the same business meaning.

- [ ] **Step 1: Implement `sales_create_quotation`**

Inputs include resolved Identity, customer snapshot, salesperson and optional note. Require Admin/Sales authority. Create only the quotation master in `draft`; do not reserve stock.

- [ ] **Step 2: Implement atomic version publishing**

`public.sales_publish_quotation_version(p_quotation_id uuid, p_items jsonb, p_customer_note text, p_terms text, p_validity_expires_at timestamptz)` must:

1. lock quotation `FOR UPDATE`;
2. reject `converted|cancelled` quotations;
3. require nonempty item array;
4. create next integer version;
5. copy item names, list/final prices, cost basis, gross profit/margin and approval IDs into immutable `sales_quotation_items` rows;
6. supersede only prior `published` version, never rewrite accepted history;
7. update `current_version_id` and quotation status `published`;
8. emit `quote.published` Sales event;
9. never create an inventory reservation.

Pricing values passed to the RPC must be revalidated against approval IDs/policy where applicable; do not trust browser totals.

- [ ] **Step 3: Implement offline accept/decline RPC**

`public.sales_record_offline_quote_decision(...)` must require channel in `whatsapp|phone|email|in_person|other`, lock the current quotation version, reject already-decided versions, persist immutable acceptance snapshot, update version/master status, and emit `quote.accepted.offline` or `quote.declined`.

Digital secure-link acceptance is Phase 3 and must use a separate restricted token RPC later.

- [ ] **Step 4: Implement convert-once RPC**

`public.sales_convert_accepted_quotation(p_quotation_id uuid, p_conversion_type text)` where conversion type is `direct_sale|order` must:

1. lock quotation and accepted version;
2. require accepted current version;
3. require `converted_order_id is null`;
4. create a shared `ops_orders` row with `identity_id`, customer snapshot, salesperson, source quotation IDs and copied commercial totals;
5. set `sales_channel='direct_sale'` + `fulfilment_mode='immediate_collection'` for direct conversion, or normal values for Order conversion;
6. copy immutable quote items into `ops_order_items` including cost/margin/approval snapshots;
7. for normal Order, do not bypass the existing confirm/reservation workflow;
8. for direct sale, leave physical handover uncompleted and stock unconsumed until Task 8 gate/RPC;
9. set quotation status `converted`, record `converted_order_id`, emit event;
10. return order ID/code.

Unique/locking rules must make repeated requests return a controlled error instead of creating a second Order.

- [ ] **Step 5: Implement `quotation-server.ts` wrappers**

Export:

```ts
createSalesQuotation(input)
publishSalesQuotationVersion(input)
recordOfflineQuotationDecision(input)
convertAcceptedQuotation(input)
```

Each wrapper calls `requireSalesActor()` first, resolves Identity when creating, invokes the RPC and returns `{ success, message, data }`.

- [ ] **Step 6: Run tests/build**

```bash
npm run test:commercial
npm run build
```

- [ ] **Step 7: Commit**

Stage only the migration actually used plus `quotation-server.ts`/types and commit:

```bash
git commit -m "feat: add quotation transaction boundaries"
```

---

### Task 7: Sales overview read model with unified payments

**Files:**
- Modify: `src/lib/sales/server.ts`
- Modify: `src/lib/sales/types.ts`
- Modify: `src/app/modules/sales/page.tsx`
- Modify: `src/components/sales/sales-overview.tsx`

**Interfaces:**
- Produces `getSalesOverview(input: { start: string; end: string }): Promise<SalesOverviewData>`.

- [ ] **Step 1: Add Overview types**

```ts
export interface SalesOverviewData {
  salesValue: number;
  cashCollected: number;
  outstanding: number;
  grossProfit: number;
  grossMargin: number;
  directSales: number;
  orders: number;
  quotationsPublished: number;
  quotationsAccepted: number;
  attention: Array<{ key: string; label: string; count: number; href: string }>;
}
```

- [ ] **Step 2: Implement period-aware Overview query**

Use confirmed `sales_commercial_balances` rows for Sales Value/Gross Profit in the selected sale period, and `sales_unified_payments.paid_at` for Cash Collected in the payment period. Outstanding is current active balance for transactions relevant to the workspace, not inferred as `period sales - period cash`.

Important: a payment against an older Order received this month contributes to this month's Cash Collected without creating this month's Sales Value.

Compute aggregate Gross Margin from total Gross Profit / total Sales Value.

- [ ] **Step 3: Add simple attention counts**

Initial Phase 1 attention:

```text
Published quotations awaiting decision
Accepted quotations not converted
Active credit approvals overdue (if any)
Receipt/document render failures (future-ready count)
```

No aggressive workflow automation is required yet.

- [ ] **Step 4: Wire Overview page to Reporting Period**

Follow the existing reporting-period pattern used by Operations components. If server components cannot directly read the client context, keep the page server-safe and pass period query parameters through a small client wrapper rather than moving database credentials client-side.

- [ ] **Step 5: Render real metric cards**

`SalesOverview` must show:

```text
Sales Value
Cash Collected
Outstanding
Gross Profit
Gross Margin
```

Use zero values only when the query genuinely returns zero. Do not use illustrative numbers.

- [ ] **Step 6: Run tests/build and inspect locally**

```bash
npm run test:commercial
npm run build
npm run dev
```

Open `/modules/sales`. Verify cards load from real data and Operations remains unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/lib/sales/server.ts src/lib/sales/types.ts src/app/modules/sales/page.tsx src/components/sales/sales-overview.tsx
git commit -m "feat: add Sales overview read model"
```

---

### Task 8: Direct-sale confirmation, credit gate and physical handover boundary

**Files:**
- Create: `src/lib/sales/direct-sale-server.ts`
- Modify or create migration according to apply state:
  - if core migration is still un-applied, include RPCs in `20260831060000_sales_commercial_foundation.sql`;
  - if applied, create `supabase/migrations/20260831090000_sales_direct_sale_rpcs.sql`.

**Interfaces:**
- Produces:
  - `sales_confirm_direct_sale(p_order_id uuid)`
  - `sales_approve_credit_release(...)`
  - `sales_complete_direct_sale_handover(p_order_id uuid)`
  - wrappers `confirmDirectSale`, `approveDirectSaleCredit`, `completeDirectSaleHandover`.

- [ ] **Step 1: Implement direct-sale confirmation validation**

`sales_confirm_direct_sale` must lock the Order and its item rows and require:

```text
sales_channel = direct_sale
fulfilment_mode = immediate_collection
commercial_state = draft
identity_id present
at least one item
all physical lines reference Operations inventory
all serialized physical lines reference one available exact unit
all quantity lines have enough available stock at their source location
all prices have valid frozen pricing decision/approval evidence
```

Confirmation creates the commercial commitment but does **not** yet mark units sold or write physical stock-out movements.

This preserves the distinction between commercial sale and physical handover.

- [ ] **Step 2: Implement Admin credit approval RPC**

`public.sales_approve_credit_release(p_order_id uuid, p_approved_outstanding_amount numeric, p_due_at timestamptz, p_reason text)` must require Admin authority, positive amount, future due date, nonblank reason and one active approval per Order.

- [ ] **Step 3: Implement atomic handover RPC**

`public.sales_complete_direct_sale_handover(p_order_id uuid)` must:

1. lock Order/items/selected inventory units and quantity stock balances;
2. require confirmed Direct Sale;
3. calculate current outstanding from canonical `ops_order_payments`;
4. allow handover only if outstanding is zero OR a valid active credit release covers the outstanding and is not expired;
5. revalidate exact unit availability/quantity immediately before stock-out;
6. mark serialized units sold and link sold order/item;
7. create quantity `sold` stock movements for non-serialized lines using existing Operations stock movement semantics;
8. set `handover_completed_at` and move fulfilment status to the appropriate completed/collection state without fabricating delivery events;
9. emit `sale.handover_completed`;
10. be idempotent: a second call must not subtract stock again.

- [ ] **Step 4: Implement focused TypeScript wrappers**

`direct-sale-server.ts` validates actor/inputs, invokes the RPCs and returns structured results. Do not expose raw cost/margin policy data to future customer-facing components.

- [ ] **Step 5: Add DB transaction tests using marked TEST data during execution**

The executor must test inside a transaction where possible:

```text
TEST Direct Sale fully paid -> handover succeeds, stock moves once
TEST Direct Sale partial payment no credit -> blocked
TEST Direct Sale partial payment with valid Admin credit -> succeeds
TEST repeated handover -> blocked/no second stock movement
TEST serialized unit selected twice concurrently -> second transaction blocked
```

Rollback the transaction or delete only explicitly marked TEST records and restore affected TEST inventory state.

- [ ] **Step 6: Run repository tests/build**

```bash
npm run test:commercial
npm run build
```

- [ ] **Step 7: Commit**

Stage only the RPC migration used plus `src/lib/sales/direct-sale-server.ts` and commit:

```bash
git commit -m "feat: add direct sale commercial gates"
```

---

### Task 9: Receipt metadata idempotency RPCs without renderer/email

**Files:**
- Modify or create migration according to apply state:
  - if financial migration is still un-applied, include RPCs in `20260831070000_sales_financial_document_foundation.sql`;
  - if applied, create `supabase/migrations/20260831100000_sales_receipt_metadata_rpcs.sql`.
- Modify: `src/lib/sales/server.ts`

**Interfaces:**
- Produces:
  - `sales_ensure_payment_receipt_metadata(p_source_type text, p_source_payment_id uuid)`
  - `sales_ensure_final_sales_receipt_metadata(p_order_id uuid)`

- [ ] **Step 1: Implement payment-receipt metadata RPC**

The RPC must:

1. require Sales/Admin authority;
2. look up exactly one canonical payment from Order or Repair ledger;
3. reject void payments;
4. derive Identity/source/customer/payment/balance snapshot from canonical data;
5. generate one unique human-readable document number;
6. insert `sales_documents(document_type='payment_receipt', render_status='pending')`;
7. rely on the unique source-payment index for idempotency;
8. if a row already exists, return the existing document instead of issuing another number.

Phase 1 stops at metadata/render queue state; no LaTeX process or email call occurs.

- [ ] **Step 2: Implement final-sales receipt metadata RPC**

Require a confirmed Order with current outstanding `<= 0`. Snapshot all purchased lines, discounts and canonical payment summaries. Unique index ensures one active final receipt per Order.

- [ ] **Step 3: Add server wrappers**

Export:

```ts
ensurePaymentReceiptMetadata(sourceType: 'order' | 'repair', sourcePaymentId: string)
ensureFinalSalesReceiptMetadata(orderId: string)
```

Do not automatically invoke renderer/email in Phase 1.

- [ ] **Step 4: Test idempotency on TEST records**

Expected:

```text
same payment called twice -> same document ID/number
fully paid order called twice -> same final document ID/number
partial order final receipt -> blocked
void payment receipt -> blocked
```

Clean TEST data.

- [ ] **Step 5: Run tests/build and commit**

```bash
npm run test:commercial
npm run build
git add <actual-migration-file> src/lib/sales/server.ts
git commit -m "feat: add receipt metadata idempotency"
```

---

### Task 10: Live migration rehearsal, verification and Phase 1 checkpoint

**Files:**
- No source changes unless verification finds a real defect.

**Interfaces:**
- Validates all Phase 1 artifacts before moving to Direct Sales UI Phase 2.

- [ ] **Step 1: Verify branch and intended diff**

Run:

```bash
git status
git branch --show-current
git log --oneline --decorate -15
```

Expected: branch `ambassador-development`; no unrelated uncommitted files.

- [ ] **Step 2: Run all commercial tests**

```bash
npm run test:commercial
```

Expected: 0 failures.

- [ ] **Step 3: Run lint/build**

```bash
npm run lint
npm run build
```

If lint contains pre-existing unrelated failures, record them separately; do not hide new Sales lint errors. `npm run build` must exit 0 before Phase 1 is called complete.

- [ ] **Step 4: Review migrations before applying to shared Supabase**

Check for:

```text
no destructive table rewrites
no dropped existing Operations constraints
existing Order rows default to normal order/operations fulfilment
RLS enabled on all new tables
anon revoked
quotation has no inventory reservation trigger
unique conversion/document indexes present
credit/return tables preserve original evidence
```

- [ ] **Step 5: Apply migrations in order to the primary EmmyTech Supabase project**

Apply only repository-reviewed additive migration files, in timestamp order. Do not make unrelated schema/data changes.

- [ ] **Step 6: Run live schema sanity queries**

Confirm counts/objects without mutating production data:

```sql
select count(*) from public.sales_settings where settings_key = 'default';
select count(*) from public.sales_quotations;
select count(*) from public.sales_documents;
select count(*) from public.sales_credit_releases where status = 'active';
select count(*) from public.sales_unified_payments;
```

Expected: settings count exactly 1; other counts reflect real existing activity/projection and are not assumed to be zero except new Sales-only tables on first deploy.

- [ ] **Step 7: Run marked TEST transaction scenarios**

Use only `TEST ...` customer/order/quotation labels and transaction rollback where possible. Verify:

```text
Identity resolution creates/reuses one Identity
quotation publish creates V1 and no stock reservation
quotation V2 supersedes V1 without rewriting it
accepted quote converts once
pricing below margin blocked without Admin approval
Admin exception logs reason/approver
partial payment changes Cash Collected but not Sales Value definition
unified payment view shows Order and Repair payments once each
payment receipt metadata is idempotent
direct sale stock handover obeys payment/credit gate
```

- [ ] **Step 8: Clean TEST data and verify no stock/payment pollution**

Explicitly confirm no TEST quotation/order/receipt/credit records remain and any TEST inventory quantity/unit state is restored.

- [ ] **Step 9: Local UI smoke check**

Open:

```text
/modules/sales
/modules/operations
/modules/operations/orders
/modules/operations/repairs
```

Expected: Sales Overview renders; existing Operations pages remain functional.

- [ ] **Step 10: Compare branch with `main`**

Verify Sales changes exist only on `ambassador-development`; do not merge/promote.

- [ ] **Step 11: Phase 1 checkpoint**

Report evidence:

```text
commercial test count/pass/fail
build exit code
migration names applied
live TEST scenarios executed/cleaned
Sales route screenshot/local validation
known deferred work: Direct Sales UI, Quotation UI, LaTeX renderer/email, customer digital acceptance, credit/returns UI
```

Do not claim Phase 1 complete without fresh evidence from Steps 2–9.

---

## Plan Self-Review

### Spec coverage

This Phase 1 plan covers the spec's foundation requirements for:

- dedicated Sales route/shell;
- shared CRM Identity;
- shared Operations Orders;
- direct-sale/order commercial distinction;
- pricing snapshots;
- Gross Margin calculation;
- cost hierarchy;
- configurable margin policies;
- tiered Sales authority foundation;
- quotation/version/acceptance schema;
- quote conversion-once boundary;
- no quotation stock reservation;
- unified canonical Order/Repair payment projection;
- Sales Value/Cash Collected/Outstanding definitions;
- receipt/document metadata/idempotency foundation;
- Admin credit-release foundation;
- return/refund audit foundations;
- Overview read model;
- direct-sale payment/stock handover gate;
- RLS/security and live-safe verification.

Production PDF rendering/email, full Direct Sale UI, full Quotation UI, public digital quotation acceptance, Credit/Returns UI and advanced reports remain intentionally assigned to later approved phases in the spec.

### Type/interface consistency

- `SalesAuthorityLevel` is defined once in `src/lib/sales/domain.ts` and imported elsewhere.
- Sales-specific view types live in `src/lib/sales/types.ts`; existing Operations types are extended only for shared Order columns.
- `ops_orders` remains the transaction master.
- `sales_unified_payments` is a view over canonical ledgers, not a copied ledger.
- Quotation conversion always points to `ops_orders`.
- Direct-sale handover occurs after commercial confirmation and payment/credit gate, preserving stock semantics.

### Migration history rule

During execution, once a migration has been applied to shared Supabase, never edit that historical migration to change live behavior. Create the corrective timestamped migration named in the relevant task instead.
