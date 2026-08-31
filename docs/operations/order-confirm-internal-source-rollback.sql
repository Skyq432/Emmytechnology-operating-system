-- Guarded rollback for 20260831193000_operations_confirm_internal_source_guard.sql.
-- Removing this guard allows internal-stock Orders to be confirmed without a selected stock location.

drop trigger if exists ops_guard_confirmed_internal_sources_trigger on public.ops_orders;
drop function if exists public.ops_guard_confirmed_internal_sources();
