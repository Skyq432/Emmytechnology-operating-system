-- EmmyTech receipt metadata/idempotency boundaries.
-- Phase 1 metadata only: PDF rendering/email delivery is handled by the document service later.

create unique index if not exists sales_documents_one_final_repair_receipt_idx
  on public.sales_documents(repair_id)
  where document_type='final_sales_receipt' and voided_at is null and repair_id is not null;

create or replace function public.sales_prepare_document_deliveries(
  p_document_id uuid,
  p_customer_email text
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare v_archive_email text;
begin
  if not public.ops_is_admin() then raise exception 'Not authorized'; end if;
  select company_archive_email into v_archive_email from public.sales_settings where settings_key='default';

  if nullif(trim(p_customer_email),'') is null then
    insert into public.sales_document_deliveries(document_id,recipient_type,recipient_email,delivery_state)
    values(p_document_id,'customer',null,'customer_email_missing');
  else
    insert into public.sales_document_deliveries(document_id,recipient_type,recipient_email,delivery_state)
    values(p_document_id,'customer',lower(trim(p_customer_email)),'pending');
  end if;

  if nullif(trim(v_archive_email),'') is not null then
    insert into public.sales_document_deliveries(document_id,recipient_type,recipient_email,delivery_state)
    values(p_document_id,'company_archive',lower(trim(v_archive_email)),'pending');
  end if;
end;
$$;

create or replace function public.sales_ensure_payment_receipt_metadata(
  p_source_type text,
  p_source_payment_id uuid
)
returns public.sales_documents
language plpgsql
security definer
set search_path=public
as $$
declare
  v_existing public.sales_documents;
  v_doc public.sales_documents;
  v_order public.ops_orders;
  v_repair public.ops_repairs;
  v_payment public.ops_order_payments;
  v_repair_payment public.ops_repair_payments;
  v_paid numeric:=0;
  v_balance numeric:=0;
  v_total numeric:=0;
  v_customer_email text;
  v_identity_id uuid;
  v_source_id uuid;
  v_source_code text;
  v_items jsonb:='[]'::jsonb;
  v_number text;
begin
  if not public.ops_is_admin() then raise exception 'Not authorized'; end if;
  if p_source_type not in ('order','repair') then raise exception 'Invalid payment source'; end if;

  select * into v_existing from public.sales_documents
  where document_type='payment_receipt' and source_payment_type=p_source_type and source_payment_id=p_source_payment_id and voided_at is null
  limit 1;
  if found then return v_existing; end if;

  if p_source_type='order' then
    select * into v_payment from public.ops_order_payments where id=p_source_payment_id;
    if not found then raise exception 'Order payment not found'; end if;
    if v_payment.is_void then raise exception 'Void payments cannot issue receipts'; end if;
    select * into v_order from public.ops_orders where id=v_payment.order_id;
    if not found then raise exception 'Order not found'; end if;
    v_total:=coalesce(v_order.total_amount,0);
    select coalesce(sum(amount),0) into v_paid
    from public.ops_order_payments
    where order_id=v_order.id and not is_void
      and (paid_at<v_payment.paid_at or (paid_at=v_payment.paid_at and created_at<=v_payment.created_at));
    v_balance:=greatest(v_total-v_paid,0);
    v_customer_email:=v_order.customer_email;
    v_identity_id:=v_order.identity_id;
    v_source_id:=v_order.id;
    v_source_code:=v_order.order_code;
    select coalesce(jsonb_agg(jsonb_build_object(
      'item_name',item_name,'quantity',quantity,'unit_price',unit_price,'list_price',list_price,
      'line_discount_amount',line_discount_amount,'line_total',line_total
    ) order by created_at,id),'[]'::jsonb) into v_items
    from public.ops_order_items where order_id=v_order.id;

    v_number:='RCT-P-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(md5(random()::text),1,7));
    insert into public.sales_documents(
      document_number,document_type,identity_id,order_id,source_payment_type,source_payment_id,snapshot,created_by
    ) values (
      v_number,'payment_receipt',v_identity_id,v_order.id,'order',v_payment.id,
      jsonb_build_object(
        'source_type','order','source_code',v_source_code,'customer_name',v_order.customer_name,
        'customer_phone',v_order.customer_phone,'customer_email',v_order.customer_email,
        'items',v_items,'transaction_total',v_total,'payment_amount',v_payment.amount,
        'cumulative_paid',v_paid,'balance_due',v_balance,'payment_method',v_payment.payment_method,
        'payment_reference',v_payment.reference,'paid_at',v_payment.paid_at,'sales_staff_name',v_order.sales_staff_name
      ),auth.uid()
    ) returning * into v_doc;
  else
    select * into v_repair_payment from public.ops_repair_payments where id=p_source_payment_id;
    if not found then raise exception 'Repair payment not found'; end if;
    if v_repair_payment.is_void then raise exception 'Void payments cannot issue receipts'; end if;
    select * into v_repair from public.ops_repairs where id=v_repair_payment.repair_id;
    if not found then raise exception 'Repair not found'; end if;
    v_total:=coalesce(v_repair.amount_charged,0);
    select coalesce(sum(amount),0) into v_paid
    from public.ops_repair_payments
    where repair_id=v_repair.id and not is_void
      and (paid_at<v_repair_payment.paid_at or (paid_at=v_repair_payment.paid_at and created_at<=v_repair_payment.created_at));
    v_balance:=greatest(v_total-v_paid,0);
    v_customer_email:=v_repair.customer_email;
    v_identity_id:=v_repair.identity_id;
    v_source_id:=v_repair.id;
    v_source_code:=v_repair.repair_code;
    v_number:='RCT-P-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(md5(random()::text),1,7));
    insert into public.sales_documents(
      document_number,document_type,identity_id,repair_id,source_payment_type,source_payment_id,snapshot,created_by
    ) values (
      v_number,'payment_receipt',v_identity_id,v_repair.id,'repair',v_repair_payment.id,
      jsonb_build_object(
        'source_type','repair','source_code',v_source_code,'customer_name',v_repair.customer_name,
        'customer_phone',v_repair.customer_phone,'customer_email',v_repair.customer_email,
        'device_type',v_repair.device_type,'brand',v_repair.brand,'model',v_repair.model,
        'repair_type',v_repair.repair_type,'transaction_total',v_total,'payment_amount',v_repair_payment.amount,
        'cumulative_paid',v_paid,'balance_due',v_balance,'payment_method',v_repair_payment.payment_method,
        'payment_reference',v_repair_payment.reference,'paid_at',v_repair_payment.paid_at
      ),auth.uid()
    ) returning * into v_doc;
  end if;

  perform public.sales_prepare_document_deliveries(v_doc.id,v_customer_email);
  insert into public.sales_events(identity_id,order_id,event_type,title,metadata,actor_id)
  values(v_identity_id,case when p_source_type='order' then v_source_id else null end,'receipt.issued','Payment receipt queued',jsonb_build_object('document_id',v_doc.id,'document_number',v_doc.document_number,'source_type',p_source_type,'source_id',v_source_id),auth.uid());
  return v_doc;
exception when unique_violation then
  select * into v_existing from public.sales_documents
  where document_type='payment_receipt' and source_payment_type=p_source_type and source_payment_id=p_source_payment_id and voided_at is null limit 1;
  if found then return v_existing; end if;
  raise;
end;
$$;

create or replace function public.sales_ensure_final_sales_receipt_metadata(p_order_id uuid)
returns public.sales_documents
language plpgsql
security definer
set search_path=public
as $$
declare
  v_existing public.sales_documents;
  v_doc public.sales_documents;
  v_order public.ops_orders;
  v_paid numeric;
  v_items jsonb;
  v_payments jsonb;
  v_number text;
begin
  if not public.ops_is_admin() then raise exception 'Not authorized'; end if;
  select * into v_existing from public.sales_documents where document_type='final_sales_receipt' and order_id=p_order_id and voided_at is null limit 1;
  if found then return v_existing; end if;

  select * into v_order from public.ops_orders where id=p_order_id;
  if not found or v_order.commercial_state<>'confirmed' then raise exception 'Confirmed sale/order is required'; end if;
  select coalesce(sum(amount) filter(where not is_void),0) into v_paid from public.ops_order_payments where order_id=p_order_id;
  if v_paid<coalesce(v_order.total_amount,0) then raise exception 'Final receipt requires full payment'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'item_name',item_name,'quantity',quantity,'unit_price',unit_price,'list_price',list_price,
    'line_discount_amount',line_discount_amount,'line_total',line_total
  ) order by created_at,id),'[]'::jsonb) into v_items from public.ops_order_items where order_id=p_order_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'amount',amount,'payment_method',payment_method,'reference',reference,'paid_at',paid_at
  ) order by paid_at,created_at,id),'[]'::jsonb) into v_payments from public.ops_order_payments where order_id=p_order_id and not is_void;

  v_number:='RCT-S-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(md5(random()::text),1,7));
  insert into public.sales_documents(document_number,document_type,identity_id,order_id,snapshot,created_by)
  values(v_number,'final_sales_receipt',v_order.identity_id,v_order.id,jsonb_build_object(
    'source_type','order','source_code',v_order.order_code,'customer_name',v_order.customer_name,
    'customer_phone',v_order.customer_phone,'customer_email',v_order.customer_email,
    'items',v_items,'subtotal',v_order.subtotal,'discount_amount',v_order.discount_amount,
    'delivery_charge',v_order.delivery_charge,'transaction_total',v_order.total_amount,
    'payments',v_payments,'total_paid',v_paid,'balance_due',0,'sales_staff_name',v_order.sales_staff_name
  ),auth.uid()) returning * into v_doc;

  perform public.sales_prepare_document_deliveries(v_doc.id,v_order.customer_email);
  insert into public.sales_events(identity_id,order_id,event_type,title,metadata,actor_id)
  values(v_order.identity_id,v_order.id,'receipt.issued','Final sales receipt queued',jsonb_build_object('document_id',v_doc.id,'document_number',v_doc.document_number),auth.uid());
  return v_doc;
