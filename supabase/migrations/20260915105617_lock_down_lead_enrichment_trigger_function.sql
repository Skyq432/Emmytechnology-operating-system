-- Trigger functions are only ever invoked implicitly by Postgres on insert/update;
-- they never need direct EXECUTE grants, and the default PUBLIC grant on newly
-- created functions was flagging this as callable by anon/authenticated.
revoke execute on function public.trg_enrich_identity_from_lead() from public, anon, authenticated;
