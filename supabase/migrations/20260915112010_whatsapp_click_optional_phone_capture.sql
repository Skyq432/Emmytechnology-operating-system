-- v4 adds one thing on top of v3: an optional p_customer_phone parameter.
-- The storefront's WhatsApp button can offer a soft, optional "leave your
-- number in case WhatsApp doesn't open" field right before the redirect.
-- When given, it replaces the 'Not provided' placeholder (or fills a lead
-- that's still on that placeholder) instead of only ever being captured if
-- the visitor completes the WhatsApp conversation. The already-wired
-- leads_enrich_identity trigger then syncs it onto the identity exactly
-- like any other lead contact update — no new identity-matching logic
-- needed here.
create or replace function public.track_whatsapp_referral_click_v4(
  p_referral_code text,
  p_ip_address text,
  p_user_agent text,
  p_visitor_id text,
  p_source_page text default null,
  p_product_id uuid default null,
  p_search_query text default null,
  p_customer_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_code text := lower(trim(coalesce(p_referral_code, '')));
  v_visitor text := trim(coalesce(p_visitor_id, ''));
  v_phone text := nullif(regexp_replace(trim(coalesce(p_customer_phone, '')), '\s+', '', 'g'), '');
  v_ambassador_id uuid;
  v_identity_id uuid;
  v_existing_lead public.leads%rowtype;
  v_lead_id uuid;
  v_click_id uuid;
  v_ip_signature text := case
    when nullif(trim(coalesce(p_ip_address, '')), '') is null then null
    else md5(trim(p_ip_address))
  end;
  v_device_signature text := case
    when nullif(trim(coalesce(p_user_agent, '')), '') is null then null
    else md5(trim(p_user_agent))
  end;
  v_signals jsonb;
  v_visitor_ids jsonb;
begin
  if v_visitor = ''
     or length(v_visitor) > 200
     or v_visitor !~ '^[a-z0-9:_-]+$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_visitor_id');
  end if;

  select a.id
  into v_ambassador_id
  from public.ambassadors a
  where a.status = 'active'
    and (
      lower(trim(a.referral_code)) = v_code
      or lower(trim(coalesce(a.custom_referral_code, ''))) = v_code
    )
  order by a.created_at asc
  limit 1;

  if v_ambassador_id is null then
    return jsonb_build_object('ok', false, 'reason', 'ambassador_not_found');
  end if;

  -- Reuse only the exact first-party visitor identity here. IP and device
  -- evidence are intentionally excluded from automatic identity matching.
  -- They remain suggestion signals for Admin review and can never merge people
  -- by themselves.
  select sig.identity_id
  into v_identity_id
  from public.identity_signals sig
  where sig.signal_type = 'visitor_id'
    and lower(trim(sig.signal_value)) = lower(v_visitor)
  order by sig.verified desc, sig.last_seen_at desc
  limit 1;

  if v_identity_id is null then
    v_signals := jsonb_build_array(
      jsonb_build_object('type', 'visitor_id', 'value', v_visitor)
    );

    v_identity_id := public.upsert_identity_from_signals(
      v_signals,
      null,
      v_phone,
      null,
      'whatsapp_referral_click'
    );
  end if;

  insert into public.identity_signals (
    identity_id,
    signal_type,
    signal_value,
    confidence_weight,
    verified,
    source
  )
  select
    v_identity_id,
    signal_type,
    signal_value,
    confidence_weight,
    false,
    'whatsapp_referral_click'
  from (
    values
      ('ip_signature'::text, v_ip_signature, 20),
      ('device_signature'::text, v_device_signature, 35)
  ) as weak_signals(signal_type, signal_value, confidence_weight)
  where signal_value is not null
  on conflict (identity_id, signal_type, signal_value)
  do update set
    last_seen_at = now(),
    seen_count = public.identity_signals.seen_count + 1,
    confidence_weight = greatest(
      public.identity_signals.confidence_weight,
      excluded.confidence_weight
    );

  select l.*
  into v_existing_lead
  from public.leads l
  where l.merged_into_lead_id is null
    and (
      l.identity_id = v_identity_id
      or l.visitor_id = v_visitor
      or coalesce(l.visitor_ids, '[]'::jsonb) @> jsonb_build_array(v_visitor)
    )
  order by
    coalesce(l.approved_as_lead, false) desc,
    l.created_at asc
  limit 1
  for update;

  if v_existing_lead.id is not null then
    v_lead_id := v_existing_lead.id;

    if v_existing_lead.ambassador_id is distinct from v_ambassador_id then
      perform public.detect_identity_ambassador_conflict(
        v_identity_id,
        v_ambassador_id
      );
    end if;

    v_visitor_ids := coalesce(v_existing_lead.visitor_ids, '[]'::jsonb);
    if not (v_visitor_ids @> jsonb_build_array(v_visitor)) then
      v_visitor_ids := v_visitor_ids || jsonb_build_array(v_visitor);
    end if;

    update public.leads
    set
      visitor_id = coalesce(visitor_id, v_visitor),
      visitor_ids = v_visitor_ids,
      click_count = coalesce(click_count, 0) + 1,
      last_clicked_at = now(),
      customer_phone = case
        when v_phone is null then customer_phone
        when customer_phone is null or lower(customer_phone) = 'not provided' then v_phone
        else customer_phone
      end,
      source_detail = coalesce(source_detail, '{}'::jsonb) || jsonb_build_object(
        'whatsapp_clicked', true,
        'last_whatsapp_visitor_id', v_visitor
      ),
      updated_at = now()
    where id = v_existing_lead.id;
  else
    insert into public.leads (
      ambassador_id,
      identity_id,
      source,
      source_detail,
      customer_name,
      customer_phone,
      referral_code_used,
      status,
      funnel_stage,
      lead_approval_status,
      approved_as_lead,
      visitor_id,
      ip_signature,
      device_signature,
      click_count,
      last_clicked_at,
      duplicate_status,
      confidence_score,
      visitor_ids,
      ip_signatures,
      device_signatures,
      lead_intelligence_status,
      needs_merge_review,
      created_at,
      updated_at
    )
    values (
      v_ambassador_id,
      v_identity_id,
      'whatsapp',
      jsonb_build_object(
        'channel', 'whatsapp',
        'visitor_id', v_visitor,
        'source_page', p_source_page,
        'product_id', p_product_id,
        'search_query', p_search_query
      ),
      'WhatsApp Lead',
      coalesce(v_phone, 'Not provided'),
      p_referral_code,
      'new',
      'new_lead',
      'pending',
      false,
      v_visitor,
      v_ip_signature,
      v_device_signature,
      1,
      now(),
      'unique',
      80,
      jsonb_build_array(v_visitor),
      jsonb_build_array(v_ip_signature),
      jsonb_build_array(v_device_signature),
      'identity_linked',
      false,
      now(),
      now()
    )
    returning id into v_lead_id;
  end if;

  insert into public.referral_clicks (
    ambassador_id,
    referral_code,
    source,
    ip_address,
    user_agent,
    visitor_fingerprint,
    visitor_id,
    identity_id,
    lead_id,
    match_score,
    match_reason,
    context,
    created_at,
    counted_as_lead
  )
  values (
    v_ambassador_id,
    p_referral_code,
    'whatsapp',
    p_ip_address,
    p_user_agent,
    md5(v_visitor || ':' || coalesce(p_user_agent, '')),
    v_visitor,
    v_identity_id,
    v_lead_id,
    case when v_existing_lead.id is null then 80 else 100 end,
    case
      when v_existing_lead.id is null then 'pending_whatsapp_identity'
      else 'matched_existing_identity'
    end,
    jsonb_build_object(
      'source_page', p_source_page,
      'product_id', p_product_id,
      'search_query', p_search_query,
      'ip_signature', v_ip_signature,
      'device_signature', v_device_signature,
      'phone_captured_at_click', v_phone is not null
    ),
    now(),
    false
  )
  returning id into v_click_id;

  insert into public.visitor_sessions (
    visitor_id,
    ambassador_id,
    referral_code,
    ip_address,
    user_agent,
    first_seen,
    last_seen,
    created_at
  )
  values (
    v_visitor,
    v_ambassador_id,
    p_referral_code,
    p_ip_address,
    p_user_agent,
    now(),
    now(),
    now()
  )
  on conflict (visitor_id) do update
  set
    ambassador_id = coalesce(public.visitor_sessions.ambassador_id, excluded.ambassador_id),
    referral_code = coalesce(public.visitor_sessions.referral_code, excluded.referral_code),
    ip_address = coalesce(excluded.ip_address, public.visitor_sessions.ip_address),
    user_agent = coalesce(excluded.user_agent, public.visitor_sessions.user_agent),
    last_seen = now();

  insert into public.lead_events (
    lead_id,
    ambassador_id,
    event_type,
    event_title,
    event_description,
    event_data,
    created_at
  )
  values (
    v_lead_id,
    coalesce(v_existing_lead.ambassador_id, v_ambassador_id),
    'whatsapp_link_clicked',
    'WhatsApp referral link opened',
    case
      when v_existing_lead.id is null then
        case when v_phone is not null
          then 'The visitor opened WhatsApp and left a number before redirecting.'
          else 'The visitor opened WhatsApp. Their number is still waiting for staff confirmation.'
        end
      else 'A known lead opened the Ambassador WhatsApp referral link.'
    end,
    jsonb_build_object(
      'referral_click_id', v_click_id,
      'visitor_id', v_visitor,
      'clicked_ambassador_id', v_ambassador_id,
      'source_page', p_source_page,
      'product_id', p_product_id,
      'search_query', p_search_query,
      'phone_captured_at_click', v_phone is not null
    ),
    now()
  );

  perform public.attach_visitor_history_to_lead_v3(
    v_visitor,
    v_identity_id,
    v_lead_id
  );

  return jsonb_build_object(
    'ok', true,
    'referral_click_id', v_click_id,
    'lead_id', v_lead_id,
    'identity_id', v_identity_id,
    'existing_lead', v_existing_lead.id is not null,
    'lead_count_added', false
  );
end;
$function$;

revoke all on function public.track_whatsapp_referral_click_v4 from public, anon, authenticated;
grant execute on function public.track_whatsapp_referral_click_v4 to service_role, postgres;
