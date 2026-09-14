-- Staff default branch and transaction location attribution.
-- Reuses public.ops_locations; no parallel branch/location system is introduced.

alter table public.users
  add column if not exists default_location_id uuid references public.ops_locations(id);

alter table public.ops_orders
  add column if not exists branch_location_id uuid references public.ops_locations(id),
  add column if not exists handled_by_user_id uuid references public.users(id),
  add column if not exists handled_by_name text,
  add column if not exists branch_location_overridden_by uuid references public.users(id),
  add column if not exists branch_location_override_reason text,
  add column if not exists branch_location_overridden_at timestamptz;

alter table public.ops_repairs
  add column if not exists branch_location_id uuid references public.ops_locations(id),
  add column if not exists handled_by_user_id uuid references public.users(id),
  add column if not exists handled_by_name text,
  add column if not exists branch_location_overridden_by uuid references public.users(id),
  add column if not exists branch_location_override_reason text,
  add column if not exists branch_location_overridden_at timestamptz;

create index if not exists users_default_location_idx
  on public.users(default_location_id);
create index if not exists ops_orders_branch_location_idx
  on public.ops_orders(branch_location_id);
create index if not exists ops_repairs_branch_location_idx
  on public.ops_repairs(branch_location_id);

create or replace function public.staff_stamp_transaction_location()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_name text;
  v_email text;
  v_default_location uuid;
  v_requested_location uuid;
  v_override_reason text;
  v_location_valid boolean;
begin
  -- Service-role/system jobs have no auth.uid(). They remain able to insert
  -- system-generated records without pretending a staff member handled them.
  if v_actor is null then
    return new;
  end if;

  select u.role, u.name, u.email, u.default_location_id
  into v_role, v_name, v_email, v_default_location
  from public.users u
  where u.id = v_actor;

  if not found or not public.is_internal_staff_role(v_role) then
    return new;
  end if;

  new.handled_by_user_id := v_actor;
  new.handled_by_name := coalesce(nullif(btrim(v_name), ''), nullif(btrim(v_email), ''), v_actor::text);

  v_requested_location := new.branch_location_id;
  v_override_reason := nullif(btrim(new.branch_location_override_reason), '');

  if v_default_location is not null then
    select exists (
      select 1
      from public.ops_locations l
      where l.id = v_default_location
        and l.is_active = true
        and l.location_type = 'store'
    ) into v_location_valid;

    if not v_location_valid then
      raise exception 'Staff transaction requires an assigned default branch that is an active store location';
    end if;
  end if;

  -- Normal staff never get to choose a branch per transaction. Their default
  -- branch is the source of truth. Only Super Admin / Operations Lead can
  -- deliberately override it, and the override must carry an audit reason.
  if v_requested_location is not null
     and v_requested_location is distinct from v_default_location then
    if v_role not in ('super_admin', 'operations_lead') then
      raise exception 'Only Super Admin or Operations Lead can override transaction branch';
    end if;
    if v_override_reason is null then
      raise exception 'Branch override reason is required';
    end if;

    select exists (
      select 1
      from public.ops_locations l
      where l.id = v_requested_location
        and l.is_active = true
        and l.location_type = 'store'
    ) into v_location_valid;

    if not v_location_valid then
      raise exception 'Transaction branch must be an active store location';
    end if;

    new.branch_location_id := v_requested_location;
    new.branch_location_overridden_by := v_actor;
    new.branch_location_overridden_at := now();
    new.branch_location_override_reason := v_override_reason;
    return new;
  end if;

  if v_default_location is null then
    raise exception 'Staff transaction requires an assigned default branch';
  end if;

  new.branch_location_id := v_default_location;
  new.branch_location_overridden_by := null;
  new.branch_location_override_reason := null;
  new.branch_location_overridden_at := null;
  return new;
end;
$$;

revoke all on function public.staff_stamp_transaction_location() from public, anon, authenticated;

-- Customer-facing transaction attribution is enforced before insert even if a
-- future UI/server action forgets to send branch information.
drop trigger if exists staff_stamp_order_location on public.ops_orders;
create trigger staff_stamp_order_location
before insert on public.ops_orders
for each row execute function public.staff_stamp_transaction_location();

