-- ═══════════════════════════════════════════════════════════════════
-- EmmyTech OS · Finance · Phase 3: receivables and payables        [MERGE]
-- ═══════════════════════════════════════════════════════════════════
-- Receivables read Sales/Repairs (nothing new stored).
-- Payables add supplier bills (stock taken now, paid later) and supplier
-- payments. Suppliers themselves stay in Operations (ops_suppliers).
-- ═══════════════════════════════════════════════════════════════════

create table public.finance_supplier_bills (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.ops_suppliers(id),
  bill_ref text not null check (length(btrim(bill_ref)) between 1 and 60),
  bill_date date not null,
  due_date date not null,
  amount numeric(14,2) not null check (amount > 0),
  note text,
  is_void boolean not null default false,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (due_date >= bill_date)
);
create unique index finance_supplier_bills_ref_uidx on public.finance_supplier_bills (supplier_id, lower(bill_ref)) where not is_void;

create table public.finance_supplier_payments (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.finance_supplier_bills(id),
  amount numeric(14,2) not null check (amount > 0),
  paid_date date not null,
  account_id uuid not null references public.finance_accounts(id),
  note text,
  is_void boolean not null default false,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.finance_supplier_bills enable row level security;
alter table public.finance_supplier_payments enable row level security;
revoke all on table public.finance_supplier_bills from public, anon, authenticated;
revoke all on table public.finance_supplier_payments from public, anon, authenticated;

-- ── Receivables: who owes EmmyTech right now ────────────────────────
-- Orders: due on the credit date agreed in Sales, else on the day of sale.
-- Repairs: due when collected; not due while the job is still in the workshop.
create or replace function public.finance_receivables(p_branch_id uuid default null, p_today date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := coalesce(p_today, public.finance_today());
  v jsonb;
begin
  if not public.finance_can_view() then raise exception 'Not authorized' using errcode = '42501'; end if;
  with order_rows as (
    select 'order'::text as kind, o.id, o.order_code as code, o.customer_name as customer, o.customer_phone as phone,
           o.branch_location_id as branch_id, o.total_amount as total,
           coalesce((select sum(p.amount) from public.ops_order_payments p where p.order_id = o.id and not p.is_void), 0) as paid,
           (select public.finance_lagos_date(max(c.due_at)) from public.sales_credit_releases c where c.order_id = o.id and c.status = 'active') as credit_due,
           public.finance_lagos_date(o.confirmed_at) as sold_on
    from public.ops_orders o
    where o.commercial_state = 'confirmed' and o.deletion_status <> 'deleted'
  ), repair_rows as (
    select 'repair'::text as kind, r.id, r.repair_code as code, r.customer_name as customer, r.customer_phone as phone,
           r.branch_location_id as branch_id, r.amount_charged as total,
           coalesce((select sum(p.amount) from public.ops_repair_payments p where p.repair_id = r.id and not p.is_void), 0) as paid,
           r.status, public.finance_lagos_date(r.collected_at) as collected_on
    from public.ops_repairs r
    where r.amount_charged > 0 and r.status not in ('received','diagnosing','awaiting_customer_approval','cancelled')
  ), all_rows as (
    select kind, id, code, customer, phone, branch_id, total, paid, total - paid as owed,
           coalesce(credit_due, sold_on) as due_date,
           case when credit_due is not null then 'Credit agreed in Sales' else 'Due on the day of sale' end as note
    from order_rows where total - paid > 0
    union all
    select kind, id, code, customer, phone, branch_id, total, paid, total - paid,
           case when status = 'collected' then collected_on end,
           case when status = 'collected' then 'Collected without full payment' else 'Due when the repair is collected' end
    from repair_rows where total - paid > 0
  ), scored as (
    select a.*, l.name as branch_name,
           case when a.due_date is null then 0 else greatest(v_today - a.due_date, 0) end as days_late
    from all_rows a left join public.ops_locations l on l.id = a.branch_id
    where p_branch_id is null or a.branch_id = p_branch_id
  ), bucketed as (
    select s.*, case when s.days_late <= 0 then 'not_due' when s.days_late <= 30 then 'd1_30' when s.days_late <= 60 then 'd31_60' else 'd60' end as bucket
    from scored s
  )
  select jsonb_build_object(
    'today', v_today,
    'total', (select coalesce(sum(owed), 0) from bucketed),
    'buckets', jsonb_build_object(
      'not_due', jsonb_build_object('amount', (select coalesce(sum(owed), 0) from bucketed where bucket = 'not_due'), 'count', (select count(*) from bucketed where bucket = 'not_due')),
      'd1_30', jsonb_build_object('amount', (select coalesce(sum(owed), 0) from bucketed where bucket = 'd1_30'), 'count', (select count(*) from bucketed where bucket = 'd1_30')),
      'd31_60', jsonb_build_object('amount', (select coalesce(sum(owed), 0) from bucketed where bucket = 'd31_60'), 'count', (select count(*) from bucketed where bucket = 'd31_60')),
      'd60', jsonb_build_object('amount', (select coalesce(sum(owed), 0) from bucketed where bucket = 'd60'), 'count', (select count(*) from bucketed where bucket = 'd60'))),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'kind', b.kind, 'id', b.id, 'code', b.code, 'customer', b.customer, 'phone', b.phone, 'branch_id', b.branch_id, 'branch_name', b.branch_name,
        'total', b.total, 'paid', b.paid, 'owed', b.owed, 'due_date', b.due_date, 'days_late', b.days_late, 'bucket', b.bucket, 'note', b.note)
        order by b.days_late desc, b.owed desc) from bucketed b), '[]'::jsonb)
  ) into v;
  return v;
end;
$$;

-- ── Payables: who EmmyTech owes right now ───────────────────────────
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

create or replace function public.finance_pay_supplier_bill(p_bill_id uuid, p_amount numeric, p_date date, p_account_id uuid, p_note text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_amount numeric;
  v_paid numeric;
  v_id uuid;
begin
  if not public.finance_can_manage() then raise exception 'Not authorized' using errcode = '42501'; end if;
  select b.amount into v_amount from public.finance_supplier_bills b where b.id = p_bill_id and not b.is_void for update;
  if v_amount is null then raise exception 'Bill not found'; end if;
  select coalesce(sum(p.amount), 0) into v_paid from public.finance_supplier_payments p where p.bill_id = p_bill_id and not p.is_void;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Enter an amount'; end if;
  if p_amount > v_amount - v_paid then raise exception 'That is more than the % still owed on this bill', to_char(v_amount - v_paid, 'FM999,999,999,990'); end if;
  if p_date is null then raise exception 'Enter the date'; end if;
  if not exists (select 1 from public.finance_accounts a where a.id = p_account_id and a.is_active) then raise exception 'Choose the account it was paid from'; end if;
  insert into public.finance_supplier_payments (bill_id, amount, paid_date, account_id, note, created_by)
  values (p_bill_id, p_amount, p_date, p_account_id, nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'left', v_amount - v_paid - p_amount);
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['public.finance_receivables(uuid, date)', 'public.finance_payables(date)',
    'public.finance_add_supplier_bill(uuid, text, text, date, date, numeric, text)',
    'public.finance_pay_supplier_bill(uuid, numeric, date, uuid, text)'] loop
    execute 'revoke all on function ' || f || ' from public, anon';
    execute 'grant execute on function ' || f || ' to authenticated';
  end loop;
end
$$;
