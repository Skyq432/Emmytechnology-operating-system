alter table public.leads drop constraint if exists leads_source_check;

alter table public.leads
  add constraint leads_source_check
  check (source = any (array[
    'whatsapp'::text,
    'referral'::text,
    'social'::text,
    'direct'::text,
    'website_cart'::text,
    'website_quote'::text
  ]));

create or replace function public.register_visitor_session(
  p_visitor_id text,
  p_referral_code text default null,
  p_ip_address text default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_visitor text := trim(coalesce(p_visitor_id, ''));
  v_code text := lower(trim(coalesce(p_referral_code, '')));
  v_ambassador_id uuid;
  v_canonical_code text;
  v_session public.visitor_sessions%rowtype;
begin
  if v_visitor = ''
     or length(v_visitor) > 200
     or v_visitor !~ '^[a-zA-Z0-9:_-]+$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_visitor_id');
  end if;

  if v_code <> '' then
    select
      a.id,
      coalesce(nullif(trim(a.custom_referral_code), ''), a.referral_code)
    into v_ambassador_id, v_canonical_code
    from public.ambassadors a
    where a.status = 'active'
      and (
        lower(trim(a.referral_code)) = v_code
        or lower(trim(coalesce(a.custom_referral_code, ''))) = v_code
      )
    order by
      case
        when lower(trim(coalesce(a.custom_referral_code, ''))) = v_code then 0
        else 1
      end,
      a.created_at asc
    limit 1;
  end if;

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
    v_canonical_code,
    p_ip_address,
    p_user_agent,
    now(),
    now(),
    now()
  )
  on conflict (visitor_id) do update
  set
    ambassador_id = case
      when public.visitor_sessions.ambassador_id is null
        then coalesce(excluded.ambassador_id, public.visitor_sessions.ambassador_id)
      else public.visitor_sessions.ambassador_id
    end,
    referral_code = case
      when public.visitor_sessions.referral_code is null
           and excluded.ambassador_id is not null
           and (
             public.visitor_sessions.ambassador_id is null
             or public.visitor_sessions.ambassador_id = excluded.ambassador_id
           )
        then excluded.referral_code
      else public.visitor_sessions.referral_code
    end,
    ip_address = coalesce(excluded.ip_address, public.visitor_sessions.ip_address),
    user_agent = coalesce(excluded.user_agent, public.visitor_sessions.user_agent),
    last_seen = now()
  returning * into v_session;

  return jsonb_build_object(
    'ok', true,
    'visitor_id', v_session.visitor_id,
    'ambassador_id', v_session.ambassador_id,
    'referral_code', v_session.referral_code,
    'attributed', v_session.ambassador_id is not null
  );
end;
$function$;

create or replace function public.register_website_visitor(
  p_visitor_id text,
  p_referral_code text default null,
  p_ip_address text default null,
  p_user_agent text default null
)
returns jsonb
language sql
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select public.register_visitor_session(
    p_visitor_id,
    p_referral_code,
    p_ip_address,
    p_user_agent
  );
$function$;

