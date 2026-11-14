-- ═══════════════════════════════════════════════════════════════════
-- EmmyTech OS · Finance · Phase 5: payroll                         [MERGE]
-- ═══════════════════════════════════════════════════════════════════
-- Pay profiles, salary advances and monthly salary runs.
-- Individual pay: Supreme Administrator only (enforced here, not just in the UI).
-- Admin, Growth Lead and Sales Analyst see run totals only.
-- Commission (optional, per person) = % of the confirmed sales they made that month.
-- ═══════════════════════════════════════════════════════════════════

create table public.finance_pay_profiles (
  user_id uuid primary key references public.users(id),
  salary numeric(14,2) not null default 0 check (salary >= 0),
  allowance numeric(14,2) not null default 0 check (allowance >= 0),
  commission_percent numeric(5,2) not null default 0 check (commission_percent between 0 and 20),
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.finance_salary_advances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  amount numeric(14,2) not null check (amount > 0),
  per_month numeric(14,2) not null check (per_month > 0),
  advance_date date not null,
  account_id uuid not null references public.finance_accounts(id),
  note text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (per_month <= amount)
);

create table public.finance_pay_runs (
  id uuid primary key default gen_random_uuid(),
  run_month date not null unique check (extract(day from run_month) = 1),
  status text not null default 'draft' check (status in ('draft','approved','paid')),
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  paid_by uuid references public.users(id) on delete set null,
  paid_at timestamptz,
  paid_date date,
  account_id uuid references public.finance_accounts(id),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (status <> 'paid' or (paid_date is not null and account_id is not null))
);

-- Locked copy of each line, taken when the run is approved.
create table public.finance_pay_run_lines (
  run_id uuid not null references public.finance_pay_runs(id) on delete cascade,
  user_id uuid not null references public.users(id),
  salary numeric(14,2) not null,
  allowance numeric(14,2) not null,
  sales numeric(14,2) not null,
  commission numeric(14,2) not null,
  deduction numeric(14,2) not null,
  gross numeric(14,2) not null,
  net numeric(14,2) not null,
  primary key (run_id, user_id)
);

