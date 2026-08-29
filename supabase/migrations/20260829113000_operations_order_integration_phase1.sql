-- EmmyTech Operations Order Integration - Phase 1
-- Additive/backward-compatible migration.

create sequence if not exists public.ops_inventory_sku_seq start with 1 increment by 1;

create or replace function public.ops_next_inventory_sku()
returns text
language sql
volatile
security definer
set search_path = public
as $$
  select 'ET-INV-' || lpad(nextval('public.ops_inventory_sku_seq')::text, 6, '0');
$$;

alter table public.ops_inventory_items
  alter column sku set default public.ops_next_inventory_sku();

insert into public.ops_locations (code, name, location_type)
values
  ('SANGO', 'Sango', 'store'),
  ('UI', 'UI', 'store'),
  ('TRANSIT', 'In Transit', 'transit')
on conflict (code) do update set
  name = excluded.name,
  location_type = excluded.location_type,
  is_active = true;

alter table public.ops_orders
  add column if not exists identity_id uuid references public.identities(id) on delete set null,
  add column if not exists lead_id uuid references public.leads(id) on delete set null,
  add column if not exists ambassador_id uuid references public.ambassadors(id) on delete set null,
  add column if not exists conversion_id uuid references public.conversions(id) on delete set null,
  add column if not exists commercial_state text not null default 'draft'
    check (commercial_state in ('draft','confirmed','cancelled')),
  add column if not exists acquisition_source text,
  add column if not exists attribution_note text,
  add column if not exists subtotal numeric not null default 0 check (subtotal >= 0),
  add column if not exists discount_type text,
  add column if not exists discount_amount numeric not null default 0 check (discount_amount >= 0),
  add column if not exists discount_percentage numeric not null default 0 check (discount_percentage >= 0),
  add column if not exists discount_reason text,
  add column if not exists discount_approved_by uuid references public.users(id) on delete set null,
  add column if not exists cash_off_amount numeric not null default 0 check (cash_off_amount >= 0),
  add column if not exists delivery_charge numeric not null default 0 check (delivery_charge >= 0),
  add column if not exists total_amount numeric not null default 0 check (total_amount >= 0),
  add column if not exists amount_paid numeric not null default 0 check (amount_paid >= 0),
  add column if not exists payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid','partial','paid','refund_pending','refunded')),
  add column if not exists commission_rate numeric not null default 0 check (commission_rate >= 0),
  add column if not exists commission_amount numeric not null default 0 check (commission_amount >= 0),
  add column if not exists commission_status text not null default 'none'
    check (commission_status in ('none','pending','earned','paid','cancelled')),
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmed_by uuid references public.users(id) on delete set null;

create index if not exists ops_orders_identity_idx on public.ops_orders(identity_id, created_at desc);
create index if not exists ops_orders_lead_idx on public.ops_orders(lead_id, created_at desc);
create index if not exists ops_orders_ambassador_idx on public.ops_orders(ambassador_id, created_at desc);
create index if not exists ops_orders_commercial_state_idx on public.ops_orders(commercial_state, updated_at desc);

alter table public.ops_order_items
  add column if not exists list_price numeric check (list_price is null or list_price >= 0),
  add column if not exists line_discount_amount numeric not null default 0 check (line_discount_amount >= 0),
  add column if not exists line_total numeric not null default 0 check (line_total >= 0),
  add column if not exists fulfilment_source text not null default 'internal'
    check (fulfilment_source in ('internal','supplier','dropship','manual')),
  add column if not exists source_location_id uuid references public.ops_locations(id) on delete set null;

