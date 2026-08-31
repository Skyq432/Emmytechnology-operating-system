-- EmmyTech Sales quotation transaction boundaries
-- Quotations never reserve inventory. Published versions are immutable.

create or replace function public.sales_create_quotation(
  p_identity_id uuid,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_customer_email text default null,
  p_sales_staff_user_id uuid default null,
  p_sales_staff_name text default null
)
returns public.sales_quotations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote public.sales_quotations;
begin
  if not public.ops_is_admin() then raise exception 'Not authorized'; end if;
  if p_identity_id is null or not exists (select 1 from public.identities where id = p_identity_id) then
    raise exception 'Valid customer Identity is required';
  end if;

  insert into public.sales_quotations (
    identity_id, customer_name, customer_phone, customer_email,
    sales_staff_user_id, sales_staff_name, created_by
  ) values (
    p_identity_id, nullif(trim(p_customer_name), ''), nullif(trim(p_customer_phone), ''),
    nullif(trim(p_customer_email), ''), coalesce(p_sales_staff_user_id, auth.uid()),
    nullif(trim(p_sales_staff_name), ''), auth.uid()
  ) returning * into v_quote;

  insert into public.sales_events (identity_id, quotation_id, event_type, title, actor_id)
  values (p_identity_id, v_quote.id, 'quote.created', 'Quotation created', auth.uid());

  return v_quote;
end;
$$;

