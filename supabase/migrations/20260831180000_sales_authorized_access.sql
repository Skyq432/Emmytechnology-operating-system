-- Configured Sales staff access. Sales reads shared operational truth; writes remain RPC-controlled.

create or replace function public.sales_can_access()
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(select 1 from public.users where id=auth.uid() and role='admin')
    or exists(select 1 from public.sales_authority_profiles where user_id=auth.uid() and is_active=true);
$$;

create or replace function public.sales_is_admin_authority()
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(select 1 from public.users where id=auth.uid() and role='admin')
    or exists(select 1 from public.sales_authority_profiles where user_id=auth.uid() and is_active=true and authority_level='admin');
$$;

create or replace function public.sales_get_current_authority()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_role text;
  v_level text;
  v_limit numeric;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select role into v_role from public.users where id=auth.uid();
  if v_role is null then raise exception 'Not authorized'; end if;
  if v_role='admin' then
    return jsonb_build_object('user_id',auth.uid(),'app_role',v_role,'authority_level','admin','discount_limit_percent',100);
  end if;
  select authority_level,discount_limit_percent into v_level,v_limit
  from public.sales_authority_profiles where user_id=auth.uid() and is_active=true;
  if v_level is null then raise exception 'Not authorized for Sales'; end if;
  return jsonb_build_object('user_id',auth.uid(),'app_role',v_role,'authority_level',v_level,'discount_limit_percent',coalesce(v_limit,0));
end;
$$;

grant execute on function public.sales_can_access() to authenticated;
grant execute on function public.sales_is_admin_authority() to authenticated;
grant execute on function public.sales_get_current_authority() to authenticated;

-- New Sales-domain access policies. Existing Admin policies remain and combine with these.
do $$
declare t text;
begin
  foreach t in array array[
    'sales_authority_profiles','sales_settings','sales_margin_policies','sales_quotations','sales_quotation_versions',
    'sales_quotation_items','sales_discount_approvals','sales_quotation_acceptances','sales_quotation_deliveries',
    'sales_events','sales_documents','sales_document_deliveries','sales_credit_releases','sales_returns','sales_return_items','sales_refunds'
  ] loop
    execute format('drop policy if exists %I_sales_select on public.%I',t,t);
    execute format('create policy %I_sales_select on public.%I for select to authenticated using (public.sales_can_access())',t,t);
  end loop;
end $$;

-- Settings/policy/authority configuration is Admin authority only.
drop policy if exists sales_settings_sales_admin_write on public.sales_settings;
create policy sales_settings_sales_admin_write on public.sales_settings for update to authenticated
using(public.sales_is_admin_authority()) with check(public.sales_is_admin_authority());
drop policy if exists sales_margin_policies_sales_admin_write on public.sales_margin_policies;
create policy sales_margin_policies_sales_admin_write on public.sales_margin_policies for all to authenticated
using(public.sales_is_admin_authority()) with check(public.sales_is_admin_authority());
drop policy if exists sales_authority_profiles_sales_admin_write on public.sales_authority_profiles;
create policy sales_authority_profiles_sales_admin_write on public.sales_authority_profiles for all to authenticated
using(public.sales_is_admin_authority()) with check(public.sales_is_admin_authority());

-- Sales staff need read-only access to shared Operations truth.
do $$
declare t text;
begin
  foreach t in array array[
    'ops_orders','ops_order_items','ops_order_payments','ops_inventory_items','ops_inventory_units','ops_locations',
    'ops_stock_movements','ops_inventory_reservations','ops_repairs','ops_repair_payments','ops_repair_quotes'
  ] loop
    execute format('drop policy if exists %I_sales_select on public.%I',t,t);
    execute format('create policy %I_sales_select on public.%I for select to authenticated using (public.sales_can_access())',t,t);
  end loop;
end $$;

-- Customer Identity is shared, not copied into Sales.
drop policy if exists identities_sales_select on public.identities;
create policy identities_sales_select on public.identities for select to authenticated
using(public.sales_can_access());

-- Sales RPCs use the Sales access function. Physical fulfilment remains behind Operations/Admin RPCs.
-- Replace only the authorization guard in Sales-owned functions by recreating wrappers where needed in later migrations.
