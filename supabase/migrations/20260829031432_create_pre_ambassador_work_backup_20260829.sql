create schema if not exists backup_20260829_pre_ambassador_work;

revoke all on schema backup_20260829_pre_ambassador_work from public;
revoke all on schema backup_20260829_pre_ambassador_work from anon;
revoke all on schema backup_20260829_pre_ambassador_work from authenticated;

create table if not exists backup_20260829_pre_ambassador_work.backup_manifest (
  id bigint generated always as identity primary key,
  backup_created_at timestamptz not null default now(),
  source_schema text not null,
  source_table text not null,
  backup_table text not null,
  row_count bigint not null
);

truncate table backup_20260829_pre_ambassador_work.backup_manifest;

do $$
declare
  r record;
  v_count bigint;
begin
  for r in
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_type = 'BASE TABLE'
    order by table_name
  loop
    execute format('drop table if exists backup_20260829_pre_ambassador_work.%I', r.table_name);
    execute format(
      'create table backup_20260829_pre_ambassador_work.%I as table public.%I',
      r.table_name,
      r.table_name
    );
    execute format('select count(*) from backup_20260829_pre_ambassador_work.%I', r.table_name)
      into v_count;

    insert into backup_20260829_pre_ambassador_work.backup_manifest
      (source_schema, source_table, backup_table, row_count)
    values
      ('public', r.table_name, r.table_name, v_count);
  end loop;
end $$;

create table if not exists backup_20260829_pre_ambassador_work.function_definitions (
  schema_name text,
  function_name text,
  identity_arguments text,
  definition text
);
truncate table backup_20260829_pre_ambassador_work.function_definitions;
insert into backup_20260829_pre_ambassador_work.function_definitions
select
  n.nspname,
  p.proname,
  pg_get_function_identity_arguments(p.oid),
  pg_get_functiondef(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public';

create table if not exists backup_20260829_pre_ambassador_work.view_definitions (
  schema_name text,
  view_name text,
  definition text
);
truncate table backup_20260829_pre_ambassador_work.view_definitions;
insert into backup_20260829_pre_ambassador_work.view_definitions
select schemaname, viewname, definition
from pg_views
where schemaname = 'public';

create table if not exists backup_20260829_pre_ambassador_work.trigger_definitions (
  table_schema text,
  table_name text,
  trigger_name text,
  definition text
);
truncate table backup_20260829_pre_ambassador_work.trigger_definitions;
insert into backup_20260829_pre_ambassador_work.trigger_definitions
select
  n.nspname,
  c.relname,
  t.tgname,
  pg_get_triggerdef(t.oid, true)
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and not t.tgisinternal;

create table if not exists backup_20260829_pre_ambassador_work.policy_definitions as
select * from pg_policies where schemaname = 'public';

revoke all on all tables in schema backup_20260829_pre_ambassador_work from public;
revoke all on all tables in schema backup_20260829_pre_ambassador_work from anon;
revoke all on all tables in schema backup_20260829_pre_ambassador_work from authenticated;
