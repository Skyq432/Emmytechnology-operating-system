drop function if exists public.get_public_website_features();
delete from public.app_settings
where key = 'website_features'
  and value = jsonb_build_object('training_enabled', false);
