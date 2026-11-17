-- EmmyTech OS · Finance · ROLLBACK of "Real product cost" only
-- (migration 20261117090000_finance_real_product_costs.sql).
-- Removes the cost list, sale costs and supplier bill item lines, and puts back
-- the previous finance_payables, finance_add_supplier_bill and
-- finance_profit_and_loss. Supplier bills themselves are kept (their totals stay).
-- Run only if this change has to be taken out again.

drop function if exists public.finance_add_supplier_bill(uuid, text, text, date, date, jsonb, text);
drop function if exists public.finance_set_inventory_real_cost(uuid, numeric, date);
drop function if exists public.finance_inventory_real_cost(uuid);
drop function if exists public.finance_join_cost_product(uuid, uuid, text);
drop function if exists public.finance_set_sale_cost(uuid, numeric, text);
drop function if exists public.finance_set_product_cost(uuid, text, numeric, date, text);
drop function if exists public.finance_product_costs(date, date);
drop function if exists public.finance_cost_status();
drop function if exists public.finance_sold_lines(date, date);
drop function if exists public.finance_list_cost(uuid, date);
drop function if exists public.finance_cost_product_for(text, uuid);
drop function if exists public.finance_cost_key(text);
drop function if exists public.finance_can_see_cost();

drop table if exists public.finance_sale_costs;
drop table if exists public.finance_cost_prices;
drop table if exists public.finance_supplier_bill_lines;
drop table if exists public.finance_cost_names;
drop table if exists public.finance_cost_products;

