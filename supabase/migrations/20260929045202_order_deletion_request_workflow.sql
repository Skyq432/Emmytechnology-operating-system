-- Soft-delete workflow for ops_orders (Direct Sale and regular Orders — same table):
-- front desk can flag an order for deletion with a reason, only an admin/super_admin
-- can resolve it (approve -> soft-deleted, or reject -> back to normal). Never a hard
-- DELETE — an approved deletion stays in the table, excluded from lists/reports, so a
-- mistaken admin approval is never unrecoverable.

alter table public.ops_orders
  add column if not exists deletion_status text not null default 'none' check (deletion_status in ('none','pending_deletion','deleted')),
  add column if not exists deletion_requested_by uuid references public.users(id),
  add column if not exists deletion_requested_at timestamptz,
  add column if not exists deletion_reason text,
  add column if not exists deletion_resolved_by uuid references public.users(id),
  add column if not exists deletion_resolved_at timestamptz,
  add column if not exists deletion_resolution_note text;

create index if not exists ops_orders_deletion_status_idx on public.ops_orders(deletion_status) where deletion_status <> 'none';

create or replace function public.ops_request_order_deletion(p_order_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order public.ops_orders%rowtype;
begin
  if not public.staff_has_capability('operations.order.manage') then raise exception 'Not authorized'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required to flag this order for deletion.'; end if;

  select * into v_order from public.ops_orders where id = p_order_id;
  if not found then raise exception 'Order not found'; end if;
  if v_order.deletion_status <> 'none' then raise exception 'This order already has a pending or resolved deletion request.'; end if;

  update public.ops_orders set
    deletion_status = 'pending_deletion',
    deletion_requested_by = auth.uid(),
    deletion_requested_at = now(),
    deletion_reason = trim(p_reason),
    deletion_resolved_by = null,
    deletion_resolved_at = null,
    deletion_resolution_note = null
  where id = p_order_id;

  insert into public.ops_order_events(order_id, event_type, title, actor_id, metadata)
  values (p_order_id, 'deletion_requested', 'Flagged for deletion', auth.uid(), jsonb_build_object('reason', trim(p_reason)));
end;
$function$;

create or replace function public.ops_resolve_order_deletion(p_order_id uuid, p_approve boolean, p_note text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order public.ops_orders%rowtype;
  v_role text;
begin
  select role into v_role from public.users where id = auth.uid();
  if v_role not in ('admin','super_admin') then raise exception 'Only an administrator can resolve a deletion request.'; end if;

  select * into v_order from public.ops_orders where id = p_order_id;
  if not found then raise exception 'Order not found'; end if;
  if v_order.deletion_status <> 'pending_deletion' then raise exception 'This order has no pending deletion request.'; end if;

  update public.ops_orders set
    deletion_status = case when p_approve then 'deleted' else 'none' end,
    deletion_resolved_by = auth.uid(),
    deletion_resolved_at = now(),
    deletion_resolution_note = nullif(trim(p_note), ''),
    deletion_requested_by = case when p_approve then deletion_requested_by else null end,
    deletion_requested_at = case when p_approve then deletion_requested_at else null end,
    deletion_reason = case when p_approve then deletion_reason else null end
  where id = p_order_id;

  insert into public.ops_order_events(order_id, event_type, title, actor_id, metadata)
  values (
    p_order_id,
    case when p_approve then 'deletion_approved' else 'deletion_rejected' end,
    case when p_approve then 'Deletion approved — order deleted' else 'Deletion request rejected' end,
    auth.uid(),
    jsonb_build_object('note', nullif(trim(p_note), ''))
  );
end;
$function$;

revoke all on function public.ops_request_order_deletion(uuid, text) from public, anon;
grant execute on function public.ops_request_order_deletion(uuid, text) to authenticated, service_role;

revoke all on function public.ops_resolve_order_deletion(uuid, boolean, text) from public, anon;
grant execute on function public.ops_resolve_order_deletion(uuid, boolean, text) to authenticated, service_role;
