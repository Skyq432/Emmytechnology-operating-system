-- Recorded live in this project's migration history (version 20260913152855) but the
-- .sql file was never committed to the repo. This commits its exact current live
-- schema and RPC definitions, verbatim, as found via information_schema/pg_catalog.
-- No-op on the current database.
--
-- Links inventory parts consumed during a repair back to Operations stock: serialized
-- units move to a 'repair' status; quantity-tracked items get a 'repair_use' stock
-- movement. Removing a part reverses either path ('available' status, or a 'return_in'
-- movement).

CREATE TABLE IF NOT EXISTS public.ops_repair_parts_used (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_id uuid NOT NULL REFERENCES public.ops_repairs(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES public.ops_inventory_items(id),
  inventory_unit_id uuid REFERENCES public.ops_inventory_units(id),
  location_id uuid REFERENCES public.ops_locations(id),
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_cost numeric,
  note text,
  removed_at timestamptz,
  removed_by uuid REFERENCES public.users(id),
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ops_repair_parts_used ENABLE ROW LEVEL SECURITY;

CREATE POLICY ops_repair_parts_used_admin_all ON public.ops_repair_parts_used
  FOR ALL USING (public.ops_is_admin()) WITH CHECK (public.ops_is_admin());

CREATE POLICY "staff read repair parts used" ON public.ops_repair_parts_used
  FOR SELECT USING (public.staff_has_any_capability(ARRAY['operations.repair.read', 'operations.inventory.read']));

CREATE OR REPLACE FUNCTION public.ops_add_repair_part(p_repair_id uuid, p_inventory_item_id uuid, p_quantity integer DEFAULT 1, p_location_id uuid DEFAULT NULL::uuid, p_inventory_unit_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_repair public.ops_repairs%rowtype;
  v_inventory public.ops_inventory_items%rowtype;
  v_unit public.ops_inventory_units%rowtype;
  v_available bigint;
  v_part_id uuid;
  v_unit_cost numeric;
begin
  if not public.staff_has_capability('operations.repair.technical') then raise exception 'Not authorized'; end if;

  select * into v_repair from public.ops_repairs where id = p_repair_id for update;
  if not found then raise exception 'Repair not found'; end if;
  if v_repair.status in ('collected','cancelled') then raise exception 'Repair is already closed'; end if;

  select * into v_inventory from public.ops_inventory_items where id = p_inventory_item_id;
  if not found then raise exception 'Inventory item not found'; end if;
  v_unit_cost := v_inventory.default_unit_cost;

  if v_inventory.serial_tracking then
    if p_inventory_unit_id is null then raise exception 'A specific unit is required for a serialized part'; end if;
    select * into v_unit from public.ops_inventory_units where id = p_inventory_unit_id and inventory_item_id = p_inventory_item_id for update;
    if not found or v_unit.status <> 'available' then raise exception 'Selected unit is not available'; end if;

    update public.ops_inventory_units set status = 'repair' where id = v_unit.id;

    insert into public.ops_repair_parts_used(repair_id, inventory_item_id, inventory_unit_id, location_id, quantity, unit_cost, note, created_by)
    values (p_repair_id, p_inventory_item_id, v_unit.id, v_unit.current_location_id, 1, coalesce(v_unit.unit_cost, v_unit_cost), nullif(trim(p_note), ''), auth.uid())
    returning id into v_part_id;
  else
    if p_location_id is null then raise exception 'A stock location is required for this part'; end if;
    select available into v_available from public.ops_inventory_availability
      where inventory_item_id = p_inventory_item_id and location_id = p_location_id;
    if coalesce(v_available, 0) < coalesce(p_quantity, 1) then raise exception 'Insufficient stock for %', v_inventory.name; end if;

    perform public.ops_create_stock_movement(p_inventory_item_id, p_location_id, 'repair_use', -coalesce(p_quantity, 1), 'repair', p_repair_id, 'Used on repair '||v_repair.repair_code);

    insert into public.ops_repair_parts_used(repair_id, inventory_item_id, location_id, quantity, unit_cost, note, created_by)
    values (p_repair_id, p_inventory_item_id, p_location_id, coalesce(p_quantity, 1), v_unit_cost, nullif(trim(p_note), ''), auth.uid())
    returning id into v_part_id;
  end if;

  insert into public.ops_repair_events(repair_id, event_type, title, actor_id, metadata)
  values (p_repair_id, 'part_used', 'Part added from inventory', auth.uid(), jsonb_build_object('inventory_item_id', p_inventory_item_id, 'part_id', v_part_id));

  return jsonb_build_object('part_id', v_part_id, 'repair_id', p_repair_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.ops_remove_repair_part(p_part_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_part public.ops_repair_parts_used%rowtype;
  v_repair public.ops_repairs%rowtype;
begin
  if not public.staff_has_capability('operations.repair.technical') then raise exception 'Not authorized'; end if;

  select * into v_part from public.ops_repair_parts_used where id = p_part_id for update;
  if not found then raise exception 'Part record not found'; end if;
  if v_part.removed_at is not null then raise exception 'Part is already removed'; end if;

  select * into v_repair from public.ops_repairs where id = v_part.repair_id;

  if v_part.inventory_unit_id is not null then
    update public.ops_inventory_units set status = 'available' where id = v_part.inventory_unit_id and status = 'repair';
  else
    perform public.ops_create_stock_movement(v_part.inventory_item_id, v_part.location_id, 'return_in', v_part.quantity, 'repair', v_part.repair_id, 'Removed from repair '||coalesce(v_repair.repair_code,''));
  end if;

  update public.ops_repair_parts_used set removed_at = now(), removed_by = auth.uid() where id = p_part_id;

  insert into public.ops_repair_events(repair_id, event_type, title, actor_id, metadata)
  values (v_part.repair_id, 'part_removed', 'Part removed / returned to inventory', auth.uid(), jsonb_build_object('part_id', p_part_id));
end;
$function$;