-- Previous versions (copied from the phase 3 and phase 4 migrations).
create or replace function public.finance_payables(p_today date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := coalesce(p_today, public.finance_today());
  v jsonb;
begin
  if not public.finance_can_view() then raise exception 'Not authorized' using errcode = '42501'; end if;
  with bills as (
    select b.*, s.name as supplier_name,
           coalesce((select sum(p.amount) from public.finance_supplier_payments p where p.bill_id = b.id and not p.is_void), 0) as paid
    from public.finance_supplier_bills b join public.ops_suppliers s on s.id = b.supplier_id
    where not b.is_void
  ), scored as (
    select b.*, greatest(b.amount - b.paid, 0) as left_to_pay,
           case when b.amount - b.paid <= 0 then 'paid'
                when b.due_date < v_today then 'overdue'
                when b.paid > 0 then 'part_paid' else 'unpaid' end as status,
           case when b.amount - b.paid > 0 then greatest(v_today - b.due_date, 0) else 0 end as days_late
    from bills b
  )
  select jsonb_build_object(
    'today', v_today,
    'owed', (select coalesce(sum(left_to_pay), 0) from scored),
    'overdue', (select coalesce(sum(left_to_pay), 0) from scored where status = 'overdue'),
    'open_count', (select count(*) from scored where left_to_pay > 0),
    'bills', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'supplier_id', s.supplier_id, 'supplier_name', s.supplier_name, 'ref', s.bill_ref, 'bill_date', s.bill_date,
        'due_date', s.due_date, 'amount', s.amount, 'paid', s.paid, 'left', s.left_to_pay, 'status', s.status, 'days_late', s.days_late, 'note', s.note)
        order by (s.left_to_pay > 0) desc, s.due_date) from scored s), '[]'::jsonb),
    'by_supplier', coalesce((select jsonb_agg(jsonb_build_object('supplier_name', g.supplier_name, 'owed', g.owed, 'open', g.open, 'overdue', g.overdue) order by g.owed desc)
        from (select supplier_name, sum(left_to_pay) as owed, count(*) filter (where left_to_pay > 0) as open, bool_or(status = 'overdue') as overdue
              from scored group by supplier_name having sum(left_to_pay) > 0) g), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'date', p.paid_date, 'amount', p.amount, 'supplier_name', s.name, 'ref', b.bill_ref,
        'account_name', (select a.name from public.finance_accounts a where a.id = p.account_id))
        order by p.paid_date desc, p.created_at desc)
        from public.finance_supplier_payments p join public.finance_supplier_bills b on b.id = p.bill_id
        join public.ops_suppliers s on s.id = b.supplier_id where not p.is_void), '[]'::jsonb),
    'suppliers', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name)
        from public.ops_suppliers s where s.is_active), '[]'::jsonb),
    -- Owed elsewhere and paid out from Marketing; shown so the full picture is here.
    'other', jsonb_build_object(
      'ambassador_payouts', jsonb_build_object('amount', (select coalesce(sum(x.amount), 0) from public.payouts x where x.status = 'pending'),
                                               'count', (select count(*) from public.payouts x where x.status = 'pending')),
      'commissions_earned', jsonb_build_object('amount', (select coalesce(sum(o.commission_amount), 0) from public.ops_orders o where o.commission_status = 'earned' and o.deletion_status <> 'deleted'),
                                               'count', (select count(*) from public.ops_orders o where o.commission_status = 'earned' and o.deletion_status <> 'deleted')),
      'spin_cashouts', jsonb_build_object('amount', (select coalesce(sum(x.amount), 0) from public.spin_cashout_requests x where x.status = 'pending'),
                                          'count', (select count(*) from public.spin_cashout_requests x where x.status = 'pending')))
  ) into v;
  return v || jsonb_build_object('other_total',
    (v #>> '{other,ambassador_payouts,amount}')::numeric + (v #>> '{other,commissions_earned,amount}')::numeric + (v #>> '{other,spin_cashouts,amount}')::numeric);
end;
$$;


create or replace function public.finance_add_supplier_bill(
  p_supplier_id uuid, p_new_supplier_name text, p_ref text, p_bill_date date, p_due_date date, p_amount numeric, p_note text default null
)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_supplier uuid := p_supplier_id;
  v_id uuid;
begin
  if not public.finance_can_manage() then raise exception 'Not authorized' using errcode = '42501'; end if;
  if nullif(btrim(coalesce(p_new_supplier_name, '')), '') is not null then
    select s.id into v_supplier from public.ops_suppliers s where lower(s.name) = lower(btrim(p_new_supplier_name));
    if v_supplier is null then
      insert into public.ops_suppliers (name, created_by) values (btrim(p_new_supplier_name), auth.uid()) returning id into v_supplier;
    end if;
  end if;
  if v_supplier is null or not exists (select 1 from public.ops_suppliers s where s.id = v_supplier) then raise exception 'Choose the supplier'; end if;
  if nullif(btrim(p_ref), '') is null then raise exception 'Enter the invoice number'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Enter an amount'; end if;
  if p_bill_date is null or p_due_date is null then raise exception 'Enter the bill date and the pay-by date'; end if;
  if p_due_date < p_bill_date then raise exception 'The pay-by date is before the bill date'; end if;
  if exists (select 1 from public.finance_supplier_bills b where b.supplier_id = v_supplier and lower(b.bill_ref) = lower(btrim(p_ref)) and not b.is_void) then
    raise exception 'This supplier already has a bill with that invoice number';
  end if;
  insert into public.finance_supplier_bills (supplier_id, bill_ref, bill_date, due_date, amount, note, created_by)
  values (v_supplier, btrim(p_ref), p_bill_date, p_due_date, p_amount, nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'supplier_id', v_supplier);
end;
$$;


create or replace function public.finance_profit_and_loss(p_month date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_from date := date_trunc('month', coalesce(p_month, public.finance_today()))::date;
  v_to date := (date_trunc('month', coalesce(p_month, public.finance_today())) + interval '1 month - 1 day')::date;
  v_start timestamptz;
  v_end timestamptz;
  v jsonb;
begin
  if not public.finance_can_view() then raise exception 'Not authorized' using errcode = '42501'; end if;
  v_start := public.finance_lagos_day_start(v_from);
  v_end := public.finance_lagos_day_start(v_to + 1);
  with cols as (
    select l.id::text as key, l.name, 1 as ord from public.ops_locations l where l.is_active and l.location_type in ('store','repair','warehouse')
    union all select 'company', 'Company-wide', 2
  ), sold as (
    select o.* from public.ops_orders o
    where o.commercial_state = 'confirmed' and o.deletion_status <> 'deleted' and o.confirmed_at >= v_start and o.confirmed_at < v_end
  ), fixed as (
    select r.* from public.ops_repairs r
    where r.status in ('ready_collection','collected')
      and coalesce(r.completed_at, r.collected_at, r.received_at) >= v_start and coalesce(r.completed_at, r.collected_at, r.received_at) < v_end
  ), raw as (
    select 'sales'::text as line, 'Sales confirmed'::text as label, s.branch_location_id::text as key, s.total_amount as amount from sold s
    union all
    select 'cogs', 'Cost of goods and repair parts', s.branch_location_id::text,
           coalesce((select sum(i.cost_basis) from public.ops_order_items i where i.order_id = s.id), 0) from sold s
    union all
    select 'repairs', 'Repairs finished', f.branch_location_id::text, f.amount_charged from fixed f
    union all
    select 'cogs', 'Cost of goods and repair parts', f.branch_location_id::text, f.parts_cost + f.labour_cost from fixed f
    union all
    select 'refunds', 'Refunds', o.branch_location_id::text, r.amount
    from public.sales_refunds r left join public.ops_orders o on o.id = r.order_id
    where r.status = 'recorded' and r.refunded_at >= v_start and r.refunded_at < v_end
    union all
    select 'expense', c.name, e.branch_location_id::text, e.amount
    from public.finance_expenses e join public.finance_expense_categories c on c.id = e.category_id
    where e.status = 'approved' and e.expense_date between v_from and v_to
    union all
    select 'salaries', 'Salaries', u.default_location_id::text, l.gross
    from public.finance_pay_runs pr join public.finance_pay_run_lines l on l.run_id = pr.id join public.users u on u.id = l.user_id
    where pr.run_month = v_from and pr.status in ('approved','paid')
  ), keyed as (
    select r.line, r.label, case when r.key in (select cols.key from cols) then r.key else 'company' end as key, r.amount from raw r
  ), summed as (
    select k.line, k.label, k.key, sum(k.amount) as amount from keyed k group by k.line, k.label, k.key
  )
  select jsonb_build_object(
    'month', v_from,
    'columns', (select jsonb_agg(jsonb_build_object('key', c.key, 'name', c.name) order by c.ord, c.name) from cols c),
    'lines', coalesce((select jsonb_agg(jsonb_build_object('line', g.line, 'label', g.label, 'values', g.vals) order by g.line, g.label)
                       from (select s.line, s.label, jsonb_object_agg(s.key, s.amount) as vals from summed s group by s.line, s.label) g), '[]'::jsonb),
    'payroll_status', (select pr.status from public.finance_pay_runs pr where pr.run_month = v_from)
  ) into v;
  return v;
end;
$$;


revoke all on function public.finance_add_supplier_bill(uuid, text, text, date, date, numeric, text) from public, anon;
grant execute on function public.finance_add_supplier_bill(uuid, text, text, date, date, numeric, text) to authenticated;
