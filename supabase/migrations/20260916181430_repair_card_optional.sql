-- Some repair customers are close/family or collect the same day — the formal
-- Repair Card + PIN + handover flow is unnecessary friction for them. Make the
-- card optional at intake, and teach every downstream RPC that currently assumes
-- a card exists (collection confirmation, admin release override, completion) to
-- treat "no card" as an automatically-satisfied step rather than a hard block.

-- Consents need to be recordable even when there is no card assignment to attach them to.
ALTER TABLE public.ops_repair_consents ALTER COLUMN assignment_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.ops_create_repair_with_card(p_card_id uuid, p_identity_id uuid, p_access_pin text, p_fault_reported text, p_original_order_id uuid DEFAULT NULL::uuid, p_inventory_unit_id uuid DEFAULT NULL::uuid, p_customer_name text DEFAULT NULL::text, p_customer_phone text DEFAULT NULL::text, p_customer_email text DEFAULT NULL::text, p_device_type text DEFAULT NULL::text, p_brand text DEFAULT NULL::text, p_model text DEFAULT NULL::text, p_serial_or_imei text DEFAULT NULL::text, p_purchased_from_us text DEFAULT 'not_sure'::text, p_diagnosis text DEFAULT NULL::text, p_repair_type text DEFAULT NULL::text, p_parts_replaced text DEFAULT NULL::text, p_parts_cost numeric DEFAULT 0, p_labour_cost numeric DEFAULT 0, p_amount_charged numeric DEFAULT 0, p_warranty_period text DEFAULT NULL::text, p_warranty_expires_at date DEFAULT NULL::date, p_condition_received text DEFAULT NULL::text, p_condition_returned text DEFAULT NULL::text, p_accessories_received text DEFAULT NULL::text, p_technician_user_id uuid DEFAULT NULL::uuid, p_technician_name text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_card public.ops_repair_cards%rowtype;
  v_repair_id uuid;
  v_repair_code text;
  v_assignment_id uuid;
begin
  if not public.staff_has_capability('operations.repair.intake') then raise exception 'Not authorized'; end if;
  if p_identity_id is null then raise exception 'Customer Identity is required'; end if;
  if nullif(btrim(p_fault_reported), '') is null then raise exception 'Fault reported is required'; end if;
  if coalesce(p_purchased_from_us, 'not_sure') not in ('yes','no','not_sure') then raise exception 'Invalid purchased-from-us state'; end if;

  if p_card_id is not null then
    if coalesce(p_access_pin, '') !~ '^[A-HJ-NP-Z2-9]{4}$' then raise exception 'Invalid Repair PIN'; end if;
    select * into v_card from public.ops_repair_cards where id = p_card_id for update;
    if not found or v_card.status <> 'available' then raise exception 'Repair Card is not available'; end if;
  end if;

  insert into public.ops_repairs(
    identity_id, original_order_id, inventory_unit_id,
    customer_name, customer_phone, customer_email,
    device_type, brand, model, serial_or_imei, purchased_from_us,
    fault_reported, diagnosis, repair_type, parts_replaced,
    parts_cost, labour_cost, amount_charged, balance_due,
    warranty_period, warranty_expires_at,
    condition_received, condition_returned, accessories_received,
    technician_user_id, technician_name, notes, status, created_by
  ) values (
    p_identity_id, p_original_order_id, p_inventory_unit_id,
    nullif(btrim(p_customer_name),''), nullif(btrim(p_customer_phone),''), nullif(btrim(p_customer_email),''),
    nullif(btrim(p_device_type),''), nullif(btrim(p_brand),''), nullif(btrim(p_model),''), nullif(btrim(p_serial_or_imei),''), coalesce(p_purchased_from_us,'not_sure'),
    btrim(p_fault_reported), nullif(btrim(p_diagnosis),''), nullif(btrim(p_repair_type),''), nullif(btrim(p_parts_replaced),''),
    greatest(coalesce(p_parts_cost,0),0), greatest(coalesce(p_labour_cost,0),0), greatest(coalesce(p_amount_charged,0),0), greatest(coalesce(p_amount_charged,0),0),
    nullif(btrim(p_warranty_period),''), p_warranty_expires_at,
    nullif(btrim(p_condition_received),''), nullif(btrim(p_condition_returned),''), nullif(btrim(p_accessories_received),''),
    p_technician_user_id, nullif(btrim(p_technician_name),''), nullif(btrim(p_notes),''), 'received', auth.uid()
  ) returning id, repair_code into v_repair_id, v_repair_code;

  if p_card_id is not null then
    insert into public.ops_repair_card_assignments(card_id, repair_id, identity_id, access_pin, assigned_by)
    values(v_card.id, v_repair_id, p_identity_id, p_access_pin, auth.uid())
    returning id into v_assignment_id;

    update public.ops_repair_cards set status = 'assigned' where id = v_card.id;
    update public.ops_repairs set current_card_assignment_id = v_assignment_id where id = v_repair_id;
  end if;
  if p_inventory_unit_id is not null then update public.ops_inventory_units set status = 'repair' where id = p_inventory_unit_id; end if;

  insert into public.ops_repair_events(repair_id, assignment_id, event_type, title, customer_visible, actor_id, metadata)
  values(v_repair_id, v_assignment_id, 'repair_received', 'Repair received', true, auth.uid(), case when v_card.id is not null then jsonb_build_object('card_code', v_card.card_code) else jsonb_build_object('card_issued', false) end);

  return jsonb_build_object('repair_id',v_repair_id,'repair_code',v_repair_code,'assignment_id',v_assignment_id,'card_id',v_card.id,'card_code',v_card.card_code,'access_pin',case when p_card_id is not null then p_access_pin else null end);
end;
$function$;

CREATE OR REPLACE FUNCTION public.ops_complete_repair_collection(p_repair_id uuid, p_card_returned boolean, p_missing_card_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_repair public.ops_repairs%rowtype;
  v_assignment public.ops_repair_card_assignments%rowtype;
  v_has_acceptance boolean := false;
  v_card_status text;
  v_has_card boolean;
begin
  if not public.staff_has_capability('operations.repair.handover') then raise exception 'Not authorized'; end if;
  select * into v_repair from public.ops_repairs where id=p_repair_id for update;
  if not found then raise exception 'Repair not found'; end if;
  if v_repair.status<>'ready_collection' then raise exception 'Repair must be ready for collection'; end if;
  if coalesce(v_repair.balance_due,0)>0 then raise exception 'Outstanding repair balance must be cleared before collection'; end if;

  v_has_card := v_repair.current_card_assignment_id is not null;
  if v_has_card then
    select * into v_assignment from public.ops_repair_card_assignments where id=v_repair.current_card_assignment_id and status='active' for update;
    if not found then raise exception 'Active Repair Card assignment not found'; end if;
  end if;

  select exists(select 1 from public.ops_repair_consents where repair_id=p_repair_id and consent_type='completion_acceptance' and (not v_has_card or assignment_id=v_assignment.id)) into v_has_acceptance;
  if not v_has_acceptance then raise exception 'Customer completion acceptance is required before collection'; end if;

  if v_has_card then
    if not coalesce(p_card_returned,false) and nullif(btrim(p_missing_card_reason),'') is null then raise exception 'Missing-card reason is required when the physical card is not returned'; end if;
    v_card_status := case when coalesce(p_card_returned,false) then 'available' else 'missing' end;
    update public.ops_repair_card_assignments set status='closed',closed_by=auth.uid(),closed_at=now(),handover_expires_at=null where id=v_assignment.id;
    update public.ops_repair_portal_sessions set revoked_at=coalesce(revoked_at,now()) where assignment_id=v_assignment.id and revoked_at is null;
    update public.ops_repair_cards set status=v_card_status where id=v_assignment.card_id;
  end if;

  update public.ops_repairs set status='collected',collected_at=now(),current_card_assignment_id=null where id=p_repair_id;
  if v_repair.inventory_unit_id is not null then update public.ops_inventory_units set status='sold' where id=v_repair.inventory_unit_id and status='repair'; end if;
  insert into public.ops_repair_events(repair_id,assignment_id,event_type,title,note,from_status,to_status,customer_visible,actor_id,metadata)
  values(p_repair_id,v_assignment.id,'repair_collected','Repair collected',case when v_has_card and not coalesce(p_card_returned,false) then btrim(p_missing_card_reason) else null end,'ready_collection','collected',true,auth.uid(),jsonb_build_object('card_returned',v_has_card and coalesce(p_card_returned,false),'card_status',v_card_status,'had_repair_card',v_has_card));
  return jsonb_build_object('status','collected','assignment_id',v_assignment.id,'card_status',v_card_status);
end;
$function$;

CREATE OR REPLACE FUNCTION public.ops_confirm_repair_collection(p_repair_id uuid, p_card_returned boolean, p_confirmation_note text, p_missing_card_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_repair public.ops_repairs%rowtype;
  v_assignment public.ops_repair_card_assignments%rowtype;
  v_note text := nullif(btrim(p_confirmation_note), '');
  v_has_card boolean;
begin
  if not public.staff_has_capability('operations.repair.handover') then raise exception 'Not authorized'; end if;
  if v_note is null then raise exception 'A confirmation note is required — record how the customer confirmed collection'; end if;

  select * into v_repair from public.ops_repairs where id = p_repair_id for update;
  if not found then raise exception 'Repair not found'; end if;
  if v_repair.status <> 'ready_collection' then raise exception 'Repair must be ready for collection'; end if;
  if v_repair.identity_id is null then raise exception 'Repair has no linked customer to record consent for'; end if;

  v_has_card := v_repair.current_card_assignment_id is not null;
  if v_has_card then
    select * into v_assignment from public.ops_repair_card_assignments where id = v_repair.current_card_assignment_id and status = 'active' for update;
    if not found then raise exception 'Active Repair Card assignment not found'; end if;
  end if;

  insert into public.ops_repair_consents(repair_id, assignment_id, identity_id, consent_type, consent_version, snapshot)
  values (
    p_repair_id, v_assignment.id, v_repair.identity_id, 'completion_acceptance', 'staff_confirmed_v1',
    jsonb_build_object('confirmed_by_staff', true, 'note', v_note, 'actor_id', auth.uid(), 'confirmed_at', now())
  );

  return public.ops_complete_repair_collection(p_repair_id, p_card_returned, p_missing_card_reason);
end;
$function$;

CREATE OR REPLACE FUNCTION public.ops_release_repair_without_payment(p_repair_id uuid, p_card_returned boolean, p_confirmation_note text, p_missing_card_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_repair public.ops_repairs%rowtype;
  v_assignment public.ops_repair_card_assignments%rowtype;
  v_note text := nullif(btrim(p_confirmation_note), '');
  v_card_status text;
  v_has_card boolean;
begin
  if not public.staff_has_capability('sales.pricing.admin') then raise exception 'Only an authorised administrator can release a repair with an outstanding balance'; end if;
  if v_note is null then raise exception 'A reason is required — record how this release was approved (who approved it, and how)'; end if;

  select * into v_repair from public.ops_repairs where id = p_repair_id for update;
  if not found then raise exception 'Repair not found'; end if;
  if v_repair.status <> 'ready_collection' then raise exception 'Repair must be ready for collection'; end if;
  if v_repair.identity_id is null then raise exception 'Repair has no linked customer to record consent for'; end if;

  v_has_card := v_repair.current_card_assignment_id is not null;
  if v_has_card then
    select * into v_assignment from public.ops_repair_card_assignments where id = v_repair.current_card_assignment_id and status = 'active' for update;
    if not found then raise exception 'Active Repair Card assignment not found'; end if;
    if not coalesce(p_card_returned, false) and nullif(btrim(p_missing_card_reason), '') is null then
      raise exception 'Missing-card reason is required when the physical card is not returned';
    end if;
  end if;

  insert into public.ops_repair_consents(repair_id, assignment_id, identity_id, consent_type, consent_version, snapshot)
  values (
    p_repair_id, v_assignment.id, v_repair.identity_id, 'completion_acceptance', 'admin_override_v1',
    jsonb_build_object('released_without_full_payment', true, 'balance_due_at_release', v_repair.balance_due, 'note', v_note, 'actor_id', auth.uid(), 'confirmed_at', now())
  );

  if v_has_card then
    v_card_status := case when coalesce(p_card_returned, false) then 'available' else 'missing' end;
    update public.ops_repair_card_assignments set status = 'closed', closed_by = auth.uid(), closed_at = now(), handover_expires_at = null where id = v_assignment.id;
    update public.ops_repair_portal_sessions set revoked_at = coalesce(revoked_at, now()) where assignment_id = v_assignment.id and revoked_at is null;
    update public.ops_repair_cards set status = v_card_status where id = v_assignment.card_id;
  end if;

  update public.ops_repairs set status = 'collected', collected_at = now(), current_card_assignment_id = null where id = p_repair_id;
  if v_repair.inventory_unit_id is not null then update public.ops_inventory_units set status = 'sold' where id = v_repair.inventory_unit_id and status = 'repair'; end if;

  insert into public.ops_repair_events(repair_id, assignment_id, event_type, title, note, from_status, to_status, customer_visible, actor_id, metadata)
  values (
    p_repair_id, v_assignment.id, 'repair_collected', 'Repair released by administrator despite outstanding balance', v_note,
    'ready_collection', 'collected', true, auth.uid(),
    jsonb_build_object('card_returned', v_has_card and coalesce(p_card_returned, false), 'card_status', v_card_status, 'balance_due_at_release', v_repair.balance_due, 'admin_override', true, 'had_repair_card', v_has_card)
  );

  return jsonb_build_object('status', 'collected', 'assignment_id', v_assignment.id, 'card_status', v_card_status, 'balance_due_at_release', v_repair.balance_due);
end;
$function$;
