-- Sales corrections, 18 Nov 2026 (owner's list).
--
-- 1. Deleted sales no longer count in Sales stats.
--    sales_commercial_balances and sales_revenue_balances still included orders whose
--    deletion was approved, so Sales Overview, Reports, Sales Team and Customers kept
--    counting them (live: 11 deleted orders, ₦930,009 of fake "outstanding").
--    Both views are recreated with exactly the same columns, plus:
--      • deleted orders are left out;
--      • sales_commercial_balances only shows "outstanding" for confirmed orders (a
--        draft is not money a customer owes).
--    sales_customer_summary is built on sales_revenue_balances, so the Customers page
--    is corrected by the same change. sales_unified_payments already left deleted
--    orders out (migration 20260929050249).
--
-- 2. Every Direct Sale buyer becomes a Referral Card Holder automatically.
--    When a Direct Sale is confirmed, the buyer's name (upper case, as the card
--    holders are written) and phone are added to referral_tracker_cardholders, so
--    front desk can pick them as the referrer the next time they bring someone.
--    A buyer who is already a card holder (same CRM identity, or same phone by the
--    last 10 digits) is not added twice. If another person already holds the same
--    name, the last 4 phone digits are added to the code ("JOHN OKAFOR 1430").
--    This can never block a sale: any problem is logged as a warning and skipped.
--    Existing confirmed Direct Sales (not deleted) are back-filled once, oldest first.
--
-- Rollback: docs/sales/sales-corrections-2026-11-18-rollback.sql

-- ── 1. Stats views ──────────────────────────────────────────────────────────────

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
  case when o.commercial_state = 'confirmed'
    then greatest(coalesce(o.total_amount, 0) - coalesce(p.cash_collected, 0), 0)
    else 0 end::numeric as outstanding,
  coalesce(ip.gross_profit, 0)::numeric as gross_profit
from public.ops_orders o
left join paid p on p.order_id = o.id
left join item_profit ip on ip.order_id = o.id
where o.commercial_state <> 'cancelled'
  and o.deletion_status <> 'deleted';

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
  and o.deletion_status <> 'deleted'
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
'Unified read-only Sales revenue model. Orders remain canonical in ops_orders and Repairs remain canonical in ops_repairs. Deleted orders are left out (2026-11-18).';

-- ── 2. Direct Sale buyer → Referral Card Holder ─────────────────────────────────

create or replace function public.referral_tracker_cardholder_from_order(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order public.ops_orders%rowtype;
  v_name text;
  v_tail text;
  v_code text;
  v_existing uuid;
  v_new_id uuid;
  v_n integer := 1;
begin
  select * into v_order from public.ops_orders where id = p_order_id;
  if not found
     or v_order.sales_channel is distinct from 'direct_sale'
     or v_order.commercial_state is distinct from 'confirmed'
     or v_order.deletion_status = 'deleted' then
    return null;
  end if;

  v_name := upper(regexp_replace(trim(coalesce(v_order.customer_name, '')), '\s+', ' ', 'g'));
  if v_name = '' then
    return null;
  end if;
  v_tail := right(regexp_replace(coalesce(v_order.customer_phone, ''), '\D', '', 'g'), 10);

  -- Already a card holder: same CRM identity, or same phone (last 10 digits).
  select c.id into v_existing
  from public.referral_tracker_cardholders c
  where (v_order.identity_id is not null and c.identity_id = v_order.identity_id)
     or (length(v_tail) >= 7 and right(regexp_replace(coalesce(c.phone_number, ''), '\D', '', 'g'), 10) = v_tail)
  order by c.created_at
  limit 1;

  if v_existing is not null then
    update public.referral_tracker_cardholders
    set identity_id = v_order.identity_id, updated_at = now()
    where id = v_existing and identity_id is null and v_order.identity_id is not null;
    return v_existing;
  end if;

  -- Codes are unique. A different person with the same name gets the last 4 phone
  -- digits added, then a number if that is still taken.
  v_code := v_name;
  if exists (select 1 from public.referral_tracker_cardholders where referral_code = v_code) and length(v_tail) >= 4 then
    v_code := v_name || ' ' || right(v_tail, 4);
  end if;
  while exists (select 1 from public.referral_tracker_cardholders where referral_code = v_code) loop
    v_n := v_n + 1;
    v_code := v_name || ' ' || v_n;
  end loop;

  insert into public.referral_tracker_cardholders (
    referral_code, phone_number, date_card_given, card_status, notes, identity_id, created_by
  ) values (
    v_code,
    nullif(trim(coalesce(v_order.customer_phone, '')), ''),
    (coalesce(v_order.confirmed_at, v_order.created_at) at time zone 'Africa/Lagos')::date,
    'Active',
    'Auto-added from Direct Sale ' || v_order.order_code,
    v_order.identity_id,
    v_order.sales_staff_user_id
  )
  returning id into v_new_id;

  return v_new_id;
end;
$function$;

-- Internal helper: only the trigger (and this migration's back-fill) call it.
revoke all on function public.referral_tracker_cardholder_from_order(uuid) from public, anon, authenticated;
grant execute on function public.referral_tracker_cardholder_from_order(uuid) to service_role;

create or replace function public.referral_tracker_cardholder_on_direct_sale()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.sales_channel = 'direct_sale'
     and new.commercial_state = 'confirmed'
     and new.deletion_status <> 'deleted'
     and (tg_op = 'INSERT' or old.commercial_state is distinct from 'confirmed') then
    begin
      perform public.referral_tracker_cardholder_from_order(new.id);
    exception when others then
      -- Never block a sale because of the referral card list.
      raise warning 'Card holder auto-add skipped for order %: %', new.order_code, sqlerrm;
    end;
  end if;
  return null;
end;
$function$;

revoke all on function public.referral_tracker_cardholder_on_direct_sale() from public, anon, authenticated;

drop trigger if exists referral_tracker_cardholder_on_direct_sale on public.ops_orders;
create trigger referral_tracker_cardholder_on_direct_sale
after insert or update of commercial_state on public.ops_orders
for each row execute function public.referral_tracker_cardholder_on_direct_sale();

-- One-time back-fill: every confirmed, not-deleted Direct Sale so far, oldest first.
do $backfill$
declare
  r record;
begin
  for r in
    select id from public.ops_orders
    where sales_channel = 'direct_sale'
      and commercial_state = 'confirmed'
      and deletion_status <> 'deleted'
    order by coalesce(confirmed_at, created_at), order_code
  loop
    perform public.referral_tracker_cardholder_from_order(r.id);
  end loop;
end
$backfill$;
