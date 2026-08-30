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

do $$
begin
  if (select count(*) from public.ops_repair_cards where card_code ~ '^RC-[0-9]{2}$') <> 30 then
    raise exception 'Expected exactly 30 seeded Repair Cards';
  end if;
end $$;
