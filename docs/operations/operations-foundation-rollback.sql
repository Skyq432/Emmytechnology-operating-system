-- EmmyTech Operations Foundation rollback
-- WARNING: This removes only the new Operations objects and all data stored in them.

begin;

drop function if exists public.ops_acknowledge_handover(uuid, text);
drop function if exists public.ops_create_handover(uuid, text, uuid, text);
drop function if exists public.ops_change_order_status(uuid, text, text);
drop function if exists public.ops_create_order(text, text, text, text, text, text, text, text, timestamptz, jsonb);
drop function if exists public.ops_create_stock_movement(uuid, uuid, text, integer, text, uuid, text);

drop view if exists public.ops_stock_balances;

drop table if exists public.ops_order_handoffs cascade;
drop table if exists public.ops_order_events cascade;
drop table if exists public.ops_order_items cascade;
drop table if exists public.ops_orders cascade;
drop table if exists public.ops_website_product_links cascade;
drop table if exists public.ops_stock_movements cascade;
drop table if exists public.ops_inventory_items cascade;
drop table if exists public.ops_locations cascade;

drop function if exists public.ops_touch_updated_at();
drop function if exists public.ops_is_admin();

commit;
