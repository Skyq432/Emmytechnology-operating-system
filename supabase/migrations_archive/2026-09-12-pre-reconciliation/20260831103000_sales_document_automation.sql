-- Automatic Sales document metadata queueing.
-- Payment writes remain canonical in Operations/Repair ledgers.

create or replace function public.sales_queue_order_payment_documents()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare v_order public.ops_orders; v_paid numeric;
begin
  if new.is_void then return new; end if;
  perform public.sales_ensure_payment_receipt_metadata('order',new.id);
  select * into v_order from public.ops_orders where id=new.order_id;
  if found and v_order.commercial_state='confirmed' then
    select coalesce(sum(amount) filter(where not is_void),0) into v_paid from public.ops_order_payments where order_id=new.order_id;
    if v_paid>=coalesce(v_order.total_amount,0) then
      perform public.sales_ensure_final_sales_receipt_metadata(new.order_id);
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.sales_queue_repair_payment_documents()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare v_repair public.ops_repairs; v_paid numeric;
begin
  if new.is_void then return new; end if;
  perform public.sales_ensure_payment_receipt_metadata('repair',new.id);
  select * into v_repair from public.ops_repairs where id=new.repair_id;
  if found then
    select coalesce(sum(amount) filter(where not is_void),0) into v_paid from public.ops_repair_payments where repair_id=new.repair_id;
    if v_paid>=coalesce(v_repair.amount_charged,0) then
      perform public.sales_ensure_final_repair_receipt_metadata(new.repair_id);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists sales_order_payment_document_queue on public.ops_order_payments;
create trigger sales_order_payment_document_queue
after insert on public.ops_order_payments
for each row execute function public.sales_queue_order_payment_documents();

drop trigger if exists sales_repair_payment_document_queue on public.ops_repair_payments;
create trigger sales_repair_payment_document_queue
after insert on public.ops_repair_payments
for each row execute function public.sales_queue_repair_payment_documents();

create or replace function public.sales_queue_quotation_document()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare v_quote public.sales_quotations; v_existing uuid; v_doc public.sales_documents; v_items jsonb; v_number text;
begin
  select id into v_existing from public.sales_documents where document_type='quotation_pdf' and quotation_version_id=new.id and voided_at is null limit 1;
  if v_existing is not null then return new; end if;
  select * into v_quote from public.sales_quotations where id=new.quotation_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'item_name',item_name,'quantity',quantity,'list_price',list_price,'final_unit_price',final_unit_price,
    'line_discount_amount',line_discount_amount,'gross_margin',gross_margin,'note',note
  ) order by created_at,id),'[]'::jsonb) into v_items from public.sales_quotation_items where quotation_version_id=new.id;
  v_number:=v_quote.quotation_code||'-V'||new.version::text;
  insert into public.sales_documents(
    document_number,document_type,identity_id,quotation_version_id,snapshot,created_by
  ) values (
    v_number,'quotation_pdf',v_quote.identity_id,new.id,jsonb_build_object(
      'quotation_code',v_quote.quotation_code,'version',new.version,'customer_name',v_quote.customer_name,
      'customer_phone',v_quote.customer_phone,'customer_email',v_quote.customer_email,
      'items',v_items,'subtotal',new.subtotal,'discount_amount',new.discount_amount,'total_amount',new.total_amount,
      'validity_expires_at',new.validity_expires_at,'customer_note',new.customer_note,'terms',new.terms,
      'sales_staff_name',v_quote.sales_staff_name,'published_at',new.published_at
    ),new.published_by
  ) returning * into v_doc;
  return new;
end;
$$;

-- Quotation items are inserted after the version row, so queue after the publish RPC completes via explicit helper.
create or replace function public.sales_ensure_quotation_document_metadata(p_quotation_version_id uuid)
returns public.sales_documents
language plpgsql
security definer
set search_path=public
as $$
declare v_version public.sales_quotation_versions; v_quote public.sales_quotations; v_doc public.sales_documents; v_items jsonb; v_number text;
begin
  if not public.ops_is_admin() then raise exception 'Not authorized'; end if;
  select * into v_doc from public.sales_documents where document_type='quotation_pdf' and quotation_version_id=p_quotation_version_id and voided_at is null limit 1;
  if found then return v_doc; end if;
  select * into v_version from public.sales_quotation_versions where id=p_quotation_version_id;
  if not found then raise exception 'Quotation version not found'; end if;
  select * into v_quote from public.sales_quotations where id=v_version.quotation_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'item_name',item_name,'quantity',quantity,'list_price',list_price,'final_unit_price',final_unit_price,
    'line_discount_amount',line_discount_amount,'note',note
  ) order by created_at,id),'[]'::jsonb) into v_items from public.sales_quotation_items where quotation_version_id=v_version.id;
  v_number:=v_quote.quotation_code||'-V'||v_version.version::text;
  insert into public.sales_documents(document_number,document_type,identity_id,quotation_version_id,snapshot,created_by)
  values(v_number,'quotation_pdf',v_quote.identity_id,v_version.id,jsonb_build_object(
    'quotation_code',v_quote.quotation_code,'version',v_version.version,'customer_name',v_quote.customer_name,
    'customer_phone',v_quote.customer_phone,'customer_email',v_quote.customer_email,'items',v_items,
    'subtotal',v_version.subtotal,'discount_amount',v_version.discount_amount,'total_amount',v_version.total_amount,
    'validity_expires_at',v_version.validity_expires_at,'customer_note',v_version.customer_note,'terms',v_version.terms,
    'sales_staff_name',v_quote.sales_staff_name,'published_at',v_version.published_at
  ),auth.uid()) returning * into v_doc;
  return v_doc;
end;
$$;

create or replace function public.sales_queue_quotation_send(
  p_quotation_version_id uuid,
  p_recipient_email text
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare v_quote public.sales_quotations; v_version public.sales_quotation_versions; v_doc public.sales_documents; v_delivery_id uuid;
begin
  if not public.ops_is_admin() then raise exception 'Not authorized'; end if;
  select * into v_version from public.sales_quotation_versions where id=p_quotation_version_id;
  if not found then raise exception 'Quotation version not found'; end if;
  select * into v_quote from public.sales_quotations where id=v_version.quotation_id;
  v_doc:=public.sales_ensure_quotation_document_metadata(v_version.id);
  if v_doc.render_status<>'rendered' then raise exception 'Quotation PDF must be rendered before it can be sent'; end if;
  if nullif(trim(p_recipient_email),'') is null then raise exception 'Customer email is required'; end if;
  insert into public.sales_quotation_deliveries(quotation_version_id,delivery_method,recipient_email,state,sent_by)
  values(v_version.id,'email',lower(trim(p_recipient_email)),'pending',auth.uid()) returning id into v_delivery_id;
  insert into public.sales_document_deliveries(document_id,recipient_type,recipient_email,delivery_state)
  values(v_doc.id,'customer',lower(trim(p_recipient_email)),'pending');
  insert into public.sales_events(identity_id,quotation_id,quotation_version_id,event_type,title,metadata,actor_id)
  values(v_quote.identity_id,v_quote.id,v_version.id,'quote.send_queued','Quotation email queued',jsonb_build_object('recipient_email',lower(trim(p_recipient_email)),'delivery_id',v_delivery_id),auth.uid());
  return v_delivery_id;
end;
$$;

grant execute on function public.sales_ensure_quotation_document_metadata(uuid) to authenticated;
grant execute on function public.sales_queue_quotation_send(uuid,text) to authenticated;