create or replace function public.track_website_behavior(
  p_visitor_id text,
  p_event_type text,
  p_product_id uuid default null,
  p_quantity integer default 1,
  p_source_page text default null,
  p_page_url text default null,
  p_search_query text default null,
  p_results_count integer default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_visitor text := trim(coalesce(p_visitor_id, ''));
  v_session public.visitor_sessions%rowtype;
  v_identity_id uuid;
  v_lead public.leads%rowtype;
  v_lead_id uuid;
  v_event_id uuid;
  v_event_type text := lower(trim(coalesce(p_event_type, '')));
  v_quantity integer := greatest(coalesce(p_quantity, 1), 1);
  v_event_ambassador_id uuid;
  v_high_intent boolean := false;
begin
  if v_visitor = '' then
    raise exception 'visitor_id is required' using errcode = '22023';
  end if;

  if v_event_type not in (
    'website_visited','page_viewed','sms_returned',
    'welcome_modal_shown','welcome_modal_dismissed','welcome_explore_products','welcome_use_spins',
    'search_performed','category_selected','sort_changed','price_filter_changed',
    'product_viewed','product_quick_viewed','product_shared',
    'add_to_cart','remove_from_cart','cart_quantity_changed','cart_opened','checkout_started','whatsapp_purchase_clicked',
    'spin_opened_from_product','spin_save_opened','spin_completed','cash_off_viewed',
    'cash_off_product_selected','cash_off_product_changed','cash_off_product_removed',
    'full_wheel_opened_from_overlay','full_wheel_opened_from_cart','returned_from_full_wheel',
    'reward_viewed','reward_applied',
    'recommendation_shown','recommendation_clicked','recommendation_dismissed'
  ) then
    raise exception 'Unsupported website event type: %', v_event_type using errcode = '22023';
  end if;

  if v_event_type in (
    'product_viewed','product_quick_viewed','product_shared','add_to_cart','remove_from_cart','cart_quantity_changed',
    'whatsapp_purchase_clicked','spin_opened_from_product','cash_off_product_selected','cash_off_product_changed',
    'cash_off_product_removed','recommendation_clicked'
  ) and p_product_id is null then
    raise exception 'product_id is required for %', v_event_type using errcode = '22023';
  end if;

  v_high_intent := v_event_type in ('add_to_cart', 'checkout_started', 'whatsapp_purchase_clicked');

  select * into v_session
  from public.visitor_sessions
  where visitor_id = v_visitor
  limit 1;

  if not found then
    perform public.register_visitor_session(v_visitor, null, null, null);

    select * into v_session
    from public.visitor_sessions
    where visitor_id = v_visitor
    limit 1;
  end if;

  select attribution.identity_id into v_identity_id
  from public.website_visitor_attributions attribution
  where attribution.visitor_id = v_visitor
    and attribution.identity_id is not null
  order by attribution.last_seen_at desc, attribution.first_seen_at desc
  limit 1;

  if v_identity_id is null then
    select signal.identity_id into v_identity_id
    from public.identity_signals signal
    where signal.signal_type = 'visitor_id'
      and lower(trim(signal.signal_value)) = lower(v_visitor)
    order by signal.verified desc, signal.confidence_weight desc, signal.last_seen_at desc
    limit 1;
  end if;

  if v_identity_id is not null then
    select lead.* into v_lead
    from public.leads lead
    where lead.identity_id = v_identity_id
      and lead.merged_into_lead_id is null
    order by
      coalesce(lead.approved_as_lead, false) desc,
      lead.created_at asc
    limit 1;
  end if;

  if v_lead.id is null then
    select lead.* into v_lead
    from public.leads lead
    where lead.merged_into_lead_id is null
      and (
        lead.visitor_id = v_visitor
        or coalesce(lead.visitor_ids, '[]'::jsonb) @> jsonb_build_array(v_visitor)
      )
    order by
      coalesce(lead.approved_as_lead, false) desc,
      lead.created_at asc
    limit 1;
  end if;

  if v_high_intent and v_lead.id is null then
    if v_identity_id is null then
      v_identity_id := public.upsert_identity_from_signals(
        jsonb_build_array(
          jsonb_build_object('type', 'visitor_id', 'value', lower(v_visitor))
        ),
        null,
        null,
        null,
        'website_high_intent'
      );
    end if;

    insert into public.leads (
      ambassador_id,
      identity_id,
      visitor_id,
      visitor_ids,
      product_id,
      source,
      source_detail,
      customer_name,
      customer_phone,
      customer_email,
      referral_code_used,
      status,
      lead_type,
      source_page,
      notes,
      funnel_stage,
      lead_approval_status,
      approved_as_lead,
      duplicate_status,
      confidence_score,
      lead_intelligence_status,
      needs_merge_review,
      click_count,
      last_clicked_at,
      created_at,
      updated_at
    )
    values (
      v_session.ambassador_id,
      v_identity_id,
      v_visitor,
      jsonb_build_array(v_visitor),
      p_product_id,
      'website_cart',
      jsonb_build_object(
        'created_from', 'website_behavior_tracking',
        'high_intent_event', v_event_type,
        'referral_code', v_session.referral_code
      ),
      case when v_identity_id is null then 'Anonymous Website Lead' else 'Known Website Customer' end,
      'Pending - Website',
      null,
      v_session.referral_code,
      'new',
      v_event_type,
      left(p_source_page, 500),
      'Lead created automatically after a high-intent website action.',
      'new_lead',
      'pending',
      false,
      'unique',
      case when v_session.ambassador_id is not null then 90 else 70 end,
      case when v_identity_id is not null then 'identity_linked' else 'visitor_only' end,
      false,
      1,
      now(),
      now(),
      now()
    )
    returning * into v_lead;

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
      v_lead.id,
      v_lead.ambassador_id,
      'website_high_intent_lead_created',
      'Website lead created',
      'A website visitor performed a high-intent action and was added as a pending lead.',
      jsonb_build_object(
        'website_event_type', v_event_type,
        'product_id', p_product_id,
        'visitor_id', v_visitor,
        'referral_code', v_session.referral_code,
        'ambassador_id', v_session.ambassador_id
      ),
      now()
    );

    insert into public.lead_signals (
      lead_id,
      ambassador_id,
      signal_type,
      signal_value,
      confidence_weight,
      verified
    )
    values (
      v_lead.id,
      v_lead.ambassador_id,
      'visitor_id',
      lower(v_visitor),
      80,
      true
    )
    on conflict (lead_id, signal_type, signal_value)
    do update set
      last_seen_at = now(),
      seen_count = public.lead_signals.seen_count + 1,
      verified = true;

    perform public.attach_visitor_history_to_lead_v3(
      v_visitor,
      v_identity_id,
      v_lead.id
    );
  end if;

  v_lead_id := v_lead.id;
  v_event_ambassador_id := coalesce(v_lead.ambassador_id, v_session.ambassador_id);

  if v_lead_id is not null then
    update public.leads
    set
      identity_id = coalesce(identity_id, v_identity_id),
      visitor_id = coalesce(visitor_id, v_visitor),
      product_id = coalesce(product_id, p_product_id),
      last_clicked_at = case when v_high_intent then now() else last_clicked_at end,
      source_detail = coalesce(source_detail, '{}'::jsonb) ||
        case
          when v_high_intent then jsonb_build_object(
            'last_high_intent_event', v_event_type,
            'last_high_intent_at', now(),
            'last_cart_product_id', p_product_id
          )
          else '{}'::jsonb
        end,
      updated_at = now()
    where id = v_lead_id;
  end if;

  insert into public.website_events (
    visitor_id,
    identity_id,
    lead_id,
    product_id,
    ambassador_id,
    event_type,
    quantity,
    source_page,
    page_url,
    search_query,
    results_count,
    metadata,
    created_at
  )
  values (
    v_visitor,
    v_identity_id,
    v_lead_id,
    p_product_id,
    v_event_ambassador_id,
    v_event_type,
    v_quantity,
    left(p_source_page, 500),
    left(p_page_url, 1000),
    left(p_search_query, 300),
    p_results_count,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'referral_code', v_session.referral_code,
      'attributed_ambassador_id', v_event_ambassador_id
    ),
    now()
  )
  returning id into v_event_id;

  if v_event_type in ('product_viewed', 'product_quick_viewed') then
    insert into public.product_views (visitor_id, product_id, ambassador_id)
    values (v_visitor, p_product_id, v_event_ambassador_id);
  end if;

  if v_event_type = 'add_to_cart' then
    insert into public.cart_events (visitor_id, product_id, ambassador_id, quantity)
    values (v_visitor, p_product_id, v_event_ambassador_id, v_quantity);
  end if;

  update public.visitor_sessions
  set last_seen = now()
  where visitor_id = v_visitor;

  return jsonb_build_object(
    'success', true,
    'event_id', v_event_id,
    'event_type', v_event_type,
    'identity_id', v_identity_id,
    'lead_id', v_lead_id,
    'ambassador_id', v_event_ambassador_id,
    'attributed', v_event_ambassador_id is not null
  );
