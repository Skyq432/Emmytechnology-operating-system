-- ═══════════════════════════════════════════════════════════════════
-- EmmyTech OS · Finance · Phase 4: balances, statements, cash counts,
--                                   profit and loss, overview position [MERGE]
-- ═══════════════════════════════════════════════════════════════════
-- Runs after phases 2, 3, 5 and 6 because it reads all of their tables.
-- Every money movement in or out of an EmmyTech account comes from ONE
-- function, finance_money_movements(), counted from the Finance start date.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.finance_noon(p_day date)
returns timestamptz language sql immutable as $$
  select public.finance_lagos_day_start(p_day) + interval '12 hours';
$$;

create or replace function public.finance_money_movements()
returns table (account_id uuid, moved_at timestamptz, day date, amount numeric, kind text, label text, source_type text, source_id uuid)
language sql stable security definer set search_path = public as $$
  with st as (
    select public.finance_start_date() as d, public.finance_lagos_day_start(public.finance_start_date()) as ts
  ),
  pay as (
    select case p.source_type when 'order' then 'order_payment' else 'repair_payment' end as stype,
           p.source_payment_id as sid, p.amount, p.payment_method, p.paid_at, p.source_code,
           coalesce(o.branch_location_id, r.branch_location_id) as branch,
           coalesce(o.customer_name, r.customer_name) as customer
    from public.sales_unified_payments p
    left join public.ops_orders o on p.source_type = 'order' and o.id = p.source_id
    left join public.ops_repairs r on p.source_type = 'repair' and r.id = p.source_id
    cross join st
    where not p.is_void and p.paid_at >= st.ts
  ),
  pos_w as (
    select w.id, w.amount_withdrawn as amount, coalesce(w.date, public.finance_lagos_date(w.created_at)) as d, w.client_name, u.default_location_id as branch
    from public.referral_tracker_pos_withdrawals w left join public.users u on u.id = w.created_by
  ),
  pos_d as (
    select x.id, x.amount, coalesce(x.date, public.finance_lagos_date(x.created_at)) as d, x.client_name, u.default_location_id as branch
    from public.referral_tracker_pos_deposits x left join public.users u on u.id = x.created_by
  )
  -- customer payments (orders, direct sales, repairs)
  select coalesce(m.account_id, public.finance_rule_account(pay.branch, pay.payment_method)), pay.paid_at, public.finance_lagos_date(pay.paid_at),
         pay.amount, 'payment', 'Customer payment · ' || pay.source_code || coalesce(' · ' || pay.customer, ''), pay.stype, pay.sid
  from pay left join public.finance_payment_accounts m on m.source_type = pay.stype and m.source_id = pay.sid
  union all
  -- refunds paid back
  select coalesce(m.account_id, public.finance_rule_account(o.branch_location_id, f.payment_method)), f.refunded_at, public.finance_lagos_date(f.refunded_at),
         -f.amount, 'refund', 'Refund · ' || coalesce(o.order_code, f.refund_code), 'refund', f.id
  from public.sales_refunds f
  left join public.ops_orders o on o.id = f.order_id
  left join public.finance_payment_accounts m on m.source_type = 'refund' and m.source_id = f.id
  cross join st
  where f.status = 'recorded' and f.refunded_at >= st.ts
  union all
  -- approved expenses (incl. approved petty cash)
  select e.account_id, public.finance_noon(e.expense_date), e.expense_date, -e.amount, 'expense',
         'Expense · ' || c.name || ' · ' || e.payee, 'expense', e.id
  from public.finance_expenses e join public.finance_expense_categories c on c.id = e.category_id cross join st
  where e.status = 'approved' and e.expense_date >= st.d
  union all
  -- supplier payments
  select p.account_id, public.finance_noon(p.paid_date), p.paid_date, -p.amount, 'supplier',
         'Supplier · ' || s.name || ' · ' || b.bill_ref, 'supplier_payment', p.id
  from public.finance_supplier_payments p
  join public.finance_supplier_bills b on b.id = p.bill_id
  join public.ops_suppliers s on s.id = b.supplier_id
  cross join st
  where not p.is_void and p.paid_date >= st.d
  union all
  -- transfers between EmmyTech accounts (both sides)
  select t.from_account_id, public.finance_noon(t.transfer_date), t.transfer_date, -t.amount, 'transfer',
         'Transfer to ' || a.name || coalesce(' · ' || t.note, ''), 'transfer', t.id
  from public.finance_transfers t join public.finance_accounts a on a.id = t.to_account_id cross join st
  where not t.is_void and t.transfer_date >= st.d
  union all
  select t.to_account_id, public.finance_noon(t.transfer_date), t.transfer_date, t.amount, 'transfer',
         'Transfer from ' || a.name || coalesce(' · ' || t.note, ''), 'transfer', t.id
  from public.finance_transfers t join public.finance_accounts a on a.id = t.from_account_id cross join st
  where not t.is_void and t.transfer_date >= st.d
  union all
  -- Free POS: withdrawal = card into the POS, cash out of the drawer
  select coalesce(m.account_id, public.finance_rule_account(w.branch, 'pos')), public.finance_noon(w.d), w.d, w.amount, 'pos',
         'Free POS withdrawal · ' || coalesce(w.client_name, ''), 'pos_withdrawal_in', w.id
  from pos_w w left join public.finance_payment_accounts m on m.source_type = 'pos_withdrawal_in' and m.source_id = w.id cross join st
  where w.d >= st.d
  union all
  select coalesce(m.account_id, public.finance_rule_account(w.branch, 'cash')), public.finance_noon(w.d), w.d, -w.amount, 'pos',
         'Free POS withdrawal · ' || coalesce(w.client_name, ''), 'pos_withdrawal_out', w.id
  from pos_w w left join public.finance_payment_accounts m on m.source_type = 'pos_withdrawal_out' and m.source_id = w.id cross join st
  where w.d >= st.d
  union all
  -- Free POS: deposit = cash into the drawer, transfer out of the bank
  select coalesce(m.account_id, public.finance_rule_account(x.branch, 'cash')), public.finance_noon(x.d), x.d, x.amount, 'pos',
         'Free POS deposit · ' || coalesce(x.client_name, ''), 'pos_deposit_in', x.id
  from pos_d x left join public.finance_payment_accounts m on m.source_type = 'pos_deposit_in' and m.source_id = x.id cross join st
  where x.d >= st.d
  union all
  select coalesce(m.account_id, public.finance_rule_account(x.branch, 'bank_transfer')), public.finance_noon(x.d), x.d, -x.amount, 'pos',
         'Free POS deposit · ' || coalesce(x.client_name, ''), 'pos_deposit_out', x.id
  from pos_d x left join public.finance_payment_accounts m on m.source_type = 'pos_deposit_out' and m.source_id = x.id cross join st
  where x.d >= st.d
  union all
  -- salary advances paid out
  select a.account_id, public.finance_noon(a.advance_date), a.advance_date, -a.amount, 'advance',
         'Salary advance · ' || u.name, 'advance', a.id
  from public.finance_salary_advances a join public.users u on u.id = a.user_id cross join st
  where a.advance_date >= st.d
  union all
  -- salaries paid (take-home total of the run)
  select r.account_id, public.finance_noon(r.paid_date), r.paid_date,
         -(select coalesce(sum(l.net), 0) from public.finance_pay_run_lines l where l.run_id = r.id), 'payroll',
         'Salaries · ' || to_char(r.run_month, 'FMMonth YYYY'), 'pay_run', r.id
  from public.finance_pay_runs r cross join st
  where r.status = 'paid' and r.paid_date >= st.d;
