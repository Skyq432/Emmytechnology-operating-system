-- EmmyTech Direct Sale transaction boundaries.
-- Uses Operations inventory/order truth; no parallel stock ledger.

create or replace function public.sales_create_direct_sale_draft(
  p_identity_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_items jsonb,
  p_sales_staff_name text default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
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
  if not public.ops_is_admin() then raise exception 'Not authorized'; end if;
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
      order_id,inventory_item_id,inventory_unit_id,item_name,item_type,quantity,unit_price,list_price,
      line_discount_amount,line_total,fulfilment_source,source_location_id,unit_cost_snapshot,
      cost_basis,cost_basis_source,gross_profit,gross_margin,note
    ) values (
      v_order_id,v_inventory_id,v_unit_id,
      case when v_inventory_id is not null then v_inventory.name else trim(v_item->>'item_name') end,
      case when v_inventory_id is not null then v_inventory.item_type else coalesce(nullif(v_item->>'item_type',''),'other') end,
      v_qty,v_price,v_list,v_discount*v_qty,v_price*v_qty,
      case when v_inventory_id is not null then 'internal' else 'manual' end,v_location_id,v_cost,v_cost,
      case when v_inventory_id is not null and v_inventory.serial_tracking then 'serialized_unit'
           when v_inventory_id is not null then 'inventory_average'
           else coalesce(nullif(v_item->>'cost_basis_source',''),'supplier_on_demand') end,
      (v_price-v_cost)*v_qty,v_margin,nullif(trim(v_item->>'note'),'')
    ) returning id into v_order_item_id;

    v_exception := nullif(trim(v_item->>'admin_exception_reason'),'');
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
$$;