end;
$function$;

create or replace function public.create_quote_lead(
  p_visitor_id text,
  p_product_id uuid,
  p_full_name text,
  p_phone text,
  p_email text default null,
  p_notes text default null,
  p_source_page text default '/products'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_visitor text := trim(coalesce(p_visitor_id, ''));
  v_name text := nullif(trim(coalesce(p_full_name, '')), '');
  v_phone text := public.normalize_contact_phone(p_phone);
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_session public.visitor_sessions%rowtype;
  v_identity_id uuid;
  v_signals jsonb := '[]'::jsonb;
  v_lead public.leads%rowtype;
  v_new_lead boolean := false;
begin
  if v_visitor = '' then
    raise exception 'visitor_id is required' using errcode = '22023';
  end if;

  if v_name is null then
    raise exception 'full name is required' using errcode = '22023';
  end if;

  if v_phone is null then
    raise exception 'a valid phone number is required' using errcode = '22023';
  end if;

  select * into v_session
  from public.visitor_sessions
  where visitor_id = v_visitor
  limit 1;

  if not found then
    perform public.register_visitor_session(v_visitor, null, null, null);
    select * into v_session
    from public.visitor_sessions
    where visitor_id = v_visitor
    limit 1;
  end if;

  v_signals := v_signals || jsonb_build_array(
    jsonb_build_object('type', 'visitor_id', 'value', lower(v_visitor)),
    jsonb_build_object('type', 'phone', 'value', v_phone)
  );

  if v_email is not null then
    v_signals := v_signals || jsonb_build_array(
      jsonb_build_object('type', 'email', 'value', v_email)
    );
  end if;

  v_identity_id := public.upsert_identity_from_signals(
    v_signals,
    v_name,
    v_phone,
    v_email,
    'website_quote_form'
  );

  select lead.* into v_lead
  from public.leads lead
  where lead.identity_id = v_identity_id
    and lead.merged_into_lead_id is null
  order by
    coalesce(lead.approved_as_lead, false) desc,
    lead.created_at asc
  limit 1;

  if v_lead.id is null then
    select lead.* into v_lead
    from public.leads lead
    where lead.merged_into_lead_id is null
      and (
        lead.visitor_id = v_visitor
        or coalesce(lead.visitor_ids, '[]'::jsonb) @> jsonb_build_array(v_visitor)
      )
    order by
      coalesce(lead.approved_as_lead, false) desc,
      lead.created_at asc
    limit 1;
  end if;

  if v_lead.id is null then
    insert into public.leads (
      ambassador_id,
      identity_id,
      visitor_id,
      visitor_ids,
      product_id,
      source,
      source_detail,
      customer_name,
      customer_phone,
      customer_email,
      referral_code_used,
      status,
      lead_type,
      source_page,
      notes,
      funnel_stage,
      lead_approval_status,
      approved_as_lead,
      duplicate_status,
      confidence_score,
      lead_intelligence_status,
      needs_merge_review,
      created_at,
      updated_at
    )
    values (
      v_session.ambassador_id,
      v_identity_id,
      v_visitor,
      jsonb_build_array(v_visitor),
      p_product_id,
      'website_quote',
      jsonb_build_object(
        'channel', 'website_quote_form',
        'referral_code', v_session.referral_code
      ),
      v_name,
      v_phone,
      v_email,
      v_session.referral_code,
      'new',
      'quote_request',
      left(p_source_page, 500),
      p_notes,
      'new_lead',
      'pending',
      false,
      'unique',
      100,
      'identity_linked',
      false,
      now(),
      now()
    )
    returning * into v_lead;

    v_new_lead := true;
  else
    if v_session.ambassador_id is not null
       and v_lead.ambassador_id is not null
       and v_session.ambassador_id is distinct from v_lead.ambassador_id then
      perform public.detect_identity_ambassador_conflict(
        v_identity_id,
        v_session.ambassador_id
      );
    end if;

    update public.leads
    set
      identity_id = coalesce(identity_id, v_identity_id),
      customer_name = case
        when nullif(trim(coalesce(customer_name, '')), '') is null
          or lower(trim(customer_name)) in ('whatsapp lead','anonymous cart lead','known website customer','anonymous website lead')
        then v_name
        else customer_name
      end,
      customer_phone = case
        when public.normalize_contact_phone(customer_phone) is null then v_phone
        else customer_phone
      end,
      customer_email = coalesce(customer_email, v_email),
      product_id = coalesce(p_product_id, product_id),
      visitor_id = coalesce(visitor_id, v_visitor),
      source_detail = coalesce(source_detail, '{}'::jsonb) || jsonb_build_object(
        'quote_requested', true,
        'quote_requested_at', now(),
        'quote_product_id', p_product_id
      ),
      updated_at = now()
    where id = v_lead.id
    returning * into v_lead;
  end if;

  insert into public.lead_signals (
    lead_id,
    ambassador_id,
    signal_type,
    signal_value,
    confidence_weight,
    verified
  )
  values
    (v_lead.id, v_lead.ambassador_id, 'visitor_id', lower(v_visitor), 80, true),
    (v_lead.id, v_lead.ambassador_id, 'phone', v_phone, 100, true)
  on conflict (lead_id, signal_type, signal_value)
  do update set
    last_seen_at = now(),
    seen_count = public.lead_signals.seen_count + 1,
    verified = true;

  if v_email is not null then
    insert into public.lead_signals (
      lead_id,
      ambassador_id,
      signal_type,
      signal_value,
      confidence_weight,
      verified
    )
    values (
      v_lead.id,
      v_lead.ambassador_id,
      'email',
      v_email,
      100,
      true
    )
    on conflict (lead_id, signal_type, signal_value)
    do update set
      last_seen_at = now(),
      seen_count = public.lead_signals.seen_count + 1,
      verified = true;
  end if;

  perform public.attach_visitor_history_to_lead_v3(
    v_visitor,
    v_identity_id,
    v_lead.id
  );

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
    v_lead.id,
    v_lead.ambassador_id,
    'quote_request_submitted',
    'Quote request submitted',
    case
      when v_new_lead then 'A new lead submitted the website quote form.'
      else 'An existing lead submitted the website quote form again.'
    end,
    jsonb_build_object(
      'product_id', p_product_id,
      'visitor_id', v_visitor,
      'referral_code', v_session.referral_code,
      'new_lead', v_new_lead
    ),
    now()
  );

  return jsonb_build_object(
    'success', true,
    'lead_id', v_lead.id,
    'identity_id', v_identity_id,
    'ambassador_id', v_lead.ambassador_id,
    'new_lead', v_new_lead
  );
