-- Transaction-safe Cash-Off redemption for Direct Sales, Orders and Repairs.
-- Cash-Off remains separate from actual customer cash/payment rows.

alter table public.ops_repairs
  add column if not exists cash_off_amount numeric(14,2) not null default 0;

alter table public.ops_repairs
  drop constraint if exists ops_repairs_cash_off_amount_check;
alter table public.ops_repairs
  add constraint ops_repairs_cash_off_amount_check check (cash_off_amount >= 0);

create or replace function public.commercial_set_draft_cash_off(
  p_order_id uuid,
  p_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.ops_orders%rowtype;
  v_amount numeric(14,2) := round(greatest(coalesce(p_amount, 0), 0)::numeric, 2);
  v_balance numeric(14,2);
  v_gross_due numeric(14,2);
begin
  if not public.staff_has_any_capability(array['sales.direct.manage','sales.order.manage','operations.order.manage']) then
    raise exception 'Not authorized';
  end if;

  select * into v_order
  from public.ops_orders
  where id = p_order_id
  for update;

  if not found then raise exception 'Order not found'; end if;
  if v_order.commercial_state <> 'draft' then raise exception 'Cash-Off can only be changed while the order is Draft'; end if;
  if v_order.identity_id is null then raise exception 'Customer Identity is required before using Cash-Off'; end if;

  v_gross_due := greatest(
    coalesce(v_order.subtotal, 0)
      - greatest(coalesce(v_order.discount_amount, 0), 0)
      + greatest(coalesce(v_order.delivery_charge, 0), 0),
    0
  );

  select coalesce(a.balance, 0) into v_balance
  from public.cash_off_accounts a
  where a.identity_id = v_order.identity_id;
  v_balance := coalesce(v_balance, 0);

  if v_amount > v_gross_due then
    raise exception 'Cash-Off cannot exceed the amount owed';
  end if;
  if v_amount > v_balance then
    raise exception 'Insufficient Cash Off balance';
  end if;

  update public.ops_orders
  set cash_off_amount = v_amount,
      total_amount = greatest(v_gross_due - v_amount, 0),
      balance_due = greatest(v_gross_due - v_amount - coalesce(amount_paid, 0), 0)
  where id = p_order_id;

  return jsonb_build_object(
    'order_id', p_order_id,
    'cash_off_amount', v_amount,
    'cash_off_balance', v_balance,
    'gross_due', v_gross_due,
    'amount_payable', greatest(v_gross_due - v_amount, 0)
  );
end;
$$;

revoke all on function public.commercial_set_draft_cash_off(uuid, numeric) from public, anon;
grant execute on function public.commercial_set_draft_cash_off(uuid, numeric) to authenticated;

create or replace function public.commercial_redeem_order_cash_off(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.ops_orders%rowtype;
  v_balance numeric(14,2);
  v_gross_due numeric(14,2);
  v_result jsonb;
begin
  select * into v_order
  from public.ops_orders
  where id = p_order_id
  for update;

  if not found then raise exception 'Order not found'; end if;
  if v_order.commercial_state <> 'draft' then raise exception 'Only Draft orders can redeem Cash-Off'; end if;
  if coalesce(v_order.cash_off_amount, 0) <= 0 then
    return jsonb_build_object('applied', false, 'amount', 0);
  end if;
  if v_order.identity_id is null then raise exception 'Customer Identity is required before using Cash-Off'; end if;

  v_gross_due := greatest(
    coalesce(v_order.subtotal, 0)
      - greatest(coalesce(v_order.discount_amount, 0), 0)
      + greatest(coalesce(v_order.delivery_charge, 0), 0),
    0
  );

  if v_order.cash_off_amount > v_gross_due then
    raise exception 'Cash-Off cannot exceed the amount owed';
  end if;

  select coalesce(a.balance, 0) into v_balance
  from public.cash_off_accounts a
  where a.identity_id = v_order.identity_id;
  v_balance := coalesce(v_balance, 0);

  if v_order.cash_off_amount > v_balance then
    raise exception 'Insufficient Cash Off balance';
  end if;

  v_result := public.cash_off_apply_transaction(
    v_order.identity_id,
    'debit',
    v_order.cash_off_amount,
    'order_redemption',
    'commercial',
    v_order.order_code,
    v_order.order_code,
    null,
    auth.uid(),
    'Cash-Off applied to ' || v_order.order_code,
    jsonb_build_object('order_id', v_order.id, 'sales_channel', v_order.sales_channel),
    'order_redemption:' || v_order.id::text
  );

  return v_result;
end;
$$;

revoke all on function public.commercial_redeem_order_cash_off(uuid) from public, anon, authenticated;

create or replace function public.ops_apply_repair_cash_off(
  p_repair_id uuid,
  p_target_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_repair public.ops_repairs%rowtype;
  v_quote public.ops_repair_quotes%rowtype;
  v_target numeric(14,2) := round(greatest(coalesce(p_target_amount, 0), 0)::numeric, 2);
  v_delta numeric(14,2);
  v_cash_paid numeric(14,2);
  v_effective_paid numeric(14,2);
  v_balance numeric(14,2);
  v_wallet numeric(14,2);
  v_status text;
  v_result jsonb;
begin
  if not public.staff_has_capability('operations.repair.finance') then raise exception 'Not authorized'; end if;

  select * into v_repair
  from public.ops_repairs
  where id = p_repair_id
  for update;

  if not found then raise exception 'Repair not found'; end if;
  if v_repair.status in ('collected','cancelled') then raise exception 'Cannot use Cash-Off on a closed repair'; end if;
  if v_repair.identity_id is null then raise exception 'Customer Identity is required before using Cash-Off'; end if;
  if v_repair.current_quote_id is null then raise exception 'Current repair quote must be approved before using Cash-Off'; end if;

  select * into v_quote
  from public.ops_repair_quotes
  where id = v_repair.current_quote_id
  for share;

  if not found or v_quote.status <> 'approved' then
    raise exception 'Current repair quote must be approved before using Cash-Off';
  end if;

  select coalesce(sum(p.amount) filter (where not p.is_void), 0)
  into v_cash_paid
  from public.ops_repair_payments p
  where p.repair_id = p_repair_id;

  if v_target < coalesce(v_repair.cash_off_amount, 0) then
    raise exception 'Cash-Off already used on this repair cannot be reduced; cancellation uses a ledger reversal';
  end if;

  if v_target > greatest(v_quote.quote_amount - v_cash_paid, 0) then
    raise exception 'Cash-Off cannot exceed the amount owed';
  end if;

  v_delta := v_target - coalesce(v_repair.cash_off_amount, 0);
  if v_delta > 0 then
    select coalesce(a.balance, 0) into v_wallet
    from public.cash_off_accounts a
    where a.identity_id = v_repair.identity_id;
    v_wallet := coalesce(v_wallet, 0);
    if v_delta > v_wallet then raise exception 'Insufficient Cash Off balance'; end if;

    v_result := public.cash_off_apply_transaction(
      v_repair.identity_id,
      'debit',
      v_delta,
      'order_redemption',
      'repair',
      v_repair.repair_code,
      v_repair.repair_code,
      null,
      auth.uid(),
      'Cash-Off applied to repair ' || v_repair.repair_code,
      jsonb_build_object('repair_id', v_repair.id, 'target_cash_off_amount', v_target),
      'repair_redemption:' || v_repair.id::text || ':' || replace(to_char(v_target, 'FM999999999990D00'), '.', '_')
    );
  else
    v_result := jsonb_build_object('applied', false, 'amount', 0, 'idempotent_replay', true);
  end if;

  v_effective_paid := v_cash_paid + v_target;
  v_balance := greatest(v_quote.quote_amount - v_effective_paid, 0);
  v_status := case
    when v_quote.quote_amount > 0 and v_effective_paid >= v_quote.quote_amount then 'paid'
    when v_effective_paid > 0 then 'partial'
    else 'unpaid'
  end;

  update public.ops_repairs
  set cash_off_amount = v_target,
      amount_paid = v_cash_paid,
      balance_due = v_balance,
      payment_status = v_status
  where id = p_repair_id;

  if v_delta > 0 then
    insert into public.ops_repair_events(
      repair_id, assignment_id, event_type, title, customer_visible, actor_id, metadata
    ) values (
      p_repair_id,
      v_repair.current_card_assignment_id,
      'cash_off_redeemed',
      'Cash-Off applied to repair',
      true,
      auth.uid(),
      jsonb_build_object(
        'amount', v_delta,
        'cash_off_total', v_target,
        'cash_payment_total', v_cash_paid,
        'effective_paid', v_effective_paid,
        'balance_due', v_balance
      )
    );
  end if;

  return jsonb_build_object(
    'repair_id', p_repair_id,
    'cash_off_amount', v_target,
    'cash_off_delta', v_delta,
    'cash_payment_total', v_cash_paid,
    'effective_paid', v_effective_paid,
    'balance_due', v_balance,
    'payment_status', v_status,
    'start_gate_satisfied', v_effective_paid >= v_quote.required_before_start,
    'ledger', v_result
  );
end;
$$;

revoke all on function public.ops_apply_repair_cash_off(uuid, numeric) from public, anon;
grant execute on function public.ops_apply_repair_cash_off(uuid, numeric) to authenticated;

-- Order confirmation now redeems the Draft Cash-Off request inside the same
-- database transaction as stock reservation and commercial confirmation.
create or replace function public.ops_confirm_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.ops_orders%rowtype;
  v_item public.ops_order_items%rowtype;
  v_available bigint;
  v_stage integer := 0;
  v_commission numeric := 0;
  v_lead_id uuid;
  v_reserved integer := 0;
begin
  if not public.staff_has_capability('operations.order.manage') then raise exception 'Not authorized'; end if;
  select * into v_order from public.ops_orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.commercial_state<>'draft' then raise exception 'Only draft orders can be confirmed'; end if;

  perform public.commercial_redeem_order_cash_off(p_order_id);

  for v_item in select * from public.ops_order_items where order_id=p_order_id order by created_at loop
    if v_item.inventory_item_id is not null and v_item.source_location_id is not null and v_item.fulfilment_source='internal' then
      select available into v_available from public.ops_inventory_availability where inventory_item_id=v_item.inventory_item_id and location_id=v_item.source_location_id;
      v_available:=coalesce(v_available,0);
      if v_available<v_item.quantity then raise exception 'Insufficient available stock for item %: need %, available %',v_item.item_name,v_item.quantity,v_available; end if;
      insert into public.ops_inventory_reservations(order_id,order_item_id,inventory_item_id,location_id,quantity,created_by)
      values(p_order_id,v_item.id,v_item.inventory_item_id,v_item.source_location_id,v_item.quantity,auth.uid());
      update public.ops_order_items set quantity_reserved=v_item.quantity where id=v_item.id;
      v_reserved:=v_reserved+v_item.quantity;
    end if;
  end loop;
  if v_order.ambassador_id is not null and v_order.commission_rate>0 then v_commission:=round((v_order.total_amount*v_order.commission_rate/100.0)::numeric,2); end if;
  update public.ops_orders set commercial_state='confirmed',confirmed_at=now(),confirmed_by=auth.uid(),commission_amount=v_commission,commission_status=case when v_commission>0 then 'pending' else 'none' end where id=p_order_id;
  if v_order.identity_id is not null then
    v_stage:=public.ops_current_crm_stage(v_order.identity_id);
    if v_stage<5 then
      insert into public.crm_manual_updates(identity_id,update_type,value,note,updated_by) values(v_order.identity_id,'funnel_stage','5','Moved to Purchase because order '||v_order.order_code||' was confirmed','Operations');
      insert into public.crm_stage_history(identity_id,from_stage,to_stage,tracking_type,changed_by) values(v_order.identity_id,nullif(v_stage,0),5,'Automatic','Operations');
      v_lead_id:=v_order.lead_id;
      if v_lead_id is null then select id into v_lead_id from public.leads where identity_id=v_order.identity_id order by updated_at desc nulls last,created_at desc limit 1; end if;
      if v_lead_id is not null then update public.leads set funnel_stage='purchase',updated_at=now() where id=v_lead_id; end if;
      v_stage:=5;
    end if;
    insert into public.identity_events(identity_id,event_type,title,description,metadata)
    values(v_order.identity_id,'operations_order_confirmed','Order confirmed','Operations order '||v_order.order_code||' was confirmed',jsonb_build_object('order_id',p_order_id,'order_code',v_order.order_code,'total_amount',v_order.total_amount,'cash_off_amount',v_order.cash_off_amount));
  end if;
  insert into public.ops_order_events(order_id,event_type,title,actor_id,metadata)
  values(p_order_id,'order_confirmed','Order confirmed',auth.uid(),jsonb_build_object('reserved_quantity',v_reserved,'commission_amount',v_commission,'crm_stage',v_stage,'cash_off_amount',v_order.cash_off_amount));
  insert into public.ops_business_events(event_type,idempotency_key,order_id,identity_id,payload,created_by)
  values('order.confirmed','order.confirmed:'||p_order_id::text,p_order_id,v_order.identity_id,jsonb_build_object('total_amount',v_order.total_amount,'cash_off_amount',v_order.cash_off_amount,'reserved_quantity',v_reserved,'ambassador_id',v_order.ambassador_id,'commission_amount',v_commission,'crm_stage',v_stage),auth.uid()) on conflict(idempotency_key) do nothing;
  if v_reserved>0 then insert into public.ops_business_events(event_type,idempotency_key,order_id,identity_id,payload,created_by) values('order.stock_reserved','order.stock_reserved:'||p_order_id::text,p_order_id,v_order.identity_id,jsonb_build_object('quantity',v_reserved),auth.uid()) on conflict(idempotency_key) do nothing; end if;
  if v_commission>0 then insert into public.ops_business_events(event_type,idempotency_key,order_id,identity_id,payload,created_by) values('commission.pending','commission.pending:'||p_order_id::text,p_order_id,v_order.identity_id,jsonb_build_object('ambassador_id',v_order.ambassador_id,'rate',v_order.commission_rate,'amount',v_commission),auth.uid()) on conflict(idempotency_key) do nothing; end if;
  return jsonb_build_object('order_id',p_order_id,'commercial_state','confirmed','reserved_quantity',v_reserved,'commission_amount',v_commission,'commission_status',case when v_commission>0 then 'pending' else 'none' end,'crm_stage',v_stage,'cash_off_amount',v_order.cash_off_amount);
end;
$$;

-- Direct Sale confirmation uses the same atomic wallet redemption before stock
-- is reserved. Any later failure rolls the wallet debit back with the transaction.
create or replace function public.sales_confirm_direct_sale(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.ops_orders%rowtype;
  v_item public.ops_order_items%rowtype;
  v_inventory public.ops_inventory_items%rowtype;
  v_unit public.ops_inventory_units%rowtype;
  v_available bigint;
  v_reserved integer:=0;
  v_stage integer:=0;
  v_lead_id uuid;
  v_commission numeric:=0;
begin
  if not public.staff_has_capability('sales.direct.manage') then raise exception 'Not authorized'; end if;
  select * into v_order from public.ops_orders where id=p_order_id for update;
  if not found then raise exception 'Sale not found'; end if;
  if v_order.sales_channel<>'direct_sale' or v_order.fulfilment_mode<>'immediate_collection' then raise exception 'Order is not a Direct Sale'; end if;
  if v_order.commercial_state<>'draft' then raise exception 'Only draft Direct Sales can be confirmed'; end if;
  if v_order.identity_id is null then raise exception 'Customer Identity is required'; end if;
  if not exists(select 1 from public.ops_order_items where order_id=p_order_id) then raise exception 'At least one sale item is required'; end if;

  perform public.commercial_redeem_order_cash_off(p_order_id);

  for v_item in select * from public.ops_order_items where order_id=p_order_id order by created_at,id loop
    if v_item.inventory_item_id is not null then
      select * into v_inventory from public.ops_inventory_items where id=v_item.inventory_item_id for share;
      if not found then raise exception 'Inventory item not found'; end if;
      if v_inventory.serial_tracking then
        if v_item.quantity<>1 or v_item.inventory_unit_id is null then raise exception 'Serialized line requires one exact unit'; end if;
        select * into v_unit from public.ops_inventory_units where id=v_item.inventory_unit_id and inventory_item_id=v_item.inventory_item_id for update;
        if not found or v_unit.status<>'available' then raise exception 'Serialized unit for % is no longer available',v_item.item_name; end if;
        if v_item.source_location_id is not null and v_unit.current_location_id is distinct from v_item.source_location_id then raise exception 'Serialized unit location changed'; end if;
        update public.ops_inventory_units set status='reserved',reserved_order_id=p_order_id,reserved_order_item_id=v_item.id where id=v_unit.id;
        update public.ops_order_items set quantity_reserved=1 where id=v_item.id;
        v_reserved:=v_reserved+1;
      else
        if v_item.source_location_id is null then raise exception 'Stock location is required for %',v_item.item_name; end if;
        select available into v_available from public.ops_inventory_availability where inventory_item_id=v_item.inventory_item_id and location_id=v_item.source_location_id;
        if coalesce(v_available,0)<v_item.quantity then raise exception 'Insufficient stock for %',v_item.item_name; end if;
        insert into public.ops_inventory_reservations(order_id,order_item_id,inventory_item_id,location_id,quantity,created_by)
        values(p_order_id,v_item.id,v_item.inventory_item_id,v_item.source_location_id,v_item.quantity,auth.uid());
        update public.ops_order_items set quantity_reserved=v_item.quantity where id=v_item.id;
        v_reserved:=v_reserved+v_item.quantity;
      end if;
    end if;
  end loop;

  if v_order.ambassador_id is not null and v_order.commission_rate>0 then v_commission:=round((v_order.total_amount*v_order.commission_rate/100.0)::numeric,2); end if;
  update public.ops_orders set commercial_state='confirmed',confirmed_at=now(),confirmed_by=auth.uid(),commission_amount=v_commission,commission_status=case when v_commission>0 then 'pending' else 'none' end where id=p_order_id;

  if v_order.identity_id is not null then
    v_stage:=public.ops_current_crm_stage(v_order.identity_id);
    if v_stage<5 then
      insert into public.crm_manual_updates(identity_id,update_type,value,note,updated_by) values(v_order.identity_id,'funnel_stage','5','Moved to Purchase because Direct Sale '||v_order.order_code||' was confirmed','Sales');
      insert into public.crm_stage_history(identity_id,from_stage,to_stage,tracking_type,changed_by) values(v_order.identity_id,nullif(v_stage,0),5,'Automatic','Sales');
      v_lead_id:=v_order.lead_id;
      if v_lead_id is null then select id into v_lead_id from public.leads where identity_id=v_order.identity_id order by updated_at desc nulls last,created_at desc limit 1; end if;
      if v_lead_id is not null then update public.leads set funnel_stage='purchase',updated_at=now() where id=v_lead_id; end if;
      v_stage:=5;
    end if;
    insert into public.identity_events(identity_id,event_type,title,description,metadata)
    values(v_order.identity_id,'sales_direct_sale_confirmed','Direct Sale confirmed','Direct Sale '||v_order.order_code||' was confirmed',jsonb_build_object('order_id',p_order_id,'total_amount',v_order.total_amount,'cash_off_amount',v_order.cash_off_amount));
  end if;

  insert into public.ops_order_events(order_id,event_type,title,actor_id,metadata)
  values(p_order_id,'order_confirmed','Direct Sale confirmed',auth.uid(),jsonb_build_object('reserved_quantity',v_reserved,'commission_amount',v_commission,'cash_off_amount',v_order.cash_off_amount));
  insert into public.sales_events(identity_id,order_id,event_type,title,metadata,actor_id)
  values(v_order.identity_id,p_order_id,'sale.confirmed','Direct Sale confirmed',jsonb_build_object('reserved_quantity',v_reserved,'cash_off_amount',v_order.cash_off_amount),auth.uid());

  return jsonb_build_object('order_id',p_order_id,'commercial_state','confirmed','reserved_quantity',v_reserved,'cash_off_amount',v_order.cash_off_amount);
end;
$$;

-- Actual Repair payments remain actual payments. Cash-Off contributes only to
-- effective settlement, balance and the start-work gate.
create or replace function public.ops_record_repair_payment(
  p_repair_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_reference text default null,
  p_paid_at timestamptz default now(),
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_repair public.ops_repairs%rowtype;
  v_quote public.ops_repair_quotes%rowtype;
  v_payment_id uuid;
  v_paid numeric;
  v_effective_paid numeric;
  v_total numeric;
  v_balance numeric;
  v_status text;
  v_gate_satisfied boolean := false;
begin
  if not public.staff_has_capability('operations.repair.finance') then raise exception 'Not authorized'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Payment amount must be greater than zero'; end if;
  if p_payment_method not in ('bank_transfer','pos','cash','split','other') then raise exception 'Invalid payment method'; end if;
  select * into v_repair from public.ops_repairs where id=p_repair_id for update;
  if not found then raise exception 'Repair not found'; end if;
  if v_repair.status in ('collected','cancelled') then raise exception 'Cannot record payment on a closed repair'; end if;
  if v_repair.current_quote_id is not null then select * into v_quote from public.ops_repair_quotes where id=v_repair.current_quote_id; end if;
  v_total := coalesce(v_quote.quote_amount,v_repair.amount_charged,0);
  if v_total <= 0 then raise exception 'Publish a repair quote before recording payment'; end if;
  if coalesce(v_repair.cash_off_amount,0) + coalesce(v_repair.amount_paid,0) + p_amount > v_total then raise exception 'Payment exceeds outstanding repair balance'; end if;

  insert into public.ops_repair_payments(repair_id,amount,payment_method,reference,paid_at,note,recorded_by)
  values(p_repair_id,p_amount,p_payment_method,nullif(btrim(p_reference),''),coalesce(p_paid_at,now()),nullif(btrim(p_note),''),auth.uid()) returning id into v_payment_id;

  select coalesce(sum(amount),0) into v_paid from public.ops_repair_payments where repair_id=p_repair_id and is_void=false;
  v_effective_paid := v_paid + coalesce(v_repair.cash_off_amount,0);
  v_balance := greatest(v_total-v_effective_paid,0);
  v_status := case when v_total>0 and v_effective_paid>=v_total then 'paid' when v_effective_paid>0 then 'partial' else 'unpaid' end;
  v_gate_satisfied := v_quote.id is not null and v_quote.status='approved' and v_effective_paid>=v_quote.required_before_start;
  update public.ops_repairs set amount_paid=v_paid,balance_due=v_balance,payment_status=v_status where id=p_repair_id;
  insert into public.ops_repair_events(repair_id,assignment_id,event_type,title,customer_visible,actor_id,metadata)
  values(p_repair_id,v_repair.current_card_assignment_id,'payment_recorded','Repair payment recorded',true,auth.uid(),jsonb_build_object('payment_id',v_payment_id,'amount',p_amount,'cash_payment_total',v_paid,'cash_off_amount',v_repair.cash_off_amount,'effective_paid',v_effective_paid,'balance_due',v_balance,'payment_status',v_status,'start_gate_satisfied',v_gate_satisfied));
  return jsonb_build_object('payment_id',v_payment_id,'amount_paid',v_paid,'cash_off_amount',v_repair.cash_off_amount,'effective_paid',v_effective_paid,'balance_due',v_balance,'payment_status',v_status,'start_gate_satisfied',v_gate_satisfied);
end;
$$;

create or replace function public.ops_change_repair_status(p_repair_id uuid, p_new_status text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_repair public.ops_repairs%rowtype;
  v_quote public.ops_repair_quotes%rowtype;
  v_allowed boolean := false;
  v_gate_ok boolean := false;
  v_effective_paid numeric := 0;
begin
  if not public.staff_has_capability('operations.repair.technical') then raise exception 'Not authorized'; end if;
  if p_new_status not in ('received','diagnosing','awaiting_customer_approval','awaiting_payment','awaiting_parts','in_progress','quality_check','ready_collection','rework','collected','cancelled') then raise exception 'Invalid repair status'; end if;
  select * into v_repair from public.ops_repairs where id=p_repair_id for update;
  if not found then raise exception 'Repair not found'; end if;
  if v_repair.status in ('collected','cancelled') then raise exception 'Closed repair status cannot be changed'; end if;
  if p_new_status='collected' then raise exception 'Use the collection handover action to collect a repair'; end if;
  if p_new_status=v_repair.status then return jsonb_build_object('status',v_repair.status); end if;
  if v_repair.current_quote_id is not null then select * into v_quote from public.ops_repair_quotes where id=v_repair.current_quote_id; end if;
  v_effective_paid := coalesce(v_repair.amount_paid,0) + coalesce(v_repair.cash_off_amount,0);
  v_gate_ok := v_quote.id is not null and v_quote.status='approved' and v_effective_paid>=v_quote.required_before_start;
  if p_new_status='cancelled' then if nullif(btrim(p_note),'') is null then raise exception 'Cancellation reason is required'; end if; v_allowed:=true;
  elsif v_repair.status='received' and p_new_status='diagnosing' then v_allowed:=true;
  elsif v_repair.status='diagnosing' and p_new_status='awaiting_customer_approval' and v_quote.id is not null then v_allowed:=true;
  elsif v_repair.status='awaiting_customer_approval' and p_new_status in ('awaiting_payment','awaiting_parts','in_progress') then v_allowed:=true;
  elsif v_repair.status='awaiting_payment' and p_new_status in ('awaiting_parts','in_progress') then v_allowed:=true;
  elsif v_repair.status='awaiting_parts' and p_new_status='in_progress' then v_allowed:=true;
  elsif v_repair.status='in_progress' and p_new_status='quality_check' then v_allowed:=true;
  elsif v_repair.status='quality_check' and p_new_status in ('ready_collection','rework') then v_allowed:=true;
  elsif v_repair.status='ready_collection' and p_new_status='rework' then v_allowed:=true;
  elsif v_repair.status='rework' and p_new_status in ('awaiting_customer_approval','in_progress','quality_check') then v_allowed:=true; end if;
  if not v_allowed then raise exception 'Invalid repair status transition: % -> %',v_repair.status,p_new_status; end if;
  if p_new_status in ('awaiting_payment','awaiting_parts','in_progress') and (v_quote.id is null or v_quote.status<>'approved') then raise exception 'Current repair quote must be approved first'; end if;
  if p_new_status in ('awaiting_parts','in_progress') and not v_gate_ok then raise exception 'Required payment must be recorded before repair work can start'; end if;
  update public.ops_repairs set status=p_new_status,completed_at=case when p_new_status='ready_collection' then now() when p_new_status='rework' then null else completed_at end where id=p_repair_id;
  if p_new_status='rework' and v_repair.current_card_assignment_id is not null then update public.ops_repair_card_assignments set handover_started_at=null,handover_expires_at=null where id=v_repair.current_card_assignment_id and status='active'; end if;
  insert into public.ops_repair_events(repair_id,assignment_id,event_type,title,note,from_status,to_status,customer_visible,actor_id,metadata)
  values(p_repair_id,v_repair.current_card_assignment_id,'status_changed','Repair status updated',nullif(btrim(p_note),''),v_repair.status,p_new_status,p_new_status in ('diagnosing','awaiting_customer_approval','awaiting_payment','awaiting_parts','in_progress','quality_check','ready_collection','rework'),auth.uid(),jsonb_build_object('cash_payment_total',v_repair.amount_paid,'cash_off_amount',v_repair.cash_off_amount,'effective_paid',v_effective_paid));
  return jsonb_build_object('status',p_new_status,'start_gate_satisfied',v_gate_ok,'effective_paid',v_effective_paid);
end;
$$;

create or replace function public.commercial_reverse_cash_off_on_cancel()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_redemption_key text;
  v_refund_key text;
  v_source_code text;
  v_entity_type text;
begin
  if old.status = 'cancelled' or new.status <> 'cancelled' then return new; end if;

  if tg_table_name = 'ops_orders' then
    if coalesce(new.cash_off_amount,0) <= 0 or new.identity_id is null then return new; end if;
    v_redemption_key := 'order_redemption:' || new.id::text;
    v_refund_key := 'order_refund:' || new.id::text;
    v_source_code := new.order_code;
    v_entity_type := 'order';
  elsif tg_table_name = 'ops_repairs' then
    if coalesce(new.cash_off_amount,0) <= 0 or new.identity_id is null then return new; end if;
    if not exists (
      select 1 from public.cash_off_transactions t
      where t.identity_id=new.identity_id
        and t.direction='debit'
        and t.source_system='repair'
        and t.source_reference=new.repair_code
        and t.idempotency_key like 'repair_redemption:' || new.id::text || ':%'
    ) then return new; end if;
    v_redemption_key := null;
    v_refund_key := 'repair_refund:' || new.id::text;
    v_source_code := new.repair_code;
    v_entity_type := 'repair';
  else
    return new;
  end if;

  if v_entity_type='order' and not exists (
    select 1 from public.cash_off_transactions t
    where t.idempotency_key=v_redemption_key
      and t.identity_id=new.identity_id
      and t.direction='debit'
      and t.transaction_type='order_redemption'
  ) then return new; end if;

  perform public.credit_cash_off(
    new.identity_id,
    new.cash_off_amount,
    'order_refund',
    case when v_entity_type='repair' then 'repair' else 'commercial' end,
    v_source_code,
    v_source_code,
    null,
    auth.uid(),
    'Cash-Off restored after ' || v_entity_type || ' cancellation',
    jsonb_build_object('entity_type',v_entity_type,'entity_id',new.id,'cancelled',true),
    v_refund_key
  );

  return new;
end;
$$;

revoke all on function public.commercial_reverse_cash_off_on_cancel() from public, anon, authenticated;

drop trigger if exists commercial_reverse_order_cash_off_on_cancel on public.ops_orders;
create trigger commercial_reverse_order_cash_off_on_cancel
after update of status on public.ops_orders
for each row execute function public.commercial_reverse_cash_off_on_cancel();

drop trigger if exists commercial_reverse_repair_cash_off_on_cancel on public.ops_repairs;
create trigger commercial_reverse_repair_cash_off_on_cancel
after update of status on public.ops_repairs
for each row execute function public.commercial_reverse_cash_off_on_cancel();
