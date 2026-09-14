create or replace function public.claim_spin_share_bonus(
  p_spin_player_id uuid,
  p_spin_log_id uuid
)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_player public.spin_players%rowtype;
  v_claim_id uuid;
  v_last_claim_at timestamptz;
  v_next_eligible_at timestamptz;
begin
  if p_spin_player_id is null or p_spin_log_id is null then
    raise exception 'spin_player_id and spin_log_id are required'
      using errcode = '22023';
  end if;

  select *
  into v_player
  from public.spin_players
  where id = p_spin_player_id
  for update;

  if not found then
    raise exception 'Spin player not found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.spin_logs
    where id = p_spin_log_id
      and spin_player_id = p_spin_player_id
  ) then
    raise exception 'Completed spin not found for this player'
      using errcode = 'P0002';
  end if;

  -- Serialize share-bonus claims for the same canonical identity, even if the
  -- identity happens to have more than one spin_player record.
  if v_player.identity_id is not null then
    perform 1
    from public.identities
    where id = v_player.identity_id
    for update;
  end if;

  -- One rewarded status share per rolling 7-day period, at identity level.
  select max(c.created_at)
  into v_last_claim_at
  from public.spin_share_bonus_claims c
  join public.spin_players sp on sp.id = c.spin_player_id
  where (
    (v_player.identity_id is not null and sp.identity_id = v_player.identity_id)
    or
    (v_player.identity_id is null and sp.id = p_spin_player_id)
  );

  if v_last_claim_at is not null
     and v_last_claim_at > now() - interval '7 days' then
    v_next_eligible_at := v_last_claim_at + interval '7 days';

    return jsonb_build_object(
      'ok', true,
      'granted', false,
      'reason', 'weekly_share_bonus_already_claimed',
      'last_claimed_at', v_last_claim_at,
      'next_eligible_at', v_next_eligible_at,
      'spins_remaining', coalesce(v_player.spins_remaining, 0)
    );
  end if;

  insert into public.spin_share_bonus_claims (spin_player_id, spin_log_id)
  values (p_spin_player_id, p_spin_log_id)
  on conflict (spin_log_id) do nothing
  returning id into v_claim_id;

  if v_claim_id is null then
    return jsonb_build_object(
      'ok', true,
      'granted', false,
      'reason', 'already_claimed',
      'spins_remaining', coalesce(v_player.spins_remaining, 0)
    );
  end if;

  update public.spin_players
  set
    spins_remaining = coalesce(spins_remaining, 0) + 1,
    updated_at = now()
  where id = p_spin_player_id
  returning * into v_player;

  insert into public.identity_events (
    identity_id,
    event_type,
    title,
    description,
    metadata,
    created_at
  )
  values (
    v_player.identity_id,
    'spin_status_share_bonus_awarded',
    'Weekly status share spin awarded',
    'One bonus spin was awarded for the identity weekly status-share reward.',
    jsonb_build_object(
      'spin_player_id', p_spin_player_id,
      'spin_log_id', p_spin_log_id,
      'spins_awarded', 1,
      'cooldown_days', 7
    ),
    now()
  );

  return jsonb_build_object(
    'ok', true,
    'granted', true,
    'reason', 'weekly_share_bonus_awarded',
    'claimed_at', now(),
    'next_eligible_at', now() + interval '7 days',
    'spins_remaining', coalesce(v_player.spins_remaining, 0)
  );
end;
$function$;
