
create or replace function public.ops_update_inventory_commercial_pricing(
  p_inventory_item_id uuid,
  p_standard_selling_price numeric,
  p_salesperson_discount_limit_percent numeric,
  p_minimum_gross_margin_percent numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_policy_id uuid;
begin
  if not public.ops_is_admin() then
    raise exception 'Not authorized';
  end if;
  if p_standard_selling_price is null or p_standard_selling_price <= 0 then
    raise exception 'Standard selling price must be greater than zero';
  end if;
  if p_salesperson_discount_limit_percent < 0 or p_salesperson_discount_limit_percent > 100 then
    raise exception 'Salesperson discount must be between 0 and 100';
  end if;
  if p_minimum_gross_margin_percent < 0 or p_minimum_gross_margin_percent >= 100 then
    raise exception 'Minimum gross margin must be between 0 and 99.99';
  end if;

  update public.ops_inventory_items
  set
    default_selling_price = p_standard_selling_price,
    salesperson_discount_limit_percent = p_salesperson_discount_limit_percent,
    updated_at = now()
  where id = p_inventory_item_id;

  if not found then
    raise exception 'Inventory item not found';
  end if;

  select id into v_policy_id
  from public.sales_margin_policies
  where policy_scope = 'product'
    and inventory_item_id = p_inventory_item_id
    and is_active = true
  order by updated_at desc, created_at desc
  limit 1
  for update;

  if v_policy_id is null then
    insert into public.sales_margin_policies (
      policy_scope,
      inventory_item_id,
      category,
      minimum_margin_percent,
      is_active,
      created_by
    )
    values (
      'product',
      p_inventory_item_id,
      null,
      p_minimum_gross_margin_percent,
      true,
      auth.uid()
    )
    returning id into v_policy_id;
  else
    update public.sales_margin_policies
    set minimum_margin_percent = p_minimum_gross_margin_percent,
        updated_at = now()
    where id = v_policy_id;
  end if;

  return jsonb_build_object(
    'inventory_item_id', p_inventory_item_id,
    'standard_selling_price', p_standard_selling_price,
    'salesperson_discount_limit_percent', p_salesperson_discount_limit_percent,
    'minimum_gross_margin_percent', p_minimum_gross_margin_percent
  );
end;
$$;

revoke all on function public.ops_update_inventory_commercial_pricing(uuid,numeric,numeric,numeric) from public;
grant execute on function public.ops_update_inventory_commercial_pricing(uuid,numeric,numeric,numeric) to authenticated;
