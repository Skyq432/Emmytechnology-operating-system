create table if not exists public.ambassador_referral_attempts (
  id uuid primary key default gen_random_uuid(),
  visitor_id text not null,
  attempted_ambassador_id uuid not null references public.ambassadors(id) on delete cascade,
  owner_ambassador_id uuid references public.ambassadors(id) on delete set null,
  identity_id uuid references public.identities(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  spin_player_id uuid references public.spin_players(id) on delete set null,
  referral_code text not null,
  source text not null default 'spin_wheel',
  status text not null default 'pending_identity',
  person_label text,
  match_reason text,
  attempt_count integer not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ambassador_referral_attempts_visitor_not_blank check (length(trim(visitor_id)) between 8 and 200),
  constraint ambassador_referral_attempts_status_check check (status in ('pending_identity', 'credited', 'previously_referred', 'failed')),
  constraint ambassador_referral_attempts_attempt_count_check check (attempt_count > 0),
  constraint ambassador_referral_attempts_unique unique (visitor_id, attempted_ambassador_id, source)
);

create index if not exists ambassador_referral_attempts_attempted_idx
  on public.ambassador_referral_attempts (attempted_ambassador_id, last_seen_at desc);
create index if not exists ambassador_referral_attempts_owner_idx
  on public.ambassador_referral_attempts (owner_ambassador_id, last_seen_at desc);
create index if not exists ambassador_referral_attempts_identity_idx
  on public.ambassador_referral_attempts (identity_id) where identity_id is not null;
create index if not exists ambassador_referral_attempts_lead_idx
  on public.ambassador_referral_attempts (lead_id) where lead_id is not null;

alter table public.ambassador_referral_attempts enable row level security;
revoke all on table public.ambassador_referral_attempts from public, anon;
grant select on table public.ambassador_referral_attempts to authenticated;
grant all on table public.ambassador_referral_attempts to service_role;

drop policy if exists "Ambassadors view own referral attempts" on public.ambassador_referral_attempts;
create policy "Ambassadors view own referral attempts"
  on public.ambassador_referral_attempts
  for select
  to authenticated
  using (
    exists (
      select 1 from public.ambassadors a
      where a.id = ambassador_referral_attempts.attempted_ambassador_id
        and a.user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.users u
      where u.id = (select auth.uid()) and u.role = 'admin'
    )
  );

insert into public.ambassador_referral_attempts (
  visitor_id, attempted_ambassador_id, owner_ambassador_id,
  identity_id, lead_id, spin_player_id, referral_code,
  source, status, person_label, match_reason,
  attempt_count, first_seen_at, last_seen_at, resolved_at
)
select
  rc.visitor_id,
  rc.ambassador_id,
  asa.ambassador_id,
  coalesce(rc.identity_id, asa.identity_id),
  coalesce(rc.lead_id, asa.lead_id),
  asa.spin_player_id,
  rc.referral_code,
  'spin_wheel',
  case
    when asa.qualified_at is null then 'pending_identity'
    when rc.ambassador_id = asa.ambassador_id then 'credited'
    else 'previously_referred'
  end,
  coalesce(i.primary_name, sp.full_name, i.primary_phone, sp.phone_number, i.primary_email, sp.email, 'Spin Wheel visitor'),
  case when rc.ambassador_id = asa.ambassador_id then 'backfilled_first_touch_owner' else 'backfilled_first_touch_preserved' end,
  count(*)::integer,
  min(rc.created_at),
  max(rc.created_at),
  asa.qualified_at
from public.referral_clicks rc
join public.ambassador_spin_attributions asa on asa.visitor_id = rc.visitor_id
left join public.identities i on i.id = coalesce(rc.identity_id, asa.identity_id)
left join public.spin_players sp on sp.id = asa.spin_player_id
where rc.source = 'spin_wheel'
  and rc.visitor_id is not null
  and rc.ambassador_id is not null
group by
  rc.visitor_id, rc.ambassador_id, asa.ambassador_id,
  coalesce(rc.identity_id, asa.identity_id), coalesce(rc.lead_id, asa.lead_id),
  asa.spin_player_id, rc.referral_code, asa.qualified_at,
  i.primary_name, sp.full_name, i.primary_phone, sp.phone_number, i.primary_email, sp.email
on conflict (visitor_id, attempted_ambassador_id, source) do nothing;

create unique index if not exists leads_ambassador_submission_key_unique
  on public.leads ((source_detail ->> 'submission_key'))
  where lead_type = 'ambassador_submission'
    and source_detail ->> 'submission_key' is not null;

create or replace function public.submit_ambassador_lead(
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text default null,
  p_interest text default null,
  p_notes text default null,
  p_submission_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_ambassador public.ambassadors%rowtype;
  v_lead_id uuid;
  v_existing_id uuid;
  v_duplicate_id uuid;
  v_phone text;
  v_email text := nullif(lower(trim(p_customer_email)), '');
  v_submission_key text := nullif(trim(p_submission_key), '');
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_ambassador
  from public.ambassadors
  where user_id = v_user_id and status = 'active'
  limit 1;

  if v_ambassador.id is null then
    raise exception 'An active Ambassador account is required';
  end if;

  if nullif(trim(p_customer_name), '') is null then
    raise exception 'Customer name is required';
  end if;

  if nullif(trim(p_customer_phone), '') is null then
    raise exception 'Customer phone is required';
  end if;

  if v_submission_key is null or length(v_submission_key) > 100 then
    raise exception 'A valid submission key is required';
  end if;

  select id into v_existing_id
  from public.leads
  where lead_type = 'ambassador_submission'
    and source_detail ->> 'submission_key' = v_submission_key
  limit 1;

  if v_existing_id is not null then
    return jsonb_build_object('lead_id', v_existing_id, 'status', 'pending', 'duplicate_submission', true);
  end if;

  v_phone := coalesce(public.normalize_contact_phone(p_customer_phone), trim(p_customer_phone));

  select l.id into v_duplicate_id
  from public.leads l
  where l.merged_into_lead_id is null
    and (
      public.normalize_contact_phone(l.customer_phone) = v_phone
      or (v_email is not null and lower(trim(coalesce(l.customer_email, ''))) = v_email)
    )
  order by l.created_at asc
  limit 1;

  insert into public.leads (
    ambassador_id, source, source_detail, customer_name, customer_phone,
    customer_email, status, notes, lead_type, funnel_stage,
    lead_approval_status, approved_as_lead, duplicate_status,
    needs_merge_review, click_count, last_clicked_at, created_at, updated_at
  ) values (
    v_ambassador.id,
    'direct',
    jsonb_strip_nulls(jsonb_build_object(
      'channel', 'ambassador_manual_submission',
      'submission_key', v_submission_key,
      'submitted_by_user_id', v_user_id,
      'interest', nullif(trim(p_interest), ''),
      'possible_duplicate_lead_id', v_duplicate_id
    )),
    trim(p_customer_name),
    v_phone,
    v_email,
    'new',
    nullif(trim(p_notes), ''),
    'ambassador_submission',
    'new_lead',
    'pending',
    false,
    case when v_duplicate_id is null then 'unique' else 'possible_duplicate' end,
    v_duplicate_id is not null,
    1,
    now(),
    now(),
    now()
  ) returning id into v_lead_id;

  insert into public.lead_events (
    lead_id, ambassador_id, event_type, event_title,
    event_description, event_data, created_by
  ) values (
    v_lead_id,
    v_ambassador.id,
    'lead_submitted_for_approval',
    'Lead submitted for approval',
    'Ambassador manually submitted a lead for Admin review.',
    jsonb_build_object('possible_duplicate_lead_id', v_duplicate_id, 'interest', nullif(trim(p_interest), '')),
    v_user_id
  );

  insert into public.admin_notifications (
    type, title, message, related_table, related_id,
    ambassador_id, lead_id, is_read, created_at
  ) values (
    'lead_approval_required',
    case when v_duplicate_id is null then 'Ambassador lead awaiting approval' else 'Possible duplicate lead awaiting review' end,
    coalesce(v_ambassador.display_name, v_ambassador.ambassador_tag, 'Ambassador') || ' submitted a lead for review.',
    'leads', v_lead_id, v_ambassador.id, v_lead_id, false, now()
  );

  return jsonb_build_object(
    'lead_id', v_lead_id,
    'status', 'pending',
    'possible_duplicate', v_duplicate_id is not null,
    'possible_duplicate_lead_id', v_duplicate_id,
    'duplicate_submission', false
  );
end;
$$;

revoke all on function public.submit_ambassador_lead(text, text, text, text, text, text) from public;
revoke all on function public.submit_ambassador_lead(text, text, text, text, text, text) from anon;
grant execute on function public.submit_ambassador_lead(text, text, text, text, text, text) to authenticated;
grant execute on function public.submit_ambassador_lead(text, text, text, text, text, text) to service_role;

create or replace function public.get_ambassador_leaderboard(
  p_start_at timestamptz,
  p_end_at timestamptz
)
returns table (
  rank bigint,
  ambassador_id uuid,
  full_name text,
  total_conversions bigint,
  total_leads bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_start_at is null or p_end_at is null or p_start_at >= p_end_at then
    raise exception 'A valid reporting period is required';
  end if;

  return query
  with performance as (
    select
      a.id as ambassador_id,
      coalesce(u.name, a.ambassador_tag, 'Ambassador') as full_name,
      coalesce(conversion_totals.total_conversions, 0) as total_conversions,
      coalesce(lead_totals.total_leads, 0) as total_leads
    from public.ambassadors a
    left join public.users u on u.id = a.user_id
    left join lateral (
      select count(*) as total_conversions
      from public.conversions c
      where c.ambassador_id = a.id
        and c.approved_at >= p_start_at
        and c.approved_at < p_end_at
    ) conversion_totals on true
    left join lateral (
      select count(*) as total_leads
      from public.leads l
      where l.ambassador_id = a.id
        and coalesce(l.approved_as_lead, false)
        and l.merged_into_lead_id is null
        and coalesce(l.approved_at, l.created_at) >= p_start_at
        and coalesce(l.approved_at, l.created_at) < p_end_at
    ) lead_totals on true
    where a.status = 'active'
  ), ranked as (
    select
      row_number() over (
        order by performance.total_conversions desc,
                 performance.total_leads desc,
                 performance.full_name asc,
                 performance.ambassador_id asc
      ) as rank,
      performance.*
    from performance
    where performance.total_conversions > 0 or performance.total_leads > 0
  )
  select ranked.rank, ranked.ambassador_id, ranked.full_name,
         ranked.total_conversions, ranked.total_leads
  from ranked
  order by ranked.rank;
end;
$$;

revoke all on function public.get_ambassador_leaderboard(timestamptz, timestamptz) from public;
revoke all on function public.get_ambassador_leaderboard(timestamptz, timestamptz) from anon;
grant execute on function public.get_ambassador_leaderboard(timestamptz, timestamptz) to authenticated;
grant execute on function public.get_ambassador_leaderboard(timestamptz, timestamptz) to service_role;

create or replace function public.recalculate_ambassador_total_leads(p_ambassador_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_ambassador_id is null then return; end if;
  update public.ambassadors
  set total_leads = (
    select count(*)::integer from public.leads where ambassador_id = p_ambassador_id
  )
  where id = p_ambassador_id;
end;
$$;

create or replace function public.sync_ambassador_total_leads_from_lead()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalculate_ambassador_total_leads(old.ambassador_id);
    return old;
  end if;
  if tg_op = 'UPDATE' and old.ambassador_id is distinct from new.ambassador_id then
    perform public.recalculate_ambassador_total_leads(old.ambassador_id);
  end if;
  perform public.recalculate_ambassador_total_leads(new.ambassador_id);
  return new;
end;
$$;

drop trigger if exists sync_ambassador_total_leads_from_lead on public.leads;
create trigger sync_ambassador_total_leads_from_lead
after insert or delete or update of ambassador_id on public.leads
for each row execute function public.sync_ambassador_total_leads_from_lead();

create or replace function public.enforce_ambassador_total_leads()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.total_leads := (
    select count(*)::integer from public.leads where ambassador_id = new.id
  );
  return new;
end;
$$;

drop trigger if exists enforce_ambassador_total_leads on public.ambassadors;
create trigger enforce_ambassador_total_leads
before insert or update of total_leads on public.ambassadors
for each row execute function public.enforce_ambassador_total_leads();

update public.ambassadors a
set total_leads = (
  select count(*)::integer from public.leads l where l.ambassador_id = a.id
);

revoke all on function public.recalculate_ambassador_total_leads(uuid) from public;
revoke all on function public.sync_ambassador_total_leads_from_lead() from public;
revoke all on function public.enforce_ambassador_total_leads() from public;
grant execute on function public.recalculate_ambassador_total_leads(uuid) to authenticated;
grant execute on function public.recalculate_ambassador_total_leads(uuid) to service_role;

notify pgrst, 'reload schema';
