-- EmmyTech Operations: sales-workbook aligned model
-- Additive only. Does not import historical spreadsheet data.

alter table public.ops_orders
  add column if not exists order_type text not null default 'other'
    check (order_type in ('laptop','phone','accessory','solar','other')),
  add column if not exists sales_staff_user_id uuid references public.users(id) on delete set null,
  add column if not exists sales_staff_name text,
  add column if not exists balance_due numeric not null default 0 check (balance_due >= 0);

update public.ops_orders
set balance_due = greatest(total_amount - amount_paid, 0)
where balance_due is distinct from greatest(total_amount - amount_paid, 0);

alter table public.ops_order_items
  add column if not exists item_type text not null default 'other'
    check (item_type in ('laptop','phone','accessory','solar','other')),
  add column if not exists brand text,
  add column if not exists model text,
  add column if not exists condition text,
  add column if not exists unit_cost_snapshot numeric check (unit_cost_snapshot is null or unit_cost_snapshot >= 0),
  add column if not exists warranty_period text,
  add column if not exists warranty_expires_at date,
  add column if not exists specs jsonb not null default '{}'::jsonb;

create table if not exists public.ops_suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  address text,
  notes text,
  is_active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ops_suppliers_name_uidx
  on public.ops_suppliers (lower(name));

create trigger ops_suppliers_touch_updated_at
before update on public.ops_suppliers
for each row execute function public.ops_touch_updated_at();

alter table public.ops_suppliers enable row level security;
drop policy if exists ops_suppliers_admin_all on public.ops_suppliers;
create policy ops_suppliers_admin_all on public.ops_suppliers
for all to authenticated using (public.ops_is_admin()) with check (public.ops_is_admin());
revoke all on public.ops_suppliers from anon;
grant select,insert,update,delete on public.ops_suppliers to authenticated;

alter table public.ops_inventory_items
  add column if not exists brand text,
  add column if not exists default_condition text,
  add column if not exists default_unit_cost numeric check (default_unit_cost is null or default_unit_cost >= 0),
  add column if not exists default_selling_price numeric check (default_selling_price is null or default_selling_price >= 0),
  add column if not exists preferred_supplier_id uuid references public.ops_suppliers(id) on delete set null;

create table if not exists public.ops_inventory_units (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references public.ops_inventory_items(id) on delete restrict,
  serial_number text,
  imei_1 text,
  imei_2 text,
  condition text,
  acquisition_date date,
  unit_cost numeric check (unit_cost is null or unit_cost >= 0),
  supplier_id uuid references public.ops_suppliers(id) on delete set null,
  current_location_id uuid references public.ops_locations(id) on delete set null,
  status text not null default 'available'
    check (status in ('available','reserved','in_transit','sold','repair','returned','faulty','retired')),
  reserved_order_id uuid references public.ops_orders(id) on delete set null,
  reserved_order_item_id uuid references public.ops_order_items(id) on delete set null,
  sold_order_id uuid references public.ops_orders(id) on delete set null,
  sold_order_item_id uuid references public.ops_order_items(id) on delete set null,
  note text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (serial_number is not null or imei_1 is not null or imei_2 is not null)
);

create unique index if not exists ops_inventory_units_serial_uidx
  on public.ops_inventory_units (lower(serial_number)) where serial_number is not null and btrim(serial_number) <> '';
create unique index if not exists ops_inventory_units_imei1_uidx
  on public.ops_inventory_units (imei_1) where imei_1 is not null and btrim(imei_1) <> '';
create unique index if not exists ops_inventory_units_imei2_uidx
  on public.ops_inventory_units (imei_2) where imei_2 is not null and btrim(imei_2) <> '';
create index if not exists ops_inventory_units_item_idx
  on public.ops_inventory_units(inventory_item_id,status,current_location_id);

create trigger ops_inventory_units_touch_updated_at
before update on public.ops_inventory_units
for each row execute function public.ops_touch_updated_at();

