insert into public.app_settings (key, value, updated_at)
values (
  'website_features',
  jsonb_build_object('training_enabled', false),
  now()
)
on conflict (key)
do update set
  value = coalesce(public.app_settings.value, '{}'::jsonb)
    || jsonb_build_object('training_enabled', false),
  updated_at = now();

create or replace function public.get_public_website_features()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'training_enabled',
    coalesce(
      (select (value ->> 'training_enabled')::boolean
       from public.app_settings
       where key = 'website_features'),
      false
    )
  );
$$;

revoke all on function public.get_public_website_features() from public;
grant execute on function public.get_public_website_features() to anon, authenticated, service_role;

comment on function public.get_public_website_features() is
  'Returns only website feature flags safe for public clients. Does not expose private app settings.';
