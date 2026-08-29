-- EmmyTech Operations Transfers + reporting support
-- Additive migration. Operations remains admin-only.

create table public.ops_stock_transfers (
  id uuid primary key default gen_random_uuid(),
  transfer_code text not null unique default (
    'TR-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(md5(random()::text), 1, 6))
  ),
  inventory_item_id uuid not null references public.ops_inventory_items(id) on delete restrict,
  from_location_id uuid not null references public.ops_locations(id) on delete restrict,
  to_location_id uuid not null references public.ops_locations(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  status text not null default 'in_transit'
    check (status in ('in_transit','received','cancelled')),
  order_id uuid references public.ops_orders(id) on delete set null,
  order_item_id uuid references public.ops_order_items(id) on delete set null,
  carrier_type text not null default 'other'
    check (carrier_type in ('emmytech_staff','dispatch_rider','supplier_delivery','courier','emmytech_vehicle','other')),
  carrier_user_id uuid references public.users(id) on delete set null,
  carrier_name text,
  carrier_phone text,
  carrier_reference text,
  reason text,
  note text,
  started_by uuid references public.users(id) on delete set null,
  started_at timestamptz not null default now(),
  received_by uuid references public.users(id) on delete set null,
  received_at timestamptz,
  cancelled_by uuid references public.users(id) on delete set null,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_location_id <> to_location_id),
  check ((order_item_id is null) or (order_id is not null))
);

create index ops_stock_transfers_created_idx on public.ops_stock_transfers(created_at desc);
create index ops_stock_transfers_status_idx on public.ops_stock_transfers(status, created_at desc);
create index ops_stock_transfers_item_idx on public.ops_stock_transfers(inventory_item_id, created_at desc);
create index ops_stock_transfers_order_idx on public.ops_stock_transfers(order_id, created_at desc);
create index ops_stock_transfers_locations_idx on public.ops_stock_transfers(from_location_id, to_location_id, created_at desc);

create trigger ops_stock_transfers_touch_updated_at
before update on public.ops_stock_transfers
for each row execute function public.ops_touch_updated_at();

alter table public.ops_stock_transfers enable row level security;
create policy ops_stock_transfers_admin_all on public.ops_stock_transfers
for all to authenticated using (public.ops_is_admin()) with check (public.ops_is_admin());
revoke all on public.ops_stock_transfers from anon;
grant select, insert, update, delete on public.ops_stock_transfers to authenticated;

