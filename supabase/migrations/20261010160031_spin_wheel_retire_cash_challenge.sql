-- Part 1a: backfill — convert every outstanding 24h cash challenge to Cash Off in full,
-- regardless of whether it ever hit the cash_target (confirmed: full balance, not capped).
do $$
declare
  v_row record;
  v_credit jsonb;
begin
  for v_row in
    select * from public.spin_cash_challenges
    where status in ('active', 'cash_eligible')
    order by created_at
  loop
    if v_row.cash_balance > 0 then
      v_credit := public.credit_cash_off(
        p_identity_id => v_row.identity_id,
        p_amount => v_row.cash_balance,
        p_transaction_type => 'promotion',
        p_source_system => 'spin_cash_challenge_shutdown',
        p_source_reference => v_row.id::text,
        p_reason => format(
          '24-hour cash challenge retired — %s converted to Cash Off.',
          trim(to_char(v_row.cash_balance, 'FM999999999990.00'))
        ),
        p_metadata => jsonb_build_object(
          'challenge_id', v_row.id,
          'cash_balance', v_row.cash_balance,
          'cash_target', v_row.cash_target,
          'previous_status', v_row.status
        ),
        p_idempotency_key => 'cash-challenge-shutdown:' || v_row.id::text
      );
    else
      v_credit := null;
    end if;

    update public.spin_cash_challenges
    set status = 'converted_to_cash_off',
        converted_cash_off_amount = v_row.cash_balance,
        processed_at = now(),
        updated_at = now()
    where id = v_row.id;

    update public.spin_players
    set wallet_balance = 0,
        cashout_eligible = false,
        total_cash_off_won = coalesce(total_cash_off_won, 0) + v_row.cash_balance,
        updated_at = now()
    where id = v_row.spin_player_id;

    insert into public.identity_events (
      identity_id, event_type, title, description, metadata, created_at
    ) values (
      v_row.identity_id,
      'cash_challenge_converted_to_cash_off',
      '24-hour cash challenge retired',
      format('%s converted to Cash Off (challenge mechanic retired).', v_row.cash_balance),
      jsonb_build_object(
        'challenge_id', v_row.id,
        'cash_balance', v_row.cash_balance,
        'cash_off_amount', v_row.cash_balance,
        'previous_status', v_row.status,
        'cash_off_transaction_id', v_credit->>'transaction_id'
      ),
      now()
    );
  end loop;
end $$;

-- Part 1b: relabel the remaining "cash" prize items so they consistently say "Cash Off",
-- matching the rows that already do.
update public.spin_rule_items
set result_label = '₦' || trunc(cash_amount)::text || ' Cash Off'
where is_active = true
  and result_type = 'cash'
  and result_label not ilike '%cash off%';

