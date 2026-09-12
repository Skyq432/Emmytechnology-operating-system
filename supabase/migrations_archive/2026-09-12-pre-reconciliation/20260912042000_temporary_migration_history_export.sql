-- Temporary reconciliation helper. This exposes only migration SQL that will be
-- committed to this public repository; it exposes no application/user data.
-- It is removed by the immediately following migration after export.

create or replace function public._temporary_migration_history_export()
returns table(version text, name text, sql text)
language sql
security definer
set search_path = ''
as $$
  select m.version,
         m.name,
         array_to_string(m.statements, E'\n\n') as sql
  from supabase_migrations.schema_migrations as m
  order by m.version;
$$;

revoke all on function public._temporary_migration_history_export() from public, authenticated;
grant execute on function public._temporary_migration_history_export() to anon;
