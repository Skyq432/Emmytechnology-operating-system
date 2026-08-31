-- Unified Sales revenue reporting across shared Orders/Direct Sales and Operations Repairs.
-- This is a read model only; it does not duplicate canonical transactions or payments.

create or replace view public.sales_revenue_balances
with (security_invoker = true)
as
with order_paid as (
  select order_id,coalesce(sum(amount) filter(where not is_void),0)::numeric as cash_collected
  from public.ops_order_payments group by order_id
), order_profit as (
  select order_id,coalesce(sum(gross_profit),0)::numeric as gross_profit
  from public.ops_order_items group by order_id
), repair_paid as (
  select repair_id,coalesce(sum(amount) filter(where not is_void),0)::numeric as cash_collected
  from public.ops_repair_payments group by repair_id
), repair_quote as (
  select q.id,q.approved_at from public.ops_repair_quotes q
)
select
  'order'::text as source_type,
  o.id as source_id,
  o.order_code as source_code,
  o.identity_id,
  o.sales_channel,
  o.sales_staff_user_id,
  o.sales_staff_name,
  o.confirmed_at as commercial_at,
  coalesce(o.total_amount,0)::numeric as sales_value,
  coalesce(p.cash_collected,0)::numeric as cash_collected,
  greatest(coalesce(o.total_amount,0)-coalesce(p.cash_collected,0),0)::numeric as outstanding,
  coalesce(ip.gross_profit,0)::numeric as gross_profit
from public.ops_orders o
left join order_paid p on p.order_id=o.id
left join order_profit ip on ip.order_id=o.id
where o.commercial_state='confirmed'
union all
select
  'repair'::text as source_type,
  r.id as source_id,
  r.repair_code as source_code,
  r.identity_id,
  'repair'::text as sales_channel,
  null::uuid as sales_staff_user_id,
  null::text as sales_staff_name,
  coalesce(q.approved_at,r.received_at) as commercial_at,
  coalesce(r.amount_charged,0)::numeric as sales_value,
  coalesce(p.cash_collected,0)::numeric as cash_collected,
  greatest(coalesce(r.amount_charged,0)-coalesce(p.cash_collected,0),0)::numeric as outstanding,
  coalesce(r.repair_profit,coalesce(r.amount_charged,0)-coalesce(r.parts_cost,0)-coalesce(r.labour_cost,0))::numeric as gross_profit
from public.ops_repairs r
left join repair_paid p on p.repair_id=r.id
left join repair_quote q on q.id=r.current_quote_id
where coalesce(r.amount_charged,0)>0
  and r.status not in ('received','diagnosing','awaiting_customer_approval','cancelled');

revoke all on public.sales_revenue_balances from anon;
grant select on public.sales_revenue_balances to authenticated;

comment on view public.sales_revenue_balances is
'Unified read-only Sales revenue model. Orders remain canonical in ops_orders and Repairs remain canonical in ops_repairs.';