$$;

create or replace function public.finance_account_balance(p_account_id uuid, p_up_to date default null)
returns numeric language sql stable security definer set search_path = public as $$
  select a.opening_balance + coalesce((select sum(m.amount) from public.finance_money_movements() m
                                       where m.account_id = a.id and (p_up_to is null or m.day <= p_up_to)), 0)
  from public.finance_accounts a where a.id = p_account_id;
$$;

-- ── Accounts page ───────────────────────────────────────────────────
create or replace function public.finance_accounts_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.finance_can_view() then raise exception 'Not authorized' using errcode = '42501'; end if;
  with mv as (select * from public.finance_money_movements()),
  bal as (
    select a.*, l.name as branch_name, a.opening_balance + coalesce((select sum(m.amount) from mv m where m.account_id = a.id), 0) as balance
    from public.finance_accounts a left join public.ops_locations l on l.id = a.branch_location_id
  ),
  unassigned as (select * from mv where mv.account_id is null)
  select jsonb_build_object(
    'start_date', public.finance_start_date(),
    'total', (select coalesce(sum(balance), 0) from bal),
    'accounts', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'type', b.account_type, 'provider', b.provider,
        'last4', b.last4, 'branch_id', b.branch_location_id, 'branch_name', b.branch_name, 'opening', b.opening_balance,
        'balance', b.balance, 'active', b.is_active) order by b.is_active desc, b.account_type, b.name) from bal b), '[]'::jsonb),
    'unassigned_total', (select coalesce(sum(amount), 0) from unassigned),
    'unassigned', coalesce((select jsonb_agg(jsonb_build_object('source_type', u.source_type, 'source_id', u.source_id, 'day', u.day,
        'moved_at', u.moved_at, 'label', u.label, 'amount', u.amount) order by u.moved_at desc) from unassigned u), '[]'::jsonb),
    'rules', coalesce((select jsonb_agg(jsonb_build_object('branch_id', r.branch_location_id, 'branch_name', l.name, 'method', r.payment_method,
        'account_id', r.account_id, 'account_name', a.name) order by l.name nulls first, r.payment_method)
        from public.finance_account_rules r join public.finance_accounts a on a.id = r.account_id
        left join public.ops_locations l on l.id = r.branch_location_id), '[]'::jsonb)
  ) into v;
  return v;
