-- submit_ambassador_lead's EXECUTE grant to `authenticated` was present in every
-- committed migration that touches this function (ambassador_lead_submission_approval,
-- repair_ambassador_dashboard_features) but had gone missing on the live database,
-- causing every ambassador's "Submit Lead" to fail with
-- "permission denied for function submit_ambassador_lead". Confirmed live via
-- information_schema.routine_privileges before applying: only postgres and
-- service_role had EXECUTE, authenticated did not. Restoring it exactly as it
-- already appears in the earlier migrations, no logic change.
revoke all on function public.submit_ambassador_lead(text, text, text, text, text, text) from public;
revoke all on function public.submit_ambassador_lead(text, text, text, text, text, text) from anon;
grant execute on function public.submit_ambassador_lead(text, text, text, text, text, text) to authenticated;
grant execute on function public.submit_ambassador_lead(text, text, text, text, text, text) to service_role;
