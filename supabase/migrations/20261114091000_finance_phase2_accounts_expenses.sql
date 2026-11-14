-- ═══════════════════════════════════════════════════════════════════
-- EmmyTech OS · Finance · Phase 2: accounts, expenses, petty cash  [MERGE]
-- ═══════════════════════════════════════════════════════════════════
-- New finance_* tables and functions only. No existing table is altered.
-- "Received into" for Sales/Repair payments lives in finance_payment_accounts,
-- so the Sales tables stay exactly as they are.
--
-- Every finance_* table has RLS on and NO policies, and no direct grants:
-- staff can only reach the data through the guarded functions below.
-- ═══════════════════════════════════════════════════════════════════

-- ── Who can do what ─────────────────────────────────────────────────
create or replace function public.finance_can_manage()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.finance_viewer_role() in ('super_admin','admin'), false);
$$;

create or replace function public.finance_is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.finance_viewer_role() = 'super_admin', false);
$$;

-- Branch staff may log petty cash for approval (admins may too).
create or replace function public.finance_can_log_petty()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.finance_viewer_role() in ('super_admin','admin','front_desk','technician','operations_lead'), false);
$$;

create or replace function public.finance_today()
returns date language sql stable as $$
  select public.finance_lagos_date(now());
$$;

-- ── Settings: the day Finance starts counting ───────────────────────
create table public.finance_settings (
  id boolean primary key default true check (id),
  start_date date not null check (extract(day from start_date) = 1),
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
-- Owner decision: Finance counts from the month data is first entered.
insert into public.finance_settings (start_date)
values (date_trunc('month', public.finance_today())::date)
on conflict (id) do nothing;

create or replace function public.finance_start_date()
returns date language sql stable security definer set search_path = public as $$
  select start_date from public.finance_settings where id;
$$;

-- ── Accounts (banks, mobile money, POS terminals, cash drawers) ─────
create table public.finance_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 80),
  account_type text not null check (account_type in ('bank','mobile','pos','cash')),
  provider text,
  last4 text check (last4 is null or last4 ~ '^[0-9]{4}$'),
  branch_location_id uuid references public.ops_locations(id),
  opening_balance numeric(14,2) not null default 0 check (opening_balance >= 0),
  is_active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index finance_accounts_name_uidx on public.finance_accounts (lower(name));

-- Which account a payment lands in by default: (branch or any branch) + method.
create table public.finance_account_rules (
  id uuid primary key default gen_random_uuid(),
  branch_location_id uuid references public.ops_locations(id),
  payment_method text not null check (payment_method in ('bank_transfer','pos','cash','split','other')),
  account_id uuid not null references public.finance_accounts(id),
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create unique index finance_account_rules_uidx
  on public.finance_account_rules (coalesce(branch_location_id, '00000000-0000-0000-0000-000000000000'::uuid), payment_method);

create or replace function public.finance_rule_account(p_branch_id uuid, p_method text)
returns uuid language sql stable security definer set search_path = public as $$
  select r.account_id
  from public.finance_account_rules r
  where r.payment_method = p_method
    and (r.branch_location_id = p_branch_id or r.branch_location_id is null)
  order by (r.branch_location_id is null)
  limit 1;
$$;

-- Explicit "received into / paid from" for money that Finance does not own.
create table public.finance_payment_accounts (
  source_type text not null check (source_type in (
    'order_payment','repair_payment','refund',
    'pos_withdrawal_in','pos_withdrawal_out','pos_deposit_in','pos_deposit_out')),
  source_id uuid not null,
  account_id uuid not null references public.finance_accounts(id),
  assigned_by uuid references public.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (source_type, source_id)
);

-- "Seen on the bank statement" ticks.
create table public.finance_statement_matches (
  source_type text not null,
  source_id uuid not null,
  account_id uuid not null references public.finance_accounts(id),
  matched_by uuid references public.users(id) on delete set null,
  matched_at timestamptz not null default now(),
  primary key (source_type, source_id, account_id)
);

create table public.finance_transfers (
  id uuid primary key default gen_random_uuid(),
  transfer_date date not null,
  from_account_id uuid not null references public.finance_accounts(id),
  to_account_id uuid not null references public.finance_accounts(id),
  amount numeric(14,2) not null check (amount > 0),
  note text,
  is_void boolean not null default false,
  voided_by uuid references public.users(id) on delete set null,
  voided_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (from_account_id <> to_account_id)
);

-- ── Expenses and petty cash ─────────────────────────────────────────
create table public.finance_expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 60),
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now()
);
create unique index finance_expense_categories_name_uidx on public.finance_expense_categories (lower(name));
insert into public.finance_expense_categories (name, sort_order) values
  ('Rent', 10), ('Fuel & transport', 20), ('Data & airtime', 30), ('Electricity & diesel', 40),
  ('Repairs & maintenance', 50), ('Marketing', 60), ('Office supplies', 70), ('Other', 900);