create or replace function public.sales_publish_quotation_version(
  p_quotation_id uuid,
  p_items jsonb,
  p_customer_note text default null,
  p_terms text default null,
  p_validity_expires_at timestamptz default null
)
returns public.sales_quotation_versions
language plpgsql
security definer
set search_path = public
as $$
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
  if not public.ops_is_admin() then raise exception 'Not authorized'; end if;
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
      cost_basis, cost_basis_source, gross_profit, gross_margin, note
    ) values (
      v_version.id, v_inventory_id, trim(v_item->>'item_name'), coalesce(nullif(v_item->>'item_type',''),'other'),
      coalesce(nullif(v_item->>'fulfilment_source',''),'manual'), v_qty, v_list, v_price, v_discount*v_qty,
      v_cost,
      case when v_inventory_id is not null then 'inventory_average' else coalesce(nullif(v_item->>'cost_basis_source',''),'supplier_on_demand') end,
      v_line_profit, v_margin, nullif(trim(v_item->>'note'),'')
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
$$;

create or replace function public.sales_record_offline_quote_decision(
  p_quotation_id uuid,
  p_decision text,
  p_channel text,
  p_note text default null,
  p_evidence_reference text default null
)
returns public.sales_quotation_acceptances
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote public.sales_quotations;
  v_version public.sales_quotation_versions;
  v_acceptance public.sales_quotation_acceptances;
begin
  if not public.ops_is_admin() then raise exception 'Not authorized'; end if;
  if p_decision not in ('accepted','declined') then raise exception 'Invalid quotation decision'; end if;
  if p_channel not in ('whatsapp','phone','email','in_person','other') then raise exception 'Invalid offline acceptance channel'; end if;

  select * into v_quote from public.sales_quotations where id=p_quotation_id for update;
  if not found or v_quote.current_version_id is null then raise exception 'Published quotation not found'; end if;
  if v_quote.status <> 'published' then raise exception 'Quotation is not awaiting a decision'; end if;
  select * into v_version from public.sales_quotation_versions where id=v_quote.current_version_id for update;
  if not found or v_version.status <> 'published' then raise exception 'Current quotation version is not awaiting a decision'; end if;

  insert into public.sales_quotation_acceptances (
    quotation_version_id, identity_id, decision, acceptance_type, channel,
    note, evidence_reference, actor_user_id, snapshot
  ) values (
    v_version.id, v_quote.identity_id, p_decision, 'offline', p_channel,
    nullif(trim(p_note),''), nullif(trim(p_evidence_reference),''), auth.uid(),
    jsonb_build_object('quotation_code',v_quote.quotation_code,'version',v_version.version,'total_amount',v_version.total_amount)
  ) returning * into v_acceptance;

  update public.sales_quotation_versions set status=p_decision where id=v_version.id;
  update public.sales_quotations set status=p_decision where id=v_quote.id;

  insert into public.sales_events (identity_id, quotation_id, quotation_version_id, event_type, title, note, actor_id)
  values (
    v_quote.identity_id, v_quote.id, v_version.id,
    case when p_decision='accepted' then 'quote.accepted.offline' else 'quote.declined' end,
    case when p_decision='accepted' then 'Quotation accepted offline' else 'Quotation declined' end,
    nullif(trim(p_note),''), auth.uid()
  );

  return v_acceptance;
end;
$$;

create or replace function public.sales_convert_accepted_quotation(
  p_quotation_id uuid,
  p_conversion_type text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote public.sales_quotations;
  v_version public.sales_quotation_versions;
  v_order_id uuid;
  v_item public.sales_quotation_items;
begin
  if not public.ops_is_admin() then raise exception 'Not authorized'; end if;
  if p_conversion_type not in ('direct_sale','order') then raise exception 'Invalid conversion type'; end if;

  select * into v_quote from public.sales_quotations where id=p_quotation_id for update;
  if not found then raise exception 'Quotation not found'; end if;
  if v_quote.status <> 'accepted' or v_quote.converted_order_id is not null then
    raise exception 'Quotation is not available for conversion';
  end if;
  select * into v_version from public.sales_quotation_versions where id=v_quote.current_version_id for update;
  if not found or v_version.status <> 'accepted' then raise exception 'Accepted quotation version not found'; end if;

  insert into public.ops_orders (
    source_type, source_reference, reference_label, identity_id,
    customer_name, customer_phone, customer_email, commercial_state,
    acquisition_source, subtotal, discount_type, discount_amount, discount_percentage,
    total_amount, amount_paid, balance_due, payment_status,
    order_type, sales_staff_user_id, sales_staff_name,
    sales_channel, fulfilment_mode, source_quotation_id, source_quotation_version_id,
    created_by
  ) values (
    'internal', v_quote.quotation_code, 'Converted quotation ' || v_quote.quotation_code, v_quote.identity_id,
    v_quote.customer_name, v_quote.customer_phone, v_quote.customer_email, 'draft',
    'sales_quotation', v_version.subtotal, 'negotiated discount', v_version.discount_amount,
    case when v_version.subtotal>0 then (v_version.discount_amount/v_version.subtotal)*100 else 0 end,
    v_version.total_amount, 0, v_version.total_amount, 'unpaid',
    'other', v_quote.sales_staff_user_id, v_quote.sales_staff_name,
    p_conversion_type,
    case when p_conversion_type='direct_sale' then 'immediate_collection' else 'operations_fulfilment' end,
    v_quote.id, v_version.id, auth.uid()
  ) returning id into v_order_id;

  for v_item in select * from public.sales_quotation_items where quotation_version_id=v_version.id order by created_at,id
  loop
    insert into public.ops_order_items (
      order_id, inventory_item_id, item_name, item_type, quantity,
      unit_price, list_price, line_discount_amount, line_total,
      fulfilment_source, unit_cost_snapshot, cost_basis, cost_basis_source,
      gross_profit, gross_margin, pricing_approval_id, note
    ) values (
      v_order_id, v_item.inventory_item_id, v_item.item_name, v_item.item_type, v_item.quantity,
      v_item.final_unit_price, v_item.list_price, v_item.line_discount_amount,
      v_item.final_unit_price*v_item.quantity, v_item.fulfilment_source,
      v_item.cost_basis, v_item.cost_basis, v_item.cost_basis_source,
      v_item.gross_profit, v_item.gross_margin, v_item.pricing_approval_id, v_item.note
    );
  end loop;

  update public.sales_quotations set status='converted', converted_order_id=v_order_id where id=v_quote.id;

  insert into public.sales_events (identity_id, quotation_id, quotation_version_id, order_id, event_type, title, metadata, actor_id)
  values (v_quote.identity_id, v_quote.id, v_version.id, v_order_id, 'quote.converted', 'Quotation converted', jsonb_build_object('conversion_type',p_conversion_type), auth.uid());

  insert into public.ops_order_events (order_id,event_type,title,to_status,actor_id,metadata)
  values (v_order_id,'order_created','Order created from accepted quotation','new',auth.uid(),jsonb_build_object('quotation_id',v_quote.id,'quotation_version_id',v_version.id,'sales_channel',p_conversion_type));

  return v_order_id;
end;
$$;

grant execute on function public.sales_create_quotation(uuid,text,text,text,uuid,text) to authenticated;
grant execute on function public.sales_publish_quotation_version(uuid,jsonb,text,text,timestamptz) to authenticated;
grant execute on function public.sales_record_offline_quote_decision(uuid,text,text,text,text) to authenticated;
grant execute on function public.sales_convert_accepted_quotation(uuid,text) to authenticated;