do $$
declare t text;
begin
  foreach t in array array['finance_pay_profiles','finance_salary_advances','finance_pay_runs','finance_pay_run_lines'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
  end loop;
end
$$;

-- Advance still owed = advances given − deductions in PAID runs.
create or replace function public.finance_advance_left(p_user_id uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select greatest(
    coalesce((select sum(a.amount) from public.finance_salary_advances a where a.user_id = p_user_id), 0)
    - coalesce((select sum(l.deduction) from public.finance_pay_run_lines l join public.finance_pay_runs r on r.id = l.run_id
                where l.user_id = p_user_id and r.status = 'paid'), 0), 0);
$$;

-- Live lines for a month (used while a run is a draft).
create or replace function public.finance_build_pay_lines(p_month date)
returns table (user_id uuid, salary numeric, allowance numeric, sales numeric, commission numeric, deduction numeric, gross numeric, net numeric)
language sql stable security definer set search_path = public as $$
  with m as (
    select date_trunc('month', p_month)::date as m_from,
           (date_trunc('month', p_month) + interval '1 month - 1 day')::date as m_to
  ), base as (
    select p.user_id, p.salary, p.allowance, p.commission_percent,
      coalesce((select sum(o.total_amount) from public.ops_orders o, m
                where o.sales_staff_user_id = p.user_id and o.commercial_state = 'confirmed' and o.deletion_status <> 'deleted'
                  and o.confirmed_at >= public.finance_lagos_day_start(m.m_from)
                  and o.confirmed_at < public.finance_lagos_day_start(m.m_to + 1)), 0) as sales,
      coalesce((select sum(a.per_month) from public.finance_salary_advances a, m where a.user_id = p.user_id and a.advance_date <= m.m_to), 0) as per_month,
      public.finance_advance_left(p.user_id) as advance_left
    from public.finance_pay_profiles p
    where p.salary > 0 or p.allowance > 0
  )
  select b.user_id, b.salary, b.allowance, b.sales,
         round(b.sales * b.commission_percent / 100) as commission,
         least(b.per_month, b.advance_left) as deduction,
         b.salary + b.allowance + round(b.sales * b.commission_percent / 100) as gross,
         b.salary + b.allowance + round(b.sales * b.commission_percent / 100) - least(b.per_month, b.advance_left) as net
  from base b;
$$;

-- Lines for a run: locked copy once approved, live while draft.
create or replace function public.finance_pay_run_lines_for(p_run_id uuid)
returns table (user_id uuid, salary numeric, allowance numeric, sales numeric, commission numeric, deduction numeric, gross numeric, net numeric)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare v_run public.finance_pay_runs;
begin
  select * into v_run from public.finance_pay_runs r where r.id = p_run_id;
  if v_run.id is null then return; end if;
  if v_run.status = 'draft' then
    return query select * from public.finance_build_pay_lines(v_run.run_month);
  else
    return query select l.user_id, l.salary, l.allowance, l.sales, l.commission, l.deduction, l.gross, l.net
                 from public.finance_pay_run_lines l where l.run_id = p_run_id;
  end if;
end;
$$;

create or replace function public.finance_pay_run_totals(p_run_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('people', count(*), 'gross', coalesce(sum(gross), 0), 'commission', coalesce(sum(commission), 0),
                            'deductions', coalesce(sum(deduction), 0), 'net', coalesce(sum(net), 0))
  from public.finance_pay_run_lines_for(p_run_id);
$$;

create or replace function public.finance_payroll(p_month date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_runs jsonb;
  v_run public.finance_pay_runs;
begin
  if not public.finance_can_view() then raise exception 'Not authorized' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'month', r.run_month, 'status', r.status, 'paid_date', r.paid_date,
           'account_name', (select a.name from public.finance_accounts a where a.id = r.account_id),
           'totals', public.finance_pay_run_totals(r.id)) order by r.run_month desc), '[]'::jsonb)
  into v_runs from public.finance_pay_runs r;

  if not public.finance_is_owner() then
    return jsonb_build_object('is_owner', false, 'runs', v_runs);
  end if;

  select * into v_run from public.finance_pay_runs r
  where r.run_month = date_trunc('month', coalesce(p_month, public.finance_today()))::date;
  if v_run.id is null then
    select * into v_run from public.finance_pay_runs r order by r.run_month desc limit 1;
  end if;

  return jsonb_build_object(
    'is_owner', true,
    'runs', v_runs,
    'run', case when v_run.id is null then null else jsonb_build_object(
      'id', v_run.id, 'month', v_run.run_month, 'status', v_run.status, 'paid_date', v_run.paid_date,
      'account_name', (select a.name from public.finance_accounts a where a.id = v_run.account_id),
      'totals', public.finance_pay_run_totals(v_run.id),
      'lines', coalesce((select jsonb_agg(jsonb_build_object('user_id', l.user_id, 'name', u.name, 'role', u.role, 'salary', l.salary,
                    'allowance', l.allowance, 'sales', l.sales, 'commission', l.commission, 'deduction', l.deduction, 'gross', l.gross, 'net', l.net)
                    order by u.name) from public.finance_pay_run_lines_for(v_run.id) l join public.users u on u.id = l.user_id), '[]'::jsonb)) end,
    'profiles', coalesce((select jsonb_agg(jsonb_build_object('user_id', p.user_id, 'name', u.name, 'role', u.role, 'salary', p.salary,
                    'allowance', p.allowance, 'commission_percent', p.commission_percent, 'advance_left', public.finance_advance_left(p.user_id))
                    order by u.name) from public.finance_pay_profiles p join public.users u on u.id = p.user_id), '[]'::jsonb),
    'advances', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'name', u.name, 'amount', a.amount, 'per_month', a.per_month,
                    'date', a.advance_date, 'account_name', (select x.name from public.finance_accounts x where x.id = a.account_id))
                    order by a.advance_date desc) from public.finance_salary_advances a join public.users u on u.id = a.user_id), '[]'::jsonb)
  );
end;
$$;

