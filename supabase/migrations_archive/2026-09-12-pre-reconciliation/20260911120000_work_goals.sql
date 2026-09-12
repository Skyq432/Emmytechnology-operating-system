drop policy if exists "goal owners manage contributors" on public.work_goal_contributors;

create policy "goal owners manage contributors"
on public.work_goal_contributors
for all
to authenticated
using (
  exists (
    select 1
    from public.work_goals g
    where g.id = goal_id
      and (
        g.owner_id = auth.uid()
        or (g.visibility in ('shared','company') and public.work_is_admin(auth.uid()))
      )
  )
)
with check (
  exists (
    select 1
    from public.work_goals g
    where g.id = goal_id
      and g.visibility <> 'personal'
      and (
        g.owner_id = auth.uid()
        or (g.visibility in ('shared','company') and public.work_is_admin(auth.uid()))
      )
  )
);

create or replace function public.work_create_goal(
  p_title text,
  p_description text,
  p_visibility text,
  p_progress_mode text,
  p_start_at timestamptz,
  p_target_at timestamptz,
  p_target_value numeric default null,
  p_unit text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_goal_id uuid;
begin
  if v_actor is null or not public.work_is_internal_user(v_actor) then
    raise exception 'Internal staff access required';
  end if;
  if length(trim(coalesce(p_title, ''))) = 0 then
    raise exception 'Goal title is required';
  end if;
  if p_visibility not in ('personal','shared','company') then
    raise exception 'Invalid goal visibility';
  end if;
  if p_progress_mode not in ('numeric','tasks') then
    raise exception 'Invalid goal progress mode';
  end if;
  if p_visibility = 'company' and not public.work_is_admin(v_actor) then
    raise exception 'Only Admin or Super Admin can create company Goals';
  end if;
  if p_target_at is not null and p_start_at is not null and p_target_at < p_start_at then
    raise exception 'Goal target date cannot be before start date';
  end if;
  if p_progress_mode = 'numeric' and (p_target_value is null or p_target_value <= 0) then
    raise exception 'Numeric Goals require a target value greater than zero';
  end if;

  insert into public.work_goals(
    title, description, owner_id, visibility, progress_mode,
    start_at, target_at, target_value, current_value, unit, status
  ) values (
    trim(p_title), nullif(trim(coalesce(p_description, '')), ''), v_actor, p_visibility, p_progress_mode,
    p_start_at, p_target_at,
    case when p_progress_mode = 'numeric' then p_target_value else null end,
    case when p_progress_mode = 'numeric' then 0 else null end,
    case when p_progress_mode = 'numeric' then nullif(trim(coalesce(p_unit, '')), '') else null end,
    'active'
  ) returning id into v_goal_id;

  return v_goal_id;
end;
$$;

create or replace function public.work_update_goal(
  p_goal_id uuid,
  p_title text,
  p_description text,
  p_visibility text,
  p_start_at timestamptz,
  p_target_at timestamptz,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_goal public.work_goals%rowtype;
begin
  select * into v_goal
  from public.work_goals
  where id = p_goal_id
  for update;

  if not found then raise exception 'Goal not found'; end if;
  if v_actor is null then raise exception 'Authentication required'; end if;
  if v_goal.visibility = 'personal' and v_goal.owner_id <> v_actor then
    raise exception 'Only the owner can manage a personal Goal';
  end if;
  if v_goal.visibility <> 'personal' and v_goal.owner_id <> v_actor and not public.work_is_admin(v_actor) then
    raise exception 'Only the Goal owner or Admin can manage this Goal';
  end if;
  if p_visibility not in ('personal','shared','company') then raise exception 'Invalid goal visibility'; end if;
  if p_visibility = 'company' and not public.work_is_admin(v_actor) then
    raise exception 'Only Admin or Super Admin can make a Goal company-wide';
  end if;
  if p_status not in ('active','achieved','cancelled','archived') then raise exception 'Invalid goal status'; end if;
  if length(trim(coalesce(p_title, ''))) = 0 then raise exception 'Goal title is required'; end if;
  if p_target_at is not null and p_start_at is not null and p_target_at < p_start_at then
    raise exception 'Goal target date cannot be before start date';
  end if;

  update public.work_goals
  set title = trim(p_title),
      description = nullif(trim(coalesce(p_description, '')), ''),
      visibility = p_visibility,
      start_at = p_start_at,
      target_at = p_target_at,
      status = p_status,
      updated_at = now()
  where id = p_goal_id;
end;
$$;

create or replace function public.work_set_goal_contributors(
  p_goal_id uuid,
  p_user_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_goal public.work_goals%rowtype;
  v_user_id uuid;
begin
  select * into v_goal from public.work_goals where id = p_goal_id for update;
  if not found then raise exception 'Goal not found'; end if;
  if v_actor is null then raise exception 'Authentication required'; end if;
  if v_goal.visibility = 'personal' then raise exception 'Personal Goals cannot have shared contributors'; end if;
  if v_goal.owner_id <> v_actor and not public.work_is_admin(v_actor) then
    raise exception 'Only the Goal owner or Admin can manage contributors';
  end if;

  for v_user_id in select distinct unnest(coalesce(p_user_ids, array[]::uuid[]))
  loop
    if not public.work_is_internal_user(v_user_id) then
      raise exception 'Goal contributors must be internal staff';
    end if;
  end loop;

  delete from public.work_goal_contributors where goal_id = p_goal_id;

  insert into public.work_goal_contributors(goal_id, user_id, added_by)
  select p_goal_id, ids.user_id, v_actor
  from (
    select distinct unnest(coalesce(p_user_ids, array[]::uuid[])) as user_id
  ) ids
  where ids.user_id <> v_goal.owner_id;
end;
$$;

create or replace function public.work_update_numeric_goal_progress(
  p_goal_id uuid,
  p_current_value numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_goal public.work_goals%rowtype;
  v_status text;
begin
  select * into v_goal from public.work_goals where id = p_goal_id for update;
  if not found then raise exception 'Goal not found'; end if;
  if v_actor is null then raise exception 'Authentication required'; end if;
  if v_goal.owner_id <> v_actor and not public.work_is_admin(v_actor) then
    raise exception 'Only the Goal owner or Admin can update progress';
  end if;
  if v_goal.progress_mode <> 'numeric' then raise exception 'This Goal does not use numeric progress'; end if;
  if p_current_value is null or p_current_value < 0 then raise exception 'Current value cannot be negative'; end if;

  v_status := case
    when v_goal.target_value is not null and p_current_value >= v_goal.target_value then 'achieved'
    when v_goal.status = 'achieved' then 'active'
    else v_goal.status
  end;

  update public.work_goals
  set current_value = p_current_value,
      status = v_status,
      updated_at = now()
  where id = p_goal_id;
end;
$$;

create or replace function public.work_get_goal_progress(p_goal_id uuid)
returns table (
  progress_mode text,
  current_value numeric,
  target_value numeric,
  completed_assignments bigint,
  total_assignments bigint,
  percent_complete numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_goal public.work_goals%rowtype;
  v_completed bigint := 0;
  v_total bigint := 0;
begin
  if v_actor is null or not public.work_can_read_goal(p_goal_id, v_actor) then
    raise exception 'Goal is not available to the current user';
  end if;

  select * into v_goal from public.work_goals where id = p_goal_id;
  if not found then raise exception 'Goal not found'; end if;

  if v_goal.progress_mode = 'tasks' then
    select
      count(*) filter (where a.status = 'completed'),
      count(*) filter (where a.status <> 'cancelled')
    into v_completed, v_total
    from public.work_tasks t
    join public.work_task_assignments a on a.task_id = t.id
    where t.goal_id = p_goal_id;

    return query
    select
      v_goal.progress_mode,
      null::numeric,
      null::numeric,
      v_completed,
      v_total,
      case when v_total = 0 then 0::numeric else round((v_completed::numeric / v_total::numeric) * 100, 1) end;
  else
    return query
    select
      v_goal.progress_mode,
      coalesce(v_goal.current_value, 0),
      v_goal.target_value,
      0::bigint,
      0::bigint,
      case
        when coalesce(v_goal.target_value, 0) <= 0 then 0::numeric
        else round((coalesce(v_goal.current_value, 0) / v_goal.target_value) * 100, 1)
      end;
  end if;
end;
$$;

revoke all on function public.work_create_goal(text,text,text,text,timestamptz,timestamptz,numeric,text) from public, anon;
revoke all on function public.work_update_goal(uuid,text,text,text,timestamptz,timestamptz,text) from public, anon;
revoke all on function public.work_set_goal_contributors(uuid,uuid[]) from public, anon;
revoke all on function public.work_update_numeric_goal_progress(uuid,numeric) from public, anon;
revoke all on function public.work_get_goal_progress(uuid) from public, anon;

grant execute on function public.work_create_goal(text,text,text,text,timestamptz,timestamptz,numeric,text) to authenticated;
grant execute on function public.work_update_goal(uuid,text,text,text,timestamptz,timestamptz,text) to authenticated;
grant execute on function public.work_set_goal_contributors(uuid,uuid[]) to authenticated;
grant execute on function public.work_update_numeric_goal_progress(uuid,numeric) to authenticated;
grant execute on function public.work_get_goal_progress(uuid) to authenticated;
