-- Rollback for 20260829113000_operations_order_integration_phase1.sql
-- Run only if Phase 1 must be removed. Existing Operations foundation objects are preserved.

begin;

drop function if exists public.ops_confirm_order(uuid);
drop function if exists public.ops_create_draft_order(text,text,text,uuid,uuid,uuid,text,text,text,text,text,timestamptz,text,numeric,numeric,text,numeric,numeric,numeric,text,jsonb);
drop function if exists public.ops_current_crm_stage(uuid);
drop function if exists public.ops_crm_stage_from_slug(text);

drop view if exists public.ops_inventory_availability;
drop table if exists public.ops_business_events;
drop table if exists public.ops_inventory_reservations;

alter table public.ops_order_items
  drop column if exists source_location_id,
  drop column if exists fulfilment_source,
  drop column if exists line_total,
  drop column if exists line_discount_amount,
  drop column if exists list_price;

alter table public.ops_orders
  drop column if exists confirmed_by,
  drop column if exists confirmed_at,
  drop column if exists commission_status,
  drop column if exists commission_amount,
  drop column if exists commission_rate,
  drop column if exists payment_status,
  drop column if exists amount_paid,
  drop column if exists total_amount,
  drop column if exists delivery_charge,
  drop column if exists cash_off_amount,
  drop column if exists discount_approved_by,
  drop column if exists discount_reason,
  drop column if exists discount_percentage,
  drop column if exists discount_amount,
  drop column if exists discount_type,
  drop column if exists subtotal,
  drop column if exists attribution_note,
  drop column if exists acquisition_source,
  drop column if exists commercial_state,
  drop column if exists conversion_id,
  drop column if exists ambassador_id,
  drop column if exists lead_id,
  drop column if exists identity_id;

alter table public.ops_inventory_items alter column sku drop default;
drop function if exists public.ops_next_inventory_sku();
drop sequence if exists public.ops_inventory_sku_seq;

-- Seeded locations are retained intentionally because they are valid Operations master data.

commit;
