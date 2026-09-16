-- Recorded live in this project's migration history (version 20260913130205) but the
-- .sql file was never committed to the repo. This commits its exact current live
-- definition, verbatim, as found via pg_get_functiondef. No-op on the current
-- database — CREATE OR REPLACE against an identical body.
--
-- Adds a dedicated handover RPC that both marks an order completed and consumes its
-- reserved stock (serialized units -> 'sold'; quantity-tracked -> a 'sold' stock
-- movement), and guards the generic status-change RPC so 'completed' can't be set
-- directly while active reservations exist — callers must use the handover RPC instead.

CREATE OR REPLACE FUNCTION public.ops_complete_order_handover(p_order_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order public.ops_orders%rowtype;
  v_item public.ops_order_items%rowtype;
  v_inventory public.ops_inventory_items%rowtype;
  v_unit public.ops_inventory_units%rowtype;
  v_moved integer := 0;
begin
  if not public.staff_has_capability('operations.order.manage') then raise exception 'Not authorized'; end if;

  select * into v_order from public.ops_orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.commercial_state <> 'confirmed' then raise exception 'Order must be commercially confirmed before handover'; end if;
  if v_order.status in ('completed','cancelled') then raise exception 'Order is already in a terminal status'; end if;
  if v_order.handover_completed_at is not null then raise exception 'Handover is already complete'; end if;

  for v_item in select * from public.ops_order_items where order_id = p_order_id order by created_at, id
  loop
    if v_item.inventory_item_id is not null and v_item.fulfilment_source = 'internal' then
      select * into v_inventory from public.ops_inventory_items where id = v_item.inventory_item_id;

      if v_inventory.serial_tracking then
        select * into v_unit from public.ops_inventory_units where id = v_item.inventory_unit_id for update;
        if not found or v_unit.status <> 'reserved' or v_unit.reserved_order_id is distinct from p_order_id or v_unit.reserved_order_item_id is distinct from v_item.id then
          raise exception 'Reserved serialized unit is no longer valid for %', v_item.item_name;
        end if;
        update public.ops_inventory_units
          set status = 'sold', sold_order_id = p_order_id, sold_order_item_id = v_item.id, reserved_order_id = null, reserved_order_item_id = null
          where id = v_unit.id;
        update public.ops_order_items set quantity_reserved = 0 where id = v_item.id;
        v_moved := v_moved + 1;
      else
        if not exists (select 1 from public.ops_inventory_reservations where order_id = p_order_id and order_item_id = v_item.id and status = 'active') then
          raise exception 'Active stock reservation is missing for %', v_item.item_name;
        end if;
        perform public.ops_create_stock_movement(v_item.inventory_item_id, v_item.source_location_id, 'sold', -v_item.quantity, 'order', p_order_id, 'Order handover');
        update public.ops_inventory_reservations set status = 'fulfilled', fulfilled_at = now(), note = 'Order handed over to customer'
          where order_id = p_order_id and order_item_id = v_item.id and status = 'active';
        update public.ops_order_items set quantity_reserved = 0 where id = v_item.id;
        v_moved := v_moved + v_item.quantity;
      end if;
    end if;
  end loop;

  update public.ops_orders set status = 'completed', handover_completed_at = now() where id = p_order_id;

  insert into public.ops_order_events(order_id, event_type, title, note, to_status, actor_id, metadata)
  values (p_order_id, 'order_handover', 'Order handed over to customer', nullif(trim(p_note), ''), 'completed', auth.uid(), jsonb_build_object('stock_quantity', v_moved));

  insert into public.ops_business_events(event_type, idempotency_key, order_id, identity_id, payload, created_by)
  values ('order.handover_completed', 'order.handover_completed:'||p_order_id::text, p_order_id, v_order.identity_id, jsonb_build_object('stock_quantity', v_moved), auth.uid())
  on conflict (idempotency_key) do nothing;

  return jsonb_build_object('order_id', p_order_id, 'handover_completed', true, 'stock_quantity', v_moved);
end;
$function$;

CREATE OR REPLACE FUNCTION public.ops_change_order_status(p_order_id uuid, p_new_status text, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_current text;
  v_sequence text[] := array['new','confirmed','stock_check','assigned','picking','packing','ready_dispatch','dispatched','delivered','completed'];
  v_current_pos integer;
  v_next_pos integer;
  v_valid boolean := false;
  v_skipped text[] := array[]::text[];
begin
  if not public.staff_has_capability('operations.order.manage') then raise exception 'Not authorized'; end if;
  select status into v_current from public.ops_orders where id=p_order_id for update;
  if v_current is null then raise exception 'Order not found'; end if;
  if v_current=p_new_status then raise exception 'Order is already in that status'; end if;
  if v_current in ('completed','cancelled') then raise exception 'Terminal orders cannot change status'; end if;

  if p_new_status = 'completed' and exists (
    select 1 from public.ops_inventory_reservations where order_id = p_order_id and status = 'active'
  ) then
    raise exception 'Order has active stock reservations — complete handover instead of setting status directly';
  end if;

  if v_current='on_hold' then
    v_valid := p_new_status='cancelled' or (p_new_status=any(v_sequence) and p_new_status<>'completed');
  elsif p_new_status in ('on_hold','cancelled') then
    v_valid := true;
  else
    v_current_pos := array_position(v_sequence,v_current);
    v_next_pos := array_position(v_sequence,p_new_status);
    v_valid := v_current_pos is not null and v_next_pos is not null and v_next_pos>v_current_pos;
    if v_valid and v_next_pos>v_current_pos+1 then
      v_skipped := v_sequence[(v_current_pos+1):(v_next_pos-1)];
      if nullif(trim(p_note),'') is null then raise exception 'A reason is required when skipping fulfilment stages'; end if;
    end if;
  end if;

  if not v_valid then raise exception 'Invalid order status transition from % to %',v_current,p_new_status; end if;

  update public.ops_orders set status=p_new_status where id=p_order_id;
  insert into public.ops_order_events(order_id,event_type,title,note,from_status,to_status,actor_id,metadata)
  values(
    p_order_id,
    case when cardinality(v_skipped)>0 then 'status_skipped' else 'status_changed' end,
    case when cardinality(v_skipped)>0 then 'Fulfilment stages skipped' else 'Status changed' end,
    nullif(trim(p_note),''),v_current,p_new_status,auth.uid(),
    jsonb_build_object('skipped_statuses',to_jsonb(v_skipped),'skip_count',cardinality(v_skipped))
  );
end;
$function$;
