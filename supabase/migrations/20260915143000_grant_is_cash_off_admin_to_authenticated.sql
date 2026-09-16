-- is_cash_off_admin() is used inside the "cash_off_admin_read_accounts" RLS policy
-- on cash_off_accounts (SELECT). Postgres evaluates every OR'd policy's qual when
-- checking row visibility, so ANY authenticated query against this table — regardless
-- of which policy would actually have permitted it — failed outright with
-- "permission denied for function is_cash_off_admin" because the function was never
-- granted EXECUTE for the authenticated role (only service_role/postgres had it).
-- This broke every cash-off balance read across the app, not just CRM identity search
-- (surfaced there first because the picker used to silently swallow this as "no
-- results" instead of showing the real error).
grant execute on function public.is_cash_off_admin() to authenticated;
