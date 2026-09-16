ALTER TABLE public.sales_quotation_items ADD COLUMN IF NOT EXISTS specs jsonb;

CREATE OR REPLACE FUNCTION public.sales_publish_quotation_version(p_quotation_id uuid, p_items jsonb, p_customer_note text DEFAULT NULL::text, p_terms text DEFAULT NULL::text, p_validity_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS sales_quotation_versions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_quote public.sales_quotations;
  v_version public.sales_quotation_versions;
  v_item jsonb;
  v_version_no integer;
  v_inventory_id uuid;
  v_inventory public.ops_inventory_items;
  v_qty integer;
  v_list numeric;
  v_price numeric;
  v_cost numeric;
  v_discount numeric;
  v_discount_pct numeric;
  v_line_total numeric;
  v_line_profit numeric;
  v_margin numeric;
  v_min_margin numeric;
  v_company_margin numeric;
  v_exception_reason text;
  v_approval_id uuid;
  v_quote_item_id uuid;
  v_subtotal numeric := 0;
  v_total numeric := 0;
  v_discount_total numeric := 0;
begin
  if not public.staff_has_capability('sales.quotation.manage') then raise exception 'Not authorized'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one quotation item is required';
  end if;

  select * into v_quote from public.sales_quotations where id = p_quotation_id for update;
  if not found then raise exception 'Quotation not found'; end if;
  if v_quote.status in ('converted','cancelled') then raise exception 'Quotation cannot be revised in its current state'; end if;

  select coalesce(max(version), 0) + 1 into v_version_no
  from public.sales_quotation_versions where quotation_id = p_quotation_id;

  select company_default_margin_percent into v_company_margin
  from public.sales_settings where settings_key = 'default';
  v_company_margin := coalesce(v_company_margin, 0);

  -- Calculate all item totals and validate controlled pricing before publishing anything.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := coalesce(nullif(v_item->>'quantity','')::integer, 0);
    v_list := coalesce(nullif(v_item->>'list_price','')::numeric, 0);
    v_price := coalesce(nullif(v_item->>'final_unit_price','')::numeric, v_list);
    if v_qty <= 0 then raise exception 'Quotation item quantity must be greater than zero'; end if;
    if nullif(trim(v_item->>'item_name'), '') is null then raise exception 'Quotation item name is required'; end if;
    if v_list < 0 or v_price <= 0 then raise exception 'Quotation item price is invalid'; end if;

    v_inventory_id := nullif(v_item->>'inventory_item_id','')::uuid;
    if v_inventory_id is not null then
      select * into v_inventory from public.ops_inventory_items where id = v_inventory_id and is_active = true;
      if not found then raise exception 'Inventory item not found or inactive'; end if;
      if v_inventory.default_unit_cost is null then raise exception 'Inventory item % has no approved cost basis', v_inventory.name; end if;
      v_cost := v_inventory.default_unit_cost;
      select minimum_margin_percent into v_min_margin
      from public.sales_margin_policies
      where policy_scope='product' and inventory_item_id=v_inventory_id and is_active=true
      limit 1;
      if v_min_margin is null and nullif(trim(v_inventory.category),'') is not null then
        select minimum_margin_percent into v_min_margin
        from public.sales_margin_policies
        where policy_scope='category' and lower(trim(category))=lower(trim(v_inventory.category)) and is_active=true
        limit 1;
      end if;
    else
      v_cost := nullif(v_item->>'cost_basis','')::numeric;
      if v_cost is null or v_cost < 0 then raise exception 'Supplier/service quotation line requires a valid cost basis'; end if;
      v_min_margin := null;
      if nullif(trim(v_item->>'category'),'') is not null then
        select minimum_margin_percent into v_min_margin
        from public.sales_margin_policies
        where policy_scope='category' and lower(trim(category))=lower(trim(v_item->>'category')) and is_active=true
        limit 1;
      end if;
    end if;

    v_min_margin := coalesce(v_min_margin, v_company_margin);
    v_discount := greatest(v_list - v_price, 0);
    v_discount_pct := case when v_list > 0 then (v_discount / v_list) * 100 else 0 end;
    v_margin := case when v_price > 0 then ((v_price - v_cost) / v_price) * 100 else 0 end;
    v_exception_reason := nullif(trim(v_item->>'admin_exception_reason'), '');
    if v_exception_reason is not null and not public.staff_has_capability('sales.pricing.admin') then
      raise exception 'Only an authorised administrator can approve a pricing exception';
    end if;
    if v_margin < v_min_margin and v_exception_reason is null then
      raise exception 'Price for % falls below the minimum gross margin of % percent', v_item->>'item_name', v_min_margin;
    end if;

    v_subtotal := v_subtotal + (v_list * v_qty);
    v_total := v_total + (v_price * v_qty);
    v_discount_total := v_discount_total + (v_discount * v_qty);
  end loop;

  update public.sales_quotation_versions
  set status='superseded'
  where quotation_id=p_quotation_id and status='published';

  insert into public.sales_quotation_versions (
    quotation_id, version, subtotal, discount_amount, total_amount,
    validity_expires_at, customer_note, terms, published_by
  ) values (
    p_quotation_id, v_version_no, v_subtotal, v_discount_total, v_total,
    p_validity_expires_at, nullif(trim(p_customer_note),''), nullif(trim(p_terms),''), auth.uid()
  ) returning * into v_version;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::integer;
    v_list := coalesce(nullif(v_item->>'list_price','')::numeric, 0);
    v_price := coalesce(nullif(v_item->>'final_unit_price','')::numeric, v_list);
    v_inventory_id := nullif(v_item->>'inventory_item_id','')::uuid;
    v_exception_reason := nullif(trim(v_item->>'admin_exception_reason'), '');
    if v_exception_reason is not null and not public.staff_has_capability('sales.pricing.admin') then
      raise exception 'Only an authorised administrator can approve a pricing exception';
    end if;

    if v_inventory_id is not null then
      select * into v_inventory from public.ops_inventory_items where id=v_inventory_id;
      v_cost := v_inventory.default_unit_cost;
      select minimum_margin_percent into v_min_margin from public.sales_margin_policies
      where policy_scope='product' and inventory_item_id=v_inventory_id and is_active=true limit 1;
      if v_min_margin is null and nullif(trim(v_inventory.category),'') is not null then
        select minimum_margin_percent into v_min_margin from public.sales_margin_policies
        where policy_scope='category' and lower(trim(category))=lower(trim(v_inventory.category)) and is_active=true limit 1;
      end if;
    else
      v_cost := (v_item->>'cost_basis')::numeric;
      v_min_margin := null;
      if nullif(trim(v_item->>'category'),'') is not null then
        select minimum_margin_percent into v_min_margin from public.sales_margin_policies
        where policy_scope='category' and lower(trim(category))=lower(trim(v_item->>'category')) and is_active=true limit 1;
      end if;
    end if;
    v_min_margin := coalesce(v_min_margin, v_company_margin);
    v_discount := greatest(v_list-v_price,0);
    v_discount_pct := case when v_list > 0 then (v_discount/v_list)*100 else 0 end;
    v_line_total := v_price*v_qty;
    v_line_profit := (v_price-v_cost)*v_qty;
    v_margin := case when v_price>0 then ((v_price-v_cost)/v_price)*100 else 0 end;
    v_approval_id := null;

    insert into public.sales_quotation_items (
      quotation_version_id, inventory_item_id, item_name, item_type, fulfilment_source,
      quantity, list_price, final_unit_price, line_discount_amount,
      cost_basis, cost_basis_source, gross_profit, gross_margin, note, specs
    ) values (
      v_version.id, v_inventory_id, trim(v_item->>'item_name'), coalesce(nullif(v_item->>'item_type',''),'other'),
      coalesce(nullif(v_item->>'fulfilment_source',''),'manual'), v_qty, v_list, v_price, v_discount*v_qty,
      v_cost,
      case when v_inventory_id is not null then 'inventory_average' else coalesce(nullif(v_item->>'cost_basis_source',''),'supplier_on_demand') end,
      v_line_profit, v_margin, nullif(trim(v_item->>'note'),''),
      nullif(v_item->'specs', 'null'::jsonb)
    ) returning id into v_quote_item_id;

    if v_exception_reason is not null then
      insert into public.sales_discount_approvals (
        quotation_version_id, quotation_item_id, list_price, requested_price, cost_basis,
        discount_percent, resulting_gross_margin, decision, reason, requested_by, approved_by
      ) values (
        v_version.id, v_quote_item_id, v_list, v_price, v_cost, v_discount_pct, v_margin,
        'approved', v_exception_reason, auth.uid(), auth.uid()
      ) returning id into v_approval_id;
      update public.sales_quotation_items set pricing_approval_id=v_approval_id where id=v_quote_item_id;
    end if;
  end loop;

  update public.sales_quotations
  set current_version_id=v_version.id, status='published'
  where id=p_quotation_id;

  insert into public.sales_events (identity_id, quotation_id, quotation_version_id, event_type, title, metadata, actor_id)
  values (v_quote.identity_id, p_quotation_id, v_version.id, 'quote.published', 'Quotation published', jsonb_build_object('version',v_version.version,'total_amount',v_version.total_amount), auth.uid());

  return v_version;
end;
$function$
