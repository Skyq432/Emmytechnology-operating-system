-- ops_order_items only has one write RLS policy (ops_order_items_admin_all, gated by
-- ops_is_admin() = role in ('admin','super_admin')). The app's fulfilment-source save
-- was doing a raw client-side UPDATE against that table, which front_desk (and anyone
-- else with only operations.order.manage) silently fails against: RLS blocks the
-- write, but a Postgres UPDATE matching zero rows returns success, not an error — so
-- the UI showed "saved" while nothing changed. Every other order mutation in this app
-- goes through a SECURITY DEFINER RPC for exactly this reason; this one was the odd
-- one out. Bringing it in line.
CREATE OR REPLACE FUNCTION public.ops_set_order_item_fulfilment_source(
  p_order_id uuid,
  p_item_id uuid,
  p_fulfilment_source text,
  p_source_location_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_order public.ops_orders%rowtype;
  v_item public.ops_order_items%rowtype;
begin
  if not public.staff_has_capability('operations.order.manage') then raise exception 'Not authorized'; end if;
  if p_fulfilment_source not in ('internal','supplier','dropship','manual') then raise exception 'Choose a valid fulfilment source'; end if;
  if p_fulfilment_source = 'internal' and p_source_location_id is null then raise exception 'Choose the internal stock location'; end if;

  select * into v_order from public.ops_orders where id = p_order_id;
  if not found then raise exception 'Order not found'; end if;
  if v_order.commercial_state <> 'draft' then raise exception 'Fulfilment source can only change while the Order is Draft'; end if;

  select * into v_item from public.ops_order_items where id = p_item_id and order_id = p_order_id;
  if not found then raise exception 'Order item not found'; end if;

  update public.ops_order_items
  set fulfilment_source = p_fulfilment_source,
      source_location_id = case when p_fulfilment_source = 'internal' then p_source_location_id else null end
  where id = p_item_id and order_id = p_order_id;
end;
$function$;

revoke all on function public.ops_set_order_item_fulfilment_source(uuid,uuid,text,uuid) from public, anon;
grant execute on function public.ops_set_order_item_fulfilment_source(uuid,uuid,text,uuid) to authenticated, service_role;
