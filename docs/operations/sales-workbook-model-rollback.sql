-- Emergency rollback reference for 20260830030000_operations_sales_workbook_model.sql
-- WARNING: destructive. Only use if the new model must be removed before real data relies on it.

begin;

drop function if exists public.ops_record_order_payment(uuid,numeric,text,text,timestamptz,text);

drop table if exists public.ops_solar_installations cascade;
drop table if exists public.ops_repairs cascade;
drop table if exists public.ops_order_payments cascade;
drop table if exists public.ops_inventory_units cascade;

alter table public.ops_inventory_items
  drop column if exists preferred_supplier_id,
  drop column if exists default_selling_price,
  drop column if exists default_unit_cost,
  drop column if exists default_condition,
  drop column if exists brand;

drop table if exists public.ops_suppliers cascade;

alter table public.ops_order_items
  drop column if exists specs,
  drop column if exists warranty_expires_at,
  drop column if exists warranty_period,
  drop column if exists unit_cost_snapshot,
  drop column if exists condition,
  drop column if exists model,
  drop column if exists brand,
  drop column if exists item_type;

alter table public.ops_orders
  drop column if exists balance_due,
  drop column if exists sales_staff_name,
  drop column if exists sales_staff_user_id,
  drop column if exists order_type;

rollback;

-- Replace ROLLBACK with COMMIT only after reviewing dependencies and confirming no real records rely on these fields/tables.