create or replace function public.sales_confirm_direct_sale(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_order public.ops_orders;
  v_item public.ops_order_items;
  v_inventory public.ops_inventory_items;
  v_unit public.ops_inventory_units;
  v_available bigint;
  v_reserved integer:=0;
  v_stage integer:=0;
  v_lead_id uuid;
  v_commission numeric:=0;
begin
  if not public.ops_is_admin() then raise exception 'Not authorized'; end if;
  select * into v_order from public.ops_orders where id=p_order_id for update;
  if not found then raise exception 'Sale not found'; end if;
  if v_order.sales_channel<>'direct_sale' or v_order.fulfilment_mode<>'immediate_collection' then raise exception 'Order is not a Direct Sale'; end if;
  if v_order.commercial_state<>'draft' then raise exception 'Only draft Direct Sales can be confirmed'; end if;
  if v_order.identity_id is null then raise exception 'Customer Identity is required'; end if;
  if not exists(select 1 from public.ops_order_items where order_id=p_order_id) then raise exception 'At least one sale item is required'; end if;

  for v_item in select * from public.ops_order_items where order_id=p_order_id order by created_at,id
  loop
    if v_item.inventory_item_id is not null then
      select * into v_inventory from public.ops_inventory_items where id=v_item.inventory_item_id for share;
      if not found then raise exception 'Inventory item not found'; end if;
      if v_inventory.serial_tracking then
        if v_item.quantity<>1 or v_item.inventory_unit_id is null then raise exception 'Serialized line requires one exact unit'; end if;
        select * into v_unit from public.ops_inventory_units where id=v_item.inventory_unit_id and inventory_item_id=v_item.inventory_item_id for update;
        if not found or v_unit.status<>'available' then raise exception 'Serialized unit for % is no longer available',v_item.item_name; end if;
        if v_item.source_location_id is not null and v_unit.current_location_id is distinct from v_item.source_location_id then raise exception 'Serialized unit location changed'; end if;
        update public.ops_inventory_units set status='reserved',reserved_order_id=p_order_id,reserved_order_item_id=v_item.id where id=v_unit.id;
        update public.ops_order_items set quantity_reserved=1 where id=v_item.id;
        v_reserved:=v_reserved+1;
      else
        if v_item.source_location_id is null then raise exception 'Stock location is required for %',v_item.item_name; end if;
        select available into v_available from public.ops_inventory_availability
        where inventory_item_id=v_item.inventory_item_id and location_id=v_item.source_location_id;
        if coalesce(v_available,0)<v_item.quantity then raise exception 'Insufficient stock for %',v_item.item_name; end if;
        insert into public.ops_inventory_reservations(order_id,order_item_id,inventory_item_id,location_id,quantity,created_by)
        values(p_order_id,v_item.id,v_item.inventory_item_id,v_item.source_location_id,v_item.quantity,auth.uid());
        update public.ops_order_items set quantity_reserved=v_item.quantity where id=v_item.id;
        v_reserved:=v_reserved+v_item.quantity;
      end if;
    end if;
  end loop;

  if v_order.ambassador_id is not null and v_order.commission_rate>0 then
    v_commission:=round((v_order.total_amount*v_order.commission_rate/100.0)::numeric,2);
  end if;

  update public.ops_orders set commercial_state='confirmed',confirmed_at=now(),confirmed_by=auth.uid(),
    commission_amount=v_commission,commission_status=case when v_commission>0 then 'pending' else 'none' end
  where id=p_order_id;

  if v_order.identity_id is not null then
    v_stage:=public.ops_current_crm_stage(v_order.identity_id);
    if v_stage<5 then
      insert into public.crm_manual_updates(identity_id,update_type,value,note,updated_by)
      values(v_order.identity_id,'funnel_stage','5','Moved to Purchase because Direct Sale '||v_order.order_code||' was confirmed','Sales');
      insert into public.crm_stage_history(identity_id,from_stage,to_stage,tracking_type,changed_by)
      values(v_order.identity_id,nullif(v_stage,0),5,'Automatic','Sales');
      v_lead_id:=v_order.lead_id;
      if v_lead_id is null then select id into v_lead_id from public.leads where identity_id=v_order.identity_id order by updated_at desc nulls last,created_at desc limit 1; end if;
      if v_lead_id is not null then update public.leads set funnel_stage='purchase',updated_at=now() where id=v_lead_id; end if;
      v_stage:=5;
    end if;
    insert into public.identity_events(identity_id,event_type,title,description,metadata)
    values(v_order.identity_id,'sales_direct_sale_confirmed','Direct Sale confirmed','Direct Sale '||v_order.order_code||' was confirmed',jsonb_build_object('order_id',p_order_id,'total_amount',v_order.total_amount));
  end if;

  insert into public.ops_order_events(order_id,event_type,title,actor_id,metadata)
  values(p_order_id,'order_confirmed','Direct Sale confirmed',auth.uid(),jsonb_build_object('reserved_quantity',v_reserved,'commission_amount',v_commission));
  insert into public.sales_events(identity_id,order_id,event_type,title,metadata,actor_id)
  values(v_order.identity_id,p_order_id,'sale.confirmed','Direct Sale confirmed',jsonb_build_object('reserved_quantity',v_reserved),auth.uid());

  return jsonb_build_object('order_id',p_order_id,'commercial_state','confirmed','reserved_quantity',v_reserved);
end;
$$;

create or replace function public.sales_approve_credit_release(
  p_order_id uuid,
  p_approved_outstanding_amount numeric,
  p_due_at timestamptz,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare v_id uuid; v_order public.ops_orders;
begin
  if not public.ops_is_admin() then raise exception 'Not authorized'; end if;
  select * into v_order from public.ops_orders where id=p_order_id for update;
  if not found or v_order.commercial_state<>'confirmed' then raise exception 'Confirmed sale/order is required'; end if;
  if coalesce(p_approved_outstanding_amount,0)<=0 then raise exception 'Approved outstanding amount must be greater than zero'; end if;
  if p_due_at is null or p_due_at<=now() then raise exception 'Credit due date must be in the future'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'Credit approval reason is required'; end if;
  update public.sales_credit_releases set status='revoked',revoked_by=auth.uid(),revoked_at=now()
  where order_id=p_order_id and status='active';
  insert into public.sales_credit_releases(order_id,approved_outstanding_amount,due_at,reason,approved_by)
  values(p_order_id,p_approved_outstanding_amount,p_due_at,trim(p_reason),auth.uid()) returning id into v_id;
  insert into public.sales_events(identity_id,order_id,event_type,title,note,metadata,actor_id)
  values(v_order.identity_id,p_order_id,'sale.credit_approved','Credit release approved',trim(p_reason),jsonb_build_object('approved_outstanding_amount',p_approved_outstanding_amount,'due_at',p_due_at),auth.uid());
  return v_id;
end;
$$;

create or replace function public.sales_complete_direct_sale_handover(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_order public.ops_orders;
  v_item public.ops_order_items;
  v_inventory public.ops_inventory_items;
  v_unit public.ops_inventory_units;
  v_paid numeric;
  v_outstanding numeric;
  v_credit public.sales_credit_releases;
  v_available bigint;
  v_moved integer:=0;
begin
  if not public.ops_is_admin() then raise exception 'Not authorized'; end if;
  select * into v_order from public.ops_orders where id=p_order_id for update;
  if not found then raise exception 'Direct Sale not found'; end if;
  if v_order.sales_channel<>'direct_sale' or v_order.commercial_state<>'confirmed' then raise exception 'Confirmed Direct Sale is required'; end if;
  if v_order.handover_completed_at is not null then raise exception 'Direct Sale handover is already complete'; end if;

  select coalesce(sum(amount) filter(where not is_void),0) into v_paid from public.ops_order_payments where order_id=p_order_id;
  v_outstanding:=greatest(coalesce(v_order.total_amount,0)-coalesce(v_paid,0),0);
  if v_outstanding>0 then
    select * into v_credit from public.sales_credit_releases
    where order_id=p_order_id and status='active' and due_at>=now()
    order by approved_at desc limit 1 for update;
    if not found or v_credit.approved_outstanding_amount<v_outstanding then
      raise exception 'Full payment or sufficient active Admin credit approval is required before handover';
    end if;
  end if;

  for v_item in select * from public.ops_order_items where order_id=p_order_id order by created_at,id
  loop
    if v_item.inventory_item_id is not null then
      select * into v_inventory from public.ops_inventory_items where id=v_item.inventory_item_id;
      if v_inventory.serial_tracking then
        select * into v_unit from public.ops_inventory_units where id=v_item.inventory_unit_id for update;
        if not found or v_unit.status<>'reserved' or v_unit.reserved_order_id is distinct from p_order_id or v_unit.reserved_order_item_id is distinct from v_item.id then
          raise exception 'Reserved serialized unit is no longer valid for %',v_item.item_name;
        end if;
        update public.ops_inventory_units
        set status='sold',sold_order_id=p_order_id,sold_order_item_id=v_item.id,reserved_order_id=null,reserved_order_item_id=null
        where id=v_unit.id;
        -- Serialized stock is represented by exact unit state; no quantity movement is fabricated.
        update public.ops_order_items set quantity_reserved=0 where id=v_item.id;
        v_moved:=v_moved+1;
      else
        select available into v_available from public.ops_inventory_availability
        where inventory_item_id=v_item.inventory_item_id and location_id=v_item.source_location_id;
        -- Current reservation is included in reserved, so on-hand must still cover the reserved quantity.
        if not exists(select 1 from public.ops_inventory_reservations where order_id=p_order_id and order_item_id=v_item.id and status='active') then
          raise exception 'Active stock reservation is missing for %',v_item.item_name;
        end if;
        perform public.ops_create_stock_movement(v_item.inventory_item_id,v_item.source_location_id,'sold',-v_item.quantity,'order',p_order_id,'Direct Sale handover');
        update public.ops_inventory_reservations set status='fulfilled',fulfilled_at=now(),note='Direct Sale handed to customer'
        where order_id=p_order_id and order_item_id=v_item.id and status='active';
        update public.ops_order_items set quantity_reserved=0 where id=v_item.id;
        v_moved:=v_moved+v_item.quantity;
      end if;
    end if;
  end loop;

  update public.ops_orders set handover_completed_at=now(),status='completed' where id=p_order_id;
  if v_outstanding<=0 then update public.sales_credit_releases set status='settled' where order_id=p_order_id and status='active'; end if;

  insert into public.ops_order_events(order_id,event_type,title,to_status,actor_id,metadata)
  values(p_order_id,'direct_sale_handover','Direct Sale handed to customer','completed',auth.uid(),jsonb_build_object('stock_quantity',v_moved,'outstanding',v_outstanding));
  insert into public.sales_events(identity_id,order_id,event_type,title,metadata,actor_id)
  values(v_order.identity_id,p_order_id,'sale.handover_completed','Direct Sale handover completed',jsonb_build_object('outstanding',v_outstanding,'credit_used',v_outstanding>0),auth.uid());

  return jsonb_build_object('order_id',p_order_id,'handover_completed',true,'outstanding',v_outstanding,'stock_quantity',v_moved);
end;
$$;

grant execute on function public.sales_create_direct_sale_draft(uuid,text,text,text,jsonb,text) to authenticated;
grant execute on function public.sales_confirm_direct_sale(uuid) to authenticated;
grant execute on function public.sales_approve_credit_release(uuid,numeric,timestamptz,text) to authenticated;
grant execute on function public.sales_complete_direct_sale_handover(uuid) to authenticated;