alter table public.ops_inventory_units enable row level security;
drop policy if exists ops_inventory_units_admin_all on public.ops_inventory_units;
create policy ops_inventory_units_admin_all on public.ops_inventory_units
for all to authenticated using (public.ops_is_admin()) with check (public.ops_is_admin());
revoke all on public.ops_inventory_units from anon;
grant select,insert,update,delete on public.ops_inventory_units to authenticated;

create table if not exists public.ops_order_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.ops_orders(id) on delete cascade,
  amount numeric not null check (amount > 0),
  payment_method text not null default 'other'
    check (payment_method in ('bank_transfer','pos','cash','split','other')),
  reference text,
  paid_at timestamptz not null default now(),
  note text,
  is_void boolean not null default false,
  voided_at timestamptz,
  voided_by uuid references public.users(id) on delete set null,
  recorded_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists ops_order_payments_order_idx on public.ops_order_payments(order_id,paid_at desc);

alter table public.ops_order_payments enable row level security;
drop policy if exists ops_order_payments_admin_all on public.ops_order_payments;
create policy ops_order_payments_admin_all on public.ops_order_payments
for all to authenticated using (public.ops_is_admin()) with check (public.ops_is_admin());
revoke all on public.ops_order_payments from anon;
grant select,insert,update,delete on public.ops_order_payments to authenticated;

create table if not exists public.ops_repairs (
  id uuid primary key default gen_random_uuid(),
  repair_code text not null unique default (
    'REP-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(md5(random()::text),1,6))
  ),
  identity_id uuid references public.identities(id) on delete set null,
  original_order_id uuid references public.ops_orders(id) on delete set null,
  inventory_unit_id uuid references public.ops_inventory_units(id) on delete set null,
  customer_name text,
  customer_phone text,
  received_at timestamptz not null default now(),
  completed_at timestamptz,
  collected_at timestamptz,
  device_type text,
  brand text,
  model text,
  serial_or_imei text,
  purchased_from_us text not null default 'not_sure'
    check (purchased_from_us in ('yes','no','not_sure')),
  fault_reported text not null,
  diagnosis text,
  repair_type text,
  parts_replaced text,
  parts_cost numeric not null default 0 check (parts_cost >= 0),
  labour_cost numeric not null default 0 check (labour_cost >= 0),
  amount_charged numeric not null default 0 check (amount_charged >= 0),
  repair_profit numeric generated always as (amount_charged - parts_cost - labour_cost) stored,
  status text not null default 'received'
    check (status in ('received','diagnosing','awaiting_parts','in_progress','ready_collection','collected','cancelled')),
  warranty_period text,
  warranty_expires_at date,
  condition_received text,
  condition_returned text,
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid','partial','paid','refunded')),
  amount_paid numeric not null default 0 check (amount_paid >= 0),
  balance_due numeric not null default 0 check (balance_due >= 0),
  technician_user_id uuid references public.users(id) on delete set null,
  technician_name text,
  notes text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ops_repairs_identity_idx on public.ops_repairs(identity_id,received_at desc);
create index if not exists ops_repairs_order_idx on public.ops_repairs(original_order_id,received_at desc);
create index if not exists ops_repairs_status_idx on public.ops_repairs(status,received_at desc);

create trigger ops_repairs_touch_updated_at
before update on public.ops_repairs
for each row execute function public.ops_touch_updated_at();

alter table public.ops_repairs enable row level security;
drop policy if exists ops_repairs_admin_all on public.ops_repairs;
create policy ops_repairs_admin_all on public.ops_repairs
for all to authenticated using (public.ops_is_admin()) with check (public.ops_is_admin());
revoke all on public.ops_repairs from anon;
grant select,insert,update,delete on public.ops_repairs to authenticated;

create table if not exists public.ops_solar_installations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.ops_orders(id) on delete cascade,
  order_item_id uuid not null references public.ops_order_items(id) on delete cascade,
  installation_required boolean not null default true,
  installation_address text,
  scheduled_at timestamptz,
  completed_at timestamptz,
  installer_user_id uuid references public.users(id) on delete set null,
  installer_name text,
  installation_cost numeric not null default 0 check (installation_cost >= 0),
  system_capacity text,
  status text not null default 'pending'
    check (status in ('not_required','pending','scheduled','in_progress','completed','cancelled')),
  notes text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(order_item_id)
);
create index if not exists ops_solar_installations_order_idx on public.ops_solar_installations(order_id,status);

