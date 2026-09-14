-- Sales normal Order drafts.
-- Commercial terms live in Sales; inventory reservation and fulfilment remain in Operations.

create or replace function public.sales_create_order_draft(
  p_identity_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_items jsonb,
  p_sales_staff_name text default null,
  p_delivery_charge numeric default 0,
  p_note text default null
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
  v_inventory_id uuid;
  v_source text;
  v_qty integer;
  v_list numeric;
  v_price numeric;
  v_cost numeric;
  v_margin numeric;
  v_min_margin numeric;
  v_company_margin numeric;
  v_discount numeric;
  v_discount_pct numeric;
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
    raise exception 'At least one order item is required';
  end if;
  if coalesce(p_delivery_charge,0)<0 then raise exception 'Delivery charge cannot be negative'; end if;

  select company_default_margin_percent into v_company_margin
  from public.sales_settings where settings_key='default';
  v_company_margin := coalesce(v_company_margin,0);

  -- Validate all commercial lines before creating the draft.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_inventory_id := nullif(v_item->>'inventory_item_id','')::uuid;
    v_source := coalesce(nullif(v_item->>'fulfilment_source',''),case when v_inventory_id is null then 'manual' else 'internal' end);
    if v_source not in ('internal','supplier','dropship','manual') then raise exception 'Invalid fulfilment source'; end if;

    v_qty := coalesce(nullif(v_item->>'quantity','')::integer,0);
    if v_qty<=0 then raise exception 'Order item quantity must be greater than zero'; end if;
    if nullif(trim(v_item->>'item_name'),'') is null then raise exception 'Order item name is required'; end if;

    if v_inventory_id is not null then
      select * into v_inventory from public.ops_inventory_items where id=v_inventory_id and is_active=true;
      if not found then raise exception 'Inventory item not found or inactive'; end if;
      if v_inventory.default_selling_price is null or v_inventory.default_selling_price<=0 then
        raise exception 'Inventory item % has no approved selling price',v_inventory.name;
      end if;
      v_list := v_inventory.default_selling_price;
      v_price := coalesce(nullif(v_item->>'final_unit_price','')::numeric,v_list);
      if v_source='internal' then
        v_cost := v_inventory.default_unit_cost;
      else
        v_cost := coalesce(nullif(v_item->>'cost_basis','')::numeric,v_inventory.default_unit_cost);
      end if;
      if v_cost is null or v_cost<0 then raise exception 'Order item % has no approved cost basis',v_inventory.name; end if;

      select minimum_margin_percent into v_min_margin from public.sales_margin_policies
      where policy_scope='product' and inventory_item_id=v_inventory_id and is_active=true limit 1;
      if v_min_margin is null and nullif(trim(v_inventory.category),'') is not null then
        select minimum_margin_percent into v_min_margin from public.sales_margin_policies
        where policy_scope='category' and lower(trim(category))=lower(trim(v_inventory.category)) and is_active=true limit 1;
      end if;
    else
      v_list := coalesce(nullif(v_item->>'list_price','')::numeric,0);
      v_price := coalesce(nullif(v_item->>'final_unit_price','')::numeric,v_list);
      v_cost := nullif(v_item->>'cost_basis','')::numeric;
      if v_list<=0 or v_price<=0 or v_cost is null or v_cost<0 then raise exception 'Service/on-demand pricing is incomplete'; end if;
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

  v_total := v_total + greatest(coalesce(p_delivery_charge,0),0);

  insert into public.ops_orders(
    source_type,reference_label,identity_id,customer_name,customer_phone,customer_email,
    commercial_state,acquisition_source,subtotal,discount_type,discount_amount,discount_percentage,
    delivery_charge,total_amount,amount_paid,balance_due,payment_status,order_type,
    sales_staff_user_id,sales_staff_name,sales_channel,fulfilment_mode,created_by
  ) values (
    'manual','Sales Order',p_identity_id,nullif(trim(p_customer_name),''),nullif(trim(p_customer_phone),''),nullif(trim(p_customer_email),''),
    'draft','sales_order',v_subtotal,'negotiated discount',v_discount_total,
    case when v_subtotal>0 then (v_discount_total/v_subtotal)*100 else 0 end,
    greatest(coalesce(p_delivery_charge,0),0),v_total,0,v_total,'unpaid','other',
    auth.uid(),nullif(trim(p_sales_staff_name),''),'order','operations_fulfilment',auth.uid()
  ) returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_inventory_id := nullif(v_item->>'inventory_item_id','')::uuid;
    v_source := coalesce(nullif(v_item->>'fulfilment_source',''),case when v_inventory_id is null then 'manual' else 'internal' end);
    v_qty := (v_item->>'quantity')::integer;
    v_approval_id := null;

    if v_inventory_id is not null then
      select * into v_inventory from public.ops_inventory_items where id=v_inventory_id;
      v_list := v_inventory.default_selling_price;
      v_price := coalesce(nullif(v_item->>'final_unit_price','')::numeric,v_list);
      if v_source='internal' then
        v_cost := v_inventory.default_unit_cost;
      else
        v_cost := coalesce(nullif(v_item->>'cost_basis','')::numeric,v_inventory.default_unit_cost);
      end if;
    else
      v_list := (v_item->>'list_price')::numeric;
      v_price := coalesce(nullif(v_item->>'final_unit_price','')::numeric,v_list);
      v_cost := (v_item->>'cost_basis')::numeric;
    end if;

    v_discount := greatest(v_list-v_price,0);
    v_discount_pct := case when v_list>0 then (v_discount/v_list)*100 else 0 end;
    v_margin := case when v_price>0 then ((v_price-v_cost)/v_price)*100 else 0 end;

    insert into public.ops_order_items(
      order_id,inventory_item_id,item_name,item_type,quantity,unit_price,list_price,
      line_discount_amount,line_total,fulfilment_source,unit_cost_snapshot,cost_basis,
      cost_basis_source,gross_profit,gross_margin,note
    ) values (
      v_order_id,v_inventory_id,
      case when v_inventory_id is not null then v_inventory.name else trim(v_item->>'item_name') end,
      case when v_inventory_id is not null then v_inventory.item_type else coalesce(nullif(v_item->>'item_type',''),'other') end,
      v_qty,v_price,v_list,v_discount*v_qty,v_price*v_qty,v_source,v_cost,v_cost,
      case when v_source in ('supplier','dropship') then 'supplier_on_demand'
           when v_inventory_id is not null then 'inventory_average'
           else coalesce(nullif(v_item->>'cost_basis_source',''),'supplier_on_demand') end,
      (v_price-v_cost)*v_qty,v_margin,nullif(trim(v_item->>'note'),'')
    ) returning id into v_order_item_id;

    v_exception := nullif(trim(v_item->>'admin_exception_reason'),'');
    if v_exception is not null then
      insert into public.sales_discount_approvals(
        order_id,order_item_id,list_price,requested_price,cost_basis,discount_percent,
        resulting_gross_margin,decision,reason,requested_by,approved_by
      ) values (
        v_order_id,v_order_item_id,v_list,v_price,v_cost,v_discount_pct,v_margin,
        'approved',v_exception,auth.uid(),auth.uid()
      ) returning id into v_approval_id;
      update public.ops_order_items set pricing_approval_id=v_approval_id where id=v_order_item_id;
    end if;
  end loop;

  insert into public.ops_order_events(order_id,event_type,title,to_status,actor_id,metadata)
  values(v_order_id,'order_created','Sales Order draft created','new',auth.uid(),jsonb_build_object('sales_channel','order','fulfilment_mode','operations_fulfilment'));
  insert into public.sales_events(identity_id,order_id,event_type,title,note,metadata,actor_id)
  values(p_identity_id,v_order_id,'order.created','Sales Order created',nullif(trim(p_note),''),jsonb_build_object('total_amount',v_total),auth.uid());

  return v_order_id;
end;
$$;

grant execute on function public.sales_create_order_draft(uuid,text,text,text,jsonb,text,numeric,text) to authenticated;
