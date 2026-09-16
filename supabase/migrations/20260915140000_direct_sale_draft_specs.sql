-- Same fix as sales_create_order_draft: non-stock Direct Sale lines can now carry
-- category-driven spec details through to ops_order_items.specs, which the INSERT
-- previously never included.
CREATE OR REPLACE FUNCTION public.sales_create_direct_sale_draft(p_identity_id uuid, p_customer_name text, p_customer_phone text, p_customer_email text, p_items jsonb, p_sales_staff_name text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order_id uuid;
  v_item jsonb;
  v_inventory public.ops_inventory_items;
  v_unit public.ops_inventory_units;
  v_inventory_id uuid;
  v_unit_id uuid;
  v_location_id uuid;
  v_qty integer;
  v_list numeric;
  v_price numeric;
  v_cost numeric;
  v_margin numeric;
  v_min_margin numeric;
  v_company_margin numeric;
  v_discount numeric;
  v_subtotal numeric := 0;
  v_total numeric := 0;
  v_discount_total numeric := 0;
  v_exception text;
  v_order_item_id uuid;
  v_approval_id uuid;
begin
  if not public.staff_has_capability('sales.direct.manage') then raise exception 'Not authorized'; end if;
  if p_identity_id is null or not exists(select 1 from public.identities where id=p_identity_id) then
    raise exception 'Valid customer Identity is required';
  end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then
    raise exception 'At least one sale item is required';
  end if;

  select company_default_margin_percent into v_company_margin from public.sales_settings where settings_key='default';
  v_company_margin := coalesce(v_company_margin,0);

  -- Validate every line and totals before inserting the transaction.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_inventory_id := nullif(v_item->>'inventory_item_id','')::uuid;
    v_unit_id := nullif(v_item->>'inventory_unit_id','')::uuid;
    v_location_id := nullif(v_item->>'source_location_id','')::uuid;
    v_qty := coalesce(nullif(v_item->>'quantity','')::integer,0);
    if v_qty<=0 then raise exception 'Quantity must be greater than zero'; end if;

    if v_inventory_id is not null then
      select * into v_inventory from public.ops_inventory_items where id=v_inventory_id and is_active=true;
      if not found then raise exception 'Inventory item not found or inactive'; end if;
      if v_inventory.default_selling_price is null or v_inventory.default_selling_price<=0 then
        raise exception 'Inventory item % has no approved selling price',v_inventory.name;
      end if;
      v_list := v_inventory.default_selling_price;
      v_price := coalesce(nullif(v_item->>'final_unit_price','')::numeric,v_list);
      if v_inventory.serial_tracking then
        if v_qty<>1 or v_unit_id is null then raise exception 'Serialized sale lines require exactly one selected unit'; end if;
        select * into v_unit from public.ops_inventory_units where id=v_unit_id and inventory_item_id=v_inventory_id;
        if not found or v_unit.status<>'available' then raise exception 'Selected serialized unit is not available'; end if;
        if v_location_id is not null and v_unit.current_location_id is distinct from v_location_id then raise exception 'Serialized unit is not at the selected location'; end if;
        v_location_id := v_unit.current_location_id;
        v_cost := coalesce(v_unit.unit_cost,v_inventory.default_unit_cost);
      else
        if v_location_id is null then raise exception 'Stock location is required'; end if;
        v_cost := v_inventory.default_unit_cost;
      end if;
      if v_cost is null then raise exception 'Inventory item % has no approved cost basis',v_inventory.name; end if;

      select minimum_margin_percent into v_min_margin from public.sales_margin_policies
      where policy_scope='product' and inventory_item_id=v_inventory_id and is_active=true limit 1;
      if v_min_margin is null and nullif(trim(v_inventory.category),'') is not null then
        select minimum_margin_percent into v_min_margin from public.sales_margin_policies
        where policy_scope='category' and lower(trim(category))=lower(trim(v_inventory.category)) and is_active=true limit 1;
      end if;
    else
      if nullif(trim(v_item->>'item_name'),'') is null then raise exception 'Service/non-stock line name is required'; end if;
      v_list := coalesce(nullif(v_item->>'list_price','')::numeric,0);
      v_price := coalesce(nullif(v_item->>'final_unit_price','')::numeric,v_list);
      v_cost := nullif(v_item->>'cost_basis','')::numeric;
      if v_list<=0 or v_price<=0 or v_cost is null or v_cost<0 then raise exception 'Service/non-stock pricing is incomplete'; end if;
      v_min_margin := null;
      if nullif(trim(v_item->>'category'),'') is not null then
        select minimum_margin_percent into v_min_margin from public.sales_margin_policies
        where policy_scope='category' and lower(trim(category))=lower(trim(v_item->>'category')) and is_active=true limit 1;
      end if;
    end if;

    v_min_margin := coalesce(v_min_margin,v_company_margin);
    v_margin := case when v_price>0 then ((v_price-v_cost)/v_price)*100 else 0 end;
    v_exception := nullif(trim(v_item->>'admin_exception_reason'),'');
    if v_exception is not null and not public.staff_has_capability('sales.pricing.admin') then
      raise exception 'Only an authorised administrator can approve a pricing exception';
    end if;
    if v_margin<v_min_margin and v_exception is null then
      raise exception 'Price for % falls below the minimum gross margin of % percent',coalesce(v_inventory.name,v_item->>'item_name'),v_min_margin;
    end if;
    v_discount := greatest(v_list-v_price,0);
    v_subtotal := v_subtotal+(v_list*v_qty);
    v_total := v_total+(v_price*v_qty);
    v_discount_total := v_discount_total+(v_discount*v_qty);
  end loop;

  insert into public.ops_orders(
    source_type,reference_label,identity_id,customer_name,customer_phone,customer_email,
    commercial_state,acquisition_source,subtotal,discount_type,discount_amount,discount_percentage,
    total_amount,amount_paid,balance_due,payment_status,order_type,sales_staff_user_id,sales_staff_name,
    sales_channel,fulfilment_mode,created_by
  ) values (
    'manual','Direct Sale',p_identity_id,nullif(trim(p_customer_name),''),nullif(trim(p_customer_phone),''),nullif(trim(p_customer_email),''),
    'draft','direct_sale',v_subtotal,'negotiated discount',v_discount_total,
    case when v_subtotal>0 then (v_discount_total/v_subtotal)*100 else 0 end,
    v_total,0,v_total,'unpaid','other',auth.uid(),nullif(trim(p_sales_staff_name),''),
    'direct_sale','immediate_collection',auth.uid()
  ) returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_inventory_id := nullif(v_item->>'inventory_item_id','')::uuid;
    v_unit_id := nullif(v_item->>'inventory_unit_id','')::uuid;
    v_location_id := nullif(v_item->>'source_location_id','')::uuid;
    v_qty := (v_item->>'quantity')::integer;
    v_approval_id := null;

    if v_inventory_id is not null then
      select * into v_inventory from public.ops_inventory_items where id=v_inventory_id;
      v_list := v_inventory.default_selling_price;
      v_price := coalesce(nullif(v_item->>'final_unit_price','')::numeric,v_list);
      if v_inventory.serial_tracking then
        select * into v_unit from public.ops_inventory_units where id=v_unit_id;
        v_location_id := v_unit.current_location_id;
        v_cost := coalesce(v_unit.unit_cost,v_inventory.default_unit_cost);
      else
        v_cost := v_inventory.default_unit_cost;
      end if;
    else
      v_list := (v_item->>'list_price')::numeric;
      v_price := coalesce(nullif(v_item->>'final_unit_price','')::numeric,v_list);
      v_cost := (v_item->>'cost_basis')::numeric;
    end if;

    v_discount := greatest(v_list-v_price,0);
    v_margin := case when v_price>0 then ((v_price-v_cost)/v_price)*100 else 0 end;

    insert into public.ops_order_items(
      order_id,inventory_item_id,inventory_unit_id,item_name,item_type,specs,quantity,unit_price,list_price,
      line_discount_amount,line_total,fulfilment_source,source_location_id,unit_cost_snapshot,
      cost_basis,cost_basis_source,gross_profit,gross_margin,note
    ) values (
      v_order_id,v_inventory_id,v_unit_id,
      case when v_inventory_id is not null then v_inventory.name else trim(v_item->>'item_name') end,
      case when v_inventory_id is not null then v_inventory.item_type else coalesce(nullif(v_item->>'item_type',''),'other') end,
      nullif(v_item->'specs','null'::jsonb),
      v_qty,v_price,v_list,v_discount*v_qty,v_price*v_qty,
      case when v_inventory_id is not null then 'internal' else 'manual' end,v_location_id,v_cost,v_cost,
      case when v_inventory_id is not null and v_inventory.serial_tracking then 'serialized_unit'
           when v_inventory_id is not null then 'inventory_average'
           else coalesce(nullif(v_item->>'cost_basis_source',''),'supplier_on_demand') end,
      (v_price-v_cost)*v_qty,v_margin,nullif(trim(v_item->>'note'),'')
    ) returning id into v_order_item_id;

    v_exception := nullif(trim(v_item->>'admin_exception_reason'),'');
    if v_exception is not null and not public.staff_has_capability('sales.pricing.admin') then
      raise exception 'Only an authorised administrator can approve a pricing exception';
    end if;
    if v_exception is not null then
      insert into public.sales_discount_approvals(
        order_id,order_item_id,list_price,requested_price,cost_basis,discount_percent,resulting_gross_margin,
        decision,reason,requested_by,approved_by
      ) values (
        v_order_id,v_order_item_id,v_list,v_price,v_cost,
        case when v_list>0 then (greatest(v_list-v_price,0)/v_list)*100 else 0 end,v_margin,
        'approved',v_exception,auth.uid(),auth.uid()
      ) returning id into v_approval_id;
      update public.ops_order_items set pricing_approval_id=v_approval_id where id=v_order_item_id;
    end if;
  end loop;

  insert into public.ops_order_events(order_id,event_type,title,to_status,actor_id,metadata)
  values(v_order_id,'order_created','Direct Sale draft created','new',auth.uid(),jsonb_build_object('sales_channel','direct_sale'));
  insert into public.sales_events(identity_id,order_id,event_type,title,actor_id)
  values(p_identity_id,v_order_id,'sale.created','Direct Sale created',auth.uid());

  return v_order_id;
end;
$function$;