end;
$$;

create or replace function public.finance_account_statement(p_account_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_opening numeric;
  v jsonb;
begin
  if not public.finance_can_view() then raise exception 'Not authorized' using errcode = '42501'; end if;
  select a.opening_balance into v_opening from public.finance_accounts a where a.id = p_account_id;
  if v_opening is null then raise exception 'Account not found'; end if;
  with mv as (
    select m.*, v_opening + sum(m.amount) over (order by m.moved_at, m.source_type, m.source_id rows unbounded preceding) as balance,
           exists (select 1 from public.finance_statement_matches s
                   where s.source_type = m.source_type and s.source_id = m.source_id and s.account_id = p_account_id) as matched
    from public.finance_money_movements() m where m.account_id = p_account_id
  )
  select jsonb_build_object(
    'account_id', p_account_id, 'opening', v_opening, 'start_date', public.finance_start_date(),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('day', mv.day, 'moved_at', mv.moved_at, 'amount', mv.amount, 'label', mv.label,
        'kind', mv.kind, 'source_type', mv.source_type, 'source_id', mv.source_id, 'balance', mv.balance, 'matched', mv.matched)
        order by mv.moved_at desc, mv.source_type desc, mv.source_id desc) from mv), '[]'::jsonb)
  ) into v;
  return v;
end;
$$;

-- ── Daily cash counts ───────────────────────────────────────────────
create or replace function public.finance_cash_counts(p_account_id uuid default null, p_day date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.finance_can_view() then raise exception 'Not authorized' using errcode = '42501'; end if;
  return jsonb_build_object(
    'expected', case when p_account_id is null then null
                     else public.finance_account_balance(p_account_id, coalesce(p_day, public.finance_today())) end,
    'drawers', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name) order by a.name)
                         from public.finance_accounts a where a.account_type = 'cash' and a.is_active), '[]'::jsonb),
    'counts', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'date', c.count_date, 'account_name', a.name, 'counted', c.counted,
                  'expected', c.expected, 'difference', c.counted - c.expected,
                  'expected_now', public.finance_account_balance(c.account_id, c.count_date),
                  'reason', c.reason, 'counted_by', u.name) order by c.count_date desc, a.name)
                from public.finance_cash_counts c join public.finance_accounts a on a.id = c.account_id
                left join public.users u on u.id = c.counted_by), '[]'::jsonb)
  );
