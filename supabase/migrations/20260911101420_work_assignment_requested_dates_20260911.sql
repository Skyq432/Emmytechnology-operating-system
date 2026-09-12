alter table public.work_task_assignments add column requested_start_at timestamptz, add column requested_due_at timestamptz;
update public.work_task_assignments a set requested_start_at=t.requested_start_at, requested_due_at=t.requested_due_at from public.work_tasks t where t.id=a.task_id;
alter table public.work_task_assignments alter column requested_start_at set not null, alter column requested_due_at set not null, add constraint work_task_assignments_requested_dates_check check (requested_due_at > requested_start_at);
