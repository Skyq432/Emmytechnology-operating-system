-- Guarded rollback for Sales financial/document foundation.
-- Run only after intentionally confirming no production Sales documents/credit/returns/refunds exist.

do $$
declare
  v_documents bigint;
  v_credit bigint;
  v_returns bigint;
  v_refunds bigint;
begin
  select count(*) into v_documents from public.sales_documents where coalesce(snapshot->>'test_marker','') <> 'TEST';
  select count(*) into v_credit from public.sales_credit_releases;
  select count(*) into v_returns from public.sales_returns where reason not ilike 'TEST%';
  select count(*) into v_refunds from public.sales_refunds;

  if v_documents > 0 or v_credit > 0 or v_returns > 0 or v_refunds > 0 then
    raise exception 'Rollback refused: production Sales financial records exist';
  end if;
end;
$$;

drop view if exists public.sales_commercial_balances;
drop view if exists public.sales_unified_payments;

drop table if exists public.sales_refunds;
drop table if exists public.sales_return_items;
drop table if exists public.sales_returns;
drop table if exists public.sales_credit_releases;
drop table if exists public.sales_document_deliveries;
drop table if exists public.sales_documents;
