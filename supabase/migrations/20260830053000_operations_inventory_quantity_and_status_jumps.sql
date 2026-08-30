alter table public.ops_inventory_items
  add column if not exists item_type text not null default 'other' check (item_type in ('laptop','phone','accessory','solar','other')),
  add column if not exists model text,
  add column if not exists specs jsonb not null default '{}'::jsonb;

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

  insert into public.ops_inventory_items(
    name,description,category,unit,serial_tracking,reorder_level,item_type,brand,model,
    default_condition,default_unit_cost,default_selling_price,preferred_supplier_id,specs,created_by
  ) values (
    trim(p_name),nullif(trim(p_description),''),nullif(trim(p_category),''),coalesce(nullif(trim(p_unit),''),'item'),
    coalesce(p_serial_tracking,false),greatest(coalesce(p_reorder_level,0),0),p_item_type,
    nullif(trim(p_brand),''),nullif(trim(p_model),''),nullif(trim(p_default_condition),''),
    p_default_unit_cost,p_default_selling_price,p_preferred_supplier_id,coalesce(p_specs,'{}'::jsonb),auth.uid()
  ) returning * into v_item;

  if coalesce(p_opening_quantity,0) > 0 then
    perform public.ops_create_stock_movement(
      v_item.id,p_opening_location_id,'opening',p_opening_quantity,
      'inventory_item',v_item.id,'Opening stock recorded when item was created'
    );
  end if;

  return v_item;
end;
$$;

grant execute on function public.ops_create_inventory_item(text,text,text,text,boolean,integer,text,text,text,text,numeric,numeric,uuid,jsonb,uuid,integer) to authenticated;

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

  select serial_tracking into v_serial
  from public.ops_inventory_items
  where id=p_inventory_item_id;

  if v_serial is null then raise exception 'Inventory item not found'; end if;
  if v_serial then raise exception 'Serialized items must be received as individual Serial/IMEI units'; end if;

  v_id := public.ops_create_stock_movement(
    p_inventory_item_id,p_location_id,'received',p_quantity,
    case when p_supplier_id is null then 'inventory_item' else 'supplier' end,
    coalesce(p_supplier_id,p_inventory_item_id),
    concat_ws(' · ',nullif(trim(p_note),''),case when p_unit_cost is not null then 'Unit cost ₦'||p_unit_cost::text end)
  );

  if p_unit_cost is not null or p_supplier_id is not null then
    update public.ops_inventory_items
    set default_unit_cost=coalesce(p_unit_cost,default_unit_cost),
        preferred_supplier_id=coalesce(p_supplier_id,preferred_supplier_id)
    where id=p_inventory_item_id;
  end if;

  return v_id;
end;
$$;

grant execute on function public.ops_add_inventory_stock(uuid,uuid,integer,numeric,uuid,text) to authenticated;

create or replace function public.ops_change_order_status(
  p_order_id uuid,
  p_new_status text,
  p_note text default null
) returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_current text;
  v_sequence text[] := array['new','confirmed','stock_check','assigned','picking','packing','ready_dispatch','dispatched','delivered','completed'];
  v_current_pos integer;
  v_next_pos integer;
  v_valid boolean := false;
  v_skipped text[] := array[]::text[];
begin
  if not public.ops_is_admin() then raise exception 'Not authorized'; end if;

  select status into v_current
  from public.ops_orders
  where id=p_order_id
  for update;

  if v_current is null then raise exception 'Order not found'; end if;
  if v_current=p_new_status then raise exception 'Order is already in that status'; end if;
  if v_current in ('completed','cancelled') then raise exception 'Terminal orders cannot change status'; end if;

  if v_current='on_hold' then
    v_valid := p_new_status='cancelled' or (p_new_status=any(v_sequence) and p_new_status<>'completed');
  elsif p_new_status in ('on_hold','cancelled') then
    v_valid := true;
  else
    v_current_pos := array_position(v_sequence,v_current);
    v_next_pos := array_position(v_sequence,p_new_status);
    v_valid := v_current_pos is not null and v_next_pos is not null and v_next_pos>v_current_pos;

    if v_valid and v_next_pos>v_current_pos+1 then
      v_skipped := v_sequence[(v_current_pos+1):(v_next_pos-1)];
      if nullif(trim(p_note),'') is null then
        raise exception 'A reason is required when skipping fulfilment stages';
      end if;
    end if;
  end if;

  if not v_valid then
    raise exception 'Invalid order status transition from % to %',v_current,p_new_status;
  end if;

  update public.ops_orders set status=p_new_status where id=p_order_id;

  insert into public.ops_order_events(
    order_id,event_type,title,note,from_status,to_status,actor_id,metadata
  ) values (
    p_order_id,
    case when cardinality(v_skipped)>0 then 'status_skipped' else 'status_changed' end,
    case when cardinality(v_skipped)>0 then 'Fulfilment stages skipped' else 'Status changed' end,
    nullif(trim(p_note),''),v_current,p_new_status,auth.uid(),
    jsonb_build_object('skipped_statuses',to_jsonb(v_skipped),'skip_count',cardinality(v_skipped))
  );
end;
$$;
