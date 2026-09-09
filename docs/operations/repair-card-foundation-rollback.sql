-- Rollback for 20260830120000_repair_card_foundation.sql
-- Use only if Repair Card foundation must be removed before dependent portal/UI phases are live.
-- This intentionally does not delete ops_repairs or unrelated Operations data.

begin;

-- Refuse destructive rollback if new workflow statuses are still in use.
do $$
begin
  if exists (
    select 1 from public.ops_repairs
    where status in ('awaiting_customer_approval','awaiting_payment','quality_check','rework')
  ) then
    raise exception 'Cannot rollback while repairs use new Repair Card workflow statuses';
  end if;
end $$;

alter table public.ops_repairs
  drop constraint if exists ops_repairs_current_quote_id_fkey,
  drop constraint if exists ops_repairs_current_card_assignment_id_fkey;

drop index if exists public.ops_repairs_current_quote_idx;
drop index if exists public.ops_repairs_current_card_assignment_idx;

alter table public.ops_repairs
  drop column if exists current_quote_id,
  drop column if exists current_card_assignment_id,
  drop column if exists customer_email,
  drop column if exists accessories_received;

alter table public.ops_repairs drop constraint if exists ops_repairs_status_check;
alter table public.ops_repairs add constraint ops_repairs_status_check check (status in (
  'received','diagnosing','awaiting_parts','in_progress','ready_collection','collected','cancelled'
));

drop table if exists public.ops_repair_access_attempts cascade;
drop table if exists public.ops_repair_consents cascade;
drop table if exists public.ops_repair_portal_sessions cascade;
drop table if exists public.ops_repair_events cascade;
drop table if exists public.ops_repair_payments cascade;
drop table if exists public.ops_repair_quotes cascade;
drop table if exists public.ops_repair_card_assignments cascade;
drop table if exists public.ops_repair_cards cascade;

commit;
