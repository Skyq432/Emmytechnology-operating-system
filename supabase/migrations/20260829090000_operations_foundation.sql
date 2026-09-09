-- EmmyTech Operations Foundation
-- Additive migration: creates only new ops_* objects.

create or replace function public.ops_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    where id = auth.uid()
      and role = 'admin'
  );
$$;

create table public.ops_locations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  location_type text not null default 'warehouse'
    check (location_type in ('warehouse','store','repair','returns','damaged','transit','other')),
  is_active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ops_inventory_items (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  description text,
  category text,
  unit text not null default 'item',
  serial_tracking boolean not null default false,
  reorder_level integer not null default 0 check (reorder_level >= 0),
  is_active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ops_stock_movements (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references public.ops_inventory_items(id) on delete restrict,
  location_id uuid references public.ops_locations(id) on delete restrict,
  movement_type text not null check (
    movement_type in (
      'opening','received','adjustment_in','adjustment_out','sold','transfer_in','transfer_out',
      'repair_use','return_in','damaged','lost','other_in','other_out'
    )
  ),
  quantity_delta integer not null check (quantity_delta <> 0),
  reference_type text,
  reference_id uuid,
  note text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.ops_website_product_links (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references public.ops_inventory_items(id) on delete cascade,
  website_product_id uuid not null references public.products(id) on delete cascade,
  relationship_type text not null default 'stocked'
    check (relationship_type in ('stocked','preorder','on_demand','dropship','service','display_only')),
  website_allocation integer check (website_allocation is null or website_allocation >= 0),
  stock_sync_enabled boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (inventory_item_id, website_product_id)
);

create table public.ops_orders (
  id uuid primary key default gen_random_uuid(),
  order_code text not null unique default (
    'OPS-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(md5(random()::text), 1, 6))
  ),
  source_type text not null default 'manual'
    check (source_type in ('manual','crm','website','whatsapp','internal','other')),
  source_reference text,
  reference_label text,
  customer_name text,
  customer_phone text,
  customer_email text,
  status text not null default 'new'
    check (status in ('new','confirmed','stock_check','assigned','picking','packing','ready_dispatch','dispatched','delivered','completed','on_hold','cancelled')),
  priority text not null default 'normal'
    check (priority in ('low','normal','high','urgent')),
  current_team text,
  current_owner_id uuid references public.users(id) on delete set null,
  due_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ops_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.ops_orders(id) on delete cascade,
  inventory_item_id uuid references public.ops_inventory_items(id) on delete set null,
  website_product_id uuid references public.products(id) on delete set null,
  item_name text not null,
  quantity integer not null default 1 check (quantity > 0),
  quantity_reserved integer not null default 0 check (quantity_reserved >= 0 and quantity_reserved <= quantity),
  unit_price numeric,
  note text,
  created_at timestamptz not null default now()
);

create table public.ops_order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.ops_orders(id) on delete cascade,
  event_type text not null,
  title text not null,
  note text,
  from_status text,
  to_status text,
  actor_id uuid references public.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.ops_order_handoffs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.ops_orders(id) on delete cascade,
  from_team text,
  from_user_id uuid references public.users(id) on delete set null,
  to_team text not null,
  to_user_id uuid references public.users(id) on delete set null,
  note text,
  status text not null default 'pending' check (status in ('pending','acknowledged','cancelled')),
  acknowledged_by uuid references public.users(id) on delete set null,
  acknowledged_at timestamptz,
  acknowledgement_note text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ops_stock_movements_item_idx on public.ops_stock_movements(inventory_item_id, created_at desc);
create index ops_stock_movements_location_idx on public.ops_stock_movements(location_id, created_at desc);
create index ops_orders_status_idx on public.ops_orders(status, updated_at desc);
create index ops_orders_owner_idx on public.ops_orders(current_owner_id, updated_at desc);
create index ops_order_items_order_idx on public.ops_order_items(order_id);
create index ops_order_events_order_idx on public.ops_order_events(order_id, created_at desc);
create index ops_order_handoffs_order_idx on public.ops_order_handoffs(order_id, created_at desc);

create view public.ops_stock_balances
with (security_invoker = true)
as
select
  i.id as inventory_item_id,
  i.sku,
  i.name,
  i.reorder_level,
  m.location_id,
  coalesce(sum(m.quantity_delta), 0)::bigint as on_hand
from public.ops_inventory_items i
left join public.ops_stock_movements m on m.inventory_item_id = i.id
group by i.id, i.sku, i.name, i.reorder_level, m.location_id;

create or replace function public.ops_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger ops_locations_touch_updated_at
before update on public.ops_locations
for each row execute function public.ops_touch_updated_at();

create trigger ops_inventory_items_touch_updated_at
before update on public.ops_inventory_items
for each row execute function public.ops_touch_updated_at();

create trigger ops_website_product_links_touch_updated_at
before update on public.ops_website_product_links
for each row execute function public.ops_touch_updated_at();

create trigger ops_orders_touch_updated_at
before update on public.ops_orders
for each row execute function public.ops_touch_updated_at();

create trigger ops_order_handoffs_touch_updated_at
before update on public.ops_order_handoffs
for each row execute function public.ops_touch_updated_at();

alter table public.ops_locations enable row level security;
alter table public.ops_inventory_items enable row level security;
alter table public.ops_stock_movements enable row level security;
alter table public.ops_website_product_links enable row level security;
alter table public.ops_orders enable row level security;
alter table public.ops_order_items enable row level security;
alter table public.ops_order_events enable row level security;
alter table public.ops_order_handoffs enable row level security;

create policy ops_locations_admin_all on public.ops_locations
for all to authenticated using (public.ops_is_admin()) with check (public.ops_is_admin());
create policy ops_inventory_items_admin_all on public.ops_inventory_items
for all to authenticated using (public.ops_is_admin()) with check (public.ops_is_admin());
create policy ops_website_product_links_admin_all on public.ops_website_product_links
for all to authenticated using (public.ops_is_admin()) with check (public.ops_is_admin());
create policy ops_orders_admin_all on public.ops_orders
for all to authenticated using (public.ops_is_admin()) with check (public.ops_is_admin());
create policy ops_order_items_admin_all on public.ops_order_items
for all to authenticated using (public.ops_is_admin()) with check (public.ops_is_admin());
create policy ops_order_handoffs_admin_select on public.ops_order_handoffs
for select to authenticated using (public.ops_is_admin());
create policy ops_stock_movements_admin_select on public.ops_stock_movements
for select to authenticated using (public.ops_is_admin());
create policy ops_order_events_admin_select on public.ops_order_events
for select to authenticated using (public.ops_is_admin());

revoke all on public.ops_locations from anon;
revoke all on public.ops_inventory_items from anon;
revoke all on public.ops_stock_movements from anon;
revoke all on public.ops_website_product_links from anon;
revoke all on public.ops_orders from anon;
revoke all on public.ops_order_items from anon;
revoke all on public.ops_order_events from anon;
revoke all on public.ops_order_handoffs from anon;
revoke all on public.ops_stock_balances from anon;

grant select, insert, update, delete on public.ops_locations to authenticated;
grant select, insert, update, delete on public.ops_inventory_items to authenticated;
grant select on public.ops_stock_movements to authenticated;
grant select, insert, update, delete on public.ops_website_product_links to authenticated;
grant select, insert, update, delete on public.ops_orders to authenticated;
grant select, insert, update, delete on public.ops_order_items to authenticated;
grant select on public.ops_order_events to authenticated;
grant select on public.ops_order_handoffs to authenticated;
grant select on public.ops_stock_balances to authenticated;

create or replace function public.ops_create_stock_movement(
  p_inventory_item_id uuid,
  p_location_id uuid,
  p_movement_type text,
  p_quantity_delta integer,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.ops_is_admin() then
    raise exception 'Not authorized';
  end if;
  if p_quantity_delta = 0 then
    raise exception 'Quantity delta cannot be zero';
  end if;

  insert into public.ops_stock_movements (
    inventory_item_id, location_id, movement_type, quantity_delta,
    reference_type, reference_id, note, created_by
  ) values (
    p_inventory_item_id, p_location_id, p_movement_type, p_quantity_delta,
    p_reference_type, p_reference_id, p_note, auth.uid()
  ) returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.ops_create_order(
  p_source_type text,
  p_source_reference text,
  p_reference_label text,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_priority text,
  p_current_team text,
  p_due_at timestamptz,
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
begin
  if not public.ops_is_admin() then
    raise exception 'Not authorized';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one order item is required';
  end if;

  insert into public.ops_orders (
    source_type, source_reference, reference_label,
    customer_name, customer_phone, customer_email,
    priority, current_team, due_at, created_by
  ) values (
    p_source_type, nullif(trim(p_source_reference), ''), nullif(trim(p_reference_label), ''),
    nullif(trim(p_customer_name), ''), nullif(trim(p_customer_phone), ''), nullif(trim(p_customer_email), ''),
    p_priority, nullif(trim(p_current_team), ''), p_due_at, auth.uid()
  ) returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    if coalesce((v_item->>'quantity')::integer, 0) <= 0 then
      raise exception 'Order item quantity must be greater than zero';
    end if;
    if nullif(trim(v_item->>'item_name'), '') is null then
      raise exception 'Order item name is required';
    end if;

    insert into public.ops_order_items (
      order_id,
      inventory_item_id,
      website_product_id,
      item_name,
      quantity,
      unit_price,
      note
    ) values (
      v_order_id,
      nullif(v_item->>'inventory_item_id', '')::uuid,
      nullif(v_item->>'website_product_id', '')::uuid,
      trim(v_item->>'item_name'),
      (v_item->>'quantity')::integer,
      nullif(v_item->>'unit_price', '')::numeric,
      nullif(trim(v_item->>'note'), '')
    );
  end loop;

  insert into public.ops_order_events (
    order_id, event_type, title, to_status, actor_id, metadata
  ) values (
    v_order_id, 'order_created', 'Order created', 'new', auth.uid(),
    jsonb_build_object('source_type', p_source_type)
  );

  return v_order_id;
end;
$$;

create or replace function public.ops_change_order_status(
  p_order_id uuid,
  p_new_status text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current text;
  v_sequence text[] := array['new','confirmed','stock_check','assigned','picking','packing','ready_dispatch','dispatched','delivered','completed'];
  v_current_pos integer;
  v_next_pos integer;
  v_valid boolean := false;
begin
  if not public.ops_is_admin() then
    raise exception 'Not authorized';
  end if;

  select status into v_current
  from public.ops_orders
  where id = p_order_id
  for update;

  if v_current is null then
    raise exception 'Order not found';
  end if;
  if v_current = p_new_status then
    raise exception 'Order is already in that status';
  end if;
  if v_current in ('completed','cancelled') then
    raise exception 'Terminal orders cannot change status';
  end if;

  if v_current = 'on_hold' then
    v_valid := p_new_status = 'cancelled' or (p_new_status = any(v_sequence) and p_new_status <> 'completed');
  elsif p_new_status in ('on_hold','cancelled') then
    v_valid := true;
  else
    v_current_pos := array_position(v_sequence, v_current);
    v_next_pos := array_position(v_sequence, p_new_status);
    v_valid := v_current_pos is not null and v_next_pos = v_current_pos + 1;
  end if;

  if not v_valid then
    raise exception 'Invalid order status transition from % to %', v_current, p_new_status;
  end if;

  update public.ops_orders
  set status = p_new_status
  where id = p_order_id;

  insert into public.ops_order_events (
    order_id, event_type, title, note, from_status, to_status, actor_id
  ) values (
    p_order_id, 'status_changed', 'Status changed', nullif(trim(p_note), ''),
    v_current, p_new_status, auth.uid()
  );
end;
$$;

create or replace function public.ops_create_handover(
  p_order_id uuid,
  p_to_team text,
  p_to_user_id uuid default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from_team text;
  v_from_user uuid;
  v_handover_id uuid;
begin
  if not public.ops_is_admin() then
    raise exception 'Not authorized';
  end if;
  if nullif(trim(p_to_team), '') is null then
    raise exception 'Destination team is required';
  end if;

  select current_team, current_owner_id
  into v_from_team, v_from_user
  from public.ops_orders
  where id = p_order_id;

  if not found then
    raise exception 'Order not found';
  end if;

  insert into public.ops_order_handoffs (
    order_id, from_team, from_user_id, to_team, to_user_id, note, created_by
  ) values (
    p_order_id, v_from_team, v_from_user, trim(p_to_team), p_to_user_id,
    nullif(trim(p_note), ''), auth.uid()
  ) returning id into v_handover_id;

  insert into public.ops_order_events (
    order_id, event_type, title, note, actor_id, metadata
  ) values (
    p_order_id, 'handover_created', 'Handover requested', nullif(trim(p_note), ''), auth.uid(),
    jsonb_build_object('handover_id', v_handover_id, 'from_team', v_from_team, 'to_team', trim(p_to_team))
  );

  return v_handover_id;
end;
$$;

create or replace function public.ops_acknowledge_handover(
  p_handover_id uuid,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_handover public.ops_order_handoffs%rowtype;
begin
  if not public.ops_is_admin() then
    raise exception 'Not authorized';
  end if;

  select * into v_handover
  from public.ops_order_handoffs
  where id = p_handover_id
  for update;

  if not found then
    raise exception 'Handover not found';
  end if;
  if v_handover.status <> 'pending' then
    raise exception 'Only pending handovers can be acknowledged';
  end if;

  update public.ops_order_handoffs
  set status = 'acknowledged',
      acknowledged_by = auth.uid(),
      acknowledged_at = now(),
      acknowledgement_note = nullif(trim(p_note), '')
  where id = p_handover_id;

  update public.ops_orders
  set current_team = v_handover.to_team,
      current_owner_id = v_handover.to_user_id
  where id = v_handover.order_id;

  insert into public.ops_order_events (
    order_id, event_type, title, note, actor_id, metadata
  ) values (
    v_handover.order_id, 'handover_acknowledged', 'Handover acknowledged',
    nullif(trim(p_note), ''), auth.uid(),
    jsonb_build_object('handover_id', p_handover_id, 'to_team', v_handover.to_team, 'to_user_id', v_handover.to_user_id)
  );
end;
$$;

revoke all on function public.ops_is_admin() from public;
revoke all on function public.ops_create_stock_movement(uuid, uuid, text, integer, text, uuid, text) from public;
revoke all on function public.ops_create_order(text, text, text, text, text, text, text, text, timestamptz, jsonb) from public;
revoke all on function public.ops_change_order_status(uuid, text, text) from public;
revoke all on function public.ops_create_handover(uuid, text, uuid, text) from public;
revoke all on function public.ops_acknowledge_handover(uuid, text) from public;

grant execute on function public.ops_is_admin() to authenticated;
grant execute on function public.ops_create_stock_movement(uuid, uuid, text, integer, text, uuid, text) to authenticated;
grant execute on function public.ops_create_order(text, text, text, text, text, text, text, text, timestamptz, jsonb) to authenticated;
grant execute on function public.ops_change_order_status(uuid, text, text) to authenticated;
grant execute on function public.ops_create_handover(uuid, text, uuid, text) to authenticated;
grant execute on function public.ops_acknowledge_handover(uuid, text) to authenticated;
