-- enrich_identity_from_lead() already exists and correctly syncs a lead's
-- customer_name/phone/email into identity_signals + identities.primary_*
-- (via coalesce, so it never overwrites known data). It was simply never
-- called by any of the lead-creation/update paths. This trigger wires it
-- in for every future insert/update that touches contact fields, so the
-- sync gap can't recur regardless of which code path writes the lead.
create or replace function public.trg_enrich_identity_from_lead()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.enrich_identity_from_lead(new.id, 'lead_trigger');
  return new;
end;
$$;

drop trigger if exists leads_enrich_identity on public.leads;

create trigger leads_enrich_identity
after insert or update of customer_name, customer_phone, customer_email
on public.leads
for each row
execute function public.trg_enrich_identity_from_lead();
