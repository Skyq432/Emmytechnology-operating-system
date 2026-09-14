-- EmmyTech private Sales PDF storage and delivery hardening.

alter table public.sales_documents
  add column if not exists render_error text;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('sales-documents','sales-documents',false,10485760,array['application/pdf'])
on conflict (id) do update
set public=false,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists sales_documents_storage_admin_select on storage.objects;
create policy sales_documents_storage_admin_select
on storage.objects for select to authenticated
using (bucket_id='sales-documents' and public.ops_is_admin());

drop policy if exists sales_documents_storage_admin_insert on storage.objects;
create policy sales_documents_storage_admin_insert
on storage.objects for insert to authenticated
with check (bucket_id='sales-documents' and public.ops_is_admin());

drop policy if exists sales_documents_storage_admin_update on storage.objects;
create policy sales_documents_storage_admin_update
on storage.objects for update to authenticated
using (bucket_id='sales-documents' and public.ops_is_admin())
with check (bucket_id='sales-documents' and public.ops_is_admin());

drop policy if exists sales_documents_storage_admin_delete on storage.objects;
create policy sales_documents_storage_admin_delete
on storage.objects for delete to authenticated
using (bucket_id='sales-documents' and public.ops_is_admin());

create unique index if not exists sales_document_deliveries_unique_recipient_idx
on public.sales_document_deliveries(document_id,recipient_type,coalesce(recipient_email,''));

-- Refund documents are created by the return/refund RPC. Ensure they enter the same
-- customer + company archive delivery pipeline as payment/final receipts.
create or replace function public.sales_prepare_refund_document_delivery()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.document_type='refund_document' then
    perform public.sales_prepare_document_deliveries(new.id,new.snapshot->>'customer_email');
  end if;
  return new;
end;
$$;

drop trigger if exists sales_refund_document_delivery_queue on public.sales_documents;
create trigger sales_refund_document_delivery_queue
after insert on public.sales_documents
for each row execute function public.sales_prepare_refund_document_delivery();

-- Queue a quotation customer email only after its PDF exists. Also retain a company
-- archive copy as a document delivery without pretending the company is the customer.
create or replace function public.sales_queue_quotation_send(
  p_quotation_version_id uuid,
  p_recipient_email text
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_quote public.sales_quotations;
  v_version public.sales_quotation_versions;
  v_doc public.sales_documents;
  v_delivery_id uuid;
  v_archive_email text;
begin
  if not public.ops_is_admin() then raise exception 'Not authorized'; end if;
  select * into v_version from public.sales_quotation_versions where id=p_quotation_version_id;
  if not found then raise exception 'Quotation version not found'; end if;
  select * into v_quote from public.sales_quotations where id=v_version.quotation_id;
  v_doc:=public.sales_ensure_quotation_document_metadata(v_version.id);
  if v_doc.render_status<>'rendered' then raise exception 'Quotation PDF must be rendered before it can be sent'; end if;
  if nullif(trim(p_recipient_email),'') is null then raise exception 'Customer email is required'; end if;

  insert into public.sales_quotation_deliveries(quotation_version_id,delivery_method,recipient_email,state,sent_by)
  values(v_version.id,'email',lower(trim(p_recipient_email)),'pending',auth.uid())
  returning id into v_delivery_id;

  insert into public.sales_document_deliveries(document_id,recipient_type,recipient_email,delivery_state)
  values(v_doc.id,'customer',lower(trim(p_recipient_email)),'pending')
  on conflict do nothing;

  select company_archive_email into v_archive_email
  from public.sales_settings where settings_key='default';
  if nullif(trim(v_archive_email),'') is not null then
    insert into public.sales_document_deliveries(document_id,recipient_type,recipient_email,delivery_state)
    values(v_doc.id,'company_archive',lower(trim(v_archive_email)),'pending')
    on conflict do nothing;
  end if;

  insert into public.sales_events(identity_id,quotation_id,quotation_version_id,event_type,title,metadata,actor_id)
  values(v_quote.identity_id,v_quote.id,v_version.id,'quote.send_queued','Quotation email queued',
    jsonb_build_object('recipient_email',lower(trim(p_recipient_email)),'delivery_id',v_delivery_id),auth.uid());
  return v_delivery_id;
end;
$$;

grant execute on function public.sales_queue_quotation_send(uuid,text) to authenticated;
