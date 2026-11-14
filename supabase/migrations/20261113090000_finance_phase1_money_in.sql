-- ═══════════════════════════════════════════════════════════════════
-- EmmyTech OS · Finance · Phase 1: Money In overview          [MERGE]
-- ═══════════════════════════════════════════════════════════════════
-- READ-ONLY. Creates new finance_* functions only. It does not create,
-- alter or write to any existing table.
--
-- Finance reads the existing Sales evidence, reusing the same definitions
-- the Sales module uses (one source of truth):
--   • public.sales_unified_payments  → what counts as a customer payment
--   • public.sales_revenue_balances  → what customers still owe
--   • public.sales_refunds, ops_orders, ops_repairs, ops_locations, users
--   • referral_tracker_pos_*         → Free POS service (NOT income)
--
-- Days are Lagos days (WAT, UTC+1; Nigeria has no daylight saving).
-- Access: super_admin, admin, growth_lead, sales_analyst (view only).
-- ═══════════════════════════════════════════════════════════════════

-- ── Time helpers (Lagos = UTC+1, fixed) ─────────────────────────────
create or replace function public.finance_lagos_day_start(p_day date)
returns timestamptz
language sql
immutable
as $$
  select ((p_day::timestamp - interval '1 hour') at time zone 'UTC');
$$;

create or replace function public.finance_lagos_date(p_ts timestamptz)
returns date
language sql
immutable
as $$
  select ((p_ts at time zone 'UTC') + interval '1 hour')::date;
$$;

-- ── Access ──────────────────────────────────────────────────────────
create or replace function public.finance_viewer_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select u.role from public.users u where u.id = auth.uid();
$$;

create or replace function public.finance_can_view()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.finance_viewer_role() in ('super_admin','admin','growth_lead','sales_analyst'), false);
$$;

-- ── Internal: every customer payment line in a time window ─────────
-- Built on sales_unified_payments, so "what is a payment" (including the
-- rule that payments on deleted orders do not count) stays defined in
-- one place. Adds branch, sales channel, customer and staff name.
create or replace function public.finance_payment_lines(p_start timestamptz, p_end timestamptz)
returns table (
  source_type text,
  sales_channel text,
  payment_id uuid,
  source_id uuid,
  source_code text,
  customer_name text,
  branch_id uuid,
  branch_name text,
  payment_method text,
  reference text,
  amount numeric,
  paid_at timestamptz,
  is_void boolean,
  recorded_by_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.source_type,
    case when p.source_type = 'repair' then 'repair' else coalesce(o.sales_channel, 'order') end,
    p.source_payment_id,
    p.source_id,
    p.source_code,
    coalesce(o.customer_name, r.customer_name),
    l.id,
    l.name,
    p.payment_method,
    p.reference,
    p.amount::numeric,
    p.paid_at,
    p.is_void,
    u.name
  from public.sales_unified_payments p
  left join public.ops_orders o on p.source_type = 'order' and o.id = p.source_id
  left join public.ops_repairs r on p.source_type = 'repair' and r.id = p.source_id
  left join public.ops_locations l on l.id = coalesce(o.branch_location_id, r.branch_location_id)
  left join public.users u on u.id = p.recorded_by
  where p.paid_at >= p_start
    and p.paid_at < p_end;
$$;

-- ── Branch list for filters ─────────────────────────────────────────
create or replace function public.finance_branches()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.finance_can_view() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object('id', l.id, 'code', l.code, 'name', l.name) order by l.name)
    from public.ops_locations l
    where l.is_active
      and l.location_type in ('store', 'repair', 'warehouse')
  ), '[]'::jsonb);
end;
$$;

