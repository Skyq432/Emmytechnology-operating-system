-- Same silent-failure bug as ops_set_order_item_fulfilment_source: updateDraftSalesDetails
-- did two raw client-side UPDATEs (ops_orders, ops_order_items), both of which only
-- have one write RLS policy each, gated by ops_is_admin() (admin/super_admin only).
-- front_desk and every other non-admin role editing "Sales details" on a draft order
-- got a false "Sales details saved" while nothing actually changed.
CREATE OR REPLACE FUNCTION public.ops_update_draft_sales_details(
  p_order_id uuid,
  p_item_id uuid,
  p_order_type text,
  p_item_type text,
  p_sales_staff_user_id uuid DEFAULT NULL,
  p_sales_staff_name text DEFAULT NULL,
  p_brand text DEFAULT NULL,
  p_model text DEFAULT NULL,
  p_condition text DEFAULT NULL,
  p_unit_cost_snapshot numeric DEFAULT NULL,
  p_warranty_period text DEFAULT NULL,
  p_warranty_expires_at date DEFAULT NULL,
  p_specs jsonb DEFAULT '{}'::jsonb
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

  select * into v_order from public.ops_orders where id = p_order_id;
  if not found then raise exception 'Order not found'; end if;
  if v_order.commercial_state <> 'draft' then raise exception 'Sales details can only be edited while the order is Draft.'; end if;

  select * into v_item from public.ops_order_items where id = p_item_id and order_id = p_order_id;
  if not found then raise exception 'Order item not found'; end if;

  update public.ops_orders
  set order_type = p_order_type,
      sales_staff_user_id = p_sales_staff_user_id,
      sales_staff_name = nullif(trim(p_sales_staff_name), '')
  where id = p_order_id;

  update public.ops_order_items
  set item_type = p_item_type,
      brand = nullif(trim(p_brand), ''),
      model = nullif(trim(p_model), ''),
      condition = nullif(trim(p_condition), ''),
      unit_cost_snapshot = case when p_unit_cost_snapshot is null then null else greatest(0, p_unit_cost_snapshot) end,
      warranty_period = nullif(trim(p_warranty_period), ''),
      warranty_expires_at = p_warranty_expires_at,
      specs = coalesce(p_specs, '{}'::jsonb)
  where id = p_item_id and order_id = p_order_id;
end;
$function$;

revoke all on function public.ops_update_draft_sales_details(uuid,uuid,text,text,uuid,text,text,text,text,numeric,text,date,jsonb) from public, anon;
grant execute on function public.ops_update_draft_sales_details(uuid,uuid,text,text,uuid,text,text,text,text,numeric,text,date,jsonb) to authenticated, service_role;
