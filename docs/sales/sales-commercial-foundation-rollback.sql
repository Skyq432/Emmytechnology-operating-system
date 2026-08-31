-- Guarded rollback for 20260831060000_sales_commercial_foundation.sql
-- Run only after confirming no real Sales activity depends on these objects.

do $$
begin
  if exists (select 1 from public.sales_quotations limit 1) then
    raise exception 'Rollback refused: sales_quotations contains records.';
  end if;
  if exists (select 1 from public.sales_discount_approvals limit 1) then
    raise exception 'Rollback refused: sales_discount_approvals contains records.';
  end if;
  if exists (select 1 from public.ops_orders where sales_channel = 'direct_sale' or source_quotation_id is not null limit 1) then
    raise exception 'Rollback refused: Orders depend on Sales foundation.';
  end if;
end $$;

drop table if exists public.sales_events cascade;
drop table if exists public.sales_quotation_deliveries cascade;
drop table if exists public.sales_quotation_acceptances cascade;
drop table if exists public.sales_discount_approvals cascade;
drop table if exists public.sales_quotation_items cascade;
drop table if exists public.sales_quotation_versions cascade;
drop table if exists public.sales_quotations cascade;
drop table if exists public.sales_margin_policies cascade;
drop table if exists public.sales_settings cascade;
drop table if exists public.sales_authority_profiles cascade;

alter table public.ops_order_items
  drop column if exists pricing_approval_id,
  drop column if exists gross_margin,
  drop column if exists gross_profit,
  drop column if exists cost_basis_source,
  drop column if exists cost_basis,
  drop column if exists inventory_unit_id;

alter table public.ops_orders
  drop column if exists handover_completed_at,
  drop column if exists source_quotation_version_id,
  drop column if exists source_quotation_id,
  drop column if exists fulfilment_mode,
  drop column if exists sales_channel;