create or replace function public.ops_start_stock_transfer(
  p_inventory_item_id uuid,
  p_from_location_id uuid,
  p_to_location_id uuid,
  p_quantity integer,
  p_order_id uuid default null,
  p_order_item_id uuid default null,
  p_carrier_type text default 'other',
  p_carrier_user_id uuid default null,
  p_carrier_name text default null,
  p_carrier_phone text default null,
  p_carrier_reference text default null,
  p_reason text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transfer_id uuid;
  v_transit_id uuid;
  v_available bigint := 0;
  v_reservation public.ops_inventory_reservations%rowtype;
  v_item public.ops_order_items%rowtype;
begin
  if not public.ops_is_admin() then raise exception 'Not authorized'; end if;
  if p_quantity <= 0 then raise exception 'Quantity must be greater than zero'; end if;
  if p_from_location_id = p_to_location_id then raise exception 'Source and destination must be different'; end if;

  select id into v_transit_id from public.ops_locations where code = 'TRANSIT' and is_active = true limit 1;
  if v_transit_id is null then raise exception 'In Transit location is missing'; end if;
  if p_to_location_id = v_transit_id then raise exception 'Choose the real destination, not In Transit'; end if;
  if p_from_location_id = v_transit_id then raise exception 'Use receive/cancel for stock already in transit'; end if;

  if p_order_item_id is not null then
    if p_order_id is null then raise exception 'Order is required for an order-linked transfer'; end if;
    select * into v_item
      from public.ops_order_items
      where id = p_order_item_id and order_id = p_order_id
      for update;
    if not found then raise exception 'Order item not found'; end if;
    if v_item.inventory_item_id is distinct from p_inventory_item_id then raise exception 'Transfer item does not match order item'; end if;

    select * into v_reservation
      from public.ops_inventory_reservations
      where order_item_id = p_order_item_id
        and order_id = p_order_id
        and inventory_item_id = p_inventory_item_id
        and location_id = p_from_location_id
        and status = 'active'
      for update;
    if not found then raise exception 'No active reservation at the source location for this order item'; end if;
    if v_reservation.quantity <> p_quantity then
      raise exception 'Order-linked transfer must move the full reserved quantity (%)', v_reservation.quantity;
    end if;
  else
    select available into v_available
      from public.ops_inventory_availability
      where inventory_item_id = p_inventory_item_id and location_id = p_from_location_id;
    v_available := coalesce(v_available, 0);
    if v_available < p_quantity then
      raise exception 'Insufficient available stock: need %, available %', p_quantity, v_available;
    end if;
  end if;

  insert into public.ops_stock_transfers (
    inventory_item_id, from_location_id, to_location_id, quantity,
    order_id, order_item_id, carrier_type, carrier_user_id,
    carrier_name, carrier_phone, carrier_reference, reason, note, started_by
  ) values (
    p_inventory_item_id, p_from_location_id, p_to_location_id, p_quantity,
    p_order_id, p_order_item_id, p_carrier_type, p_carrier_user_id,
    nullif(trim(p_carrier_name), ''), nullif(trim(p_carrier_phone), ''),
    nullif(trim(p_carrier_reference), ''), nullif(trim(p_reason), ''),
    nullif(trim(p_note), ''), auth.uid()
  ) returning id into v_transfer_id;

  insert into public.ops_stock_movements (
    inventory_item_id, location_id, movement_type, quantity_delta,
    reference_type, reference_id, note, created_by
  ) values
    (p_inventory_item_id, p_from_location_id, 'transfer_out', -p_quantity,
      'stock_transfer', v_transfer_id, 'Transfer started', auth.uid()),
    (p_inventory_item_id, v_transit_id, 'transfer_in', p_quantity,
      'stock_transfer', v_transfer_id, 'Moved into transit', auth.uid());

  if p_order_item_id is not null then
    update public.ops_inventory_reservations
      set location_id = v_transit_id,
          note = coalesce(note || E'\n', '') || 'Moved to In Transit on transfer ' || v_transfer_id::text
      where id = v_reservation.id;
  end if;

  insert into public.ops_business_events (
    event_type, idempotency_key, order_id, payload, created_by
  ) values (
    'stock.transfer_started', 'stock.transfer_started:' || v_transfer_id::text,
    p_order_id,
    jsonb_build_object(
      'transfer_id', v_transfer_id,
      'inventory_item_id', p_inventory_item_id,
      'from_location_id', p_from_location_id,
      'to_location_id', p_to_location_id,
      'quantity', p_quantity
    ), auth.uid()
  ) on conflict (idempotency_key) do nothing;

  if p_order_id is not null then
    insert into public.ops_order_events(order_id,event_type,title,actor_id,metadata)
    values (p_order_id,'stock_transfer_started','Stock transfer started',auth.uid(),
      jsonb_build_object('transfer_id',v_transfer_id,'quantity',p_quantity,'to_location_id',p_to_location_id));
  end if;

  return v_transfer_id;
end;
$$;

create or replace function public.ops_receive_stock_transfer(
  p_transfer_id uuid,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transfer public.ops_stock_transfers%rowtype;
  v_transit_id uuid;
begin
  if not public.ops_is_admin() then raise exception 'Not authorized'; end if;
  select * into v_transfer from public.ops_stock_transfers where id = p_transfer_id for update;
  if not found then raise exception 'Transfer not found'; end if;
  if v_transfer.status <> 'in_transit' then raise exception 'Only in-transit transfers can be received'; end if;

  select id into v_transit_id from public.ops_locations where code = 'TRANSIT' and is_active = true limit 1;
  if v_transit_id is null then raise exception 'In Transit location is missing'; end if;

  insert into public.ops_stock_movements (
    inventory_item_id, location_id, movement_type, quantity_delta,
    reference_type, reference_id, note, created_by
  ) values
    (v_transfer.inventory_item_id, v_transit_id, 'transfer_out', -v_transfer.quantity,
      'stock_transfer', v_transfer.id, 'Transfer received', auth.uid()),
    (v_transfer.inventory_item_id, v_transfer.to_location_id, 'transfer_in', v_transfer.quantity,
      'stock_transfer', v_transfer.id, 'Transfer received at destination', auth.uid());

  if v_transfer.order_item_id is not null then
    update public.ops_inventory_reservations
      set location_id = v_transfer.to_location_id,
          note = coalesce(note || E'\n', '') || 'Received at destination on transfer ' || v_transfer.id::text
      where order_item_id = v_transfer.order_item_id
        and order_id = v_transfer.order_id
        and status = 'active'
        and location_id = v_transit_id;
    update public.ops_order_items
      set source_location_id = v_transfer.to_location_id
      where id = v_transfer.order_item_id;
  end if;

  update public.ops_stock_transfers
    set status = 'received', received_by = auth.uid(), received_at = now(),
        note = coalesce(note, '') || case when nullif(trim(p_note),'') is null then '' else E'\n' || trim(p_note) end
    where id = v_transfer.id;

  insert into public.ops_business_events(event_type,idempotency_key,order_id,payload,created_by)
  values ('stock.transfer_received','stock.transfer_received:'||v_transfer.id::text,v_transfer.order_id,
    jsonb_build_object('transfer_id',v_transfer.id,'quantity',v_transfer.quantity,'to_location_id',v_transfer.to_location_id),auth.uid())
  on conflict(idempotency_key) do nothing;

  if v_transfer.order_id is not null then
    insert into public.ops_order_events(order_id,event_type,title,actor_id,metadata)
    values(v_transfer.order_id,'stock_transfer_received','Stock transfer received',auth.uid(),
      jsonb_build_object('transfer_id',v_transfer.id,'quantity',v_transfer.quantity,'location_id',v_transfer.to_location_id));
  end if;
end;
$$;

create or replace function public.ops_cancel_stock_transfer(
  p_transfer_id uuid,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transfer public.ops_stock_transfers%rowtype;
  v_transit_id uuid;
begin
  if not public.ops_is_admin() then raise exception 'Not authorized'; end if;
  select * into v_transfer from public.ops_stock_transfers where id = p_transfer_id for update;
  if not found then raise exception 'Transfer not found'; end if;
  if v_transfer.status <> 'in_transit' then raise exception 'Only in-transit transfers can be cancelled'; end if;

  select id into v_transit_id from public.ops_locations where code = 'TRANSIT' and is_active = true limit 1;

  insert into public.ops_stock_movements (
    inventory_item_id, location_id, movement_type, quantity_delta,
    reference_type, reference_id, note, created_by
  ) values
    (v_transfer.inventory_item_id, v_transit_id, 'transfer_out', -v_transfer.quantity,
      'stock_transfer', v_transfer.id, 'Transfer cancelled', auth.uid()),
    (v_transfer.inventory_item_id, v_transfer.from_location_id, 'transfer_in', v_transfer.quantity,
      'stock_transfer', v_transfer.id, 'Returned to source after transfer cancellation', auth.uid());

  if v_transfer.order_item_id is not null then
    update public.ops_inventory_reservations
      set location_id = v_transfer.from_location_id,
          note = coalesce(note || E'\n', '') || 'Returned to source after cancelled transfer ' || v_transfer.id::text
      where order_item_id = v_transfer.order_item_id
        and order_id = v_transfer.order_id
        and status = 'active'
        and location_id = v_transit_id;
  end if;

  update public.ops_stock_transfers
    set status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now(),
        note = coalesce(note, '') || case when nullif(trim(p_note),'') is null then '' else E'\n' || trim(p_note) end
    where id = v_transfer.id;

  insert into public.ops_business_events(event_type,idempotency_key,order_id,payload,created_by)
  values ('stock.transfer_cancelled','stock.transfer_cancelled:'||v_transfer.id::text,v_transfer.order_id,
    jsonb_build_object('transfer_id',v_transfer.id,'quantity',v_transfer.quantity),auth.uid())
  on conflict(idempotency_key) do nothing;
end;
$$;

grant execute on function public.ops_start_stock_transfer(uuid,uuid,uuid,integer,uuid,uuid,text,uuid,text,text,text,text,text) to authenticated;
grant execute on function public.ops_receive_stock_transfer(uuid,text) to authenticated;
grant execute on function public.ops_cancel_stock_transfer(uuid,text) to authenticated;