create table public.finance_expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null,
  category_id uuid not null references public.finance_expense_categories(id),
  branch_location_id uuid references public.ops_locations(id),
  account_id uuid not null references public.finance_accounts(id),
  payee text not null check (length(btrim(payee)) between 1 and 120),
  amount numeric(14,2) not null check (amount > 0),
  note text,
  receipt_path text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  is_petty boolean not null default false,
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  decided_by uuid references public.users(id) on delete set null,
  decided_at timestamptz,
  decision_note text
);
create index finance_expenses_date_idx on public.finance_expenses (expense_date, status);

-- ── Daily cash counts ───────────────────────────────────────────────
create table public.finance_cash_counts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.finance_accounts(id),
  count_date date not null,
  counted numeric(14,2) not null check (counted >= 0),
  expected numeric(14,2) not null,
  reason text,
  counted_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (account_id, count_date)
);

-- Lock every Finance table: functions only.
do $$
declare t text;
begin
  foreach t in array array['finance_settings','finance_accounts','finance_account_rules','finance_payment_accounts',
                           'finance_statement_matches','finance_transfers','finance_expense_categories',
                           'finance_expenses','finance_cash_counts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
  end loop;
end
$$;

-- ═══════════════════ functions ═══════════════════

-- Lists the forms need (categories, accounts, branches, staff, permissions).
create or replace function public.finance_reference_data()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.finance_can_view() or public.finance_can_log_petty()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'today', public.finance_today(),
    'start_date', public.finance_start_date(),
    'can_view', public.finance_can_view(),
    'can_manage', public.finance_can_manage(),
    'is_owner', public.finance_is_owner(),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.sort_order, c.name)
                            from public.finance_expense_categories c where c.is_active), '[]'::jsonb),
    'accounts', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'type', a.account_type,
                                  'branch_id', a.branch_location_id, 'active', a.is_active) order by a.name)
                          from public.finance_accounts a where public.finance_can_view()), '[]'::jsonb),
    'branches', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name) order by l.name)
                          from public.ops_locations l where l.is_active and l.location_type in ('store','repair','warehouse')), '[]'::jsonb),
    'staff', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'name', u.name, 'role', u.role, 'branch_id', u.default_location_id) order by u.name)
                       from public.users u
                       where public.finance_can_manage()
                         and u.role in ('super_admin','admin','growth_lead','marketing_manager','front_desk','operations_lead','technician','sales_analyst')), '[]'::jsonb)
  );
end;
$$;

create or replace function public.finance_set_start_date(p_start date)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.finance_is_owner() then raise exception 'Not authorized' using errcode = '42501'; end if;
  if p_start is null or extract(day from p_start) <> 1 then raise exception 'The start date must be the first day of a month'; end if;
  update public.finance_settings set start_date = p_start, updated_by = auth.uid(), updated_at = now() where id;
  return jsonb_build_object('start_date', p_start);
end;
$$;

create or replace function public.finance_add_account(
  p_name text, p_type text, p_provider text default null, p_last4 text default null,
  p_branch_id uuid default null, p_opening numeric default 0
)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.finance_can_manage() then raise exception 'Not authorized' using errcode = '42501'; end if;
  if nullif(btrim(p_name), '') is null then raise exception 'Give the account a name'; end if;
  if p_type not in ('bank','mobile','pos','cash') then raise exception 'Choose the account type'; end if;
  if coalesce(p_opening, 0) < 0 then raise exception 'The opening balance cannot be negative'; end if;
  if exists (select 1 from public.finance_accounts a where lower(a.name) = lower(btrim(p_name))) then
    raise exception 'An account with that name already exists';
  end if;
  insert into public.finance_accounts (name, account_type, provider, last4, branch_location_id, opening_balance, created_by)
  values (btrim(p_name), p_type, nullif(btrim(coalesce(p_provider, '')), ''),
          nullif(regexp_replace(coalesce(p_last4, ''), '\D', '', 'g'), ''), p_branch_id, coalesce(p_opening, 0), auth.uid())
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end;
$$;

