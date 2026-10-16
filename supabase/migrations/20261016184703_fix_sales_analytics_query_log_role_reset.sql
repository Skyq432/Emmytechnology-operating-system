-- Fix: run_sales_analytics_query() used `reset role` to return from
-- sales_analytics_readonly back to a normal role before logging the audit entry.
-- RESET ROLE reverts to session_user, not to whatever role was active via a prior
-- SET ROLE -- and in a real PostgREST connection session_user is `authenticator`
-- (confirmed live: authenticator is a member of anon/authenticated/service_role, and
-- PostgREST does SET ROLE authenticated per request), which has no EXECUTE grant on
-- log_sales_analytics_query. Every dry-run test during development connected as
-- `postgres` directly, which masked this entirely (RESET ROLE landed back on
-- postgres, a role that could call the logger regardless). Reproduced live as
-- sales_analyst through the real app: "permission denied for function
-- log_sales_analytics_query".
--
-- Fix: explicitly `SET LOCAL ROLE authenticated` instead of `RESET ROLE` in both the
-- success path and the exception handler -- deterministic regardless of session_user,
-- rather than relying on RESET ROLE's "go back to session_user" semantics. Verified by
-- simulating the real authenticator -> authenticated chain this time (not postgres).
create or replace function public.run_sales_analytics_query(p_sql text)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_sql text := trim(coalesce(p_sql, ''));
  v_check text;
  v_rows jsonb;
  v_row_count integer;
  v_start timestamptz := clock_timestamp();
  v_duration_ms integer;
begin
  if not public.sales_analytics_has_access() then
    raise exception 'Not authorized';
  end if;

  begin
    if v_sql = '' then
      raise exception 'Query cannot be empty.';
    end if;

    if right(v_sql, 1) = ';' then
      v_sql := trim(left(v_sql, length(v_sql) - 1));
    end if;

    if position(';' in v_sql) > 0 then
      raise exception 'Only a single statement is allowed.';
    end if;

    v_check := lower(v_sql);
    if v_check !~ '^(select|with)\y' then
      raise exception 'Only SELECT (or WITH ... SELECT) queries are allowed.';
    end if;

    if v_check ~ '\y(insert|update|delete|drop|alter|create|grant|revoke|truncate|copy|call|do|vacuum|reindex|listen|notify|lock|set|reset)\y' then
      raise exception 'Query contains a disallowed keyword. Only read-only SELECT queries are allowed.';
    end if;

    set local statement_timeout = '8s';
    set local role sales_analytics_readonly;

    execute format(
      'select coalesce(jsonb_agg(row_to_json(capped)), ''[]''::jsonb) from (select * from (%s) as user_query limit 1000) as capped',
      v_sql
    ) into v_rows;

    set local role authenticated;

    v_row_count := jsonb_array_length(v_rows);
    v_duration_ms := round(extract(epoch from (clock_timestamp() - v_start)) * 1000)::integer;

    perform public.log_sales_analytics_query(v_sql, v_row_count, v_duration_ms);

    return jsonb_build_object(
      'ok', true,
      'rows', v_rows,
      'row_count', v_row_count,
      'truncated', v_row_count >= 1000
    );
  exception when others then
    set local role authenticated;
    v_duration_ms := round(extract(epoch from (clock_timestamp() - v_start)) * 1000)::integer;

    perform public.log_sales_analytics_query(v_sql, null, v_duration_ms, sqlerrm);

    raise;
  end;
end;
$function$;