exception when unique_violation then
  select * into v_existing from public.sales_documents where document_type='final_sales_receipt' and order_id=p_order_id and voided_at is null limit 1;
  if found then return v_existing; end if;
  raise;
end;
$$;

create or replace function public.sales_ensure_final_repair_receipt_metadata(p_repair_id uuid)
returns public.sales_documents
language plpgsql
security definer
set search_path=public
as $$
declare
  v_existing public.sales_documents;
  v_doc public.sales_documents;
  v_repair public.ops_repairs;
  v_paid numeric;
  v_payments jsonb;
  v_number text;
begin
  if not public.ops_is_admin() then raise exception 'Not authorized'; end if;
  select * into v_existing from public.sales_documents where document_type='final_sales_receipt' and repair_id=p_repair_id and voided_at is null limit 1;
  if found then return v_existing; end if;
  select * into v_repair from public.ops_repairs where id=p_repair_id;
  if not found then raise exception 'Repair not found'; end if;
  select coalesce(sum(amount) filter(where not is_void),0) into v_paid from public.ops_repair_payments where repair_id=p_repair_id;
  if v_paid<coalesce(v_repair.amount_charged,0) then raise exception 'Final repair receipt requires full payment'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('amount',amount,'payment_method',payment_method,'reference',reference,'paid_at',paid_at) order by paid_at,created_at,id),'[]'::jsonb)
  into v_payments from public.ops_repair_payments where repair_id=p_repair_id and not is_void;

  v_number:='RCT-S-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(md5(random()::text),1,7));
  insert into public.sales_documents(document_number,document_type,identity_id,repair_id,snapshot,created_by)
  values(v_number,'final_sales_receipt',v_repair.identity_id,v_repair.id,jsonb_build_object(
    'source_type','repair','source_code',v_repair.repair_code,'customer_name',v_repair.customer_name,
    'customer_phone',v_repair.customer_phone,'customer_email',v_repair.customer_email,
    'device_type',v_repair.device_type,'brand',v_repair.brand,'model',v_repair.model,
    'fault_reported',v_repair.fault_reported,'repair_type',v_repair.repair_type,'parts_replaced',v_repair.parts_replaced,
    'parts_cost',v_repair.parts_cost,'labour_cost',v_repair.labour_cost,'transaction_total',v_repair.amount_charged,
    'payments',v_payments,'total_paid',v_paid,'balance_due',0
  ),auth.uid()) returning * into v_doc;
  perform public.sales_prepare_document_deliveries(v_doc.id,v_repair.customer_email);
  return v_doc;
exception when unique_violation then
  select * into v_existing from public.sales_documents where document_type='final_sales_receipt' and repair_id=p_repair_id and voided_at is null limit 1;
  if found then return v_existing; end if;
  raise;
end;
$$;

grant execute on function public.sales_prepare_document_deliveries(uuid,text) to authenticated;
grant execute on function public.sales_ensure_payment_receipt_metadata(text,uuid) to authenticated;
grant execute on function public.sales_ensure_final_sales_receipt_metadata(uuid) to authenticated;
grant execute on function public.sales_ensure_final_repair_receipt_metadata(uuid) to authenticated;
