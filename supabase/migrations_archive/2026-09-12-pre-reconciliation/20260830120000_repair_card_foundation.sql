-- EmmyTech Operations: Repair Card foundation
-- Additive/backward-compatible. Does not import historical repair data.

create extension if not exists pgcrypto;

alter table public.ops_repairs
  add column if not exists customer_email text,
  add column if not exists accessories_received text,
  add column if not exists current_quote_id uuid,
  add column if not exists current_card_assignment_id uuid;

alter table public.ops_repairs drop constraint if exists ops_repairs_status_check;
alter table public.ops_repairs add constraint ops_repairs_status_check check (status in (
  'received','diagnosing','awaiting_customer_approval','awaiting_payment','awaiting_parts',
  'in_progress','quality_check','ready_collection','rework','collected','cancelled'
));

create table if not exists public.ops_repair_cards (
  id uuid primary key default gen_random_uuid(),
  card_code text not null unique,
  public_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  status text not null default 'available'
    check (status in ('available','assigned','missing','retired')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ops_repair_card_assignments (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.ops_repair_cards(id) on delete restrict,
  repair_id uuid not null references public.ops_repairs(id) on delete cascade,
  identity_id uuid not null references public.identities(id) on delete restrict,
  access_pin text not null check (access_pin ~ '^[A-HJ-NP-Z2-9]{4}$'),
  pin_version integer not null default 1 check (pin_version > 0),
  status text not null default 'active' check (status in ('active','closed')),
  handover_started_at timestamptz,
  handover_expires_at timestamptz,
  assigned_by uuid references public.users(id) on delete set null,
  closed_by uuid references public.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  closed_at timestamptz,
  check ((status = 'active' and closed_at is null) or status = 'closed')
);

create unique index if not exists ops_repair_card_assignments_one_active_card
  on public.ops_repair_card_assignments(card_id) where status = 'active';
create unique index if not exists ops_repair_card_assignments_one_active_repair
  on public.ops_repair_card_assignments(repair_id) where status = 'active';
create index if not exists ops_repair_card_assignments_identity_idx
  on public.ops_repair_card_assignments(identity_id, assigned_at desc);

create table if not exists public.ops_repair_quotes (
  id uuid primary key default gen_random_uuid(),
  repair_id uuid not null references public.ops_repairs(id) on delete cascade,
  version integer not null check (version > 0),
  diagnosis_public text,
  work_description text,
  quote_amount numeric not null default 0 check (quote_amount >= 0),
  estimated_completion text,
  payment_requirement text not null default 'none'
    check (payment_requirement in ('none','partial','full')),
  required_before_start numeric not null default 0 check (required_before_start >= 0),
  status text not null default 'draft'
    check (status in ('draft','published','approved','declined','superseded')),
  published_at timestamptz,
  approved_at timestamptz,
  declined_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(repair_id, version),
  check (required_before_start <= quote_amount),
  check (payment_requirement <> 'none' or required_before_start = 0),
  check (payment_requirement <> 'full' or required_before_start = quote_amount)
);
create index if not exists ops_repair_quotes_repair_idx
  on public.ops_repair_quotes(repair_id, version desc);

create table if not exists public.ops_repair_payments (
  id uuid primary key default gen_random_uuid(),
  repair_id uuid not null references public.ops_repairs(id) on delete cascade,
  amount numeric not null check (amount > 0),
  payment_method text not null default 'other'
    check (payment_method in ('bank_transfer','pos','cash','split','other')),
  reference text,
  paid_at timestamptz not null default now(),
  note text,
  is_void boolean not null default false,
  voided_at timestamptz,
  voided_by uuid references public.users(id) on delete set null,
  recorded_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists ops_repair_payments_repair_idx
  on public.ops_repair_payments(repair_id, paid_at desc);

create table if not exists public.ops_repair_portal_sessions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.ops_repair_card_assignments(id) on delete cascade,
  token_hash text not null unique,
  pin_version integer not null check (pin_version > 0),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);
create index if not exists ops_repair_portal_sessions_assignment_idx
  on public.ops_repair_portal_sessions(assignment_id, revoked_at, expires_at);

create table if not exists public.ops_repair_consents (
  id uuid primary key default gen_random_uuid(),
  repair_id uuid not null references public.ops_repairs(id) on delete cascade,
  assignment_id uuid not null references public.ops_repair_card_assignments(id) on delete restrict,
  identity_id uuid not null references public.identities(id) on delete restrict,
  quote_id uuid references public.ops_repair_quotes(id) on delete restrict,
  consent_type text not null check (consent_type in (
    'repair_authorization','completion_acceptance','unrepaired_return_acknowledgement'
  )),
  consent_version text not null,
  snapshot jsonb not null default '{}'::jsonb,
  portal_session_id uuid references public.ops_repair_portal_sessions(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists ops_repair_consents_repair_idx
  on public.ops_repair_consents(repair_id, created_at desc);
create unique index if not exists ops_repair_consents_quote_authorization_uidx
  on public.ops_repair_consents(quote_id, consent_type)
  where quote_id is not null and consent_type = 'repair_authorization';

create table if not exists public.ops_repair_events (
  id uuid primary key default gen_random_uuid(),
  repair_id uuid not null references public.ops_repairs(id) on delete cascade,
  assignment_id uuid references public.ops_repair_card_assignments(id) on delete set null,
  event_type text not null,
  title text not null,
  note text,
  from_status text,
  to_status text,
  customer_visible boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  actor_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists ops_repair_events_repair_idx
  on public.ops_repair_events(repair_id, created_at desc);

create table if not exists public.ops_repair_access_attempts (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.ops_repair_cards(id) on delete cascade,
  assignment_id uuid references public.ops_repair_card_assignments(id) on delete cascade,
  client_fingerprint text,
  succeeded boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists ops_repair_access_attempts_rate_idx
  on public.ops_repair_access_attempts(card_id, client_fingerprint, created_at desc);

alter table public.ops_repairs
  drop constraint if exists ops_repairs_current_quote_id_fkey,
  drop constraint if exists ops_repairs_current_card_assignment_id_fkey;

alter table public.ops_repairs
  add constraint ops_repairs_current_quote_id_fkey
    foreign key (current_quote_id) references public.ops_repair_quotes(id) on delete set null,
  add constraint ops_repairs_current_card_assignment_id_fkey
    foreign key (current_card_assignment_id) references public.ops_repair_card_assignments(id) on delete set null;

create index if not exists ops_repairs_current_quote_idx on public.ops_repairs(current_quote_id);
create index if not exists ops_repairs_current_card_assignment_idx on public.ops_repairs(current_card_assignment_id);

-- Keep updated_at semantics aligned with existing Operations tables.
drop trigger if exists ops_repair_cards_touch_updated_at on public.ops_repair_cards;
create trigger ops_repair_cards_touch_updated_at
before update on public.ops_repair_cards
for each row execute function public.ops_touch_updated_at();

-- Seed the initial reusable physical card inventory.
insert into public.ops_repair_cards(card_code)
select 'RC-' || lpad(n::text, 2, '0')
from generate_series(1,30) n
on conflict(card_code) do nothing;

-- Admin-only direct table access. Public customer access will be mediated by trusted server routes.
alter table public.ops_repair_cards enable row level security;
alter table public.ops_repair_card_assignments enable row level security;
alter table public.ops_repair_quotes enable row level security;
alter table public.ops_repair_payments enable row level security;
alter table public.ops_repair_consents enable row level security;
alter table public.ops_repair_events enable row level security;
alter table public.ops_repair_portal_sessions enable row level security;
alter table public.ops_repair_access_attempts enable row level security;

drop policy if exists ops_repair_cards_admin_all on public.ops_repair_cards;
create policy ops_repair_cards_admin_all on public.ops_repair_cards
for all to authenticated using (public.ops_is_admin()) with check (public.ops_is_admin());

drop policy if exists ops_repair_card_assignments_admin_all on public.ops_repair_card_assignments;
create policy ops_repair_card_assignments_admin_all on public.ops_repair_card_assignments
for all to authenticated using (public.ops_is_admin()) with check (public.ops_is_admin());

drop policy if exists ops_repair_quotes_admin_all on public.ops_repair_quotes;
create policy ops_repair_quotes_admin_all on public.ops_repair_quotes
for all to authenticated using (public.ops_is_admin()) with check (public.ops_is_admin());

drop policy if exists ops_repair_payments_admin_all on public.ops_repair_payments;
create policy ops_repair_payments_admin_all on public.ops_repair_payments
for all to authenticated using (public.ops_is_admin()) with check (public.ops_is_admin());

drop policy if exists ops_repair_consents_admin_all on public.ops_repair_consents;
create policy ops_repair_consents_admin_all on public.ops_repair_consents
for all to authenticated using (public.ops_is_admin()) with check (public.ops_is_admin());

drop policy if exists ops_repair_events_admin_all on public.ops_repair_events;
create policy ops_repair_events_admin_all on public.ops_repair_events
for all to authenticated using (public.ops_is_admin()) with check (public.ops_is_admin());

drop policy if exists ops_repair_portal_sessions_admin_all on public.ops_repair_portal_sessions;
create policy ops_repair_portal_sessions_admin_all on public.ops_repair_portal_sessions
for all to authenticated using (public.ops_is_admin()) with check (public.ops_is_admin());

drop policy if exists ops_repair_access_attempts_admin_all on public.ops_repair_access_attempts;
create policy ops_repair_access_attempts_admin_all on public.ops_repair_access_attempts
for all to authenticated using (public.ops_is_admin()) with check (public.ops_is_admin());

revoke all on public.ops_repair_cards from anon;
revoke all on public.ops_repair_card_assignments from anon;
revoke all on public.ops_repair_quotes from anon;
revoke all on public.ops_repair_payments from anon;
revoke all on public.ops_repair_consents from anon;
revoke all on public.ops_repair_events from anon;
revoke all on public.ops_repair_portal_sessions from anon;
revoke all on public.ops_repair_access_attempts from anon;

grant select,insert,update,delete on public.ops_repair_cards to authenticated;
grant select,insert,update,delete on public.ops_repair_card_assignments to authenticated;
grant select,insert,update,delete on public.ops_repair_quotes to authenticated;
grant select,insert,update,delete on public.ops_repair_payments to authenticated;
grant select,insert,update,delete on public.ops_repair_consents to authenticated;
grant select,insert,update,delete on public.ops_repair_events to authenticated;
grant select,insert,update,delete on public.ops_repair_portal_sessions to authenticated;
grant select,insert,update,delete on public.ops_repair_access_attempts to authenticated;

create or replace function public.ops_create_repair_with_card(
  p_card_id uuid,
  p_identity_id uuid,
  p_access_pin text,
  p_fault_reported text,
  p_original_order_id uuid default null,
  p_inventory_unit_id uuid default null,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_customer_email text default null,
  p_device_type text default null,
  p_brand text default null,
  p_model text default null,
  p_serial_or_imei text default null,
  p_purchased_from_us text default 'not_sure',
  p_diagnosis text default null,
  p_repair_type text default null,
  p_parts_replaced text default null,
  p_parts_cost numeric default 0,
  p_labour_cost numeric default 0,
  p_amount_charged numeric default 0,
  p_warranty_period text default null,
  p_warranty_expires_at date default null,
  p_condition_received text default null,
  p_condition_returned text default null,
  p_accessories_received text default null,
  p_technician_user_id uuid default null,
  p_technician_name text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card public.ops_repair_cards%rowtype;
  v_repair_id uuid;
  v_repair_code text;
  v_assignment_id uuid;
begin
  if not public.ops_is_admin() then raise exception 'Not authorized'; end if;
  if p_identity_id is null then raise exception 'Customer Identity is required'; end if;
  if p_card_id is null then raise exception 'Repair Card is required'; end if;
  if nullif(btrim(p_fault_reported), '') is null then raise exception 'Fault reported is required'; end if;
  if coalesce(p_purchased_from_us, 'not_sure') not in ('yes','no','not_sure') then raise exception 'Invalid purchased-from-us state'; end if;
  if coalesce(p_access_pin, '') !~ '^[A-HJ-NP-Z2-9]{4}$' then raise exception 'Invalid Repair PIN'; end if;

  select * into v_card
  from public.ops_repair_cards
  where id = p_card_id
  for update;

  if not found or v_card.status <> 'available' then
    raise exception 'Repair Card is not available';
  end if;

  insert into public.ops_repairs(
    identity_id, original_order_id, inventory_unit_id,
    customer_name, customer_phone, customer_email,
    device_type, brand, model, serial_or_imei, purchased_from_us,
    fault_reported, diagnosis, repair_type, parts_replaced,
    parts_cost, labour_cost, amount_charged, balance_due,
    warranty_period, warranty_expires_at,
    condition_received, condition_returned, accessories_received,
    technician_user_id, technician_name, notes, status, created_by
  ) values (
    p_identity_id, p_original_order_id, p_inventory_unit_id,
    nullif(btrim(p_customer_name),''), nullif(btrim(p_customer_phone),''), nullif(btrim(p_customer_email),''),
    nullif(btrim(p_device_type),''), nullif(btrim(p_brand),''), nullif(btrim(p_model),''), nullif(btrim(p_serial_or_imei),''), coalesce(p_purchased_from_us,'not_sure'),
    btrim(p_fault_reported), nullif(btrim(p_diagnosis),''), nullif(btrim(p_repair_type),''), nullif(btrim(p_parts_replaced),''),
    greatest(coalesce(p_parts_cost,0),0), greatest(coalesce(p_labour_cost,0),0), greatest(coalesce(p_amount_charged,0),0), greatest(coalesce(p_amount_charged,0),0),
    nullif(btrim(p_warranty_period),''), p_warranty_expires_at,
    nullif(btrim(p_condition_received),''), nullif(btrim(p_condition_returned),''), nullif(btrim(p_accessories_received),''),
    p_technician_user_id, nullif(btrim(p_technician_name),''), nullif(btrim(p_notes),''), 'received', auth.uid()
  ) returning id, repair_code into v_repair_id, v_repair_code;

  insert into public.ops_repair_card_assignments(
    card_id, repair_id, identity_id, access_pin, assigned_by
  ) values (
    v_card.id, v_repair_id, p_identity_id, p_access_pin, auth.uid()
  ) returning id into v_assignment_id;

  update public.ops_repair_cards
  set status = 'assigned'
  where id = v_card.id;

  update public.ops_repairs
  set current_card_assignment_id = v_assignment_id
  where id = v_repair_id;

  if p_inventory_unit_id is not null then
    update public.ops_inventory_units
    set status = 'repair'
    where id = p_inventory_unit_id;
  end if;

  insert into public.ops_repair_events(
    repair_id, assignment_id, event_type, title, customer_visible, actor_id,
    metadata
  ) values (
    v_repair_id, v_assignment_id, 'repair_received', 'Repair received', true, auth.uid(),
    jsonb_build_object('card_code', v_card.card_code)
  );

  return jsonb_build_object(
    'repair_id', v_repair_id,
    'repair_code', v_repair_code,
    'assignment_id', v_assignment_id,
    'card_id', v_card.id,
    'card_code', v_card.card_code,
    'access_pin', p_access_pin
  );
end;
$$;

create or replace function public.ops_publish_repair_quote(
  p_repair_id uuid,
  p_diagnosis_public text,
  p_work_description text,
  p_quote_amount numeric,
  p_estimated_completion text,
  p_payment_requirement text,
  p_required_before_start numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_repair public.ops_repairs%rowtype;
  v_quote_id uuid;
  v_version integer;
  v_required numeric;
  v_balance numeric;
  v_payment_status text;
begin
  if not public.ops_is_admin() then raise exception 'Not authorized'; end if;
  if p_quote_amount is null or p_quote_amount < 0 then raise exception 'Quote amount must be zero or greater'; end if;
  if p_payment_requirement not in ('none','partial','full') then raise exception 'Invalid payment requirement'; end if;

  select * into v_repair from public.ops_repairs where id = p_repair_id for update;
  if not found then raise exception 'Repair not found'; end if;
  if v_repair.status in ('collected','cancelled') then raise exception 'Closed repair cannot receive a new quote'; end if;

  v_required := case
    when p_payment_requirement = 'none' then 0
    when p_payment_requirement = 'full' then p_quote_amount
    else greatest(coalesce(p_required_before_start,0),0)
  end;
  if v_required > p_quote_amount then raise exception 'Required start payment cannot exceed quote amount'; end if;

  select coalesce(max(version),0) + 1 into v_version
  from public.ops_repair_quotes
  where repair_id = p_repair_id;

  update public.ops_repair_quotes
  set status = 'superseded'
  where repair_id = p_repair_id and status in ('draft','published');

  insert into public.ops_repair_quotes(
    repair_id, version, diagnosis_public, work_description, quote_amount,
    estimated_completion, payment_requirement, required_before_start,
    status, published_at, created_by
  ) values (
    p_repair_id, v_version, nullif(btrim(p_diagnosis_public),''), nullif(btrim(p_work_description),''), p_quote_amount,
    nullif(btrim(p_estimated_completion),''), p_payment_requirement, v_required,
    'published', now(), auth.uid()
  ) returning id into v_quote_id;

  v_balance := greatest(p_quote_amount - coalesce(v_repair.amount_paid,0), 0);
  v_payment_status := case
    when p_quote_amount > 0 and coalesce(v_repair.amount_paid,0) >= p_quote_amount then 'paid'
    when coalesce(v_repair.amount_paid,0) > 0 then 'partial'
    else 'unpaid'
  end;

  update public.ops_repairs
  set current_quote_id = v_quote_id,
      amount_charged = p_quote_amount,
      balance_due = v_balance,
      payment_status = v_payment_status,
      status = 'awaiting_customer_approval'
  where id = p_repair_id;

  insert into public.ops_repair_events(
    repair_id, assignment_id, event_type, title, from_status, to_status,
    customer_visible, actor_id, metadata
  ) values (
    p_repair_id, v_repair.current_card_assignment_id, 'quote_published', 'Repair quote ready for approval',
    v_repair.status, 'awaiting_customer_approval', true, auth.uid(),
    jsonb_build_object('quote_id',v_quote_id,'version',v_version,'quote_amount',p_quote_amount,'payment_requirement',p_payment_requirement,'required_before_start',v_required)
  );

  return jsonb_build_object(
    'quote_id', v_quote_id,
    'version', v_version,
    'quote_amount', p_quote_amount,
    'required_before_start', v_required,
    'balance_due', v_balance,
    'payment_status', v_payment_status
  );
end;
$$;

create or replace function public.ops_record_repair_payment(
  p_repair_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_reference text default null,
  p_paid_at timestamptz default now(),
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_repair public.ops_repairs%rowtype;
  v_quote public.ops_repair_quotes%rowtype;
  v_payment_id uuid;
  v_paid numeric;
  v_total numeric;
  v_balance numeric;
  v_status text;
  v_gate_satisfied boolean := false;
begin
  if not public.ops_is_admin() then raise exception 'Not authorized'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Payment amount must be greater than zero'; end if;
  if p_payment_method not in ('bank_transfer','pos','cash','split','other') then raise exception 'Invalid payment method'; end if;

  select * into v_repair from public.ops_repairs where id = p_repair_id for update;
  if not found then raise exception 'Repair not found'; end if;
  if v_repair.status in ('collected','cancelled') then raise exception 'Cannot record payment on a closed repair'; end if;

  if v_repair.current_quote_id is not null then
    select * into v_quote from public.ops_repair_quotes where id = v_repair.current_quote_id;
  end if;
  v_total := coalesce(v_quote.quote_amount, v_repair.amount_charged, 0);
  if v_total <= 0 then raise exception 'Publish a repair quote before recording payment'; end if;

  insert into public.ops_repair_payments(
    repair_id, amount, payment_method, reference, paid_at, note, recorded_by
  ) values (
    p_repair_id, p_amount, p_payment_method, nullif(btrim(p_reference),''), coalesce(p_paid_at,now()), nullif(btrim(p_note),''), auth.uid()
  ) returning id into v_payment_id;

  select coalesce(sum(amount),0) into v_paid
  from public.ops_repair_payments
  where repair_id = p_repair_id and is_void = false;

  v_balance := greatest(v_total - v_paid, 0);
  v_status := case
    when v_total > 0 and v_paid >= v_total then 'paid'
    when v_paid > 0 then 'partial'
    else 'unpaid'
  end;
  v_gate_satisfied := v_quote.id is not null
    and v_quote.status = 'approved'
    and v_paid >= v_quote.required_before_start;

  update public.ops_repairs
  set amount_paid = v_paid,
      balance_due = v_balance,
      payment_status = v_status
  where id = p_repair_id;

  insert into public.ops_repair_events(
    repair_id, assignment_id, event_type, title, customer_visible, actor_id, metadata
  ) values (
    p_repair_id, v_repair.current_card_assignment_id, 'payment_recorded', 'Repair payment recorded', true, auth.uid(),
    jsonb_build_object('payment_id',v_payment_id,'amount',p_amount,'amount_paid',v_paid,'balance_due',v_balance,'payment_status',v_status,'start_gate_satisfied',v_gate_satisfied)
  );

  return jsonb_build_object(
    'payment_id', v_payment_id,
    'amount_paid', v_paid,
    'balance_due', v_balance,
    'payment_status', v_status,
    'start_gate_satisfied', v_gate_satisfied
  );
end;
$$;

create or replace function public.ops_change_repair_status(
  p_repair_id uuid,
  p_new_status text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_repair public.ops_repairs%rowtype;
  v_quote public.ops_repair_quotes%rowtype;
  v_allowed boolean := false;
  v_gate_ok boolean := false;
begin
  if not public.ops_is_admin() then raise exception 'Not authorized'; end if;
  if p_new_status not in (
    'received','diagnosing','awaiting_customer_approval','awaiting_payment','awaiting_parts',
    'in_progress','quality_check','ready_collection','rework','collected','cancelled'
  ) then raise exception 'Invalid repair status'; end if;

  select * into v_repair from public.ops_repairs where id = p_repair_id for update;
  if not found then raise exception 'Repair not found'; end if;
  if v_repair.status in ('collected','cancelled') then raise exception 'Closed repair status cannot be changed'; end if;
  if p_new_status = 'collected' then raise exception 'Use the collection handover action to collect a repair'; end if;
  if p_new_status = v_repair.status then return jsonb_build_object('status',v_repair.status); end if;

  if v_repair.current_quote_id is not null then
    select * into v_quote from public.ops_repair_quotes where id = v_repair.current_quote_id;
  end if;
  v_gate_ok := v_quote.id is not null
    and v_quote.status = 'approved'
    and coalesce(v_repair.amount_paid,0) >= v_quote.required_before_start;

  if p_new_status = 'cancelled' then
    if nullif(btrim(p_note),'') is null then raise exception 'Cancellation reason is required'; end if;
    v_allowed := true;
  elsif v_repair.status = 'received' and p_new_status = 'diagnosing' then v_allowed := true;
  elsif v_repair.status = 'diagnosing' and p_new_status = 'awaiting_customer_approval' and v_quote.id is not null then v_allowed := true;
  elsif v_repair.status = 'awaiting_customer_approval' and p_new_status in ('awaiting_payment','awaiting_parts','in_progress') then v_allowed := true;
  elsif v_repair.status = 'awaiting_payment' and p_new_status in ('awaiting_parts','in_progress') then v_allowed := true;
  elsif v_repair.status = 'awaiting_parts' and p_new_status = 'in_progress' then v_allowed := true;
  elsif v_repair.status = 'in_progress' and p_new_status = 'quality_check' then v_allowed := true;
  elsif v_repair.status = 'quality_check' and p_new_status in ('ready_collection','rework') then v_allowed := true;
  elsif v_repair.status = 'ready_collection' and p_new_status = 'rework' then v_allowed := true;
  elsif v_repair.status = 'rework' and p_new_status in ('awaiting_customer_approval','in_progress','quality_check') then v_allowed := true;
  end if;

  if not v_allowed then raise exception 'Invalid repair status transition: % -> %', v_repair.status, p_new_status; end if;

  if p_new_status in ('awaiting_payment','awaiting_parts','in_progress') then
    if v_quote.id is null or v_quote.status <> 'approved' then raise exception 'Current repair quote must be approved first'; end if;
  end if;
  if p_new_status in ('awaiting_parts','in_progress') and not v_gate_ok then
    raise exception 'Required payment must be recorded before repair work can start';
  end if;

  update public.ops_repairs
  set status = p_new_status,
      completed_at = case
        when p_new_status = 'ready_collection' then now()
        when p_new_status = 'rework' then null
        else completed_at
      end
  where id = p_repair_id;

  if p_new_status = 'rework' and v_repair.current_card_assignment_id is not null then
    update public.ops_repair_card_assignments
    set handover_started_at = null, handover_expires_at = null
    where id = v_repair.current_card_assignment_id and status = 'active';
  end if;

  insert into public.ops_repair_events(
    repair_id, assignment_id, event_type, title, note, from_status, to_status,
    customer_visible, actor_id
  ) values (
    p_repair_id, v_repair.current_card_assignment_id, 'status_changed', 'Repair status updated', nullif(btrim(p_note),''),
    v_repair.status, p_new_status, p_new_status in ('diagnosing','awaiting_customer_approval','awaiting_payment','awaiting_parts','in_progress','quality_check','ready_collection','rework'), auth.uid()
  );

  return jsonb_build_object('status', p_new_status, 'start_gate_satisfied', v_gate_ok);
end;
$$;

create or replace function public.ops_regenerate_repair_pin(
  p_repair_id uuid,
  p_new_pin text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_repair public.ops_repairs%rowtype;
  v_assignment public.ops_repair_card_assignments%rowtype;
  v_card_code text;
begin
  if not public.ops_is_admin() then raise exception 'Not authorized'; end if;
  if coalesce(p_new_pin,'') !~ '^[A-HJ-NP-Z2-9]{4}$' then raise exception 'Invalid Repair PIN'; end if;

  select * into v_repair from public.ops_repairs where id = p_repair_id for update;
  if not found then raise exception 'Repair not found'; end if;
  if v_repair.current_card_assignment_id is null then raise exception 'Repair has no active Repair Card'; end if;

  select * into v_assignment
  from public.ops_repair_card_assignments
  where id = v_repair.current_card_assignment_id and status = 'active'
  for update;
  if not found then raise exception 'Active Repair Card assignment not found'; end if;

  update public.ops_repair_card_assignments
  set access_pin = p_new_pin,
      pin_version = pin_version + 1,
      handover_started_at = null,
      handover_expires_at = null
  where id = v_assignment.id
  returning pin_version into v_assignment.pin_version;

  update public.ops_repair_portal_sessions
  set revoked_at = coalesce(revoked_at, now())
  where assignment_id = v_assignment.id and revoked_at is null;

  select card_code into v_card_code from public.ops_repair_cards where id = v_assignment.card_id;

  insert into public.ops_repair_events(
    repair_id, assignment_id, event_type, title, customer_visible, actor_id,
    metadata
  ) values (
    p_repair_id, v_assignment.id, 'pin_regenerated', 'Repair access PIN regenerated', false, auth.uid(),
    jsonb_build_object('pin_version',v_assignment.pin_version,'card_code',v_card_code)
  );

  return jsonb_build_object('assignment_id',v_assignment.id,'card_code',v_card_code,'access_pin',p_new_pin,'pin_version',v_assignment.pin_version);
end;
$$;

create or replace function public.ops_begin_repair_handover(p_repair_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_repair public.ops_repairs%rowtype;
  v_assignment public.ops_repair_card_assignments%rowtype;
  v_expires timestamptz := now() + interval '15 minutes';
begin
  if not public.ops_is_admin() then raise exception 'Not authorized'; end if;

  select * into v_repair from public.ops_repairs where id = p_repair_id for update;
  if not found then raise exception 'Repair not found'; end if;
  if v_repair.status <> 'ready_collection' then raise exception 'Repair must be ready for collection before handover'; end if;
  if v_repair.current_card_assignment_id is null then raise exception 'Repair has no active Repair Card'; end if;

  select * into v_assignment
  from public.ops_repair_card_assignments
  where id = v_repair.current_card_assignment_id and status = 'active'
  for update;
  if not found then raise exception 'Active Repair Card assignment not found'; end if;

  update public.ops_repair_card_assignments
  set handover_started_at = now(), handover_expires_at = v_expires
  where id = v_assignment.id;

  insert into public.ops_repair_events(
    repair_id, assignment_id, event_type, title, customer_visible, actor_id,
    metadata
  ) values (
    p_repair_id, v_assignment.id, 'handover_started', 'Customer handover started', true, auth.uid(),
    jsonb_build_object('expires_at',v_expires)
  );

  return jsonb_build_object('assignment_id',v_assignment.id,'handover_expires_at',v_expires);
end;
$$;

create or replace function public.ops_complete_repair_collection(
  p_repair_id uuid,
  p_card_returned boolean,
  p_missing_card_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_repair public.ops_repairs%rowtype;
  v_assignment public.ops_repair_card_assignments%rowtype;
  v_has_acceptance boolean := false;
  v_card_status text;
begin
  if not public.ops_is_admin() then raise exception 'Not authorized'; end if;

  select * into v_repair from public.ops_repairs where id = p_repair_id for update;
  if not found then raise exception 'Repair not found'; end if;
  if v_repair.status <> 'ready_collection' then raise exception 'Repair must be ready for collection'; end if;
  if coalesce(v_repair.balance_due,0) > 0 then raise exception 'Outstanding repair balance must be cleared before collection'; end if;
  if v_repair.current_card_assignment_id is null then raise exception 'Repair has no active Repair Card'; end if;

  select * into v_assignment
  from public.ops_repair_card_assignments
  where id = v_repair.current_card_assignment_id and status = 'active'
  for update;
  if not found then raise exception 'Active Repair Card assignment not found'; end if;

  select exists(
    select 1 from public.ops_repair_consents
    where repair_id = p_repair_id
      and assignment_id = v_assignment.id
      and consent_type = 'completion_acceptance'
  ) into v_has_acceptance;
  if not v_has_acceptance then raise exception 'Customer completion acceptance is required before collection'; end if;

  if not coalesce(p_card_returned,false) and nullif(btrim(p_missing_card_reason),'') is null then
    raise exception 'Missing-card reason is required when the physical card is not returned';
  end if;

  v_card_status := case when coalesce(p_card_returned,false) then 'available' else 'missing' end;

  update public.ops_repair_card_assignments
  set status = 'closed',
      closed_by = auth.uid(),
      closed_at = now(),
      handover_expires_at = null
  where id = v_assignment.id;

  update public.ops_repair_portal_sessions
  set revoked_at = coalesce(revoked_at, now())
  where assignment_id = v_assignment.id and revoked_at is null;

  update public.ops_repair_cards
  set status = v_card_status
  where id = v_assignment.card_id;

  update public.ops_repairs
  set status = 'collected',
      collected_at = now(),
      current_card_assignment_id = null
  where id = p_repair_id;

  if v_repair.inventory_unit_id is not null then
    update public.ops_inventory_units
    set status = 'sold'
    where id = v_repair.inventory_unit_id and status = 'repair';
  end if;

  insert into public.ops_repair_events(
    repair_id, assignment_id, event_type, title, note, from_status, to_status,
    customer_visible, actor_id, metadata
  ) values (
    p_repair_id, v_assignment.id, 'repair_collected', 'Repair collected',
    case when p_card_returned then null else btrim(p_missing_card_reason) end,
    'ready_collection', 'collected', true, auth.uid(),
    jsonb_build_object('card_returned',coalesce(p_card_returned,false),'card_status',v_card_status)
  );

  return jsonb_build_object('status','collected','assignment_id',v_assignment.id,'card_status',v_card_status);
end;
$$;

grant execute on function public.ops_create_repair_with_card(uuid,uuid,text,text,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,text,date,text,text,text,uuid,text,text) to authenticated;
grant execute on function public.ops_publish_repair_quote(uuid,text,text,numeric,text,text,numeric) to authenticated;
grant execute on function public.ops_record_repair_payment(uuid,numeric,text,text,timestamptz,text) to authenticated;
grant execute on function public.ops_change_repair_status(uuid,text,text) to authenticated;
grant execute on function public.ops_regenerate_repair_pin(uuid,text) to authenticated;
grant execute on function public.ops_begin_repair_handover(uuid) to authenticated;
grant execute on function public.ops_complete_repair_collection(uuid,boolean,text) to authenticated;

do $$
begin
  if (select count(*) from public.ops_repair_cards where card_code ~ '^RC-[0-9]{2}$') <> 30 then
    raise exception 'Expected exactly 30 seeded Repair Cards';
  end if;
end $$;