end;
$$;

create or replace function public.finance_save_cash_count(p_account_id uuid, p_date date, p_counted numeric, p_reason text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_expected numeric;
begin
  if not public.finance_can_manage() then raise exception 'Not authorized' using errcode = '42501'; end if;
  if not exists (select 1 from public.finance_accounts a where a.id = p_account_id and a.account_type = 'cash') then raise exception 'Choose a cash drawer'; end if;
  if p_date is null then raise exception 'Enter the date'; end if;
  if p_counted is null or p_counted < 0 then raise exception 'Enter the cash counted'; end if;
  v_expected := public.finance_account_balance(p_account_id, p_date);
  if p_counted <> v_expected and nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'The count is % off. Add a reason.', to_char(p_counted - v_expected, 'FMS999,999,999,990');
  end if;
  insert into public.finance_cash_counts (account_id, count_date, counted, expected, reason, counted_by)
  values (p_account_id, p_date, p_counted, v_expected, nullif(btrim(coalesce(p_reason, '')), ''), auth.uid())
  on conflict (account_id, count_date) do update
    set counted = excluded.counted, expected = excluded.expected, reason = excluded.reason, counted_by = excluded.counted_by, created_at = now();
  return jsonb_build_object('expected', v_expected, 'difference', p_counted - v_expected);
end;
$$;

-- ── Profit and loss for one month, by branch ────────────────────────
-- Raw lines only; revenue, gross profit and net profit are added up by the app
-- (src/lib/finance/pnl.ts) so the same rule is used on screen and in the CSV.
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

-- ── Overview: money out and position (company-wide) ─────────────────
create or replace function public.finance_position(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_pay jsonb;
  v_budget jsonb;
  v jsonb;
begin
  if not public.finance_can_view() then raise exception 'Not authorized' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Invalid period'; end if;
  v_pay := public.finance_payables(null);
  v_budget := public.finance_budgets(public.finance_today());
  with mv as (select * from public.finance_money_movements())
  select jsonb_build_object(
    'money_out', jsonb_build_object(
      'expenses', (select coalesce(sum(e.amount), 0) from public.finance_expenses e where e.status = 'approved' and e.expense_date between p_from and p_to),
      'suppliers', (select coalesce(sum(p.amount), 0) from public.finance_supplier_payments p where not p.is_void and p.paid_date between p_from and p_to),
      'salaries', (select coalesce(sum(l.net), 0) from public.finance_pay_runs r join public.finance_pay_run_lines l on l.run_id = r.id
                   where r.status = 'paid' and r.paid_date between p_from and p_to)),
    'accounts_total', (select coalesce(sum(a.opening_balance), 0) from public.finance_accounts a)
                    + (select coalesce(sum(mv.amount), 0) from mv where mv.account_id is not null),
    'account_count', (select count(*) from public.finance_accounts a where a.is_active),
    'unassigned', jsonb_build_object('amount', (select coalesce(sum(mv.amount), 0) from mv where mv.account_id is null),
                                     'count', (select count(*) from mv where mv.account_id is null)),
    'payables', jsonb_build_object('owed', v_pay -> 'owed', 'overdue', v_pay -> 'overdue', 'other', v_pay -> 'other_total'),
    'budget', jsonb_build_object('month', v_budget -> 'month', 'budgeted', v_budget -> 'budgeted', 'spent', v_budget -> 'spent', 'over', v_budget -> 'over'),
    'pending_petty', jsonb_build_object('amount', (select coalesce(sum(e.amount), 0) from public.finance_expenses e where e.status = 'pending'),
                                        'count', (select count(*) from public.finance_expenses e where e.status = 'pending'))
  ) into v;
  return v || jsonb_build_object('money_out_total',
    (v #>> '{money_out,expenses}')::numeric + (v #>> '{money_out,suppliers}')::numeric + (v #>> '{money_out,salaries}')::numeric);
end;
$$;

-- ── Money In, now with "Received into" ──────────────────────────────
create or replace function public.finance_money_in(
  p_from date, p_to date, p_branch_id uuid default null, p_no_branch boolean default false,
  p_method text default null, p_source text default null, p_search text default null,
  p_include_void boolean default false, p_limit integer default 50, p_offset integer default 0
)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_start timestamptz;
  v_end timestamptz;
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_result jsonb;
begin
  if not public.finance_can_view() then raise exception 'Not authorized' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Invalid period'; end if;
  if p_to - p_from > 1100 then raise exception 'Period is too long (maximum about 3 years)'; end if;
  if p_method is not null and p_method not in ('bank_transfer','pos','cash','split','other') then raise exception 'Invalid payment method'; end if;
  if p_source is not null and p_source not in ('order','direct_sale','repair') then raise exception 'Invalid source'; end if;
  if p_limit is null or p_limit < 1 or p_limit > 5000 then raise exception 'Invalid page size'; end if;
  if p_offset is null or p_offset < 0 then raise exception 'Invalid page offset'; end if;
  v_start := public.finance_lagos_day_start(p_from);
  v_end := public.finance_lagos_day_start(p_to + 1);

  with filtered as (
    select pl.* from public.finance_payment_lines(v_start, v_end) pl
    where (p_branch_id is null or pl.branch_id = p_branch_id)
      and (not coalesce(p_no_branch, false) or pl.branch_id is null)
      and (p_method is null or pl.payment_method = p_method)
      and (p_source is null or pl.sales_channel = p_source)
      and (coalesce(p_include_void, false) or not pl.is_void)
      and (v_search is null or pl.source_code ilike '%' || v_search || '%' or pl.customer_name ilike '%' || v_search || '%' or pl.reference ilike '%' || v_search || '%')
  ),
  page as (
    select f.*, coalesce(m.account_id, public.finance_rule_account(f.branch_id, f.payment_method)) as account_id
    from filtered f
    left join public.finance_payment_accounts m
      on m.source_type = case f.source_type when 'order' then 'order_payment' else 'repair_payment' end and m.source_id = f.payment_id
    order by f.paid_at desc, f.payment_id
    limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'total_count', (select count(*) from filtered),
    'total_amount', (select coalesce(sum(amount), 0) from filtered where not filtered.is_void),
    'void_count', (select count(*) from filtered where filtered.is_void),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
      'payment_id', page.payment_id, 'source_type', page.source_type, 'sales_channel', page.sales_channel, 'source_id', page.source_id,
      'source_code', page.source_code, 'customer_name', page.customer_name, 'branch_id', page.branch_id, 'branch_name', page.branch_name,
      'payment_method', page.payment_method, 'reference', page.reference, 'amount', page.amount, 'paid_at', page.paid_at,
      'is_void', page.is_void, 'recorded_by_name', page.recorded_by_name, 'account_id', page.account_id,
      'account_name', (select a.name from public.finance_accounts a where a.id = page.account_id))
      order by page.paid_at desc, page.payment_id) from page), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['public.finance_money_movements()', 'public.finance_account_balance(uuid, date)'] loop
    execute 'revoke all on function ' || f || ' from public, anon, authenticated';
  end loop;
  foreach f in array array['public.finance_noon(date)', 'public.finance_accounts_overview()', 'public.finance_account_statement(uuid)',
    'public.finance_cash_counts(uuid, date)', 'public.finance_save_cash_count(uuid, date, numeric, text)',
    'public.finance_profit_and_loss(date)', 'public.finance_position(date, date)',
    'public.finance_money_in(date, date, uuid, boolean, text, text, text, boolean, integer, integer)'] loop
    execute 'revoke all on function ' || f || ' from public, anon';
    execute 'grant execute on function ' || f || ' to authenticated';
  end loop;
end
$$;