drop trigger if exists staff_stamp_repair_location on public.ops_repairs;
create trigger staff_stamp_repair_location
before insert on public.ops_repairs
for each row execute function public.staff_stamp_transaction_location();

create or replace function public.set_staff_default_location(
  p_user_id uuid,
  p_location_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_location_name text;
begin
  if auth.uid() is null or not public.ops_is_admin() then
    raise exception 'Not authorized';
  end if;

  select u.role into v_role
  from public.users u
  where u.id = p_user_id;

  if not found or not public.is_internal_staff_role(v_role) then
    raise exception 'Target user must be internal EmmyTech staff';
  end if;

  if p_location_id is not null then
    select l.name into v_location_name
    from public.ops_locations l
    where l.id = p_location_id
      and l.is_active = true
      and l.location_type = 'store';

    if not found then
      raise exception 'Default branch must be an active store location';
    end if;
  end if;

  update public.users
  set default_location_id = p_location_id
  where id = p_user_id;

  return jsonb_build_object(
    'user_id', p_user_id,
    'default_location_id', p_location_id,
    'location_name', v_location_name
  );
end;
$$;

revoke all on function public.set_staff_default_location(uuid, uuid) from public, anon;
grant execute on function public.set_staff_default_location(uuid, uuid) to authenticated;

create or replace function public.ops_override_transaction_branch(
  p_entity_type text,
  p_entity_id uuid,
  p_location_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_reason text := nullif(btrim(p_reason), '');
  v_location_name text;
  v_previous_location uuid;
  v_updated integer;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  select u.role into v_role
  from public.users u
  where u.id = v_actor;

  if v_role not in ('super_admin', 'operations_lead') then
    raise exception 'Only Super Admin or Operations Lead can override transaction branch';
  end if;

  if v_reason is null then
    raise exception 'Branch override reason is required';
  end if;

  select l.name into v_location_name
  from public.ops_locations l
  where l.id = p_location_id
    and l.is_active = true
    and l.location_type = 'store';

  if not found then
    raise exception 'Transaction branch must be an active store location';
  end if;

  if p_entity_type = 'order' then
    select o.branch_location_id into v_previous_location
    from public.ops_orders o
    where o.id = p_entity_id
    for update;

    if not found then
      raise exception 'Order not found';
    end if;

    update public.ops_orders
    set branch_location_id = p_location_id,
        branch_location_overridden_by = v_actor,
        branch_location_override_reason = v_reason,
        branch_location_overridden_at = now()
    where id = p_entity_id;
    get diagnostics v_updated = row_count;

    insert into public.ops_order_events(
      order_id, event_type, title, note, actor_id, metadata
    ) values (
      p_entity_id,
      'branch_override',
      'Transaction branch overridden',
      v_reason,
      v_actor,
      jsonb_build_object(
        'previous_location_id', v_previous_location,
        'new_location_id', p_location_id,
        'new_location_name', v_location_name
      )
    );
  elsif p_entity_type = 'repair' then
    select r.branch_location_id into v_previous_location
    from public.ops_repairs r
    where r.id = p_entity_id
    for update;

    if not found then
      raise exception 'Repair not found';
    end if;

    update public.ops_repairs
    set branch_location_id = p_location_id,
        branch_location_overridden_by = v_actor,
        branch_location_override_reason = v_reason,
        branch_location_overridden_at = now()
    where id = p_entity_id;
    get diagnostics v_updated = row_count;

    insert into public.ops_repair_events(
      repair_id, event_type, title, note, customer_visible, actor_id, metadata
    ) values (
      p_entity_id,
      'branch_override',
      'Transaction branch overridden',
      v_reason,
      false,
      v_actor,
      jsonb_build_object(
        'previous_location_id', v_previous_location,
        'new_location_id', p_location_id,
        'new_location_name', v_location_name
      )
    );
  else
    raise exception 'Entity type must be order or repair';
  end if;

  return jsonb_build_object(
    'entity_type', p_entity_type,
    'entity_id', p_entity_id,
    'branch_location_id', p_location_id,
    'branch_name', v_location_name,
    'overridden_by', v_actor,
    'reason', v_reason,
    'updated', v_updated
  );
end;
$$;

revoke all on function public.ops_override_transaction_branch(text, uuid, uuid, text) from public, anon;
grant execute on function public.ops_override_transaction_branch(text, uuid, uuid, text) to authenticated;
