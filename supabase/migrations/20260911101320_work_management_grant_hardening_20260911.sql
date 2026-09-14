revoke all privileges on table public.work_todos from anon, authenticated;
revoke all privileges on table public.work_tasks from anon, authenticated;
revoke all privileges on table public.work_task_assignments from anon, authenticated;
revoke all privileges on table public.work_task_extension_requests from anon, authenticated;
revoke all privileges on table public.work_task_events from anon, authenticated;
revoke all privileges on table public.work_goals from anon, authenticated;
revoke all privileges on table public.work_goal_contributors from anon, authenticated;

grant select, insert, update, delete on public.work_todos to authenticated;
grant select on public.work_tasks to authenticated;
grant select on public.work_task_assignments to authenticated;
grant select on public.work_task_extension_requests to authenticated;
grant select on public.work_task_events to authenticated;
grant select, insert, update, delete on public.work_goals to authenticated;
grant select, insert, update, delete on public.work_goal_contributors to authenticated;

revoke all on function public.work_is_internal_user(uuid) from anon;
revoke all on function public.work_is_admin(uuid) from anon;
revoke all on function public.work_can_read_task(uuid, uuid) from anon;
revoke all on function public.work_can_read_goal(uuid, uuid) from anon;

grant execute on function public.work_is_internal_user(uuid) to authenticated;
grant execute on function public.work_is_admin(uuid) to authenticated;
grant execute on function public.work_can_read_task(uuid, uuid) to authenticated;
grant execute on function public.work_can_read_goal(uuid, uuid) to authenticated;
