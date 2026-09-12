-- Rich final receipt snapshots and final-receipt queueing for Cash-Off settlements.

create or replace function public.sales_ensure_final_sales_receipt_metadata(p_order_id uuid)
returns public.sales_documents
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.sales_documents%rowtype;
  v_doc public.sales_documents%rowtype;
  v_order public.ops_orders%rowtype;
  v_location public.ops_locations%rowtype;
  v_paid numeric;
  v_effective_paid numeric;
  v_gross numeric;
  v_items jsonb;
  v_payments jsonb;
  v_number text;
begin
  if not public.staff_has_any_capability(array['sales.direct.manage','sales.order.manage','operations.order.manage']) then
    raise exception 'Not authorized';
  end if;

  select * into v_existing
  from public.sales_documents
  where document_type='final_sales_receipt'
    and order_id=p_order_id
    and voided_at is null
  limit 1;
  if found then return v_existing; end if;

  select * into v_order
  from public.ops_orders
  where id=p_order_id;
  if not found or v_order.commercial_state<>'confirmed' then
    raise exception 'Confirmed sale/order is required';
  end if;

  if v_order.branch_location_id is not null then
    select * into v_location
    from public.ops_locations
    where id=v_order.branch_location_id;
  end if;

  select coalesce(sum(amount) filter(where not is_void),0)
  into v_paid
  from public.ops_order_payments
  where order_id=p_order_id;

  v_effective_paid := v_paid + coalesce(v_order.cash_off_amount,0);
  v_gross := coalesce(v_order.total_amount,0) + coalesce(v_order.cash_off_amount,0);

  if v_paid < coalesce(v_order.total_amount,0) then
    raise exception 'Final receipt requires full payment of the amount payable';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'item_name',item_name,
    'quantity',quantity,
    'unit_price',unit_price,
    'list_price',list_price,
    'line_discount_amount',line_discount_amount,
    'line_total',line_total
  ) order by created_at,id),'[]'::jsonb)
  into v_items
  from public.ops_order_items
  where order_id=p_order_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'amount',amount,
    'payment_method',payment_method,
    'reference',reference,
    'paid_at',paid_at
  ) order by paid_at,created_at,id),'[]'::jsonb)
  into v_payments
  from public.ops_order_payments
  where order_id=p_order_id and not is_void;

  v_number := 'RCT-S-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(md5(random()::text),1,7));

  insert into public.sales_documents(
    document_number,document_type,identity_id,order_id,snapshot,created_by
  ) values (
    v_number,
    'final_sales_receipt',
    v_order.identity_id,
    v_order.id,
    jsonb_build_object(
      'source_type','order',
      'source_code',v_order.order_code,
      'customer_name',v_order.customer_name,
      'customer_phone',v_order.customer_phone,
      'customer_email',v_order.customer_email,
      'items',v_items,
      'subtotal',v_order.subtotal,
      'discount_amount',v_order.discount_amount,
      'delivery_charge',v_order.delivery_charge,
      'gross_amount',v_gross,
      'cash_off_amount',coalesce(v_order.cash_off_amount,0),
      'amount_payable',v_order.total_amount,
      'transaction_total',v_order.total_amount,
      'payments',v_payments,
      'cash_payment_total',v_paid,
      'total_paid',v_paid,
      'effective_paid',v_effective_paid,
      'balance_due',0,
      'branch_location_id',v_order.branch_location_id,
      'branch_code',v_location.code,
      'branch_name',v_location.name,
      'handled_by_user_id',v_order.handled_by_user_id,
      'handled_by_name',v_order.handled_by_name,
      'sales_staff_user_id',v_order.sales_staff_user_id,
      'sales_staff_name',coalesce(v_order.sales_staff_name,v_order.handled_by_name)
    ),
    auth.uid()
  ) returning * into v_doc;

  perform public.sales_prepare_document_deliveries(v_doc.id,v_order.customer_email);
  insert into public.sales_events(identity_id,order_id,event_type,title,metadata,actor_id)
  values(
    v_order.identity_id,
    v_order.id,
    'receipt.issued',
    'Final sales receipt queued',
    jsonb_build_object('document_id',v_doc.id,'document_number',v_doc.document_number),
    auth.uid()
  );
  return v_doc;
exception when unique_violation then
  select * into v_existing
  from public.sales_documents
  where document_type='final_sales_receipt'
    and order_id=p_order_id
    and voided_at is null
  limit 1;
  if found then return v_existing; end if;
  raise;
end;
$$;

create or replace function public.sales_ensure_final_repair_receipt_metadata(p_repair_id uuid)
returns public.sales_documents
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.sales_documents%rowtype;
  v_doc public.sales_documents%rowtype;
  v_repair public.ops_repairs%rowtype;
  v_location public.ops_locations%rowtype;
  v_paid numeric;
  v_effective_paid numeric;
  v_payments jsonb;
  v_number text;
