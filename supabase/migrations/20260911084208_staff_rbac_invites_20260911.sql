alter table public.users
  drop constraint if exists users_role_check;

alter table public.users
  add constraint users_role_check check (
    role = any (array[
      'admin'::text,
      'ambassador'::text,
      'super_admin'::text,
      'growth_lead'::text,
      'marketing_manager'::text,
      'front_desk'::text,
      'operations_lead'::text,
      'technician'::text,
      'sales_analyst'::text
    ])
  );

alter table public.invite_links
  drop constraint if exists invite_links_role_check;

alter table public.invite_links
  add constraint invite_links_role_check check (
    role = any (array[
      'ambassador'::text,
      'super_admin'::text,
      'growth_lead'::text,
      'marketing_manager'::text,
      'front_desk'::text,
      'operations_lead'::text,
      'technician'::text,
      'sales_analyst'::text
    ])
  );

create or replace function public.is_internal_staff_role(p_role text)
returns boolean
language sql
immutable
as $$
  select p_role = any (array[
    'super_admin'::text,
    'admin'::text,
    'growth_lead'::text,
    'marketing_manager'::text,
    'front_desk'::text,
    'operations_lead'::text,
    'technician'::text,
    'sales_analyst'::text
  ]);
$$;

create or replace function public.get_invite_link(p_code text)
returns table (
  code text,
  role text,
  status text,
  max_uses integer,
  used_count integer,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    i.code,
    i.role,
    i.status,
    i.max_uses,
    i.used_count,
    i.expires_at
  from public.invite_links i
  where i.code = trim(p_code)
    and i.status = 'active'
    and (i.expires_at is null or i.expires_at > now())
    and (i.max_uses is null or coalesce(i.used_count, 0) < i.max_uses)
  limit 1;
$$;

grant execute on function public.get_invite_link(text) to anon, authenticated;

create or replace function public.generate_invite_link_for_role(
  p_role text,
  p_max_uses integer default 1,
  p_expiry_days integer default 7
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor_role text;
  v_code text;
begin
  select u.role into v_actor_role
  from public.users u
  where u.id = auth.uid();

  if p_role not in (
    'ambassador',
    'super_admin',
    'growth_lead',
    'marketing_manager',
    'front_desk',
    'operations_lead',
    'technician',
    'sales_analyst'
  ) then
    raise exception 'Invalid invite role';
  end if;

  if p_max_uses is null or p_max_uses < 1 then
    raise exception 'Max uses must be at least one';
  end if;

  if p_expiry_days is null or p_expiry_days < 0 then
    raise exception 'Expiry days cannot be negative';
  end if;

  if p_role = 'ambassador' then
    if v_actor_role not in ('super_admin', 'admin', 'growth_lead', 'marketing_manager') then
      raise exception 'Not authorized to create Ambassador invitations';
    end if;
  else
    if v_actor_role not in ('super_admin', 'admin') then
      raise exception 'Not authorized to create staff invitations';
    end if;

    if p_role = 'super_admin' and v_actor_role <> 'super_admin' then
      perform pg_advisory_xact_lock(hashtext('emmytech-super-admin-bootstrap'));
      if exists (select 1 from public.users where role = 'super_admin') then
        raise exception 'Only a Supreme Administrator can invite another Supreme Administrator';
      end if;
    end if;
  end if;

  loop
    v_code := 'EMMY-' || upper(substring(md5(random()::text || clock_timestamp()::text), 1, 8));
    exit when not exists (select 1 from public.invite_links where code = v_code);
  end loop;

  insert into public.invite_links (
    code,
    created_by,
    max_uses,
    used_count,
    expires_at,
    role,
    status
  ) values (
    v_code,
    auth.uid(),
    p_max_uses,
    0,
    case when p_expiry_days > 0 then now() + make_interval(days => p_expiry_days) else null end,
    p_role,
    'active'
  );

  return v_code;
end;
$$;

grant execute on function public.generate_invite_link_for_role(text, integer, integer) to authenticated;

create or replace function public.generate_invite_link(
  p_admin_id uuid,
  p_max_uses integer default 1,
  p_expiry_days integer default 7
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null or auth.uid() <> p_admin_id then
    raise exception 'Invite creator identity does not match the authenticated user';
  end if;

  return public.generate_invite_link_for_role('ambassador', p_max_uses, p_expiry_days);
end;
$$;

grant execute on function public.generate_invite_link(uuid, integer, integer) to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ambassador_tag text;
  v_referral_code text;
  v_whatsapp_link text;
  v_name text;
  v_random text;
  v_invite_code text;
begin
  v_invite_code := nullif(trim(new.raw_user_meta_data->>'invite_code'), '');
  if v_invite_code is not null then
    return new;
  end if;

  v_name := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1));
  v_random := substring(md5(random()::text), 1, 4);

  insert into public.users (id, name, email, role)
  values (new.id, v_name, new.email, 'ambassador')
  on conflict (id) do update
  set email = excluded.email,
      name = excluded.name;

  v_ambassador_tag := '#EMMY_' || upper(regexp_replace(v_name, '[^a-zA-Z0-9]', '', 'g')) || '_' || v_random;
  v_referral_code := upper(regexp_replace(v_name, '[^a-zA-Z0-9]', '', 'g')) || lpad(floor(random() * 10000)::text, 4, '0');
  v_whatsapp_link := 'https://wa.me/2348146503700?text=Hi%20I%20came%20from%20' || v_referral_code;

  insert into public.ambassadors (user_id, ambassador_tag, referral_code, whatsapp_number, whatsapp_link, status)
  values (new.id, v_ambassador_tag, v_referral_code, '+2348146503700', v_whatsapp_link, 'active')
  on conflict (user_id) do nothing;

  return new;
exception when others then
  raise notice 'Error in handle_new_user: %', sqlerrm;
  return new;
end;
$$;

create or replace function public.handle_new_invite_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_invite public.invite_links%rowtype;
  v_invite_code text;
  v_role text;
  v_name text;
  v_tag text;
  v_custom_code text;
  v_referral_code text;
begin
  v_invite_code := nullif(trim(new.raw_user_meta_data->>'invite_code'), '');
  if v_invite_code is null then
    return new;
  end if;

  select * into v_invite
  from public.invite_links
  where code = v_invite_code
  for update;

  if not found
     or v_invite.status <> 'active'
     or (v_invite.expires_at is not null and v_invite.expires_at <= now())
     or (v_invite.max_uses is not null and coalesce(v_invite.used_count, 0) >= v_invite.max_uses) then
    raise exception 'Invalid or expired invite code';
  end if;

  v_role := coalesce(v_invite.role, 'ambassador');
  if v_role <> 'ambassador' and not public.is_internal_staff_role(v_role) then
    raise exception 'Invite contains an unsupported role';
  end if;

  v_name := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1));

  insert into public.users (id, email, name, role, invite_code, created_at)
  values (new.id, new.email, v_name, v_role, v_invite_code, now())
  on conflict (id) do update
  set email = excluded.email,
      name = excluded.name,
      invite_code = excluded.invite_code;

  if v_role = 'ambassador' then
    v_tag := upper(regexp_replace(v_name, '[^a-zA-Z0-9]', '', 'g'));
    v_custom_code := lower(regexp_replace(replace(v_name, ' ', ''), '[^a-zA-Z0-9_-]', '', 'g'));
    if v_custom_code = '' then
      v_custom_code := 'ambassador-' || lower(substring(md5(new.id::text), 1, 8));
    end if;
    v_referral_code := v_tag || floor(random() * 9000 + 1000)::text;

    insert into public.ambassadors (
      user_id, ambassador_tag, referral_code, custom_referral_code, custom_referral_code_set,
      whatsapp_number, whatsapp_link, bio, social_links, total_points, total_leads,
      total_conversions, available_balance, total_cashed_out, status, created_at
    ) values (
      new.id, '#' || v_tag, v_referral_code, v_custom_code, true,
      '2348146503700', 'https://ambassador.emmytechnology.com/r/' || v_custom_code,
      null, '{}'::jsonb, 0, 0, 0, 0, 0, 'active', now()
    ) on conflict (user_id) do nothing;
  end if;

  update public.invite_links
  set used_count = coalesce(used_count, 0) + 1,
      status = case
        when max_uses is not null and coalesce(used_count, 0) + 1 >= max_uses then 'used'
        else status
      end
  where id = v_invite.id;

  return new;
