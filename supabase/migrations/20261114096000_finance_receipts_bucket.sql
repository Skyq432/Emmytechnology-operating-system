-- EmmyTech OS · Finance · private storage for receipt photos               [MERGE]
-- Runs only on Supabase (the local test build has no Storage and keeps receipts
-- in .local-uploads/). Apply after the six Finance migrations.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('finance-receipts', 'finance-receipts', false, 5242880,
        array['image/jpeg','image/png','image/webp','image/heic','application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Upload: anyone who may log petty cash or manage Finance.
drop policy if exists finance_receipts_insert on storage.objects;
create policy finance_receipts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'finance-receipts' and (public.finance_can_log_petty() or public.finance_can_manage()));

-- Read (needed for the 5-minute signed link): Finance viewers, or the uploader.
drop policy if exists finance_receipts_select on storage.objects;
create policy finance_receipts_select on storage.objects for select to authenticated
  using (bucket_id = 'finance-receipts' and (public.finance_can_view() or owner_id = auth.uid()::text));

-- No update or delete policies: receipts are evidence and are never changed.