-- Part 2: stop creating new 24h challenges — every future cash win goes straight to
-- Cash Off, credited instantly, no accumulation/expiry window.
create or replace function public.complete_cash_challenge_spin(
  p_spin_player_id uuid,
  p_rule_item_id uuid,
  p_expected_spin_number integer,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_player public.spin_players%rowtype;
  v_updated_player public.spin_players%rowtype;
  v_item record;
  v_existing_log public.spin_logs%rowtype;
  v_spin_log public.spin_logs%rowtype;
  v_cash_off_balance numeric(14,2) := 0;
  v_cash_amount numeric(14,2) := 0;
  v_cash_off_credit jsonb;
  v_cash_off_after numeric(14,2) := 0;
  v_bonus_spins integer := 0;
  v_spin_number integer;
  v_new_spins_remaining integer;
  v_usage_count integer := 0;
  v_letters text[];
  v_next_letter text;
  v_letter_code text;
  v_result_label text;
  v_completed boolean := false;
begin
  if p_request_id is null then
    raise exception 'request_id is required' using errcode = '22023';
  end if;

  select * into v_existing_log
  from public.spin_logs
  where request_id = p_request_id;

  if found then
    select * into v_updated_player from public.spin_players where id = p_spin_player_id;

    return jsonb_build_object(
      'ok', true,
      'idempotent_replay', true,
      'result', jsonb_build_object(
        'label', v_existing_log.result_label,
        'result_type', v_existing_log.result_type,
        'cash_amount', coalesce(v_existing_log.cash_amount, 0),
        'cash_off_credited', coalesce(v_existing_log.cash_off_after, 0) - coalesce(v_existing_log.cash_off_before, 0),
        'cash_off_balance_after', coalesce(v_existing_log.cash_off_after, 0),
        'letter_code', v_existing_log.letter_code,
        'spin_log_id', v_existing_log.id,
        'request_id', p_request_id
      ),
      'spinPlayer', to_jsonb(v_updated_player)
    );
  end if;

  select * into v_player
  from public.spin_players
  where id = p_spin_player_id
  for update;

  if not found then
    raise exception 'Spin player not found' using errcode = 'P0002';
  end if;

  if v_player.identity_id is null then
    raise exception 'Spin player has no CRM identity' using errcode = 'P0001';
  end if;

  if coalesce(v_player.spins_remaining, 0) <= 0 then
    raise exception 'No spins left' using errcode = 'P0001';
  end if;

  v_spin_number := coalesce(v_player.spin_sequence_step, 0) + 1;

  if p_expected_spin_number is null or p_expected_spin_number <> v_spin_number then
    raise exception 'Spin sequence changed. Expected %, received %',
      v_spin_number, p_expected_spin_number using errcode = '40001';
  end if;

  select
    i.id, i.result_label, i.result_type, i.cash_amount, i.letter_code,
    i.bonus_spins, i.max_uses_per_user, i.is_active as item_active,
    g.id as group_id, g.group_type, g.start_spin, g.end_spin,
    g.priority, g.is_active as group_active
  into v_item
  from public.spin_rule_items i
  join public.spin_rule_groups g on g.id = i.group_id
  where i.id = p_rule_item_id;

  if not found or coalesce(v_item.item_active, false) = false
     or coalesce(v_item.group_active, false) = false then
    raise exception 'Spin rule item is not active' using errcode = 'P0001';
  end if;

  if v_spin_number < v_item.start_spin
     or (v_item.end_spin is not null and v_spin_number > v_item.end_spin) then
    raise exception 'Spin rule item does not apply to this spin number' using errcode = 'P0001';
  end if;

  if coalesce(v_item.max_uses_per_user, 999) < 999 then
    select count(*) into v_usage_count
    from public.spin_user_rule_usage u
    where u.spin_player_id = v_player.id
      and u.spin_rule_item_id = v_item.id;

    if v_usage_count >= v_item.max_uses_per_user then
      raise exception 'Maximum uses reached for this result' using errcode = 'P0001';
    end if;
  end if;

  v_result_label := v_item.result_label;
  v_letter_code := v_item.letter_code;
  v_cash_amount := round(greatest(coalesce(v_item.cash_amount, 0), 0)::numeric, 2);
  v_bonus_spins := greatest(coalesce(v_item.bonus_spins, 0), 0);
  v_letters := coalesce(v_player.letters_unlocked, '{}'::text[]);

  if v_item.result_type = 'letter' then
    select s.segment_code into v_next_letter
    from public.spin_letter_segments s
    where coalesce(s.is_active, true) = true
      and not (s.segment_code = any(v_letters))
    order by s.segment_order
    limit 1;

    if v_next_letter is not null then
      v_letter_code := v_next_letter;
      v_result_label := v_next_letter;
      if not (v_next_letter = any(v_letters)) then
        v_letters := array_append(v_letters, v_next_letter);
      end if;
    end if;

    select not exists (
      select 1 from public.spin_letter_segments s
      where coalesce(s.is_active, true) = true
        and not (s.segment_code = any(v_letters))
    ) into v_completed;
  else
    v_completed := coalesce(v_player.letter_challenge_completed, false);
  end if;

  v_new_spins_remaining := coalesce(v_player.spins_remaining, 0) - 1 + v_bonus_spins;

  select coalesce(balance, 0) into v_cash_off_balance
  from public.cash_off_accounts
  where identity_id = v_player.identity_id;
  v_cash_off_balance := coalesce(v_cash_off_balance, 0);

  insert into public.spin_logs (
    identity_id, spin_player_id, result_label, result_type, cash_amount,
    letter_code, wallet_before, wallet_after, reward_mode, request_id, created_at,
    cash_off_before, cash_off_after
  ) values (
    v_player.identity_id, v_player.id, v_result_label, v_item.result_type,
    v_cash_amount, v_letter_code, coalesce(v_player.wallet_balance, 0),
    coalesce(v_player.wallet_balance, 0),
    case when v_cash_amount > 0 then 'cash_off' else 'canonical_prize' end,
    p_request_id, now(), v_cash_off_balance, v_cash_off_balance
  ) returning * into v_spin_log;

  if v_cash_amount > 0 then
    v_cash_off_credit := public.credit_cash_off(
      p_identity_id => v_player.identity_id,
      p_amount => v_cash_amount,
      p_transaction_type => 'promotion',
      p_source_system => 'spin_wheel_cash_off',
      p_source_reference => v_spin_log.id::text,
      p_spin_log_id => v_spin_log.id,
      p_reason => format('Spin Wheel win: %s Cash Off.', v_result_label),
      p_metadata => jsonb_build_object(
        'spin_log_id', v_spin_log.id,
        'rule_item_id', v_item.id,
        'request_id', p_request_id
      ),
      p_idempotency_key => 'spin-cash-off:' || p_request_id::text
    );
    v_cash_off_after := coalesce((v_cash_off_credit->>'balance_after')::numeric, v_cash_off_balance + v_cash_amount);
  else
    v_cash_off_after := v_cash_off_balance;
  end if;

  update public.spin_logs
  set cash_off_after = v_cash_off_after
  where id = v_spin_log.id
  returning * into v_spin_log;

  update public.spin_players
  set spins_remaining = v_new_spins_remaining,
      total_cash_won = coalesce(total_cash_won, 0) + v_cash_amount,
      spin_sequence_step = v_spin_number,
      letters_unlocked = v_letters,
      letter_challenge_completed = v_completed,
      last_prize_won = v_result_label,
      last_prize_type = v_item.result_type,
      updated_at = now()
  where id = v_player.id
  returning * into v_updated_player;

  insert into public.spin_user_rule_usage (
    identity_id, spin_player_id, spin_rule_item_id, spin_number, created_at
  ) values (
    v_player.identity_id, v_player.id, v_item.id, v_spin_number, now()
  );

  if v_item.result_type <> 'retry' then
    insert into public.spin_user_prizes (
      identity_id, spin_player_id, prize_label, status, result_type,
      cash_amount, letter_code, wallet_after, claim_message, reward_mode,
      cash_off_after, created_at
    ) values (
      v_player.identity_id, v_player.id, v_result_label, 'available',
      v_item.result_type, v_cash_amount, v_letter_code, v_cash_off_after,
      case when v_cash_amount > 0 then
        format('%s was added to your EmmyTech Cash Off balance.', v_result_label)
      else format('I just won %s on the EmmyTech Spin Wheel.', v_result_label) end,
      case when v_cash_amount > 0 then 'cash_off' else 'canonical_prize' end,
      v_cash_off_after, now()
    );
  end if;

  insert into public.identity_events (
    identity_id, event_type, title, description, metadata, created_at
  ) values (
    v_player.identity_id,
    'cash_challenge_spin_completed',
    'Spin completed',
    format('Spin result: %s', v_result_label),
    jsonb_build_object(
      'spin_player_id', v_player.id,
      'spin_log_id', v_spin_log.id,
      'spin_number', v_spin_number,
      'rule_item_id', v_item.id,
      'result_label', v_result_label,
      'result_type', v_item.result_type,
      'cash_amount_won', v_cash_amount,
      'cash_off_balance_after', v_cash_off_after,
      'request_id', p_request_id
    ),
    now()
  );

  if v_spin_number = 1 and v_player.referred_by_referral_code is not null then
    perform public.award_spin_referral(
      v_player.referred_by_referral_code,
      v_player.id,
      v_player.identity_id
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'idempotent_replay', false,
    'result', jsonb_build_object(
      'label', v_result_label,
      'result_type', v_item.result_type,
      'cash_amount', v_cash_amount,
      'cash_off_credited', v_cash_amount,
      'cash_off_balance_after', v_cash_off_after,
      'letter_code', v_letter_code,
      'bonus_spins', v_bonus_spins,
      'letter_challenge_completed', v_completed,
      'spin_log_id', v_spin_log.id,
      'request_id', p_request_id
    ),
    'spinPlayer', to_jsonb(v_updated_player)
  );
end;
$function$;