end;
$$;

create or replace function public.validate_invite_code()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.invite_code is not null then
    if not exists (
      select 1
      from public.invite_links i
      where i.code = new.invite_code
        and i.status = 'active'
        and (i.expires_at is null or i.expires_at > now())
        and (i.max_uses is null or coalesce(i.used_count, 0) < i.max_uses)
    ) then
      raise exception 'Invalid or expired invite code';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.remove_ambassador_on_admin()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if public.is_internal_staff_role(new.role)
     and not public.is_internal_staff_role(old.role) then
    delete from public.ambassadors where user_id = new.id;
  end if;
  return new;
end;
$$;

create or replace function public.set_staff_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor_role text;
  v_target_role text;
begin
  select role into v_actor_role from public.users where id = auth.uid();
  if v_actor_role not in ('super_admin', 'admin') then
    raise exception 'Not authorized to manage staff roles';
  end if;

  if not public.is_internal_staff_role(p_role) then
    raise exception 'Invalid staff role';
  end if;

  select role into v_target_role from public.users where id = p_user_id for update;
  if v_target_role is null then
    raise exception 'Staff user not found';
  end if;

  if p_role = 'super_admin' and v_actor_role <> 'super_admin' then
    perform pg_advisory_xact_lock(hashtext('emmytech-super-admin-bootstrap'));
    if exists (select 1 from public.users where role = 'super_admin' and id <> p_user_id) then
      raise exception 'Only a Supreme Administrator can assign Supreme Administrator access';
    end if;
  end if;

  if p_role = 'admin' and v_actor_role <> 'super_admin' then
    raise exception 'Only a Supreme Administrator can assign legacy Administrator access';
  end if;

  if v_target_role = 'super_admin' and v_actor_role <> 'super_admin' then
    raise exception 'Only a Supreme Administrator can change a Supreme Administrator';
  end if;

  update public.users set role = p_role where id = p_user_id;