create trigger ops_solar_installations_touch_updated_at
before update on public.ops_solar_installations
for each row execute function public.ops_touch_updated_at();

alter table public.ops_solar_installations enable row level security;
drop policy if exists ops_solar_installations_admin_all on public.ops_solar_installations;
create policy ops_solar_installations_admin_all on public.ops_solar_installations
for all to authenticated using (public.ops_is_admin()) with check (public.ops_is_admin());
revoke all on public.ops_solar_installations from anon;
grant select,insert,update,delete on public.ops_solar_installations to authenticated;

create or replace function public.ops_record_order_payment(
  p_order_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_reference text default null,
  p_paid_at timestamptz default now(),
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.ops_orders%rowtype;
  v_paid numeric := 0;
  v_balance numeric := 0;
  v_status text := 'unpaid';
  v_payment_id uuid;
begin
  if not public.ops_is_admin() then raise exception 'Not authorized'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Payment amount must be greater than zero'; end if;
  if p_payment_method not in ('bank_transfer','pos','cash','split','other') then raise exception 'Invalid payment method'; end if;

  select * into v_order from public.ops_orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.commercial_state = 'cancelled' then raise exception 'Cannot record payment on a cancelled order'; end if;

  insert into public.ops_order_payments(order_id,amount,payment_method,reference,paid_at,note,recorded_by)
  values(p_order_id,p_amount,p_payment_method,nullif(trim(p_reference),''),coalesce(p_paid_at,now()),nullif(trim(p_note),''),auth.uid())
  returning id into v_payment_id;

  select coalesce(sum(amount),0) into v_paid
  from public.ops_order_payments
  where order_id = p_order_id and is_void = false;

  v_balance := greatest(v_order.total_amount - v_paid,0);
  v_status := case
    when v_order.total_amount > 0 and v_paid >= v_order.total_amount then 'paid'
    when v_paid > 0 then 'partial'
    else 'unpaid'
  end;

  update public.ops_orders
  set amount_paid = v_paid,
      balance_due = v_balance,
      payment_status = v_status,
      commission_status = case
        when v_status = 'paid' and commission_status = 'pending' then 'earned'
        else commission_status
      end
  where id = p_order_id;

  insert into public.ops_order_events(order_id,event_type,title,actor_id,metadata)
  values(p_order_id,'payment_recorded','Payment recorded',auth.uid(),jsonb_build_object(
    'payment_id',v_payment_id,'amount',p_amount,'payment_method',p_payment_method,
    'amount_paid',v_paid,'balance_due',v_balance,'payment_status',v_status
  ));

  insert into public.ops_business_events(event_type,idempotency_key,order_id,identity_id,payload,created_by)
  values(
    case when v_status='paid' then 'payment.confirmed' else 'payment.recorded' end,
    'payment.recorded:'||v_payment_id::text,
    p_order_id,v_order.identity_id,
    jsonb_build_object('payment_id',v_payment_id,'amount',p_amount,'amount_paid',v_paid,'balance_due',v_balance,'payment_status',v_status),
    auth.uid()
  ) on conflict(idempotency_key) do nothing;

  if v_status='paid' and v_order.commission_status='pending' then
    insert into public.ops_business_events(event_type,idempotency_key,order_id,identity_id,payload,created_by)
    values('commission.earned','commission.earned:'||p_order_id::text,p_order_id,v_order.identity_id,
      jsonb_build_object('ambassador_id',v_order.ambassador_id,'amount',v_order.commission_amount,'rate',v_order.commission_rate),auth.uid())
    on conflict(idempotency_key) do nothing;
  end if;

  return jsonb_build_object(
    'payment_id',v_payment_id,
    'amount_paid',v_paid,
    'balance_due',v_balance,
    'payment_status',v_status,
    'commission_status',(select commission_status from public.ops_orders where id=p_order_id)
  );
end;
$$;

grant execute on function public.ops_record_order_payment(uuid,numeric,text,text,timestamptz,text) to authenticated;
