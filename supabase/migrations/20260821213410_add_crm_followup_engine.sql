begin;

create table if not exists public.crm_notes (
  id uuid primary key default gen_random_uuid(),
  identity_id uuid not null references public.identities(id) on delete cascade,
  body text not null,
  author text,
  created_at timestamptz not null default now()
);

create index if not exists crm_notes_identity_created_idx
  on public.crm_notes(identity_id, created_at desc);

create table if not exists public.crm_manual_updates (
  id uuid primary key default gen_random_uuid(),
  identity_id uuid not null references public.identities(id) on delete cascade,
  update_type text not null,
  value text,
  note text,
  updated_by text,
  created_at timestamptz not null default now()
);

create index if not exists crm_manual_updates_identity_created_idx
  on public.crm_manual_updates(identity_id, created_at desc);

create table if not exists public.crm_stage_history (
  id uuid primary key default gen_random_uuid(),
  identity_id uuid not null references public.identities(id) on delete cascade,
  from_stage integer,
  to_stage integer not null,
  tracking_type text not null default 'Manual',
  changed_by text,
  created_at timestamptz not null default now(),
  constraint crm_stage_history_from_stage_check check (from_stage is null or from_stage between 1 and 10),
  constraint crm_stage_history_to_stage_check check (to_stage between 1 and 10)
);

create index if not exists crm_stage_history_identity_created_idx
  on public.crm_stage_history(identity_id, created_at desc);

create table if not exists public.crm_lead_ownership (
  identity_id uuid primary key references public.identities(id) on delete cascade,
  referrer_identity_id uuid references public.identities(id) on delete set null,
  original_ambassador_id uuid references public.ambassadors(id) on delete set null,
  generation integer,
  owner_type text not null default 'unassigned',
  owner_id uuid,
  owner_label text,
  assigned_by text,
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_lead_ownership_owner_type_check check (owner_type in ('ambassador','admin','unassigned')),
  constraint crm_lead_ownership_generation_check check (generation is null or generation > 0)
);

create index if not exists crm_lead_ownership_owner_idx
  on public.crm_lead_ownership(owner_type, owner_id);

create table if not exists public.crm_contact_state (
  identity_id uuid primary key references public.identities(id) on delete cascade,
  last_contacted_at timestamptz,
  next_contact_allowed_at timestamptz,
  contact_attempt_count integer not null default 0,
  last_contact_outcome text,
  cooling_until timestamptz,
  dormant boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint crm_contact_state_attempts_check check (contact_attempt_count >= 0)
);

create index if not exists crm_contact_state_next_contact_idx
  on public.crm_contact_state(next_contact_allowed_at)
  where next_contact_allowed_at is not null;

create table if not exists public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  identity_id uuid not null references public.identities(id) on delete cascade,
  title text not null,
  description text,
  action_text text,
  priority text not null default 'Medium',
  owner text,
  owner_type text not null default 'unassigned',
  owner_id uuid,
  due_at timestamptz not null,
  expires_at timestamptz,
  status text not null default 'open',
  outcome text,
  task_type text not null default 'follow_up',
  action_key text,
  source_stage integer,
  trigger_at timestamptz,
  auto_generated boolean not null default false,
  dedupe_key text,
  created_by text,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  expired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_tasks_status_check check (status in ('open','completed','cancelled','expired')),
  constraint crm_tasks_owner_type_check check (owner_type in ('ambassador','admin','unassigned')),
  constraint crm_tasks_stage_check check (source_stage is null or source_stage between 1 and 10),
  constraint crm_tasks_expiry_check check (expires_at is null or expires_at > due_at)
);

create unique index if not exists crm_tasks_dedupe_key_unique
  on public.crm_tasks(dedupe_key)
  where dedupe_key is not null;
create index if not exists crm_tasks_identity_due_idx
  on public.crm_tasks(identity_id, due_at);
create index if not exists crm_tasks_open_due_idx
  on public.crm_tasks(due_at, expires_at)
  where status = 'open';

create table if not exists public.crm_followup_rules (
  stage integer primary key,
  delay_minutes integer not null,
  expected_progress_minutes integer not null,
  cold_after_minutes integer not null,
  task_window_minutes integer not null,
  priority text not null default 'Medium',
  action_template text not null,
  max_contact_attempts integer not null default 3,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_followup_rules_stage_check check (stage between 1 and 10),
  constraint crm_followup_rules_delay_check check (delay_minutes >= 0),
  constraint crm_followup_rules_progress_check check (expected_progress_minutes > 0),
  constraint crm_followup_rules_cold_check check (cold_after_minutes > 0),
  constraint crm_followup_rules_window_check check (task_window_minutes > 0),
  constraint crm_followup_rules_attempts_check check (max_contact_attempts > 0)
);

insert into public.crm_followup_rules
  (stage, delay_minutes, expected_progress_minutes, cold_after_minutes, task_window_minutes, priority, action_template, max_contact_attempts, active)
values
  (1, 2880, 4320, 10080, 1440, 'Low',    'Contact the lead once to understand what product they are interested in and whether they want help choosing an option.', 3, true),
  (2, 1440, 2880, 7200,  1440, 'Medium', 'Contact the customer about their voucher and ask which product they would like to use it toward.', 3, true),
  (3, 720,  2880, 5760,  1440, 'Medium', 'Contact the customer to understand which product option they prefer and answer any buying questions.', 3, true),
  (4, 60,   1440, 2880,  720,  'High',   'Contact the customer about the product in their cart and ask if they need help completing the order.', 3, true),
  (5, 15,   1440, 4320,  240,  'High',   'Open the WhatsApp handoff, continue the sales conversation, then record the outcome in CRM.', 3, true)
on conflict (stage) do update set
  delay_minutes = excluded.delay_minutes,
  expected_progress_minutes = excluded.expected_progress_minutes,
  cold_after_minutes = excluded.cold_after_minutes,
  task_window_minutes = excluded.task_window_minutes,
  priority = excluded.priority,
  action_template = excluded.action_template,
  max_contact_attempts = excluded.max_contact_attempts,
  active = excluded.active,
  updated_at = now();

alter table public.crm_notes enable row level security;
alter table public.crm_manual_updates enable row level security;
alter table public.crm_stage_history enable row level security;
alter table public.crm_lead_ownership enable row level security;
alter table public.crm_contact_state enable row level security;
alter table public.crm_tasks enable row level security;
alter table public.crm_followup_rules enable row level security;

grant all on public.crm_notes to service_role;
grant all on public.crm_manual_updates to service_role;
grant all on public.crm_stage_history to service_role;
grant all on public.crm_lead_ownership to service_role;
grant all on public.crm_contact_state to service_role;
grant all on public.crm_tasks to service_role;
grant all on public.crm_followup_rules to service_role;

commit;