end;
$$;

grant execute on function public.set_staff_role(uuid, text) to authenticated;

create or replace function public.guard_user_role_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor_role text;
begin
  if old.role is not distinct from new.role then
    return new;
  end if;

  select role into v_actor_role from public.users where id = auth.uid();
  if v_actor_role not in ('super_admin', 'admin') then
    raise exception 'Role changes must be performed by an authorised administrator';
  end if;

  if new.role = 'super_admin' and v_actor_role <> 'super_admin' then
    if exists (select 1 from public.users where role = 'super_admin' and id <> new.id) then
      raise exception 'Only a Supreme Administrator can assign Supreme Administrator access';
    end if;
  end if;

  if old.role = 'super_admin' and v_actor_role <> 'super_admin' then
    raise exception 'Only a Supreme Administrator can change a Supreme Administrator';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_user_role_change on public.users;
create trigger guard_user_role_change
before update of role on public.users
for each row execute function public.guard_user_role_change();

drop policy if exists "Anyone can validate active invite links" on public.invite_links;
drop policy if exists "Admins manage invites" on public.invite_links;

create policy "Administrators manage all invites"
on public.invite_links
for all
to authenticated
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role in ('super_admin', 'admin')
  )
)
with check (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role in ('super_admin', 'admin')
  )
);

create policy "Marketing leaders manage Ambassador invites"
on public.invite_links
for all
to authenticated
using (
  role = 'ambassador'
  and exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role in ('growth_lead', 'marketing_manager')
  )
)
with check (
  role = 'ambassador'
  and exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role in ('growth_lead', 'marketing_manager')
  )
);
