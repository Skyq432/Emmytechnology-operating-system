CREATE OR REPLACE FUNCTION public.sales_queue_document_send(p_document_id uuid, p_recipient_email text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_doc public.sales_documents;
begin
  if not public.staff_has_any_capability(array['sales.payment.record','sales.quotation.manage','operations.repair.finance']) then
    raise exception 'Not authorized';
  end if;
  select * into v_doc from public.sales_documents where id = p_document_id;
  if not found then raise exception 'Document not found'; end if;
  if v_doc.voided_at is not null then raise exception 'Void documents cannot be sent'; end if;
  if nullif(trim(p_recipient_email),'') is null then raise exception 'Customer email is required'; end if;

  insert into public.sales_document_deliveries(document_id,recipient_type,recipient_email,delivery_state)
  values(p_document_id,'customer',lower(trim(p_recipient_email)),'pending')
  on conflict do nothing;
end;
$function$
