-- Batched replacement for calling ops_current_crm_stage() once per matched identity
-- (the identity search N+1 — up to 8 extra sequential round trips per search).
-- Mirrors ops_current_crm_stage's exact per-identity branching in one set-based query:
-- a valid manual override (1-10) wins over the lead-derived stage, but is still compared
-- against the conversion-derived stage; otherwise the lead-derived and conversion-derived
-- values are combined via greatest(), exactly as the scalar function does.
CREATE OR REPLACE FUNCTION public.ops_current_crm_stage_bulk(p_identity_ids uuid[])
RETURNS TABLE(identity_id uuid, stage integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  with ids as (
    select unnest(p_identity_ids) as id
  ),
  manual as (
    select distinct on (m.identity_id)
      m.identity_id,
      case when m.value ~ '^[0-9]+$' then m.value::integer else null end as manual_stage
    from public.crm_manual_updates m
    where lower(m.update_type) = 'funnel_stage'
      and m.identity_id = any(p_identity_ids)
    order by m.identity_id, m.created_at desc
  ),
  agg as (
    select
      ids.id,
      coalesce(max(public.ops_crm_stage_from_slug(l.funnel_stage)), 0) as lead_stage,
      coalesce(max(case when c.approved_at is not null then case when coalesce(c.is_repeat_conversion, false) then 8 else 6 end else 0 end), 0) as conv_stage
    from ids
    left join public.leads l on l.identity_id = ids.id
    left join public.conversions c on c.lead_id = l.id
    group by ids.id
  )
  select
    agg.id,
    case
      when m.manual_stage between 1 and 10 then greatest(m.manual_stage, agg.conv_stage)
      else greatest(agg.lead_stage, agg.conv_stage)
    end as stage
  from agg
  left join manual m on m.identity_id = agg.id;
$function$;

revoke all on function public.ops_current_crm_stage_bulk(uuid[]) from public, anon, authenticated;
grant execute on function public.ops_current_crm_stage_bulk(uuid[]) to service_role, postgres, authenticated;
