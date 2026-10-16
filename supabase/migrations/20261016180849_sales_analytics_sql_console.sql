-- Sales Analyst SQL Console: lets sales_analyst (+ admins) write and run their own
-- read-only SQL against the database from the EmmyTech-OS frontend.
--
-- Architecture note: the obvious approach (a SECURITY DEFINER function owned by a
-- restricted role, so calling it automatically drops privileges) does NOT work on this
-- Supabase instance -- empirically confirmed that ANY SECURITY DEFINER function, even a
-- trivial one owned by the well-established `authenticated` role, fails with
-- "permission denied for schema public" the moment it's invoked. This is a platform-level
-- restriction, not a grants problem (verified with multiple isolated test cases). It's
-- also separately true that Postgres forbids `SET ROLE` inside any SECURITY DEFINER
-- function body at all ("cannot set parameter \"role\" within security-definer
-- function") -- a hard restriction, unrelated to the platform-level one above.
--
-- What actually works: a plain SECURITY INVOKER function (the default -- no "security
-- definer" clause) that does `SET LOCAL ROLE sales_analytics_readonly` itself, called
-- as the real `authenticated` connection role. The access check (sales_analyst/admin
-- only) happens before the role switch; audit logging is a separate small SECURITY
-- DEFINER helper (fine on its own -- it never attempts SET ROLE, so neither restriction
-- above applies to it), called only after switching back to `authenticated`.

create role sales_analytics_readonly nologin bypassrls;
grant sales_analytics_readonly to authenticated;
grant usage on schema public to sales_analytics_readonly;
grant select on all tables in schema public to sales_analytics_readonly;
alter default privileges in schema public grant select on tables to sales_analytics_readonly;

create table public.analytics_query_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id),
  query_text text not null,
  row_count integer,
  duration_ms integer,
  error text,
  created_at timestamptz not null default now()
);
alter table public.analytics_query_log enable row level security;
-- Deliberately no client-facing policies -- written only via log_sales_analytics_query()
-- (SECURITY DEFINER), read only via a future admin view if ever needed. Same
-- no-policy audit-table pattern used elsewhere this session (order deletion requests).

create or replace function public.sales_analytics_has_access()
returns boolean
language sql security definer set search_path to 'public' stable
as $function$
  select exists (
    select 1 from public.users
    where id = auth.uid()
      and role in ('super_admin','admin','sales_analyst')
  );
$function$;
revoke all on function public.sales_analytics_has_access() from public, anon;
grant execute on function public.sales_analytics_has_access() to authenticated, service_role;

create or replace function public.log_sales_analytics_query(
  p_query_text text, p_row_count integer, p_duration_ms integer, p_error text default null
) returns void
language sql security definer set search_path to 'public'
as $function$
  insert into public.analytics_query_log (user_id, query_text, row_count, duration_ms, error)
  values (auth.uid(), p_query_text, p_row_count, p_duration_ms, p_error);
$function$;
revoke all on function public.log_sales_analytics_query(text, integer, integer, text) from public, anon;
grant execute on function public.log_sales_analytics_query(text, integer, integer, text) to authenticated;

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

    -- The string checks above are defense in depth, not the real boundary -- the
    -- actual boundary is that sales_analytics_readonly was never granted anything but
    -- SELECT, so even a write statement that somehow slipped past validation would
    -- still fail at the database level (verified directly: a raw DELETE under this
    -- role fails with "permission denied for table X", independent of this function).
    set local statement_timeout = '8s';
    set local role sales_analytics_readonly;

    execute format(
      'select coalesce(jsonb_agg(row_to_json(capped)), ''[]''::jsonb) from (select * from (%s) as user_query limit 1000) as capped',
      v_sql
    ) into v_rows;

    reset role;

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
    reset role;
    v_duration_ms := round(extract(epoch from (clock_timestamp() - v_start)) * 1000)::integer;

    perform public.log_sales_analytics_query(v_sql, null, v_duration_ms, sqlerrm);

    raise;
  end;
end;
$function$;

revoke all on function public.run_sales_analytics_query(text) from public, anon;
grant execute on function public.run_sales_analytics_query(text) to authenticated;
