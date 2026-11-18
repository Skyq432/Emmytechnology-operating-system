-- Rollback for migration 20261118090000_sales_corrections_deleted_outstanding_cardholders.
-- Puts both stats views back exactly as they were, removes the Direct Sale → Card
-- Holder trigger, and removes the card holders it added — except any that have since
-- been used as a referrer (those stay, because referrals point at them).

drop trigger if exists referral_tracker_cardholder_on_direct_sale on public.ops_orders;
drop function if exists public.referral_tracker_cardholder_on_direct_sale();
drop function if exists public.referral_tracker_cardholder_from_order(uuid);

delete from public.referral_tracker_cardholders c
where c.notes like 'Auto-added from Direct Sale %'
  and not exists (select 1 from public.referral_tracker_referrals r where r.referral_code = c.referral_code);

create or replace view public.sales_commercial_balances
with (security_invoker = true)
as
with paid as (
  select order_id, coalesce(sum(amount) filter (where not is_void), 0)::numeric as cash_collected
  from public.ops_order_payments
  group by order_id
), item_profit as (
  select order_id, coalesce(sum(gross_profit), 0)::numeric as gross_profit
  from public.ops_order_items
  group by order_id
)
select
  o.id as order_id,
  o.order_code,
  o.identity_id,
  o.sales_channel,
  o.sales_staff_user_id,
  o.sales_staff_name,
  o.commercial_state,
  o.created_at,
  o.confirmed_at,
  case when o.commercial_state = 'confirmed' then coalesce(o.total_amount, 0) else 0 end::numeric as sales_value,
  coalesce(p.cash_collected, 0)::numeric as cash_collected,
  greatest(coalesce(o.total_amount, 0) - coalesce(p.cash_collected, 0), 0)::numeric as outstanding,
  coalesce(ip.gross_profit, 0)::numeric as gross_profit
from public.ops_orders o
left join paid p on p.order_id = o.id
left join item_profit ip on ip.order_id = o.id
where o.commercial_state <> 'cancelled';

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

comment on view public.sales_revenue_balances is
'Unified read-only Sales revenue model. Orders remain canonical in ops_orders and Repairs remain canonical in ops_repairs.';
