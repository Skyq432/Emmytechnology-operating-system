-- Formal Sales returns/refunds and receipt void controls.

create or replace function public.sales_create_return(
  p_order_id uuid,
  p_reason text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_order public.ops_orders;
  v_return_id uuid;
  v_item jsonb;
  v_order_item public.ops_order_items;
  v_unit public.ops_inventory_units;
  v_qty integer;
  v_disposition text;
begin
  if not public.ops_is_admin() then raise exception 'Not authorized'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'Return reason is required'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'At least one returned item is required'; end if;
  select * into v_order from public.ops_orders where id=p_order_id;
  if not found or v_order.commercial_state<>'confirmed' then raise exception 'Confirmed sale/order is required'; end if;

  insert into public.sales_returns(order_id,identity_id,reason,requested_by)
  values(p_order_id,v_order.identity_id,trim(p_reason),auth.uid()) returning id into v_return_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_order_item from public.ops_order_items where id=nullif(v_item->>'order_item_id','')::uuid and order_id=p_order_id;
    if not found then raise exception 'Returned line is not part of the original sale'; end if;
    v_qty:=coalesce(nullif(v_item->>'quantity','')::integer,0);
    if v_qty<=0 or v_qty>v_order_item.quantity then raise exception 'Invalid return quantity for %',v_order_item.item_name; end if;
    v_disposition:=coalesce(nullif(v_item->>'disposition',''),'inspection');
    if v_disposition not in ('available','faulty','inspection','retired','other') then raise exception 'Invalid return disposition'; end if;
    if v_order_item.inventory_unit_id is not null then
      if v_qty<>1 then raise exception 'Serialized units can only be returned once'; end if;
      select * into v_unit from public.ops_inventory_units where id=v_order_item.inventory_unit_id;
      if not found or v_unit.sold_order_id is distinct from p_order_id or v_unit.sold_order_item_id is distinct from v_order_item.id then
        raise exception 'Serialized unit does not match the original sale';
      end if;
    end if;

    insert into public.sales_return_items(return_id,order_item_id,inventory_unit_id,quantity,returned_condition,disposition,note)
    values(v_return_id,v_order_item.id,v_order_item.inventory_unit_id,v_qty,nullif(trim(v_item->>'returned_condition'),''),v_disposition,nullif(trim(v_item->>'note'),''));
  end loop;

  insert into public.sales_events(identity_id,order_id,event_type,title,note,metadata,actor_id)
  values(v_order.identity_id,p_order_id,'return.created','Return requested',trim(p_reason),jsonb_build_object('return_id',v_return_id),auth.uid());
  return v_return_id;
end;
$$;

create or replace function public.sales_approve_return(p_return_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare v_return public.sales_returns;
begin
  if not public.ops_is_admin() then raise exception 'Not authorized'; end if;
  select * into v_return from public.sales_returns where id=p_return_id for update;
  if not found or v_return.status<>'requested' then raise exception 'Return is not awaiting approval'; end if;
  update public.sales_returns set status='approved',approved_by=auth.uid(),approved_at=now() where id=p_return_id;
  insert into public.sales_events(identity_id,order_id,event_type,title,metadata,actor_id)
  values(v_return.identity_id,v_return.order_id,'return.approved','Return approved',jsonb_build_object('return_id',p_return_id),auth.uid());
end;
$$;

create or replace function public.sales_complete_return(p_return_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_return public.sales_returns;
  v_return_item public.sales_return_items;
  v_order_item public.ops_order_items;
  v_status text;
begin
  if not public.ops_is_admin() then raise exception 'Not authorized'; end if;
  select * into v_return from public.sales_returns where id=p_return_id for update;
  if not found or v_return.status<>'approved' then raise exception 'Approved return is required'; end if;

  for v_return_item in select * from public.sales_return_items where return_id=p_return_id order by created_at,id
  loop
    select * into v_order_item from public.ops_order_items where id=v_return_item.order_item_id;
    if v_return_item.inventory_unit_id is not null then
      v_status:=case v_return_item.disposition when 'available' then 'available' when 'faulty' then 'faulty' when 'retired' then 'retired' else 'returned' end;
      update public.ops_inventory_units
      set status=v_status,
          sold_order_id=case when v_status='available' then null else sold_order_id end,
          sold_order_item_id=case when v_status='available' then null else sold_order_item_id end,
          note=concat_ws(' · ',note,'Returned under '||v_return.return_code)
      where id=v_return_item.inventory_unit_id and sold_order_id=v_return.order_id;
    elsif v_order_item.inventory_item_id is not null and v_return_item.disposition='available' then
      if v_order_item.source_location_id is null then raise exception 'Original stock location missing for returned item %',v_order_item.item_name; end if;
      perform public.ops_create_stock_movement(v_order_item.inventory_item_id,v_order_item.source_location_id,'return_in',v_return_item.quantity,'return',p_return_id,'Customer return '||v_return.return_code);
    end if;
  end loop;

  update public.sales_returns set status='completed',completed_at=now() where id=p_return_id;
  insert into public.sales_events(identity_id,order_id,event_type,title,metadata,actor_id)
  values(v_return.identity_id,v_return.order_id,'return.completed','Return completed',jsonb_build_object('return_id',p_return_id),auth.uid());
end;
$$;

create or replace function public.sales_record_refund(
  p_return_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_return public.sales_returns;
  v_order public.ops_orders;
  v_refund_id uuid;
  v_max_refund numeric;
  v_refunded numeric;
begin
  if not public.ops_is_admin() then raise exception 'Not authorized'; end if;
  if coalesce(p_amount,0)<=0 then raise exception 'Refund amount must be greater than zero'; end if;
  if p_payment_method not in ('bank_transfer','pos','cash','split','other') then raise exception 'Invalid refund method'; end if;
  select * into v_return from public.sales_returns where id=p_return_id for update;
  if not found or v_return.status not in ('approved','completed') then raise exception 'Approved return is required before refund'; end if;
  select * into v_order from public.ops_orders where id=v_return.order_id;
  select coalesce(sum(ri.quantity*coalesce(oi.unit_price,0)),0) into v_max_refund
  from public.sales_return_items ri join public.ops_order_items oi on oi.id=ri.order_item_id where ri.return_id=p_return_id;
  select coalesce(sum(amount) filter(where status='recorded'),0) into v_refunded from public.sales_refunds where return_id=p_return_id;
  if v_refunded+p_amount>v_max_refund then raise exception 'Refund exceeds the commercial value of returned items'; end if;

  insert into public.sales_refunds(return_id,order_id,amount,payment_method,reference,recorded_by)
  values(p_return_id,v_return.order_id,p_amount,p_payment_method,nullif(trim(p_reference),''),auth.uid()) returning id into v_refund_id;

  insert into public.sales_documents(document_number,document_type,identity_id,order_id,source_payment_type,source_payment_id,snapshot,created_by)
  values(
    'RCT-R-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(md5(random()::text),1,7)),
    'refund_document',v_return.identity_id,v_return.order_id,'refund',v_refund_id,
    jsonb_build_object('return_code',v_return.return_code,'order_code',v_order.order_code,'customer_name',v_order.customer_name,
      'customer_phone',v_order.customer_phone,'customer_email',v_order.customer_email,'refund_amount',p_amount,
      'payment_method',p_payment_method,'reference',p_reference,'refunded_at',now()),auth.uid()
  );

  insert into public.sales_events(identity_id,order_id,event_type,title,metadata,actor_id)
  values(v_return.identity_id,v_return.order_id,'refund.recorded','Refund recorded',jsonb_build_object('return_id',p_return_id,'refund_id',v_refund_id,'amount',p_amount),auth.uid());
  return v_refund_id;
end;
$$;

create or replace function public.sales_void_document(p_document_id uuid,p_reason text)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare v_doc public.sales_documents;
begin
  if not public.ops_is_admin() then raise exception 'Not authorized'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'Void reason is required'; end if;
  select * into v_doc from public.sales_documents where id=p_document_id for update;
  if not found then raise exception 'Document not found'; end if;
  if v_doc.voided_at is not null then raise exception 'Document is already void'; end if;
  update public.sales_documents set voided_at=now(),void_reason=trim(p_reason),voided_by=auth.uid() where id=p_document_id;
  update public.sales_document_deliveries set delivery_state='failed',last_error='Document voided before delivery'
  where document_id=p_document_id and delivery_state='pending';
  insert into public.sales_events(identity_id,order_id,event_type,title,note,metadata,actor_id)
  values(v_doc.identity_id,v_doc.order_id,'receipt.voided','Document voided',trim(p_reason),jsonb_build_object('document_id',p_document_id,'document_number',v_doc.document_number),auth.uid());
end;
$$;

grant execute on function public.sales_create_return(uuid,text,jsonb) to authenticated;
grant execute on function public.sales_approve_return(uuid) to authenticated;
grant execute on function public.sales_complete_return(uuid) to authenticated;
grant execute on function public.sales_record_refund(uuid,numeric,text,text) to authenticated;
grant execute on function public.sales_void_document(uuid,text) to authenticated;
