create table public.work_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.users(id) on delete cascade,
  actor_id uuid references public.users(id) on delete set null,
  task_id uuid not null references public.work_tasks(id) on delete cascade,
  task_assignment_id uuid references public.work_task_assignments(id) on delete cascade,
  notification_type text not null check (notification_type in (
    'task_assigned',
    'task_accepted',
    'task_returned',
    'extension_requested',
    'extension_approved',
    'extension_declined',
    'task_completed',
    'task_reassigned',
    'task_cancelled'
  )),
  title text not null check (length(trim(title)) > 0),
  message text,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index work_notifications_recipient_idx
  on public.work_notifications(recipient_id, is_read, created_at desc);
create index work_notifications_task_idx
  on public.work_notifications(task_id, created_at desc);

alter table public.work_notifications enable row level security;

create policy "staff read their work notifications"
on public.work_notifications
for select
to authenticated
using (auth.uid() = recipient_id);

create policy "staff mark their work notifications read"
on public.work_notifications
for update
to authenticated
using (auth.uid() = recipient_id)
with check (auth.uid() = recipient_id);

revoke all on public.work_notifications from anon;
revoke all on public.work_notifications from authenticated;
grant select, update on public.work_notifications to authenticated;

create or replace function public.work_emit_task_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.work_tasks%rowtype;
  v_assignment public.work_task_assignments%rowtype;
  v_recipient uuid;
  v_type text;
  v_title text;
  v_message text;
begin
  if new.event_type not in (
    'task_assigned',
    'task_accepted',
    'task_rejected',
    'extension_requested',
    'extension_approved',
    'extension_declined',
    'task_completed',
    'task_reassigned',
    'task_cancelled'
  ) then
    return new;
  end if;

  select * into v_task from public.work_tasks where id = new.task_id;
  if not found then return new; end if;

  if new.task_assignment_id is not null then
    select * into v_assignment
    from public.work_task_assignments
    where id = new.task_assignment_id;
  end if;

  case new.event_type
    when 'task_assigned' then
      v_recipient := v_assignment.assignee_id;
      v_type := 'task_assigned';
      v_title := 'New Task assigned';
      v_message := v_task.title;
    when 'task_reassigned' then
      v_recipient := v_assignment.assignee_id;
      v_type := 'task_reassigned';
      v_title := 'Task reassigned to you';
      v_message := v_task.title;
    when 'task_accepted' then
      v_recipient := v_assignment.assigned_by;
      v_type := 'task_accepted';
      v_title := 'Task accepted';
      v_message := v_task.title;
    when 'task_rejected' then
      v_recipient := v_assignment.assigned_by;
      v_type := 'task_returned';
      v_title := 'Task returned';
      v_message := v_task.title;
    when 'extension_requested' then
      v_recipient := v_assignment.assigned_by;
      v_type := 'extension_requested';
      v_title := 'More time requested';
      v_message := v_task.title;
    when 'extension_approved' then
      v_recipient := v_assignment.assignee_id;
      v_type := 'extension_approved';
      v_title := 'Extension approved';
      v_message := v_task.title;
    when 'extension_declined' then
      v_recipient := v_assignment.assignee_id;
      v_type := 'extension_declined';
      v_title := 'Extension declined';
      v_message := v_task.title;
    when 'task_completed' then
      v_recipient := v_assignment.assigned_by;
      v_type := 'task_completed';
      v_title := 'Task completed';
      v_message := v_task.title;
    when 'task_cancelled' then
      v_recipient := v_assignment.assignee_id;
      v_type := 'task_cancelled';
      v_title := 'Task cancelled';
      v_message := v_task.title;
    else
      return new;
  end case;

  if v_recipient is null or v_recipient = new.actor_id then
    return new;
  end if;

  insert into public.work_notifications(
    recipient_id,
    actor_id,
    task_id,
    task_assignment_id,
    notification_type,
    title,
    message
  ) values (
    v_recipient,
    new.actor_id,
    new.task_id,
    new.task_assignment_id,
    v_type,
    v_title,
    v_message
  );

  return new;
end;
$$;

revoke all on function public.work_emit_task_notification() from public, anon, authenticated;

drop trigger if exists work_task_events_notify on public.work_task_events;
create trigger work_task_events_notify
after insert on public.work_task_events
for each row
execute function public.work_emit_task_notification();

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'work_notifications'
  ) then
    alter publication supabase_realtime add table public.work_notifications;
  end if;
end;
$$;