create or replace function public.finance_set_account_active(p_account_id uuid, p_active boolean)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.finance_can_manage() then raise exception 'Not authorized' using errcode = '42501'; end if;
  update public.finance_accounts set is_active = coalesce(p_active, true), updated_at = now() where id = p_account_id;
  if not found then raise exception 'Account not found'; end if;
  return jsonb_build_object('id', p_account_id, 'active', coalesce(p_active, true));
end;
$$;

-- Sets (or clears, with p_account_id null) the default account for branch + method.
create or replace function public.finance_set_account_rule(p_branch_id uuid, p_method text, p_account_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.finance_can_manage() then raise exception 'Not authorized' using errcode = '42501'; end if;
  if p_method not in ('bank_transfer','pos','cash','split','other') then raise exception 'Invalid payment method'; end if;
  delete from public.finance_account_rules r
  where coalesce(r.branch_location_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and r.payment_method = p_method;
  if p_account_id is not null then
    if not exists (select 1 from public.finance_accounts a where a.id = p_account_id and a.is_active) then raise exception 'Choose an active account'; end if;
    insert into public.finance_account_rules (branch_location_id, payment_method, account_id, updated_by)
    values (p_branch_id, p_method, p_account_id, auth.uid());
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.finance_assign_payment_account(p_source_type text, p_source_id uuid, p_account_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.finance_can_manage() then raise exception 'Not authorized' using errcode = '42501'; end if;
  if not exists (select 1 from public.finance_accounts a where a.id = p_account_id and a.is_active) then raise exception 'Choose an active account'; end if;
  if not (
       (p_source_type = 'order_payment' and exists (select 1 from public.ops_order_payments x where x.id = p_source_id))
    or (p_source_type = 'repair_payment' and exists (select 1 from public.ops_repair_payments x where x.id = p_source_id))
    or (p_source_type = 'refund' and exists (select 1 from public.sales_refunds x where x.id = p_source_id))
    or (p_source_type in ('pos_withdrawal_in','pos_withdrawal_out') and exists (select 1 from public.referral_tracker_pos_withdrawals x where x.id = p_source_id))
    or (p_source_type in ('pos_deposit_in','pos_deposit_out') and exists (select 1 from public.referral_tracker_pos_deposits x where x.id = p_source_id))
  ) then
    raise exception 'Payment not found';
  end if;
  insert into public.finance_payment_accounts (source_type, source_id, account_id, assigned_by)
  values (p_source_type, p_source_id, p_account_id, auth.uid())
  on conflict (source_type, source_id) do update set account_id = excluded.account_id, assigned_by = excluded.assigned_by, assigned_at = now();
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.finance_toggle_statement_match(p_source_type text, p_source_id uuid, p_account_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.finance_can_manage() then raise exception 'Not authorized' using errcode = '42501'; end if;
  if exists (select 1 from public.finance_statement_matches m where m.source_type = p_source_type and m.source_id = p_source_id and m.account_id = p_account_id) then
    delete from public.finance_statement_matches m where m.source_type = p_source_type and m.source_id = p_source_id and m.account_id = p_account_id;
    return jsonb_build_object('matched', false);
  end if;
  insert into public.finance_statement_matches (source_type, source_id, account_id, matched_by) values (p_source_type, p_source_id, p_account_id, auth.uid());
  return jsonb_build_object('matched', true);
end;
$$;

create or replace function public.finance_add_transfer(p_from uuid, p_to uuid, p_amount numeric, p_date date, p_note text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.finance_can_manage() then raise exception 'Not authorized' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_from = p_to then raise exception 'Choose two different accounts'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Enter an amount'; end if;
  if p_date is null then raise exception 'Enter the date'; end if;
  if (select count(*) from public.finance_accounts a where a.id in (p_from, p_to) and a.is_active) <> 2 then raise exception 'Choose active accounts'; end if;
  insert into public.finance_transfers (transfer_date, from_account_id, to_account_id, amount, note, created_by)
  values (p_date, p_from, p_to, p_amount, nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end;
$$;

create or replace function public.finance_add_expense_category(p_name text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.finance_can_manage() then raise exception 'Not authorized' using errcode = '42501'; end if;
  if nullif(btrim(p_name), '') is null then raise exception 'Type a category name'; end if;
  if exists (select 1 from public.finance_expense_categories c where lower(c.name) = lower(btrim(p_name))) then raise exception 'That category already exists'; end if;
  insert into public.finance_expense_categories (name) values (btrim(p_name)) returning id into v_id;
  return jsonb_build_object('id', v_id);
end;
$$;

-- Admin-recorded expense: counts straight away.
create or replace function public.finance_add_expense(
  p_date date, p_category_id uuid, p_branch_id uuid, p_account_id uuid, p_payee text, p_amount numeric,
  p_note text default null, p_receipt_path text default null
)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.finance_can_manage() then raise exception 'Not authorized' using errcode = '42501'; end if;
  if p_date is null then raise exception 'Enter the date'; end if;
  if p_date > public.finance_today() then raise exception 'The date cannot be in the future'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Enter an amount'; end if;
  if nullif(btrim(p_payee), '') is null then raise exception 'Say who was paid'; end if;
  if not exists (select 1 from public.finance_expense_categories c where c.id = p_category_id) then raise exception 'Choose a category'; end if;
  if not exists (select 1 from public.finance_accounts a where a.id = p_account_id and a.is_active) then raise exception 'Choose the account it was paid from'; end if;
  insert into public.finance_expenses (expense_date, category_id, branch_location_id, account_id, payee, amount, note, receipt_path,
                                       status, is_petty, created_by, decided_by, decided_at)
  values (p_date, p_category_id, p_branch_id, p_account_id, btrim(p_payee), p_amount, nullif(btrim(coalesce(p_note, '')), ''),
          nullif(p_receipt_path, ''), 'approved', false, auth.uid(), auth.uid(), now())
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end;
$$;

-- Branch staff petty cash: paid from their branch cash drawer, waits for approval.
create or replace function public.finance_log_petty_cash(
  p_date date, p_category_id uuid, p_payee text, p_amount numeric, p_note text, p_receipt_path text default null
)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_branch uuid;
  v_account uuid;
  v_id uuid;
begin
  if not public.finance_can_log_petty() then raise exception 'Not authorized' using errcode = '42501'; end if;
  select u.default_location_id into v_branch from public.users u where u.id = auth.uid();
  if v_branch is null then raise exception 'Your profile has no branch. Ask an admin to set it.'; end if;
  v_account := public.finance_rule_account(v_branch, 'cash');
  if v_account is null or not exists (select 1 from public.finance_accounts a where a.id = v_account and a.account_type = 'cash' and a.is_active) then
    select a.id into v_account from public.finance_accounts a
    where a.account_type = 'cash' and a.branch_location_id = v_branch and a.is_active order by a.created_at limit 1;
  end if;
  if v_account is null then raise exception 'Your branch has no cash drawer set up in Finance yet'; end if;
  if p_date is null then raise exception 'Enter the date'; end if;
  if p_date > public.finance_today() then raise exception 'The date cannot be in the future'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Enter an amount'; end if;
  if nullif(btrim(p_payee), '') is null then raise exception 'Say who was paid'; end if;
  if nullif(btrim(p_note), '') is null then raise exception 'Say what it was for'; end if;
  if not exists (select 1 from public.finance_expense_categories c where c.id = p_category_id and c.is_active) then raise exception 'Choose a category'; end if;
  insert into public.finance_expenses (expense_date, category_id, branch_location_id, account_id, payee, amount, note, receipt_path, status, is_petty, created_by)
  values (p_date, p_category_id, v_branch, v_account, btrim(p_payee), p_amount, btrim(p_note), nullif(p_receipt_path, ''), 'pending', true, auth.uid())
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end;
$$;

create or replace function public.finance_decide_expense(p_expense_id uuid, p_approve boolean, p_note text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
#variable_conflict use_column
declare v_status text;
begin
  if not public.finance_can_manage() then raise exception 'Not authorized' using errcode = '42501'; end if;
  select e.status into v_status from public.finance_expenses e where e.id = p_expense_id for update;
  if v_status is null then raise exception 'Expense not found'; end if;
  if v_status <> 'pending' then raise exception 'This expense was already decided'; end if;
  update public.finance_expenses
  set status = case when p_approve then 'approved' else 'rejected' end,
      decided_by = auth.uid(), decided_at = now(), decision_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_expense_id;
  return jsonb_build_object('status', case when p_approve then 'approved' else 'rejected' end);
end;
$$;

create or replace function public.finance_expense_json(e public.finance_expenses)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', e.id, 'date', e.expense_date, 'category_id', e.category_id,
    'category', (select c.name from public.finance_expense_categories c where c.id = e.category_id),
    'branch_id', e.branch_location_id, 'branch_name', (select l.name from public.ops_locations l where l.id = e.branch_location_id),
    'account_id', e.account_id, 'account_name', (select a.name from public.finance_accounts a where a.id = e.account_id),
    'payee', e.payee, 'amount', e.amount, 'note', e.note, 'receipt_path', e.receipt_path, 'status', e.status, 'is_petty', e.is_petty,
    'created_by_name', (select u.name from public.users u where u.id = e.created_by),
    'decided_by_name', (select u.name from public.users u where u.id = e.decided_by), 'decision_note', e.decision_note
  );
$$;

create or replace function public.finance_expenses(
  p_from date, p_to date, p_branch_id uuid default null, p_category_id uuid default null, p_status text default null
)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.finance_can_view() then raise exception 'Not authorized' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Invalid period'; end if;
  if p_status is not null and p_status not in ('pending','approved','rejected') then raise exception 'Invalid status'; end if;
  with list as (
    select e.* from public.finance_expenses e
    where e.expense_date between p_from and p_to
      and (p_branch_id is null or e.branch_location_id = p_branch_id)
      and (p_category_id is null or e.category_id = p_category_id)
      and (p_status is null or e.status = p_status)
  ), approved as (select * from list where list.status = 'approved')
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(public.finance_expense_json(e) order by e.expense_date desc, e.created_at desc)
                      from public.finance_expenses e where e.id in (select list.id from list)), '[]'::jsonb),
    'approved', jsonb_build_object('amount', (select coalesce(sum(amount), 0) from approved), 'count', (select count(*) from approved)),
    'missing_receipts', (select count(*) from approved where approved.receipt_path is null),
    'by_category', coalesce((select jsonb_agg(jsonb_build_object('category', g.name, 'amount', g.amount, 'count', g.cnt) order by g.amount desc)
                             from (select c.name, sum(a.amount) as amount, count(*) as cnt from approved a
                                   join public.finance_expense_categories c on c.id = a.category_id group by c.name) g), '[]'::jsonb),
    'pending', coalesce((select jsonb_agg(public.finance_expense_json(e) order by e.expense_date, e.created_at)
                         from public.finance_expenses e where e.status = 'pending'), '[]'::jsonb)
  ) into v;
  return v;
end;
$$;

create or replace function public.finance_my_petty_cash()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.finance_can_log_petty() then raise exception 'Not authorized' using errcode = '42501'; end if;
  return jsonb_build_object(
    'branch_name', (select l.name from public.users u join public.ops_locations l on l.id = u.default_location_id where u.id = auth.uid()),
    'rows', coalesce((select jsonb_agg(public.finance_expense_json(e) order by e.expense_date desc, e.created_at desc)
                      from public.finance_expenses e where e.created_by = auth.uid() and e.is_petty), '[]'::jsonb)
  );
end;
$$;

-- Receipt path for one expense: Finance viewers, or the person who logged it.
create or replace function public.finance_expense_receipt(p_expense_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v public.finance_expenses;
begin
  select * into v from public.finance_expenses e where e.id = p_expense_id;
  if v.id is null then raise exception 'Expense not found'; end if;
  if not (public.finance_can_view() or (public.finance_can_log_petty() and v.created_by = auth.uid())) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return jsonb_build_object('receipt_path', v.receipt_path);
end;
$$;

-- ── Permissions ─────────────────────────────────────────────────────
do $$
declare f text;
begin
  -- internal helpers: not callable by staff directly
  foreach f in array array['public.finance_rule_account(uuid, text)', 'public.finance_expense_json(public.finance_expenses)'] loop
    execute 'revoke all on function ' || f || ' from public, anon, authenticated';
  end loop;
  -- guarded entry points
  foreach f in array array[
    'public.finance_can_manage()', 'public.finance_is_owner()', 'public.finance_can_log_petty()', 'public.finance_today()',
    'public.finance_start_date()', 'public.finance_reference_data()', 'public.finance_set_start_date(date)',
    'public.finance_add_account(text, text, text, text, uuid, numeric)', 'public.finance_set_account_active(uuid, boolean)',
    'public.finance_set_account_rule(uuid, text, uuid)', 'public.finance_assign_payment_account(text, uuid, uuid)',
    'public.finance_toggle_statement_match(text, uuid, uuid)', 'public.finance_add_transfer(uuid, uuid, numeric, date, text)',
    'public.finance_add_expense_category(text)', 'public.finance_add_expense(date, uuid, uuid, uuid, text, numeric, text, text)',
    'public.finance_log_petty_cash(date, uuid, text, numeric, text, text)', 'public.finance_decide_expense(uuid, boolean, text)',
    'public.finance_expenses(date, date, uuid, uuid, text)', 'public.finance_my_petty_cash()', 'public.finance_expense_receipt(uuid)'] loop
    execute 'revoke all on function ' || f || ' from public, anon';
    execute 'grant execute on function ' || f || ' to authenticated';
  end loop;
end
$$;
