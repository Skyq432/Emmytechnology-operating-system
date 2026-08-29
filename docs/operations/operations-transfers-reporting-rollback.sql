-- EmmyTech Operations Transfers rollback reference
-- Use only if the transfer feature must be removed after confirming no production transfer data must be preserved.

begin;

drop function if exists public.ops_cancel_stock_transfer(uuid,text);
drop function if exists public.ops_receive_stock_transfer(uuid,text);
drop function if exists public.ops_start_stock_transfer(uuid,uuid,uuid,integer,uuid,uuid,text,uuid,text,text,text,text,text);

drop table if exists public.ops_stock_transfers;

commit;

-- Reporting-period application code is backward compatible and requires no database rollback.
-- Do not remove existing ops_locations, ops_stock_movements, ops_inventory_reservations,
-- ops_orders, CRM, Ambassador or Product tables as part of this rollback.
