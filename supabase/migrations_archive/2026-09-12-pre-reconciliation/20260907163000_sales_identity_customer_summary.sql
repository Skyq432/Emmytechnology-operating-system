-- Shared Sales/CRM identity support and scalable customer commercial summary.

insert into public.identity_signal_weights (signal_type, weight)
values ('address', 15)
on conflict (signal_type) do update set weight = excluded.weight;

create or replace view public.sales_customer_summary as
select
  i.id,
  i.identity_code,
  i.primary_name,
  i.primary_phone,
  i.primary_email,
  coalesce(r.sales_value,0)::numeric as sales_value,
  coalesce(r.cash_collected,0)::numeric as cash_collected,
  coalesce(r.outstanding,0)::numeric as outstanding,
  coalesce(r.gross_profit,0)::numeric as gross_profit,
  coalesce(r.repair_transactions,0)::bigint as repair_transactions,
  coalesce(q.quotations,0)::bigint as quotations,
  coalesce(q.accepted_quotations,0)::bigint as accepted_quotations
from public.identities i
left join (
  select identity_id,
    sum(sales_value) sales_value,
    sum(cash_collected) cash_collected,
    sum(outstanding) outstanding,
    sum(gross_profit) gross_profit,
    count(*) filter (where source_type='repair') repair_transactions
  from public.sales_revenue_balances
  where identity_id is not null
  group by identity_id
) r on r.identity_id=i.id
left join (
  select identity_id,
    count(*) quotations,
    count(*) filter (where status in ('accepted','converted')) accepted_quotations
  from public.sales_quotations
  where identity_id is not null
  group by identity_id
) q on q.identity_id=i.id
where coalesce(r.sales_value,0) > 0 or coalesce(q.quotations,0) > 0;

revoke all on public.sales_customer_summary from anon;
grant select on public.sales_customer_summary to authenticated;
