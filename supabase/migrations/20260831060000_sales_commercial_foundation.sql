-- EmmyTech Sales Commercial Foundation
-- Additive only. Sales reuses public.identities, ops_orders, Operations inventory and canonical payment ledgers.

alter table public.ops_orders
  add column if not exists sales_channel text not null default 'order'
    check (sales_channel in ('order','direct_sale')),
  add column if not exists fulfilment_mode text not null default 'operations_fulfilment'
    check (fulfilment_mode in ('operations_fulfilment','immediate_collection')),
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

create table if not exists public.sales_authority_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  authority_level text not null check (authority_level in ('salesperson','manager','admin')),
  discount_limit_percent numeric not null default 0 check (discount_limit_percent >= 0 and discount_limit_percent <= 100),
  is_active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales_settings (
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

create table if not exists public.sales_margin_policies (
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

create unique index if not exists sales_margin_policies_active_category_unique
  on public.sales_margin_policies (lower(trim(category)))
  where is_active and policy_scope = 'category';
create unique index if not exists sales_margin_policies_active_product_unique
  on public.sales_margin_policies (inventory_item_id)
  where is_active and policy_scope = 'product';

create table if not exists public.sales_quotations (
  id uuid primary key default gen_random_uuid(),
  quotation_code text not null unique default ('QT-' || to_char(now(),'YYYYMMDD') || '-' || upper(substr(md5(random()::text),1,6))),
  identity_id uuid not null references public.identities(id) on delete restrict,
  customer_name text,
  customer_phone text,
  customer_email text,
  sales_staff_user_id uuid references public.users(id) on delete set null,
  sales_staff_name text,
  status text not null default 'draft' check (status in ('draft','published','accepted','declined','converted','cancelled')),
  current_version_id uuid,
  converted_order_id uuid references public.ops_orders(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales_quotation_versions (
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

alter table public.sales_quotations
  drop constraint if exists sales_quotations_current_version_fk;
alter table public.sales_quotations
  add constraint sales_quotations_current_version_fk
  foreign key (current_version_id) references public.sales_quotation_versions(id) on delete set null;

create table if not exists public.sales_quotation_items (
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

create table if not exists public.sales_discount_approvals (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.ops_orders(id) on delete cascade,
  quotation_version_id uuid references public.sales_quotation_versions(id) on delete cascade,
  order_item_id uuid references public.ops_order_items(id) on delete cascade,
  quotation_item_id uuid references public.sales_quotation_items(id) on delete cascade,
  list_price numeric not null check (list_price >= 0),
  requested_price numeric not null check (requested_price >= 0),
  cost_basis numeric not null check (cost_basis >= 0),
  discount_percent numeric not null default 0,
  resulting_gross_margin numeric not null,
  decision text not null check (decision in ('approved','rejected')),
  reason text not null check (length(trim(reason)) > 0),
  requested_by uuid references public.users(id) on delete set null,
  approved_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (order_id is not null or quotation_version_id is not null)
);

alter table public.ops_order_items
  drop constraint if exists ops_order_items_pricing_approval_fk;
alter table public.ops_order_items
  add constraint ops_order_items_pricing_approval_fk
  foreign key (pricing_approval_id) references public.sales_discount_approvals(id) on delete set null;

alter table public.sales_quotation_items
  drop constraint if exists sales_quotation_items_pricing_approval_fk;
alter table public.sales_quotation_items
  add constraint sales_quotation_items_pricing_approval_fk
  foreign key (pricing_approval_id) references public.sales_discount_approvals(id) on delete set null;

alter table public.ops_orders
  drop constraint if exists ops_orders_source_quotation_fk,
  drop constraint if exists ops_orders_source_quotation_version_fk;
alter table public.ops_orders
  add constraint ops_orders_source_quotation_fk
    foreign key (source_quotation_id) references public.sales_quotations(id) on delete set null,
  add constraint ops_orders_source_quotation_version_fk
    foreign key (source_quotation_version_id) references public.sales_quotation_versions(id) on delete set null;

create table if not exists public.sales_quotation_acceptances (
  id uuid primary key default gen_random_uuid(),
  quotation_version_id uuid not null unique references public.sales_quotation_versions(id) on delete cascade,
  identity_id uuid not null references public.identities(id) on delete restrict,
  decision text not null check (decision in ('accepted','declined')),
  acceptance_type text not null check (acceptance_type in ('digital','offline')),
  channel text not null check (channel in ('secure_link','whatsapp','phone','email','in_person','other')),
  note text,
  evidence_reference text,
  actor_user_id uuid references public.users(id) on delete set null,
  snapshot jsonb not null default '{}'::jsonb,
  decided_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.sales_quotation_deliveries (
  id uuid primary key default gen_random_uuid(),
  quotation_version_id uuid not null references public.sales_quotation_versions(id) on delete cascade,
  delivery_method text not null default 'email' check (delivery_method in ('email','manual')),
  recipient_email text,
  state text not null default 'pending' check (state in ('pending','sent','failed')),
  error_text text,
  sent_by uuid references public.users(id) on delete set null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.sales_events (
  id uuid primary key default gen_random_uuid(),
  identity_id uuid references public.identities(id) on delete set null,
  quotation_id uuid references public.sales_quotations(id) on delete cascade,
  quotation_version_id uuid references public.sales_quotation_versions(id) on delete cascade,
  order_id uuid references public.ops_orders(id) on delete cascade,
  event_type text not null,
  title text not null,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  actor_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists sales_quotations_identity_idx on public.sales_quotations(identity_id, updated_at desc);
create index if not exists sales_quotations_status_idx on public.sales_quotations(status, updated_at desc);
create index if not exists sales_quotation_versions_quote_idx on public.sales_quotation_versions(quotation_id, version desc);
create index if not exists sales_events_identity_idx on public.sales_events(identity_id, created_at desc);
create index if not exists sales_events_order_idx on public.sales_events(order_id, created_at desc);
create index if not exists ops_orders_sales_channel_idx on public.ops_orders(sales_channel, updated_at desc);

insert into public.sales_settings (settings_key, company_default_margin_percent)
values ('default', 0)
on conflict (settings_key) do nothing;

-- Reuse the Operations updated-at trigger.
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'sales_authority_profiles_touch_updated_at') then
    create trigger sales_authority_profiles_touch_updated_at before update on public.sales_authority_profiles
    for each row execute function public.ops_touch_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'sales_settings_touch_updated_at') then
    create trigger sales_settings_touch_updated_at before update on public.sales_settings
    for each row execute function public.ops_touch_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'sales_margin_policies_touch_updated_at') then
    create trigger sales_margin_policies_touch_updated_at before update on public.sales_margin_policies
    for each row execute function public.ops_touch_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'sales_quotations_touch_updated_at') then
    create trigger sales_quotations_touch_updated_at before update on public.sales_quotations
    for each row execute function public.ops_touch_updated_at();
  end if;
end $$;

alter table public.sales_authority_profiles enable row level security;
alter table public.sales_settings enable row level security;
alter table public.sales_margin_policies enable row level security;
alter table public.sales_quotations enable row level security;
alter table public.sales_quotation_versions enable row level security;
alter table public.sales_quotation_items enable row level security;
alter table public.sales_discount_approvals enable row level security;
alter table public.sales_quotation_acceptances enable row level security;
alter table public.sales_quotation_deliveries enable row level security;
alter table public.sales_events enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'sales_authority_profiles','sales_settings','sales_margin_policies','sales_quotations',
    'sales_quotation_versions','sales_quotation_items','sales_discount_approvals',
    'sales_quotation_acceptances','sales_quotation_deliveries','sales_events'
  ] loop
    execute format('drop policy if exists %I_admin_all on public.%I', t, t);
    execute format('create policy %I_admin_all on public.%I for all to authenticated using (public.ops_is_admin()) with check (public.ops_is_admin())', t, t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
