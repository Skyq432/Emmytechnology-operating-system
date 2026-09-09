-- Prevent confirmed Orders from claiming internal fulfilment without a real Operations stock source.
-- The exception rolls back the surrounding confirmation transaction, including any reservations already attempted.

create or replace function public.ops_guard_confirmed_internal_sources()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  v_missing text;
begin
  if new.commercial_state='confirmed' and old.commercial_state is distinct from 'confirmed' then
    select string_agg(item_name, ', ' order by created_at,id)
    into v_missing
    from public.ops_order_items
    where order_id=new.id
      and inventory_item_id is not null
      and fulfilment_source='internal'
      and source_location_id is null;

    if v_missing is not null then
      raise exception 'Choose an internal stock location before confirming: %',v_missing;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists ops_guard_confirmed_internal_sources_trigger on public.ops_orders;
create trigger ops_guard_confirmed_internal_sources_trigger
before update of commercial_state on public.ops_orders
for each row execute function public.ops_guard_confirmed_internal_sources();
