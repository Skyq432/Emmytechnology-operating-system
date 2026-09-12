create or replace function public.is_admin()
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  return exists (
    select 1
    from public.users
    where id = auth.uid()
      and role in ('admin', 'super_admin')
  );
end;
$$;

create or replace function public.is_cash_off_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role in ('admin', 'super_admin')
  );
$$;

create or replace function public.ops_is_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.users
    where id = auth.uid()
      and role in ('admin', 'super_admin')
  );
$$;