create table if not exists public.ops_inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.ops_orders(id) on delete cascade,
  order_item_id uuid not null references public.ops_order_items(id) on delete cascade,
  inventory_item_id uuid not null references public.ops_inventory_items(id) on delete restrict,
  location_id uuid not null references public.ops_locations(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  status text not null default 'active' check (status in ('active','released','fulfilled','cancelled')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  released_at timestamptz,
  fulfilled_at timestamptz,
  note text
);

create index if not exists ops_inventory_reservations_item_location_idx
  on public.ops_inventory_reservations(inventory_item_id, location_id, status);
create index if not exists ops_inventory_reservations_order_idx
  on public.ops_inventory_reservations(order_id, status);
create unique index if not exists ops_inventory_reservations_active_line_location_uidx
  on public.ops_inventory_reservations(order_item_id, location_id)
  where status = 'active';

alter table public.ops_inventory_reservations enable row level security;
drop policy if exists ops_inventory_reservations_admin_all on public.ops_inventory_reservations;
create policy ops_inventory_reservations_admin_all on public.ops_inventory_reservations
for all to authenticated using (public.ops_is_admin()) with check (public.ops_is_admin());
revoke all on public.ops_inventory_reservations from anon;
grant select, insert, update, delete on public.ops_inventory_reservations to authenticated;

create table if not exists public.ops_business_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  idempotency_key text not null unique,
  order_id uuid references public.ops_orders(id) on delete cascade,
  identity_id uuid references public.identities(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'published' check (status in ('published','processed','failed')),
  processed_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists ops_business_events_order_idx on public.ops_business_events(order_id, created_at desc);
create index if not exists ops_business_events_identity_idx on public.ops_business_events(identity_id, created_at desc);
alter table public.ops_business_events enable row level security;
drop policy if exists ops_business_events_admin_select on public.ops_business_events;
create policy ops_business_events_admin_select on public.ops_business_events
for select to authenticated using (public.ops_is_admin());
revoke all on public.ops_business_events from anon;
grant select on public.ops_business_events to authenticated;

create or replace view public.ops_inventory_availability
with (security_invoker = true)
as
with stock as (
  select inventory_item_id, location_id, sum(quantity_delta)::bigint as on_hand
  from public.ops_stock_movements
  group by inventory_item_id, location_id
), reserved as (
  select inventory_item_id, location_id, sum(quantity)::bigint as reserved
  from public.ops_inventory_reservations
  where status = 'active'
  group by inventory_item_id, location_id
)
select
  i.id as inventory_item_id,
  i.sku,
  i.name,
  i.reorder_level,
  l.id as location_id,
  l.code as location_code,
  l.name as location_name,
  coalesce(s.on_hand, 0)::bigint as on_hand,
  coalesce(r.reserved, 0)::bigint as reserved,
  greatest(coalesce(s.on_hand, 0) - coalesce(r.reserved, 0), 0)::bigint as available
from public.ops_inventory_items i
cross join public.ops_locations l
left join stock s on s.inventory_item_id = i.id and s.location_id = l.id
left join reserved r on r.inventory_item_id = i.id and r.location_id = l.id
where l.is_active = true;

revoke all on public.ops_inventory_availability from anon;
grant select on public.ops_inventory_availability to authenticated;

create or replace function public.ops_crm_stage_from_slug(p_stage text)
returns integer
language sql
immutable
as $$
  select case lower(coalesce(p_stage, ''))
    when 'awareness' then 1
    when 'new_lead' then 1
    when 'interest' then 2
    when 'consideration' then 3
    when 'intent' then 4
    when 'purchase' then 5
    when 'onboarding' then 6
    when 'satisfaction' then 7
    when 'loyalty' then 8
    when 'expansion' then 9
    when 'advocacy' then 10
    else 0
  end;
$$;

create or replace function public.ops_current_crm_stage(p_identity_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_manual integer := 0;
  v_lead integer := 0;
  v_conversion integer := 0;
begin
  if p_identity_id is null then return 0; end if;

  select coalesce(max(case when value ~ '^[0-9]+$' then value::integer else 0 end), 0)
  into v_manual
  from public.crm_manual_updates
  where identity_id = p_identity_id
    and lower(update_type) = 'funnel_stage';

  select coalesce(max(public.ops_crm_stage_from_slug(funnel_stage)), 0)
  into v_lead
  from public.leads
  where identity_id = p_identity_id;

  select coalesce(max(case when c.approved_at is not null then
    case when coalesce(c.is_repeat_conversion, false) then 8 else 6 end
  else 0 end), 0)
  into v_conversion
  from public.conversions c
  join public.leads l on l.id = c.lead_id
  where l.identity_id = p_identity_id;

  return greatest(v_manual, v_lead, v_conversion);
end;
$$;

create or replace function public.ops_create_draft_order(
  p_source_type text,
  p_source_reference text,
  p_reference_label text,
  p_identity_id uuid,
  p_lead_id uuid,
  p_ambassador_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_priority text,
  p_current_team text,
  p_due_at timestamptz,
  p_discount_type text,
  p_discount_amount numeric,
  p_discount_percentage numeric,
  p_discount_reason text,
  p_cash_off_amount numeric,
  p_delivery_charge numeric,
  p_commission_rate numeric,
  p_acquisition_source text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_item jsonb;
  v_subtotal numeric := 0;
  v_total numeric := 0;
  v_qty integer;
  v_unit numeric;
  v_line_discount numeric;
  v_line_total numeric;
begin
  if not public.ops_is_admin() then raise exception 'Not authorized'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one order item is required';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := coalesce((v_item->>'quantity')::integer, 0);
    v_unit := greatest(coalesce(nullif(v_item->>'unit_price','')::numeric, 0), 0);
    v_line_discount := greatest(coalesce(nullif(v_item->>'line_discount_amount','')::numeric, 0), 0);
    if v_qty <= 0 then raise exception 'Order item quantity must be greater than zero'; end if;
    if nullif(trim(v_item->>'item_name'), '') is null then raise exception 'Order item name is required'; end if;
    v_line_total := greatest((v_qty * v_unit) - v_line_discount, 0);
    v_subtotal := v_subtotal + v_line_total;
  end loop;

  v_total := greatest(
    v_subtotal - greatest(coalesce(p_discount_amount,0),0) - greatest(coalesce(p_cash_off_amount,0),0) + greatest(coalesce(p_delivery_charge,0),0),
    0
  );

  insert into public.ops_orders (
    source_type, source_reference, reference_label,
    identity_id, lead_id, ambassador_id,
    customer_name, customer_phone, customer_email,
    priority, current_team, due_at,
    commercial_state, acquisition_source,
    subtotal, discount_type, discount_amount, discount_percentage, discount_reason,
    cash_off_amount, delivery_charge, total_amount, amount_paid, payment_status,
    commission_rate, commission_amount, commission_status,
    created_by
  ) values (
    p_source_type, nullif(trim(p_source_reference), ''), nullif(trim(p_reference_label), ''),
    p_identity_id, p_lead_id, p_ambassador_id,
    nullif(trim(p_customer_name), ''), nullif(trim(p_customer_phone), ''), nullif(trim(p_customer_email), ''),
    p_priority, nullif(trim(p_current_team), ''), p_due_at,
    'draft', nullif(trim(p_acquisition_source), ''),
    v_subtotal, nullif(trim(p_discount_type), ''), greatest(coalesce(p_discount_amount,0),0), greatest(coalesce(p_discount_percentage,0),0), nullif(trim(p_discount_reason), ''),
    greatest(coalesce(p_cash_off_amount,0),0), greatest(coalesce(p_delivery_charge,0),0), v_total, 0, 'unpaid',
    greatest(coalesce(p_commission_rate,0),0), 0, 'none',
    auth.uid()
  ) returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::integer;
    v_unit := greatest(coalesce(nullif(v_item->>'unit_price','')::numeric, 0), 0);
    v_line_discount := greatest(coalesce(nullif(v_item->>'line_discount_amount','')::numeric, 0), 0);
    v_line_total := greatest((v_qty * v_unit) - v_line_discount, 0);

    insert into public.ops_order_items (
      order_id, inventory_item_id, website_product_id, item_name, quantity,
      unit_price, list_price, line_discount_amount, line_total,
      fulfilment_source, source_location_id, note
    ) values (
      v_order_id,
      nullif(v_item->>'inventory_item_id', '')::uuid,
      nullif(v_item->>'website_product_id', '')::uuid,
      trim(v_item->>'item_name'),
      v_qty,
      v_unit,
      coalesce(nullif(v_item->>'list_price','')::numeric, v_unit),
      v_line_discount,
      v_line_total,
      coalesce(nullif(v_item->>'fulfilment_source',''), 'internal'),
      nullif(v_item->>'source_location_id', '')::uuid,
      nullif(trim(v_item->>'note'), '')
    );
  end loop;

  insert into public.ops_order_events (order_id,event_type,title,to_status,actor_id,metadata)
  values (v_order_id,'order_created','Draft order created','new',auth.uid(),jsonb_build_object('commercial_state','draft'));

  insert into public.ops_business_events (event_type,idempotency_key,order_id,identity_id,payload,created_by)
  values ('order.created','order.created:'||v_order_id::text,v_order_id,p_identity_id,jsonb_build_object('commercial_state','draft','total_amount',v_total),auth.uid())
  on conflict (idempotency_key) do nothing;

  return v_order_id;
end;
$$;

create or replace function public.ops_confirm_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.ops_orders%rowtype;
  v_item public.ops_order_items%rowtype;
  v_available bigint;
  v_stage integer := 0;
  v_commission numeric := 0;
  v_lead_id uuid;
  v_reserved integer := 0;
begin
  if not public.ops_is_admin() then raise exception 'Not authorized'; end if;

  select * into v_order from public.ops_orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.commercial_state <> 'draft' then raise exception 'Only draft orders can be confirmed'; end if;
  if v_order.total_amount < 0 then raise exception 'Order total is invalid'; end if;

  for v_item in select * from public.ops_order_items where order_id = p_order_id order by created_at
  loop
    if v_item.inventory_item_id is not null and v_item.source_location_id is not null and v_item.fulfilment_source = 'internal' then
      select available into v_available
      from public.ops_inventory_availability
      where inventory_item_id = v_item.inventory_item_id
        and location_id = v_item.source_location_id;

      v_available := coalesce(v_available,0);
      if v_available < v_item.quantity then
        raise exception 'Insufficient available stock for item %: need %, available %', v_item.item_name, v_item.quantity, v_available;
      end if;

      insert into public.ops_inventory_reservations (
        order_id, order_item_id, inventory_item_id, location_id, quantity, created_by
      ) values (
        p_order_id, v_item.id, v_item.inventory_item_id, v_item.source_location_id, v_item.quantity, auth.uid()
      );

      update public.ops_order_items set quantity_reserved = v_item.quantity where id = v_item.id;
      v_reserved := v_reserved + v_item.quantity;
    end if;
  end loop;

  if v_order.ambassador_id is not null and v_order.commission_rate > 0 then
    v_commission := round((v_order.total_amount * v_order.commission_rate / 100.0)::numeric, 2);
  end if;

  update public.ops_orders
  set commercial_state = 'confirmed',
      confirmed_at = now(),
      confirmed_by = auth.uid(),
      commission_amount = v_commission,
      commission_status = case when v_commission > 0 then 'pending' else 'none' end
  where id = p_order_id;

  if v_order.identity_id is not null then
    v_stage := public.ops_current_crm_stage(v_order.identity_id);
    if v_stage < 5 then
      insert into public.crm_manual_updates (identity_id,update_type,value,note,updated_by)
      values (v_order.identity_id,'funnel_stage','5','Moved to Purchase because order '||v_order.order_code||' was confirmed','Operations');

      insert into public.crm_stage_history (identity_id,from_stage,to_stage,tracking_type,changed_by)
      values (v_order.identity_id,nullif(v_stage,0),5,'Automatic','Operations');

      select id into v_lead_id from public.leads
      where identity_id = v_order.identity_id
      order by updated_at desc nulls last, created_at desc
      limit 1;

      if v_lead_id is not null then
        update public.leads set funnel_stage='purchase', updated_at=now() where id=v_lead_id;
      end if;
      v_stage := 5;
    end if;

    insert into public.identity_events (identity_id,event_type,title,description,metadata)
    values (
      v_order.identity_id,
      'operations_order_confirmed',
      'Order confirmed',
      'Operations order '||v_order.order_code||' was confirmed',
      jsonb_build_object('order_id',p_order_id,'order_code',v_order.order_code,'total_amount',v_order.total_amount)
    );
  end if;

  insert into public.ops_order_events (order_id,event_type,title,actor_id,metadata)
  values (
    p_order_id,'order_confirmed','Order confirmed',auth.uid(),
    jsonb_build_object('reserved_quantity',v_reserved,'commission_amount',v_commission,'crm_stage',v_stage)
  );

  insert into public.ops_business_events (event_type,idempotency_key,order_id,identity_id,payload,created_by)
  values (
    'order.confirmed','order.confirmed:'||p_order_id::text,p_order_id,v_order.identity_id,
    jsonb_build_object('total_amount',v_order.total_amount,'reserved_quantity',v_reserved,'ambassador_id',v_order.ambassador_id,'commission_amount',v_commission,'crm_stage',v_stage),
    auth.uid()
  ) on conflict (idempotency_key) do nothing;

  if v_reserved > 0 then
    insert into public.ops_business_events (event_type,idempotency_key,order_id,identity_id,payload,created_by)
    values ('order.stock_reserved','order.stock_reserved:'||p_order_id::text,p_order_id,v_order.identity_id,jsonb_build_object('quantity',v_reserved),auth.uid())
    on conflict (idempotency_key) do nothing;
  end if;

  if v_commission > 0 then
    insert into public.ops_business_events (event_type,idempotency_key,order_id,identity_id,payload,created_by)
    values ('commission.pending','commission.pending:'||p_order_id::text,p_order_id,v_order.identity_id,jsonb_build_object('ambassador_id',v_order.ambassador_id,'rate',v_order.commission_rate,'amount',v_commission),auth.uid())
    on conflict (idempotency_key) do nothing;
  end if;

  return jsonb_build_object(
    'order_id',p_order_id,
    'commercial_state','confirmed',
    'reserved_quantity',v_reserved,
    'commission_amount',v_commission,
    'commission_status',case when v_commission > 0 then 'pending' else 'none' end,
    'crm_stage',v_stage
  );
end;
$$;

grant execute on function public.ops_next_inventory_sku() to authenticated;
grant execute on function public.ops_create_draft_order(text,text,text,uuid,uuid,uuid,text,text,text,text,text,timestamptz,text,numeric,numeric,text,numeric,numeric,numeric,text,jsonb) to authenticated;
grant execute on function public.ops_confirm_order(uuid) to authenticated;
