-- ops_complete_repair_collection has always required a row in ops_repair_consents
-- (consent_type='completion_acceptance') before it will release a repair, but no
-- function anywhere ever inserted one -- there is no customer self-service portal
-- for repairs (unlike sales quotations). This meant NO repair could ever be marked
-- collected, staff or customer side: a total, confirmed gap.
--
-- This adds the staff-side attestation path: front desk hands the device over in
-- person (or confirms by phone) and records how, then this records that as the
-- completion consent on the customer's behalf and completes the same collection
-- flow ops_complete_repair_collection already implements (balance-clear, active
-- card, card-returned bookkeeping all still enforced there).
CREATE OR REPLACE FUNCTION public.ops_confirm_repair_collection(
  p_repair_id uuid,
  p_card_returned boolean,
  p_confirmation_note text,
  p_missing_card_reason text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_repair public.ops_repairs%rowtype;
  v_assignment public.ops_repair_card_assignments%rowtype;
  v_note text := nullif(btrim(p_confirmation_note), '');
begin
  if not public.staff_has_capability('operations.repair.handover') then raise exception 'Not authorized'; end if;
  if v_note is null then raise exception 'A confirmation note is required — record how the customer confirmed collection'; end if;

  select * into v_repair from public.ops_repairs where id = p_repair_id for update;
  if not found then raise exception 'Repair not found'; end if;
  if v_repair.status <> 'ready_collection' then raise exception 'Repair must be ready for collection'; end if;
  if v_repair.identity_id is null then raise exception 'Repair has no linked customer to record consent for'; end if;
  if v_repair.current_card_assignment_id is null then raise exception 'Repair has no active Repair Card'; end if;

  select * into v_assignment from public.ops_repair_card_assignments where id = v_repair.current_card_assignment_id and status = 'active' for update;
  if not found then raise exception 'Active Repair Card assignment not found'; end if;

  insert into public.ops_repair_consents(repair_id, assignment_id, identity_id, consent_type, consent_version, snapshot)
  values (
    p_repair_id, v_assignment.id, v_repair.identity_id, 'completion_acceptance', 'staff_confirmed_v1',
    jsonb_build_object('confirmed_by_staff', true, 'note', v_note, 'actor_id', auth.uid(), 'confirmed_at', now())
  );

  return public.ops_complete_repair_collection(p_repair_id, p_card_returned, p_missing_card_reason);
end;
$function$;

REVOKE ALL ON FUNCTION public.ops_confirm_repair_collection(uuid, boolean, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ops_confirm_repair_collection(uuid, boolean, text, text) TO authenticated, service_role, postgres;