-- ── Overview ────────────────────────────────────────────────────────
create or replace function public.finance_overview(
  p_from date,
  p_to date,
  p_branch_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start timestamptz;
  v_end timestamptz;
  v_result jsonb;
begin
  if not public.finance_can_view() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Invalid period';
  end if;
  if p_to - p_from > 1100 then
    raise exception 'Period is too long (maximum about 3 years)';
  end if;

  v_start := public.finance_lagos_day_start(p_from);
  v_end := public.finance_lagos_day_start(p_to + 1);

  with lines as (
    select pl.*
    from public.finance_payment_lines(v_start, v_end) pl
    where p_branch_id is null or pl.branch_id = p_branch_id
  ),
  live as (
    select * from lines where not lines.is_void
  ),
  refunds as (
    select f.amount
    from public.sales_refunds f
    left join public.ops_orders o on o.id = f.order_id
    where f.status = 'recorded'
      and f.refunded_at >= v_start and f.refunded_at < v_end
      and (p_branch_id is null or o.branch_location_id = p_branch_id)
  ),
  confirmed_orders as (
    select o.total_amount, o.cash_off_amount
    from public.ops_orders o
    where o.commercial_state = 'confirmed'
      and o.deletion_status <> 'deleted'
      and o.confirmed_at >= v_start and o.confirmed_at < v_end
      and (p_branch_id is null or o.branch_location_id = p_branch_id)
  ),
  repair_cash_off as (
    select r.cash_off_amount
    from public.ops_repairs r
    where r.status <> 'cancelled'
      and r.received_at >= v_start and r.received_at < v_end
      and (p_branch_id is null or r.branch_location_id = p_branch_id)
  ),
  -- Outstanding is a "right now" figure, not a period figure.
  -- Uses the Sales view, but leaves out orders that were deleted.
  owed as (
    select b.outstanding
    from public.sales_revenue_balances b
    left join public.ops_orders o on b.source_type = 'order' and o.id = b.source_id
    left join public.ops_repairs r on b.source_type = 'repair' and r.id = b.source_id
    where b.outstanding > 0
      and coalesce(o.deletion_status, 'none') <> 'deleted'
      and (p_branch_id is null or coalesce(o.branch_location_id, r.branch_location_id) = p_branch_id)
  ),
  pos_withdrawals as (
    select w.amount_withdrawn as amount
    from public.referral_tracker_pos_withdrawals w
    left join public.users u on u.id = w.created_by
    where coalesce(w.date, public.finance_lagos_date(w.created_at)) between p_from and p_to
      and (p_branch_id is null or u.default_location_id = p_branch_id)
  ),
  pos_deposits as (
    select d.amount
    from public.referral_tracker_pos_deposits d
    left join public.users u on u.id = d.created_by
    where coalesce(d.date, public.finance_lagos_date(d.created_at)) between p_from and p_to
      and (p_branch_id is null or u.default_location_id = p_branch_id)
  )
  select jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to, 'branch_id', p_branch_id),
    'money_in', jsonb_build_object(
      'amount', (select coalesce(sum(amount), 0) from live),
      'count', (select count(*) from live)
    ),
    'refunds', jsonb_build_object(
      'amount', (select coalesce(sum(amount), 0) from refunds),
      'count', (select count(*) from refunds)
    ),
    'net_cash_in', (select coalesce(sum(amount), 0) from live) - (select coalesce(sum(amount), 0) from refunds),
    'voided', jsonb_build_object(
      'amount', (select coalesce(sum(amount), 0) from lines where lines.is_void),
      'count', (select count(*) from lines where lines.is_void)
    ),
    'by_method', coalesce((
      select jsonb_agg(jsonb_build_object('method', m.payment_method, 'amount', m.amount, 'count', m.cnt) order by m.amount desc, m.payment_method)
      from (select payment_method, sum(amount) as amount, count(*) as cnt from live group by payment_method) m
    ), '[]'::jsonb),
    'by_source', coalesce((
      select jsonb_agg(jsonb_build_object('source', s.sales_channel, 'amount', s.amount, 'count', s.cnt) order by s.amount desc, s.sales_channel)
      from (select sales_channel, sum(amount) as amount, count(*) as cnt from live group by sales_channel) s
    ), '[]'::jsonb),
    'by_branch', coalesce((
      select jsonb_agg(jsonb_build_object('branch_id', b.branch_id, 'branch_name', b.branch_name, 'amount', b.amount, 'count', b.cnt) order by b.amount desc, b.branch_name)
      from (select branch_id, branch_name, sum(amount) as amount, count(*) as cnt from live group by branch_id, branch_name) b
    ), '[]'::jsonb),
    'by_day', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day, 'amount', d.amount, 'count', d.cnt) order by d.day)
      from (select public.finance_lagos_date(paid_at) as day, sum(amount) as amount, count(*) as cnt from live group by 1) d
    ), '[]'::jsonb),
    'sales_confirmed', jsonb_build_object(
      'amount', (select coalesce(sum(total_amount), 0) from confirmed_orders),
      'count', (select count(*) from confirmed_orders)
    ),
    'cash_off_used', (select coalesce(sum(cash_off_amount), 0) from confirmed_orders)
                   + (select coalesce(sum(cash_off_amount), 0) from repair_cash_off),
    'owed_now', jsonb_build_object(
      'amount', (select coalesce(sum(outstanding), 0) from owed),
      'count', (select count(*) from owed)
    ),
    'free_pos', jsonb_build_object(
      'withdrawals_amount', (select coalesce(sum(amount), 0) from pos_withdrawals),
      'withdrawals_count', (select count(*) from pos_withdrawals),
      'deposits_amount', (select coalesce(sum(amount), 0) from pos_deposits),
      'deposits_count', (select count(*) from pos_deposits)
    ),
    'data_checks', jsonb_build_object(
      'no_branch_amount', (select coalesce(sum(amount), 0) from live where live.branch_id is null),
      'no_branch_count', (select count(*) from live where live.branch_id is null),
      'split_amount', (select coalesce(sum(amount), 0) from live where live.payment_method = 'split'),
      'split_count', (select count(*) from live where live.payment_method = 'split'),
      'other_method_amount', (select coalesce(sum(amount), 0) from live where live.payment_method = 'other'),
      'other_method_count', (select count(*) from live where live.payment_method = 'other')
    )
  )
  into v_result;

  return v_result;
