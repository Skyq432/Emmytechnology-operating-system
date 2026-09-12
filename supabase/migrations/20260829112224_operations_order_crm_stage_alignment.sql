create or replace function public.ops_current_crm_stage(p_identity_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_manual integer := null;
  v_computed integer := 0;
  v_conversion integer := 0;
begin
  if p_identity_id is null then return 0; end if;

  select case when value ~ '^[0-9]+$' then value::integer else null end
  into v_manual
  from public.crm_manual_updates
  where identity_id = p_identity_id
    and lower(update_type) = 'funnel_stage'
  order by created_at desc
  limit 1;

  select greatest(
    coalesce(max(public.ops_crm_stage_from_slug(l.funnel_stage)), 0),
    coalesce(max(case when c.approved_at is not null then case when coalesce(c.is_repeat_conversion,false) then 8 else 6 end else 0 end), 0)
  )
  into v_computed
  from public.leads l
  left join public.conversions c on c.lead_id = l.id
  where l.identity_id = p_identity_id;

  select coalesce(max(case when c.approved_at is not null then case when coalesce(c.is_repeat_conversion,false) then 8 else 6 end else 0 end),0)
  into v_conversion
  from public.conversions c
  join public.leads l on l.id=c.lead_id
  where l.identity_id=p_identity_id;

  if v_manual between 1 and 10 then
    return greatest(v_manual, v_conversion);
  end if;

  return coalesce(v_computed,0);
end;
$$;
