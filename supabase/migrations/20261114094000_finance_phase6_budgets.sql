-- ═══════════════════════════════════════════════════════════════════
-- EmmyTech OS · Finance · Phase 6: budgets                         [MERGE]
-- ═══════════════════════════════════════════════════════════════════
-- A monthly limit per expense category, for all branches or one branch.
-- Only APPROVED expenses count. Warning at 80%, over at 100%.
-- ═══════════════════════════════════════════════════════════════════

create table public.finance_budgets (
  id uuid primary key default gen_random_uuid(),
  budget_month date not null check (extract(day from budget_month) = 1),
  category_id uuid not null references public.finance_expense_categories(id),
  branch_location_id uuid references public.ops_locations(id),
  amount numeric(14,2) not null check (amount > 0),
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create unique index finance_budgets_uidx
  on public.finance_budgets (budget_month, category_id, coalesce(branch_location_id, '00000000-0000-0000-0000-000000000000'::uuid));

alter table public.finance_budgets enable row level security;
revoke all on table public.finance_budgets from public, anon, authenticated;

create or replace function public.finance_budgets(p_month date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_from date := date_trunc('month', coalesce(p_month, public.finance_today()))::date;
  v_to date := (date_trunc('month', coalesce(p_month, public.finance_today())) + interval '1 month - 1 day')::date;
  v jsonb;
begin
  if not public.finance_can_view() then raise exception 'Not authorized' using errcode = '42501'; end if;
  with budget_rows as (
    select b.id, b.category_id, c.name as category, b.branch_location_id as branch_id, l.name as branch_name, b.amount,
      coalesce((select sum(e.amount) from public.finance_expenses e
                where e.status = 'approved' and e.category_id = b.category_id and e.expense_date between v_from and v_to
                  and (b.branch_location_id is null or e.branch_location_id = b.branch_location_id)), 0) as actual
    from public.finance_budgets b
    join public.finance_expense_categories c on c.id = b.category_id
    left join public.ops_locations l on l.id = b.branch_location_id
    where b.budget_month = v_from
  ), scored as (
    select r.*, round(r.actual / r.amount * 100)::int as used, r.amount - r.actual as left_amount
    from budget_rows r
  )
  select jsonb_build_object(
    'month', v_from,
    'budgeted', (select coalesce(sum(amount), 0) from scored),
    'spent', (select coalesce(sum(actual), 0) from scored),
    'over', coalesce((select jsonb_agg(s.category order by s.used desc) from scored s where s.used >= 100), '[]'::jsonb),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'category_id', s.category_id, 'category', s.category, 'branch_id', s.branch_id, 'branch_name', s.branch_name,
        'amount', s.amount, 'actual', s.actual, 'used', s.used, 'left', s.left_amount,
        'level', case when s.used >= 100 then 'over' when s.used >= 80 then 'warn' else 'ok' end)
        order by s.used desc, s.category) from scored s), '[]'::jsonb)
  ) into v;
  return v;
end;
$$;

create or replace function public.finance_set_budget(p_month date, p_category_id uuid, p_branch_id uuid, p_amount numeric)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_month date := date_trunc('month', p_month)::date;
begin
  if not public.finance_can_manage() then raise exception 'Not authorized' using errcode = '42501'; end if;
  if p_month is null then raise exception 'Choose the month'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Enter the budget amount'; end if;
  if not exists (select 1 from public.finance_expense_categories c where c.id = p_category_id) then raise exception 'Choose a category'; end if;
  delete from public.finance_budgets b
  where b.budget_month = v_month and b.category_id = p_category_id
    and coalesce(b.branch_location_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_branch_id, '00000000-0000-0000-0000-000000000000'::uuid);
  insert into public.finance_budgets (budget_month, category_id, branch_location_id, amount, updated_by)
  values (v_month, p_category_id, p_branch_id, p_amount, auth.uid());
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.finance_delete_budget(p_budget_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.finance_can_manage() then raise exception 'Not authorized' using errcode = '42501'; end if;
  delete from public.finance_budgets b where b.id = p_budget_id;
  if not found then raise exception 'Budget not found'; end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- Copies a month's budgets into the next month, skipping ones already set there.
create or replace function public.finance_copy_budgets(p_month date)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_from date := date_trunc('month', p_month)::date;
  v_next date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_count integer;
begin
  if not public.finance_can_manage() then raise exception 'Not authorized' using errcode = '42501'; end if;
  insert into public.finance_budgets (budget_month, category_id, branch_location_id, amount, updated_by)
  select v_next, b.category_id, b.branch_location_id, b.amount, auth.uid()
  from public.finance_budgets b
  where b.budget_month = v_from
    and not exists (select 1 from public.finance_budgets x where x.budget_month = v_next and x.category_id = b.category_id
                    and coalesce(x.branch_location_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(b.branch_location_id, '00000000-0000-0000-0000-000000000000'::uuid));
  get diagnostics v_count = row_count;
  return jsonb_build_object('copied', v_count, 'month', v_next);
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['public.finance_budgets(date)', 'public.finance_set_budget(date, uuid, uuid, numeric)',
                           'public.finance_delete_budget(uuid)', 'public.finance_copy_budgets(date)'] loop
    execute 'revoke all on function ' || f || ' from public, anon';
    execute 'grant execute on function ' || f || ' to authenticated';
  end loop;
end
$$;