end;
$$;

-- ── Money In list (search, filter, page, CSV) ──────────────────────
create or replace function public.finance_money_in(
  p_from date,
  p_to date,
  p_branch_id uuid default null,
  p_no_branch boolean default false,
  p_method text default null,
  p_source text default null,
  p_search text default null,
  p_include_void boolean default false,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start timestamptz;
  v_end timestamptz;
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_result jsonb;
begin
  if not public.finance_can_view() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Invalid period';
  end if;
  if p_to - p_from > 1100 then
    raise exception 'Period is too long (maximum about 3 years)';
  end if;
  if p_method is not null and p_method not in ('bank_transfer','pos','cash','split','other') then
    raise exception 'Invalid payment method';
  end if;
  if p_source is not null and p_source not in ('order','direct_sale','repair') then
    raise exception 'Invalid source';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 5000 then
    raise exception 'Invalid page size';
  end if;
  if p_offset is null or p_offset < 0 then
    raise exception 'Invalid page offset';
  end if;

  v_start := public.finance_lagos_day_start(p_from);
  v_end := public.finance_lagos_day_start(p_to + 1);

  with filtered as (
    select pl.*
    from public.finance_payment_lines(v_start, v_end) pl
    where (p_branch_id is null or pl.branch_id = p_branch_id)
      and (not coalesce(p_no_branch, false) or pl.branch_id is null)
      and (p_method is null or pl.payment_method = p_method)
      and (p_source is null or pl.sales_channel = p_source)
      and (coalesce(p_include_void, false) or not pl.is_void)
      and (
        v_search is null
        or pl.source_code ilike '%' || v_search || '%'
        or pl.customer_name ilike '%' || v_search || '%'
        or pl.reference ilike '%' || v_search || '%'
      )
  ),
  page as (
    select * from filtered
    order by filtered.paid_at desc, filtered.payment_id
    limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'total_count', (select count(*) from filtered),
    'total_amount', (select coalesce(sum(amount), 0) from filtered where not filtered.is_void),
    'void_count', (select count(*) from filtered where filtered.is_void),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'payment_id', page.payment_id,
        'source_type', page.source_type,
        'sales_channel', page.sales_channel,
        'source_id', page.source_id,
        'source_code', page.source_code,
        'customer_name', page.customer_name,
        'branch_id', page.branch_id,
        'branch_name', page.branch_name,
        'payment_method', page.payment_method,
        'reference', page.reference,
        'amount', page.amount,
        'paid_at', page.paid_at,
        'is_void', page.is_void,
        'recorded_by_name', page.recorded_by_name
      ) order by page.paid_at desc, page.payment_id)
      from page
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

-- ── Permissions ─────────────────────────────────────────────────────
-- Supabase grants EXECUTE on new public functions to anon/authenticated by
-- default, so lock everything first, then open only the guarded entry points.
revoke all on function public.finance_lagos_day_start(date) from public, anon;
revoke all on function public.finance_lagos_date(timestamptz) from public, anon;
revoke all on function public.finance_viewer_role() from public, anon, authenticated;
revoke all on function public.finance_can_view() from public, anon;
revoke all on function public.finance_payment_lines(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.finance_branches() from public, anon;
revoke all on function public.finance_overview(date, date, uuid) from public, anon;
revoke all on function public.finance_money_in(date, date, uuid, boolean, text, text, text, boolean, integer, integer) from public, anon;

grant execute on function public.finance_lagos_day_start(date) to authenticated;
grant execute on function public.finance_lagos_date(timestamptz) to authenticated;
grant execute on function public.finance_can_view() to authenticated;
grant execute on function public.finance_branches() to authenticated;
grant execute on function public.finance_overview(date, date, uuid) to authenticated;
grant execute on function public.finance_money_in(date, date, uuid, boolean, text, text, text, boolean, integer, integer) to authenticated;

comment on function public.finance_overview(date, date, uuid) is
  'Finance Phase 1. Money in, refunds, net, splits by method/source/branch/day, confirmed sales, Cash Off, owed now, Free POS volume. View-only roles: super_admin, admin, growth_lead, sales_analyst.';
comment on function public.finance_money_in(date, date, uuid, boolean, text, text, text, boolean, integer, integer) is
  'Finance Phase 1. Paged, filterable list of customer payments (orders, direct sales, repairs) built on sales_unified_payments.';
