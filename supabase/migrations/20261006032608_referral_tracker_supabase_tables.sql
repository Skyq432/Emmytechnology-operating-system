-- Referral Tracker: native Supabase tables replacing the Google Sheet.
-- Column names map 1:1 onto ReferralRow/CardholderRow/PosRow/DepositRow in
-- src/lib/marketing/referral-tracker-sheet-server.ts to minimize app-cutover friction.
-- Formula columns (commission, commission_paid) are GENERATED ALWAYS AS ... STORED so
-- the app can never desync them, mirroring the Sheet's "formula field, app may never
-- write to it" rule. Every mutation is RPC-only (no INSERT/UPDATE/DELETE RLS policies).

create table public.referral_tracker_cardholders (
  id uuid primary key default gen_random_uuid(),
  referral_code text not null unique,
  phone_number text,
  date_card_given date,
  card_status text not null default 'Active' check (card_status in ('Active','Inactive')),
  notes text,
  identity_id uuid references public.identities(id),
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.referral_tracker_referrals (
  id uuid primary key default gen_random_uuid(),
  referral_code text not null references public.referral_tracker_cardholders(referral_code) on update cascade,
  referred_client text,
  client_phone text,
  referral_date date,
  revenue numeric not null default 0,
  commission_rate numeric not null default 0.03,
  commission numeric generated always as (round(revenue * commission_rate, 2)) stored,
  payment_status text not null default 'Pending' check (payment_status in ('Pending','Paid')),
  commission_paid numeric generated always as (
    case when payment_status = 'Paid' then round(revenue * commission_rate, 2) else 0 end
  ) stored,
  notes text,
  identity_id uuid references public.identities(id),
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.referral_tracker_pos_withdrawals (
  id uuid primary key default gen_random_uuid(),
  date date,
  client_name text,
  phone_number text,
  amount_withdrawn numeric not null default 0,
  identity_id uuid references public.identities(id),
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create table public.referral_tracker_pos_deposits (
  id uuid primary key default gen_random_uuid(),
  date date,
  client_name text,
  phone_number text,
  amount numeric not null default 0,
  identity_id uuid references public.identities(id),
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create index on public.referral_tracker_referrals(referral_code);
create index on public.referral_tracker_cardholders(phone_number);
create index on public.referral_tracker_pos_withdrawals(phone_number);
create index on public.referral_tracker_pos_deposits(phone_number);

-- Mirrors canAccessReferralTracker() in src/lib/auth/roles.ts exactly — keep both in sync.
create or replace function public.referral_tracker_has_access()
returns boolean
language sql security definer set search_path to 'public' stable
as $function$
  select exists (
    select 1 from public.users
    where id = auth.uid()
      and role in ('super_admin','admin','front_desk','marketing_manager','growth_lead')
  );
$function$;
revoke all on function public.referral_tracker_has_access() from public, anon;
grant execute on function public.referral_tracker_has_access() to authenticated, service_role;

alter table public.referral_tracker_cardholders enable row level security;
alter table public.referral_tracker_referrals enable row level security;
alter table public.referral_tracker_pos_withdrawals enable row level security;
alter table public.referral_tracker_pos_deposits enable row level security;

create policy referral_tracker_cardholders_select on public.referral_tracker_cardholders for select to authenticated using (public.referral_tracker_has_access());
create policy referral_tracker_referrals_select on public.referral_tracker_referrals for select to authenticated using (public.referral_tracker_has_access());
create policy referral_tracker_pos_withdrawals_select on public.referral_tracker_pos_withdrawals for select to authenticated using (public.referral_tracker_has_access());
create policy referral_tracker_pos_deposits_select on public.referral_tracker_pos_deposits for select to authenticated using (public.referral_tracker_has_access());

create or replace function public.referral_tracker_add_cardholder(
  p_referral_code text,
  p_phone_number text default null,
  p_date_card_given date default null,
  p_card_status text default 'Active',
  p_notes text default null,
  p_identity_id uuid default null
) returns public.referral_tracker_cardholders
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_row public.referral_tracker_cardholders;
begin
  if not public.referral_tracker_has_access() then
    raise exception 'Not authorized';
  end if;
  if trim(coalesce(p_referral_code, '')) = '' then
    raise exception 'Referral code is required.';
  end if;

  begin
    insert into public.referral_tracker_cardholders (
      referral_code, phone_number, date_card_given, card_status, notes, identity_id, created_by
    ) values (
      trim(p_referral_code), p_phone_number, p_date_card_given, coalesce(p_card_status, 'Active'), p_notes, p_identity_id, auth.uid()
    ) returning * into v_row;
  exception when unique_violation then
    raise exception 'Referral code "%" already exists. Codes must be unique.', trim(p_referral_code);
  end;

  return v_row;
end;
$function$;
revoke all on function public.referral_tracker_add_cardholder(text, text, date, text, text, uuid) from public, anon;
grant execute on function public.referral_tracker_add_cardholder(text, text, date, text, text, uuid) to authenticated, service_role;

create or replace function public.referral_tracker_update_cardholder_status(
  p_id uuid,
  p_card_status text,
  p_notes text default null
) returns public.referral_tracker_cardholders
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_row public.referral_tracker_cardholders;
begin
  if not public.referral_tracker_has_access() then
    raise exception 'Not authorized';
  end if;

  update public.referral_tracker_cardholders
  set card_status = coalesce(p_card_status, card_status),
      notes = coalesce(p_notes, notes),
      updated_at = now()
  where id = p_id
  returning * into v_row;

  if not found then
    raise exception 'Card holder not found.';
  end if;

  return v_row;
end;
$function$;
revoke all on function public.referral_tracker_update_cardholder_status(uuid, text, text) from public, anon;
grant execute on function public.referral_tracker_update_cardholder_status(uuid, text, text) to authenticated, service_role;

create or replace function public.referral_tracker_add_referral(
  p_referral_code text,
  p_referred_client text default null,
  p_client_phone text default null,
  p_referral_date date default null,
  p_revenue numeric default 0,
  p_notes text default null,
  p_identity_id uuid default null
) returns public.referral_tracker_referrals
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_row public.referral_tracker_referrals;
begin
  if not public.referral_tracker_has_access() then
    raise exception 'Not authorized';
  end if;
  if trim(coalesce(p_referral_code, '')) = '' then
    raise exception 'Referral code is required.';
  end if;
  if not exists (select 1 from public.referral_tracker_cardholders where referral_code = trim(p_referral_code)) then
    raise exception 'Referral code "%" is not in Referral Card Holders. Add the card holder first.', trim(p_referral_code);
  end if;

  insert into public.referral_tracker_referrals (
    referral_code, referred_client, client_phone, referral_date, revenue, notes, identity_id, created_by
  ) values (
    trim(p_referral_code), p_referred_client, p_client_phone, p_referral_date, coalesce(p_revenue, 0), p_notes, p_identity_id, auth.uid()
  ) returning * into v_row;

  return v_row;
end;
$function$;
revoke all on function public.referral_tracker_add_referral(text, text, text, date, numeric, text, uuid) from public, anon;
grant execute on function public.referral_tracker_add_referral(text, text, text, date, numeric, text, uuid) to authenticated, service_role;

create or replace function public.referral_tracker_update_referral_payment(
  p_id uuid,
  p_payment_status text,
  p_notes text default null
) returns public.referral_tracker_referrals
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_row public.referral_tracker_referrals;
begin
  if not public.referral_tracker_has_access() then
    raise exception 'Not authorized';
  end if;
  if p_payment_status not in ('Pending', 'Paid') then
    raise exception 'Payment status must be Pending or Paid.';
  end if;

  update public.referral_tracker_referrals
  set payment_status = p_payment_status,
      notes = coalesce(p_notes, notes),
      updated_at = now()
  where id = p_id
  returning * into v_row;

  if not found then
    raise exception 'Referral not found.';
  end if;

  return v_row;
end;
$function$;
revoke all on function public.referral_tracker_update_referral_payment(uuid, text, text) from public, anon;
grant execute on function public.referral_tracker_update_referral_payment(uuid, text, text) to authenticated, service_role;

create or replace function public.referral_tracker_add_pos_withdrawal(
  p_date date default null,
  p_client_name text default null,
  p_phone_number text default null,
  p_amount_withdrawn numeric default 0,
  p_identity_id uuid default null
) returns public.referral_tracker_pos_withdrawals
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_row public.referral_tracker_pos_withdrawals;
begin
  if not public.referral_tracker_has_access() then
    raise exception 'Not authorized';
  end if;

  insert into public.referral_tracker_pos_withdrawals (
    date, client_name, phone_number, amount_withdrawn, identity_id, created_by
  ) values (
    p_date, p_client_name, p_phone_number, coalesce(p_amount_withdrawn, 0), p_identity_id, auth.uid()
  ) returning * into v_row;

  return v_row;
end;
$function$;
revoke all on function public.referral_tracker_add_pos_withdrawal(date, text, text, numeric, uuid) from public, anon;
grant execute on function public.referral_tracker_add_pos_withdrawal(date, text, text, numeric, uuid) to authenticated, service_role;

create or replace function public.referral_tracker_add_pos_deposit(
  p_date date default null,
  p_client_name text default null,
  p_phone_number text default null,
  p_amount numeric default 0,
  p_identity_id uuid default null
) returns public.referral_tracker_pos_deposits
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_row public.referral_tracker_pos_deposits;
begin
  if not public.referral_tracker_has_access() then
    raise exception 'Not authorized';
  end if;

  insert into public.referral_tracker_pos_deposits (
    date, client_name, phone_number, amount, identity_id, created_by
  ) values (
    p_date, p_client_name, p_phone_number, coalesce(p_amount, 0), p_identity_id, auth.uid()
  ) returning * into v_row;

  return v_row;
end;
$function$;
revoke all on function public.referral_tracker_add_pos_deposit(date, text, text, numeric, uuid) from public, anon;
grant execute on function public.referral_tracker_add_pos_deposit(date, text, text, numeric, uuid) to authenticated, service_role;
