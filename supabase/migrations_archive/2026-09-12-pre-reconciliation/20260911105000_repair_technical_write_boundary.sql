-- Technicians must never receive generic UPDATE access to ops_repairs.
-- Expose only the technical fields they are allowed to maintain.

drop policy if exists "technical staff update repair work" on public.ops_repairs;

create or replace function public.ops_update_repair_work_details(
  p_repair_id uuid,
  p_diagnosis text default null,
  p_repair_type text default null,
  p_parts_replaced text default null,
  p_parts_cost numeric default 0,
  p_labour_cost numeric default 0,
  p_technician_name text default null,
  p_condition_returned text default null,
  p_warranty_period text default null,
  p_warranty_expires_at date default null,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.staff_has_capability('operations.repair.technical') then
    raise exception 'Not authorized';
  end if;

  if p_repair_id is null or not exists (select 1 from public.ops_repairs where id = p_repair_id) then
    raise exception 'Repair not found';
  end if;

  update public.ops_repairs
  set diagnosis = nullif(trim(p_diagnosis), ''),
      repair_type = nullif(trim(p_repair_type), ''),
      parts_replaced = nullif(trim(p_parts_replaced), ''),
      parts_cost = greatest(coalesce(p_parts_cost, 0), 0),
      labour_cost = greatest(coalesce(p_labour_cost, 0), 0),
      technician_name = nullif(trim(p_technician_name), ''),
      condition_returned = nullif(trim(p_condition_returned), ''),
      warranty_period = nullif(trim(p_warranty_period), ''),
      warranty_expires_at = p_warranty_expires_at,
      notes = nullif(trim(p_notes), '')
  where id = p_repair_id;

  insert into public.ops_repair_events(repair_id,event_type,title,actor_type,actor_id,metadata)
  values (
    p_repair_id,
    'technical_details_updated',
    'Repair work details updated',
    'staff',
    auth.uid(),
    '{}'::jsonb
  );
end;
$$;

grant execute on function public.ops_update_repair_work_details(uuid,text,text,text,numeric,numeric,text,text,text,date,text) to authenticated;

-- Reading suppliers is useful for inventory context; changing suppliers remains
-- restricted by the existing operations.supplier.manage ALL policy.
create policy "inventory staff read suppliers"
on public.ops_suppliers
for select
to authenticated
using (public.staff_has_capability('operations.inventory.read'));
