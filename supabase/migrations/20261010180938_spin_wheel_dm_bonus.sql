-- Spin Wheel: one-time "message EmmyTech" bonus spin for brand-new players who finish
-- registration with zero spins left. Reuses the dm_bonus_claimed / dm_clicked_at columns
-- on spin_players, which already existed but had no backing logic. Same trust-based
-- pattern as claim_spin_share_bonus (grant on the honor system once WhatsApp is opened),
-- but one-time per player rather than a rolling weekly window.
create or replace function public.claim_spin_dm_bonus(p_spin_player_id uuid, p_spin_log_id uuid)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_player public.spin_players%rowtype;
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

  if coalesce(v_player.dm_bonus_claimed, false) then
    return jsonb_build_object(
      'ok', true,
      'granted', false,
      'reason', 'already_claimed',
      'spins_remaining', coalesce(v_player.spins_remaining, 0)
    );
  end if;

  update public.spin_players
  set
    dm_bonus_claimed = true,
    dm_clicked_at = now(),
    spins_remaining = coalesce(spins_remaining, 0) + 1,
    updated_at = now()
  where id = p_spin_player_id
  returning * into v_player;

  insert into public.identity_events (
    identity_id, event_type, title, description, metadata, created_at
  )
  values (
    v_player.identity_id,
    'spin_dm_bonus_awarded',
    'Bonus spin awarded for messaging EmmyTech',
    'One bonus spin was awarded for messaging EmmyTech directly right after the first spin.',
    jsonb_build_object(
      'spin_player_id', p_spin_player_id,
      'spin_log_id', p_spin_log_id,
      'spins_awarded', 1
    ),
    now()
  );

  return jsonb_build_object(
    'ok', true,
    'granted', true,
    'reason', 'dm_bonus_awarded',
    'claimed_at', now(),
    'spins_remaining', coalesce(v_player.spins_remaining, 0)
  );
end;
$function$;

revoke all on function public.claim_spin_dm_bonus(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_spin_dm_bonus(uuid, uuid) to service_role;
