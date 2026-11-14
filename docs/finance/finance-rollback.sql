-- EmmyTech OS · Finance · ROLLBACK
-- Removes everything Finance added to the database. Existing Sales, Operations,
-- Marketing and staff data is untouched. (Suppliers created from "Add a supplier
-- bill" stay in ops_suppliers; Finance data in them is removed with the bills.)
-- Run only if Finance has to be taken out again.

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'finance\_%'
  loop
    execute 'drop function if exists ' || r.signature || ' cascade';
  end loop;

  for r in
    select tablename from pg_tables where schemaname = 'public' and tablename like 'finance\_%'
  loop
    execute format('drop table if exists public.%I cascade', r.tablename);
  end loop;
end
$$;

drop policy if exists finance_receipts_insert on storage.objects;
drop policy if exists finance_receipts_select on storage.objects;
delete from storage.objects where bucket_id = 'finance-receipts';
delete from storage.buckets where id = 'finance-receipts';