create or replace function public.finance_set_pay_profile(p_user_id uuid, p_salary numeric, p_allowance numeric, p_commission_percent numeric)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.finance_is_owner() then raise exception 'Not authorized' using errcode = '42501'; end if;
  if not exists (select 1 from public.users u where u.id = p_user_id and u.role <> 'ambassador') then raise exception 'Choose a staff member'; end if;
  if coalesce(p_salary, 0) < 0 or coalesce(p_allowance, 0) < 0 then raise exception 'Pay cannot be negative'; end if;
  if coalesce(p_commission_percent, 0) not between 0 and 20 then raise exception 'Commission must be between 0%% and 20%%'; end if;
  insert into public.finance_pay_profiles (user_id, salary, allowance, commission_percent, updated_by)
  values (p_user_id, coalesce(p_salary, 0), coalesce(p_allowance, 0), coalesce(p_commission_percent, 0), auth.uid())
  on conflict (user_id) do update set salary = excluded.salary, allowance = excluded.allowance,
    commission_percent = excluded.commission_percent, updated_by = excluded.updated_by, updated_at = now();
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.finance_add_salary_advance(p_user_id uuid, p_amount numeric, p_per_month numeric, p_date date, p_account_id uuid, p_note text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.finance_is_owner() then raise exception 'Not authorized' using errcode = '42501'; end if;
  if not exists (select 1 from public.users u where u.id = p_user_id and u.role <> 'ambassador') then raise exception 'Choose a staff member'; end if;
  if coalesce(p_amount, 0) <= 0 or coalesce(p_per_month, 0) <= 0 then raise exception 'Enter the amount and the monthly repayment'; end if;
  if p_per_month > p_amount then raise exception 'The monthly repayment cannot be more than the advance'; end if;
  if p_date is null then raise exception 'Enter the date'; end if;
  if not exists (select 1 from public.finance_accounts a where a.id = p_account_id and a.is_active) then raise exception 'Choose the account it was paid from'; end if;
  insert into public.finance_salary_advances (user_id, amount, per_month, advance_date, account_id, note, created_by)
  values (p_user_id, p_amount, p_per_month, p_date, p_account_id, nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end;
$$;

create or replace function public.finance_create_pay_run(p_month date)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.finance_is_owner() then raise exception 'Not authorized' using errcode = '42501'; end if;
  if p_month is null then raise exception 'Choose the month'; end if;
  if exists (select 1 from public.finance_pay_runs r where r.run_month = date_trunc('month', p_month)::date) then
    raise exception 'That month already has a salary run';
  end if;
  insert into public.finance_pay_runs (run_month, created_by) values (date_trunc('month', p_month)::date, auth.uid()) returning id into v_id;
  return jsonb_build_object('id', v_id);
end;
$$;

create or replace function public.finance_approve_pay_run(p_run_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_status text;
begin
  if not public.finance_is_owner() then raise exception 'Not authorized' using errcode = '42501'; end if;
  select r.status into v_status from public.finance_pay_runs r where r.id = p_run_id for update;
  if v_status is null then raise exception 'Salary run not found'; end if;
  if v_status <> 'draft' then raise exception 'This salary run is already approved'; end if;
  insert into public.finance_pay_run_lines (run_id, user_id, salary, allowance, sales, commission, deduction, gross, net)
  select p_run_id, l.user_id, l.salary, l.allowance, l.sales, l.commission, l.deduction, l.gross, l.net
  from public.finance_build_pay_lines((select r.run_month from public.finance_pay_runs r where r.id = p_run_id)) l;
  update public.finance_pay_runs set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = p_run_id;
  return jsonb_build_object('status', 'approved');
end;
$$;

create or replace function public.finance_mark_pay_run_paid(p_run_id uuid, p_account_id uuid, p_paid_date date)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_status text;
begin
  if not public.finance_is_owner() then raise exception 'Not authorized' using errcode = '42501'; end if;
  select r.status into v_status from public.finance_pay_runs r where r.id = p_run_id for update;
  if v_status is null then raise exception 'Salary run not found'; end if;
  if v_status <> 'approved' then raise exception 'Approve the salary run before marking it paid'; end if;
  if p_paid_date is null then raise exception 'Enter the pay date'; end if;
  if not exists (select 1 from public.finance_accounts a where a.id = p_account_id and a.is_active) then raise exception 'Choose the account salaries were paid from'; end if;
  update public.finance_pay_runs set status = 'paid', paid_by = auth.uid(), paid_at = now(), paid_date = p_paid_date, account_id = p_account_id where id = p_run_id;
  return jsonb_build_object('status', 'paid');
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['public.finance_advance_left(uuid)', 'public.finance_build_pay_lines(date)',
                           'public.finance_pay_run_lines_for(uuid)', 'public.finance_pay_run_totals(uuid)'] loop
    execute 'revoke all on function ' || f || ' from public, anon, authenticated';
  end loop;
  foreach f in array array['public.finance_payroll(date)', 'public.finance_set_pay_profile(uuid, numeric, numeric, numeric)',
    'public.finance_add_salary_advance(uuid, numeric, numeric, date, uuid, text)', 'public.finance_create_pay_run(date)',
    'public.finance_approve_pay_run(uuid)', 'public.finance_mark_pay_run_paid(uuid, uuid, date)'] loop
    execute 'revoke all on function ' || f || ' from public, anon';
    execute 'grant execute on function ' || f || ' to authenticated';
  end loop;
end
$$;