begin
  if not public.staff_has_any_capability(array['operations.repair.finance','operations.repair.handover']) then
    raise exception 'Not authorized';
  end if;

  select * into v_existing
  from public.sales_documents
  where document_type='final_sales_receipt'
    and repair_id=p_repair_id
    and voided_at is null
  limit 1;
  if found then return v_existing; end if;

  select * into v_repair
  from public.ops_repairs
  where id=p_repair_id;
  if not found then raise exception 'Repair not found'; end if;

  if v_repair.branch_location_id is not null then
    select * into v_location
    from public.ops_locations
    where id=v_repair.branch_location_id;
  end if;

  select coalesce(sum(amount) filter(where not is_void),0)
  into v_paid
  from public.ops_repair_payments
  where repair_id=p_repair_id;

  v_effective_paid := v_paid + coalesce(v_repair.cash_off_amount,0);

  if v_effective_paid < coalesce(v_repair.amount_charged,0) then
    raise exception 'Final repair receipt requires full settlement';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'amount',amount,
    'payment_method',payment_method,
    'reference',reference,
    'paid_at',paid_at
  ) order by paid_at,created_at,id),'[]'::jsonb)
  into v_payments
  from public.ops_repair_payments
  where repair_id=p_repair_id and not is_void;

  v_number := 'RCT-S-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(md5(random()::text),1,7));

  insert into public.sales_documents(
    document_number,document_type,identity_id,repair_id,snapshot,created_by
  ) values (
    v_number,
    'final_sales_receipt',
    v_repair.identity_id,
    v_repair.id,
    jsonb_build_object(
      'source_type','repair',
      'source_code',v_repair.repair_code,
      'customer_name',v_repair.customer_name,
      'customer_phone',v_repair.customer_phone,
      'customer_email',v_repair.customer_email,
      'device_type',v_repair.device_type,
      'brand',v_repair.brand,
      'model',v_repair.model,
      'fault_reported',v_repair.fault_reported,
      'repair_type',v_repair.repair_type,
      'parts_replaced',v_repair.parts_replaced,
      'parts_cost',v_repair.parts_cost,
      'labour_cost',v_repair.labour_cost,
      'gross_amount',v_repair.amount_charged,
      'cash_off_amount',coalesce(v_repair.cash_off_amount,0),
      'amount_payable',greatest(coalesce(v_repair.amount_charged,0)-coalesce(v_repair.cash_off_amount,0),0),
      'transaction_total',greatest(coalesce(v_repair.amount_charged,0)-coalesce(v_repair.cash_off_amount,0),0),
      'payments',v_payments,
      'cash_payment_total',v_paid,
      'total_paid',v_paid,
      'effective_paid',v_effective_paid,
      'balance_due',0,
      'branch_location_id',v_repair.branch_location_id,
      'branch_code',v_location.code,
      'branch_name',v_location.name,
      'handled_by_user_id',v_repair.handled_by_user_id,
      'handled_by_name',v_repair.handled_by_name,
      'technician_user_id',v_repair.technician_user_id,
      'technician_name',v_repair.technician_name
    ),
    auth.uid()
  ) returning * into v_doc;

  perform public.sales_prepare_document_deliveries(v_doc.id,v_repair.customer_email);
  return v_doc;
exception when unique_violation then
  select * into v_existing
  from public.sales_documents
  where document_type='final_sales_receipt'
    and repair_id=p_repair_id
    and voided_at is null
  limit 1;
  if found then return v_existing; end if;
  raise;
end;
$$;

-- Cash-Off must count toward repair settlement when an actual payment is recorded.
create or replace function public.sales_queue_repair_payment_documents()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_repair public.ops_repairs%rowtype;
  v_paid numeric;
  v_effective_paid numeric;
begin
  if new.is_void then return new; end if;
  perform public.sales_ensure_payment_receipt_metadata('repair',new.id);

  select * into v_repair
  from public.ops_repairs
  where id=new.repair_id;

  if found then
    select coalesce(sum(amount) filter(where not is_void),0)
    into v_paid
    from public.ops_repair_payments
    where repair_id=new.repair_id;

    v_effective_paid := v_paid + coalesce(v_repair.cash_off_amount,0);
    if v_effective_paid >= coalesce(v_repair.amount_charged,0)
       and coalesce(v_repair.amount_charged,0) > 0 then
      perform public.sales_ensure_final_repair_receipt_metadata(new.repair_id);
    end if;
  end if;
  return new;
end;
$$;

-- A repair can become fully settled by Cash-Off without another cash payment.
create or replace function public.sales_queue_repair_cashoff_final_document()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_paid numeric;
begin
  if coalesce(new.cash_off_amount,0) <= coalesce(old.cash_off_amount,0) then return new; end if;
  if coalesce(new.amount_charged,0) <= 0 then return new; end if;

  select coalesce(sum(amount) filter(where not is_void),0)
  into v_paid
  from public.ops_repair_payments
  where repair_id=new.id;

  if v_paid + coalesce(new.cash_off_amount,0) >= new.amount_charged then
    perform public.sales_ensure_final_repair_receipt_metadata(new.id);
  end if;
  return new;
end;
$$;

revoke all on function public.sales_queue_repair_cashoff_final_document() from public, anon, authenticated;
drop trigger if exists sales_queue_repair_cashoff_final_document on public.ops_repairs;
create trigger sales_queue_repair_cashoff_final_document
after update of cash_off_amount on public.ops_repairs
for each row execute function public.sales_queue_repair_cashoff_final_document();

-- Cash-Off can cover 100% of a sale/order, meaning no payment row will be inserted
-- to trigger final receipt creation. Queue it when confirmation makes a zero-net order real.
create or replace function public.sales_queue_zero_net_order_final_document()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.commercial_state is distinct from 'confirmed'
     and new.commercial_state='confirmed'
     and coalesce(new.total_amount,0) <= 0 then
    perform public.sales_ensure_final_sales_receipt_metadata(new.id);
  end if;
  return new;
end;
$$;

revoke all on function public.sales_queue_zero_net_order_final_document() from public, anon, authenticated;
drop trigger if exists sales_queue_zero_net_order_final_document on public.ops_orders;
create trigger sales_queue_zero_net_order_final_document
after update of commercial_state on public.ops_orders
for each row execute function public.sales_queue_zero_net_order_final_document();
