create or replace function public.ops_create_inventory_item(
  p_name text,
  p_description text default null,
  p_category text default null,
  p_unit text default 'item',
  p_serial_tracking boolean default false,
  p_reorder_level integer default 0,
  p_item_type text default 'other',
  p_brand text default null,
  p_model text default null,
  p_default_condition text default null,
  p_default_unit_cost numeric default null,
  p_default_selling_price numeric default null,
  p_preferred_supplier_id uuid default null,
  p_specs jsonb default '{}'::jsonb,
  p_opening_location_id uuid default null,
  p_opening_quantity integer default 0
) returns public.ops_inventory_items
language plpgsql
security definer
set search_path=public
as $$
declare v_item public.ops_inventory_items%rowtype;
begin
  if not public.ops_is_admin() then raise exception 'Not authorized'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'Item name is required'; end if;
  if p_item_type not in ('laptop','phone','accessory','solar','other') then raise exception 'Invalid item type'; end if;
  if coalesce(p_opening_quantity,0) < 0 then raise exception 'Opening quantity cannot be negative'; end if;
  if coalesce(p_opening_quantity,0) > 0 and p_opening_location_id is null then raise exception 'Opening location is required when opening quantity is greater than zero'; end if;
  if coalesce(p_serial_tracking,false) and coalesce(p_opening_quantity,0) > 0 then raise exception 'Serialized items must be added as individual Serial/IMEI units'; end if;
  insert into public.ops_inventory_items(name,description,category,unit,serial_tracking,reorder_level,item_type,brand,model,default_condition,default_unit_cost,default_selling_price,preferred_supplier_id,specs,created_by)
  values(trim(p_name),nullif(trim(p_description),''),nullif(trim(p_category),''),coalesce(nullif(trim(p_unit),''),'item'),coalesce(p_serial_tracking,false),greatest(coalesce(p_reorder_level,0),0),p_item_type,nullif(trim(p_brand),''),nullif(trim(p_model),''),nullif(trim(p_default_condition),''),p_default_unit_cost,p_default_selling_price,p_preferred_supplier_id,coalesce(p_specs,'{}'::jsonb),auth.uid()) returning * into v_item;
  if coalesce(p_opening_quantity,0) > 0 then
    perform public.ops_create_stock_movement(v_item.id,p_opening_location_id,'opening',p_opening_quantity,'inventory_item',v_item.id,'Opening stock recorded when item was created');
  end if;
  return v_item;
end; $$;

create or replace function public.ops_add_inventory_stock(
  p_inventory_item_id uuid,
  p_location_id uuid,
  p_quantity integer,
  p_unit_cost numeric default null,
  p_supplier_id uuid default null,
  p_note text default null
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare v_serial boolean; v_id uuid;
begin
  if not public.ops_is_admin() then raise exception 'Not authorized'; end if;
  if coalesce(p_quantity,0) <= 0 then raise exception 'Quantity must be greater than zero'; end if;
  select serial_tracking into v_serial from public.ops_inventory_items where id=p_inventory_item_id;
  if v_serial is null then raise exception 'Inventory item not found'; end if;
  if v_serial then raise exception 'Serialized items must be received as individual Serial/IMEI units'; end if;
  v_id := public.ops_create_stock_movement(p_inventory_item_id,p_location_id,'received',p_quantity,case when p_supplier_id is null then 'inventory_item' else 'supplier' end,coalesce(p_supplier_id,p_inventory_item_id),concat_ws(' · ',nullif(trim(p_note),''),case when p_unit_cost is not null then 'Unit cost ₦'||p_unit_cost::text end));
  if p_unit_cost is not null or p_supplier_id is not null then
    update public.ops_inventory_items set default_unit_cost=coalesce(p_unit_cost,default_unit_cost),preferred_supplier_id=coalesce(p_supplier_id,preferred_supplier_id) where id=p_inventory_item_id;
  end if;
  return v_id;
end; $$;
