-- There was previously no path anywhere — staff or customer — that ever moved a
-- published repair quote to 'approved'. Once a quote was published, the repair was
-- permanently stuck at 'awaiting_customer_approval' with only Cancel available.
-- This adds the staff-side approval path: many customers confirm by phone, not a
-- self-service portal, so approval requires a mandatory confirmation note (how/when
-- the customer was reached and what they agreed to) rather than a bare button.
CREATE OR REPLACE FUNCTION public.ops_approve_repair_quote(p_repair_id uuid, p_confirmation_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_repair public.ops_repairs%rowtype;
  v_quote public.ops_repair_quotes%rowtype;
  v_note text := nullif(btrim(p_confirmation_note), '');
begin
  if not public.staff_has_capability('operations.repair.finance') then raise exception 'Not authorized'; end if;
  if v_note is null then raise exception 'A confirmation note is required — record how and when the customer confirmed'; end if;

  select * into v_repair from public.ops_repairs where id = p_repair_id for update;
  if not found then raise exception 'Repair not found'; end if;
  if v_repair.current_quote_id is null then raise exception 'Repair has no current quote to approve'; end if;

  select * into v_quote from public.ops_repair_quotes where id = v_repair.current_quote_id for update;
  if not found or v_quote.status <> 'published' then raise exception 'Current quote is not awaiting approval'; end if;

  update public.ops_repair_quotes set status = 'approved' where id = v_quote.id;

  insert into public.ops_repair_events(repair_id, assignment_id, event_type, title, note, customer_visible, actor_id, metadata)
  values (p_repair_id, v_repair.current_card_assignment_id, 'quote_approved', 'Repair quote approved (customer confirmed by staff)', v_note, true, auth.uid(), jsonb_build_object('quote_id', v_quote.id, 'version', v_quote.version));

  return jsonb_build_object('quote_id', v_quote.id, 'status', 'approved');
end;
$function$;

revoke all on function public.ops_approve_repair_quote(uuid, text) from public, anon;
grant execute on function public.ops_approve_repair_quote(uuid, text) to authenticated, service_role, postgres;
