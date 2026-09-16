-- Staff-side collection (ops_confirm_repair_collection, added previously) still refuses
-- to release a repair while balance_due > 0, same as the customer-portal path it
-- replaces -- correctly, since normal collection should require payment first.
-- But the user asked for a genuine exception path: an administrator can approve
-- releasing a device despite an outstanding balance (e.g. confirmed by phone that
-- the customer will settle later), distinct from the everyday front-desk collection
-- flow. Gated by 'sales.pricing.admin' -- this codebase's existing "only an
-- authorised administrator" capability, already used the same way for pricing
-- exceptions (held only by admin/super_admin, not front_desk/growth_lead/etc).
--
-- This intentionally duplicates ops_complete_repair_collection's completion
-- mechanics rather than parameterising that function, so the ordinary collection
-- path's guarantees (balance must be zero) can never be accidentally weakened by
-- a future change to a shared helper -- the two paths stay independently readable.
CREATE OR REPLACE FUNCTION public.ops_release_repair_without_payment(
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
  v_card_status text;
begin
  if not public.staff_has_capability('sales.pricing.admin') then raise exception 'Only an authorised administrator can release a repair with an outstanding balance'; end if;
  if v_note is null then raise exception 'A reason is required — record how this release was approved (who approved it, and how)'; end if;

  select * into v_repair from public.ops_repairs where id = p_repair_id for update;
  if not found then raise exception 'Repair not found'; end if;
  if v_repair.status <> 'ready_collection' then raise exception 'Repair must be ready for collection'; end if;
  if v_repair.identity_id is null then raise exception 'Repair has no linked customer to record consent for'; end if;
  if v_repair.current_card_assignment_id is null then raise exception 'Repair has no active Repair Card'; end if;

  select * into v_assignment from public.ops_repair_card_assignments where id = v_repair.current_card_assignment_id and status = 'active' for update;
  if not found then raise exception 'Active Repair Card assignment not found'; end if;
  if not coalesce(p_card_returned, false) and nullif(btrim(p_missing_card_reason), '') is null then
    raise exception 'Missing-card reason is required when the physical card is not returned';
  end if;

  insert into public.ops_repair_consents(repair_id, assignment_id, identity_id, consent_type, consent_version, snapshot)
  values (
    p_repair_id, v_assignment.id, v_repair.identity_id, 'completion_acceptance', 'admin_override_v1',
    jsonb_build_object('released_without_full_payment', true, 'balance_due_at_release', v_repair.balance_due, 'note', v_note, 'actor_id', auth.uid(), 'confirmed_at', now())
  );

  v_card_status := case when coalesce(p_card_returned, false) then 'available' else 'missing' end;
  update public.ops_repair_card_assignments set status = 'closed', closed_by = auth.uid(), closed_at = now(), handover_expires_at = null where id = v_assignment.id;
  update public.ops_repair_portal_sessions set revoked_at = coalesce(revoked_at, now()) where assignment_id = v_assignment.id and revoked_at is null;
  update public.ops_repair_cards set status = v_card_status where id = v_assignment.card_id;
  update public.ops_repairs set status = 'collected', collected_at = now(), current_card_assignment_id = null where id = p_repair_id;
  if v_repair.inventory_unit_id is not null then update public.ops_inventory_units set status = 'sold' where id = v_repair.inventory_unit_id and status = 'repair'; end if;

  insert into public.ops_repair_events(repair_id, assignment_id, event_type, title, note, from_status, to_status, customer_visible, actor_id, metadata)
  values (
    p_repair_id, v_assignment.id, 'repair_collected', 'Repair released by administrator despite outstanding balance', v_note,
    'ready_collection', 'collected', true, auth.uid(),
    jsonb_build_object('card_returned', coalesce(p_card_returned, false), 'card_status', v_card_status, 'balance_due_at_release', v_repair.balance_due, 'admin_override', true)
  );

  return jsonb_build_object('status', 'collected', 'assignment_id', v_assignment.id, 'card_status', v_card_status, 'balance_due_at_release', v_repair.balance_due);
end;
$function$;

REVOKE ALL ON FUNCTION public.ops_release_repair_without_payment(uuid, boolean, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ops_release_repair_without_payment(uuid, boolean, text, text) TO authenticated, service_role, postgres;