end;
$function$;

-- Safe historical repair: only use already-linked lead ownership or exact,
-- unambiguous first-party visitor IDs. Never infer ownership from IP/device.
update public.website_events we
set
  ambassador_id = l.ambassador_id,
  identity_id = coalesce(we.identity_id, l.identity_id)
from public.leads l
where we.lead_id = l.id
  and we.ambassador_id is null
  and l.ambassador_id is not null;

with lead_visitor as (
  select
    l.ambassador_id,
    l.referral_code_used,
    v.visitor_id
  from public.leads l
  cross join lateral (
    select nullif(trim(l.visitor_id), '') as visitor_id
    union
    select nullif(trim(x.value #>> '{}'), '')
    from jsonb_array_elements(coalesce(l.visitor_ids, '[]'::jsonb)) x(value)
  ) v
  where l.merged_into_lead_id is null
    and l.ambassador_id is not null
    and v.visitor_id is not null
), unambiguous as (
  select
    visitor_id,
    min(ambassador_id::text)::uuid as ambassador_id,
    min(referral_code_used) filter (where referral_code_used is not null) as referral_code
  from lead_visitor
  group by visitor_id
  having count(distinct ambassador_id) = 1
)
update public.visitor_sessions vs
set
  ambassador_id = u.ambassador_id,
  referral_code = coalesce(
    vs.referral_code,
    u.referral_code,
    nullif(trim(a.custom_referral_code), ''),
    a.referral_code
  )
from unambiguous u
join public.ambassadors a on a.id = u.ambassador_id
where vs.visitor_id = u.visitor_id
  and vs.ambassador_id is null;

update public.website_events we
set ambassador_id = vs.ambassador_id
from public.visitor_sessions vs
where we.visitor_id = vs.visitor_id
  and we.ambassador_id is null
  and vs.ambassador_id is not null;
