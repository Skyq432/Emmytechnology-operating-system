-- EmmyTech Sales financial/document foundation
-- Additive migration. Canonical Order/Repair payment ledgers remain unchanged.

create table if not exists public.sales_documents (
  id uuid primary key default gen_random_uuid(),
  document_number text not null unique,
  document_type text not null check (document_type in ('payment_receipt','final_sales_receipt','refund_document','quotation_pdf')),
  identity_id uuid references public.identities(id) on delete set null,
  order_id uuid references public.ops_orders(id) on delete set null,
  repair_id uuid references public.ops_repairs(id) on delete set null,
  quotation_version_id uuid references public.sales_quotation_versions(id) on delete set null,
  source_payment_type text check (source_payment_type is null or source_payment_type in ('order','repair','refund')),
  source_payment_id uuid,
  snapshot jsonb not null default '{}'::jsonb,
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

create unique index if not exists sales_documents_one_payment_receipt_idx
  on public.sales_documents(source_payment_type, source_payment_id)
  where document_type = 'payment_receipt' and voided_at is null;

create unique index if not exists sales_documents_one_final_sales_receipt_idx
  on public.sales_documents(order_id)
  where document_type = 'final_sales_receipt' and voided_at is null;

create index if not exists sales_documents_identity_idx on public.sales_documents(identity_id, issued_at desc);
create index if not exists sales_documents_order_idx on public.sales_documents(order_id, issued_at desc);
create index if not exists sales_documents_repair_idx on public.sales_documents(repair_id, issued_at desc);
create index if not exists sales_documents_render_idx on public.sales_documents(render_status, created_at desc);

create table if not exists public.sales_document_deliveries (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.sales_documents(id) on delete cascade,
  recipient_type text not null check (recipient_type in ('customer','company_archive')),
  recipient_email text,
  delivery_state text not null default 'pending'
    check (delivery_state in ('pending','sent','failed','customer_email_missing')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sales_document_deliveries_document_idx on public.sales_document_deliveries(document_id, created_at desc);
create index if not exists sales_document_deliveries_state_idx on public.sales_document_deliveries(delivery_state, created_at desc);

create table if not exists public.sales_credit_releases (
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists sales_credit_releases_one_active_order_idx
  on public.sales_credit_releases(order_id)
  where status = 'active';
create index if not exists sales_credit_releases_due_idx on public.sales_credit_releases(status, due_at);

create table if not exists public.sales_returns (
  id uuid primary key default gen_random_uuid(),
  return_code text not null unique default (
    'RET-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(md5(random()::text), 1, 6))
  ),
  order_id uuid not null references public.ops_orders(id) on delete restrict,
  identity_id uuid references public.identities(id) on delete set null,
  status text not null default 'requested' check (status in ('requested','approved','completed','rejected')),
  reason text not null check (length(trim(reason)) > 0),
  requested_by uuid references public.users(id) on delete set null,
  approved_by uuid references public.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sales_returns_order_idx on public.sales_returns(order_id, created_at desc);
create index if not exists sales_returns_status_idx on public.sales_returns(status, created_at desc);

create table if not exists public.sales_return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.sales_returns(id) on delete cascade,
  order_item_id uuid not null references public.ops_order_items(id) on delete restrict,
  inventory_unit_id uuid references public.ops_inventory_units(id) on delete set null,
  quantity integer not null default 1 check (quantity > 0),
  returned_condition text,
  disposition text not null default 'inspection'
    check (disposition in ('available','faulty','inspection','retired','other')),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists sales_return_items_return_idx on public.sales_return_items(return_id);
create index if not exists sales_return_items_order_item_idx on public.sales_return_items(order_item_id);

create table if not exists public.sales_refunds (
  id uuid primary key default gen_random_uuid(),
  refund_code text not null unique default (
    'RFD-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(md5(random()::text), 1, 6))
  ),
  return_id uuid not null references public.sales_returns(id) on delete restrict,
  order_id uuid not null references public.ops_orders(id) on delete restrict,
  amount numeric not null check (amount > 0),
  payment_method text not null check (payment_method in ('bank_transfer','pos','cash','split','other')),
  reference text,
  status text not null default 'recorded' check (status in ('recorded','void')),
  refunded_at timestamptz not null default now(),
  recorded_by uuid references public.users(id) on delete set null,
  voided_by uuid references public.users(id) on delete set null,
  voided_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists sales_refunds_order_idx on public.sales_refunds(order_id, refunded_at desc);
create index if not exists sales_refunds_return_idx on public.sales_refunds(return_id, refunded_at desc);

create trigger sales_document_deliveries_touch_updated_at
before update on public.sales_document_deliveries
for each row execute function public.ops_touch_updated_at();

create trigger sales_credit_releases_touch_updated_at
before update on public.sales_credit_releases
for each row execute function public.ops_touch_updated_at();

create trigger sales_returns_touch_updated_at
before update on public.sales_returns
for each row execute function public.ops_touch_updated_at();

alter table public.sales_documents enable row level security;
alter table public.sales_document_deliveries enable row level security;
alter table public.sales_credit_releases enable row level security;
alter table public.sales_returns enable row level security;
alter table public.sales_return_items enable row level security;
alter table public.sales_refunds enable row level security;

create policy sales_documents_admin_all on public.sales_documents
for all to authenticated using (public.ops_is_admin()) with check (public.ops_is_admin());
create policy sales_document_deliveries_admin_all on public.sales_document_deliveries
for all to authenticated using (public.ops_is_admin()) with check (public.ops_is_admin());
create policy sales_credit_releases_admin_all on public.sales_credit_releases
for all to authenticated using (public.ops_is_admin()) with check (public.ops_is_admin());
create policy sales_returns_admin_all on public.sales_returns
for all to authenticated using (public.ops_is_admin()) with check (public.ops_is_admin());
create policy sales_return_items_admin_all on public.sales_return_items
for all to authenticated using (public.ops_is_admin()) with check (public.ops_is_admin());
create policy sales_refunds_admin_all on public.sales_refunds
for all to authenticated using (public.ops_is_admin()) with check (public.ops_is_admin());

revoke all on public.sales_documents from anon;
revoke all on public.sales_document_deliveries from anon;
revoke all on public.sales_credit_releases from anon;
revoke all on public.sales_returns from anon;
revoke all on public.sales_return_items from anon;
revoke all on public.sales_refunds from anon;

grant select, insert, update on public.sales_documents to authenticated;
grant select, insert, update on public.sales_document_deliveries to authenticated;
grant select, insert, update on public.sales_credit_releases to authenticated;
grant select, insert, update on public.sales_returns to authenticated;
grant select, insert, update on public.sales_return_items to authenticated;
grant select, insert, update on public.sales_refunds to authenticated;

create or replace view public.sales_unified_payments
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

revoke all on public.sales_unified_payments from anon;
grant select on public.sales_unified_payments to authenticated;

create or replace view public.sales_commercial_balances
with (security_invoker = true)
as
with paid as (
  select order_id, coalesce(sum(amount) filter (where not is_void), 0)::numeric as cash_collected
  from public.ops_order_payments
  group by order_id
), item_profit as (
  select order_id, coalesce(sum(gross_profit), 0)::numeric as gross_profit
  from public.ops_order_items
  group by order_id
)
select
  o.id as order_id,
  o.order_code,
  o.identity_id,
  o.sales_channel,
  o.sales_staff_user_id,
  o.sales_staff_name,
  o.commercial_state,
  o.created_at,
  o.confirmed_at,
  case when o.commercial_state = 'confirmed' then coalesce(o.total_amount, 0) else 0 end::numeric as sales_value,
  coalesce(p.cash_collected, 0)::numeric as cash_collected,
  greatest(coalesce(o.total_amount, 0) - coalesce(p.cash_collected, 0), 0)::numeric as outstanding,
  coalesce(ip.gross_profit, 0)::numeric as gross_profit
from public.ops_orders o
left join paid p on p.order_id = o.id
left join item_profit ip on ip.order_id = o.id
where o.commercial_state <> 'cancelled';

revoke all on public.sales_commercial_balances from anon;
grant select on public.sales_commercial_balances to authenticated;
