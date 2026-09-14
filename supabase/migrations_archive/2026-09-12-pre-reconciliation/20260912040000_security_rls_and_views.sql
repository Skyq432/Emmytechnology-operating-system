-- Security remediation: exposed REST tables and SECURITY DEFINER views.
-- This file is committed before production application. After application via
-- Supabase, it will be renamed to the exact live migration version recorded by
-- supabase_migrations.schema_migrations so migration history remains aligned.

-- ---------------------------------------------------------------------------
-- 1. Enable RLS on all 41 tables identified by the security review.
-- ---------------------------------------------------------------------------

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'ambassador_bonuses',
    'identities',
    'identity_signals',
    'identity_events',
    'identity_signal_weights',
    'identity_ambassador_conflicts',
    'identity_match_suggestions',
    'lead_events',
    'lead_signals',
    'product_interests',
    'referral_route_logs',
    'admin_notifications',
    'crm_notifications',
    'crm_audit_logs',
    'crm_followups',
    'crm_communications',
    'crm_files',
    'crm_quote_items',
    'crm_funnel_stages',
    'crm_funnel_events',
    'crm_quotes',
    'crm_products',
    'crm_sale_items',
    'crm_sales',
    'crm_invoices',
    'crm_receipts',
    'conversation_message_bank',
    'spin_user_prizes',
    'spin_players',
    'spin_cashout_requests',
    'spin_prizes',
    'spin_dm_clicks',
    'spin_referrals',
    'spin_logs',
    'spin_game_settings',
    'spin_letter_segments',
    'spin_rule_groups',
    'spin_rule_items',
    'spin_transactions',
    'spin_user_rule_usage',
    'spin_referral_awards'
  ]
  loop
    execute format('alter table public.%I enable row level security', v_table);
    -- Guest Spin Wheel and public tracking use RPC/server-side service-role
    -- paths. No reviewed table needs direct anonymous REST access.
    execute format('revoke all on table public.%I from anon', v_table);
  end loop;
end
$$;

-- Common internal-read predicate used below:
--   Marketing/CRM staff OR Sales/Operations staff with a read capability.
-- Together these roles correspond to the currently exposed internal CRM users.

-- ---------------------------------------------------------------------------
-- 2. Ambassador/Marketing programme tables.
-- ---------------------------------------------------------------------------

drop policy if exists "marketing staff read ambassador bonuses" on public.ambassador_bonuses;
create policy "marketing staff read ambassador bonuses"
on public.ambassador_bonuses
for select to authenticated
using (public.is_marketing_staff());

drop policy if exists "internal staff read identities" on public.identities;
create policy "internal staff read identities"
on public.identities
for select to authenticated
using (
  public.is_marketing_staff()
  or public.staff_has_any_capability(array['sales.read','operations.read']::text[])
);

drop policy if exists "internal staff read identity signals" on public.identity_signals;
create policy "internal staff read identity signals"
on public.identity_signals
for select to authenticated
using (
  public.is_marketing_staff()
  or public.staff_has_any_capability(array['sales.read','operations.read']::text[])
);

drop policy if exists "internal staff read identity events" on public.identity_events;
create policy "internal staff read identity events"
on public.identity_events
for select to authenticated
using (
  public.is_marketing_staff()
  or public.staff_has_any_capability(array['sales.read','operations.read']::text[])
);

drop policy if exists "internal staff read identity signal weights" on public.identity_signal_weights;
create policy "internal staff read identity signal weights"
on public.identity_signal_weights
for select to authenticated
using (
  public.is_marketing_staff()
  or public.staff_has_any_capability(array['sales.read','operations.read']::text[])
);

drop policy if exists "marketing staff read identity ambassador conflicts" on public.identity_ambassador_conflicts;
create policy "marketing staff read identity ambassador conflicts"
on public.identity_ambassador_conflicts
for select to authenticated
using (public.is_marketing_staff());

drop policy if exists "marketing staff read identity match suggestions" on public.identity_match_suggestions;
create policy "marketing staff read identity match suggestions"
on public.identity_match_suggestions
for select to authenticated
using (public.is_marketing_staff());

drop policy if exists "marketing staff read lead events" on public.lead_events;
create policy "marketing staff read lead events"
on public.lead_events
for select to authenticated
using (public.is_marketing_staff());

drop policy if exists "internal staff read lead signals" on public.lead_signals;
create policy "internal staff read lead signals"
on public.lead_signals
for select to authenticated
using (
  public.is_marketing_staff()
  or public.staff_has_any_capability(array['sales.read','operations.read']::text[])
);

drop policy if exists "internal staff read product interests" on public.product_interests;
create policy "internal staff read product interests"
on public.product_interests
for select to authenticated
using (
  public.is_marketing_staff()
  or public.staff_has_any_capability(array['sales.read','operations.read']::text[])
);

drop policy if exists "marketing staff read referral route logs" on public.referral_route_logs;
create policy "marketing staff read referral route logs"
on public.referral_route_logs
for select to authenticated
using (public.is_marketing_staff());

-- Admin notifications are Marketing/Admin workflow data. Direct clients only
-- need to read and mark the read flag; inserts remain backend/RPC only.
drop policy if exists "marketing staff read admin notifications" on public.admin_notifications;
create policy "marketing staff read admin notifications"
on public.admin_notifications
for select to authenticated
using (public.is_marketing_staff());

drop policy if exists "marketing staff mark admin notifications read" on public.admin_notifications;
create policy "marketing staff mark admin notifications read"
on public.admin_notifications
for update to authenticated
using (public.is_marketing_staff())
with check (public.is_marketing_staff());

revoke update on table public.admin_notifications from authenticated;
grant update (is_read) on table public.admin_notifications to authenticated;

-- ---------------------------------------------------------------------------
-- 3. CRM tables.
-- ---------------------------------------------------------------------------

-- CRM notifications are recipient-private; administrators may inspect all.
drop policy if exists "crm notification recipients read" on public.crm_notifications;
create policy "crm notification recipients read"
on public.crm_notifications
for select to authenticated
using (created_for = auth.uid() or public.is_admin());

drop policy if exists "crm notification recipients update read state" on public.crm_notifications;
create policy "crm notification recipients update read state"
on public.crm_notifications
for update to authenticated
using (created_for = auth.uid() or public.is_admin())
with check (created_for = auth.uid() or public.is_admin());

revoke update on table public.crm_notifications from authenticated;
grant update (status, read_at) on table public.crm_notifications to authenticated;

-- Audit records are management-only and are written through backend/RPC paths.
drop policy if exists "admins read crm audit logs" on public.crm_audit_logs;
create policy "admins read crm audit logs"
on public.crm_audit_logs
for select to authenticated
using (public.is_admin());

-- Non-financial CRM context is readable by internal CRM users. Mutations remain
-- through audited RPC/backend paths rather than direct REST writes.
drop policy if exists "internal staff read crm followups" on public.crm_followups;
create policy "internal staff read crm followups"
on public.crm_followups
for select to authenticated
using (
  public.is_marketing_staff()
  or public.staff_has_any_capability(array['sales.read','operations.read']::text[])
);

drop policy if exists "internal staff read crm communications" on public.crm_communications;
create policy "internal staff read crm communications"
on public.crm_communications
for select to authenticated
using (
  public.is_marketing_staff()
  or public.staff_has_any_capability(array['sales.read','operations.read']::text[])
);

drop policy if exists "internal staff read crm files" on public.crm_files;
create policy "internal staff read crm files"
on public.crm_files
for select to authenticated
using (
  public.is_marketing_staff()
  or public.staff_has_any_capability(array['sales.read','operations.read']::text[])
);

drop policy if exists "internal staff read crm funnel stages" on public.crm_funnel_stages;
create policy "internal staff read crm funnel stages"
on public.crm_funnel_stages
for select to authenticated
using (
  public.is_marketing_staff()
  or public.staff_has_any_capability(array['sales.read','operations.read']::text[])
);

drop policy if exists "internal staff read crm funnel events" on public.crm_funnel_events;
create policy "internal staff read crm funnel events"
on public.crm_funnel_events
for select to authenticated
using (
  public.is_marketing_staff()
  or public.staff_has_any_capability(array['sales.read','operations.read']::text[])
);

drop policy if exists "internal staff read crm products" on public.crm_products;
create policy "internal staff read crm products"
on public.crm_products
for select to authenticated
using (
  public.is_marketing_staff()
  or public.staff_has_any_capability(array['sales.read','operations.read']::text[])
);

-- Commercial/financial CRM records require Sales read authority. Direct writes
-- are intentionally omitted; existing Sales/Operations RPCs enforce mutation
-- capabilities and service-role server routes remain unaffected by RLS.
drop policy if exists "sales staff read crm quotes" on public.crm_quotes;
create policy "sales staff read crm quotes"
on public.crm_quotes
for select to authenticated
using (public.staff_has_capability('sales.read'));

drop policy if exists "sales staff read crm quote items" on public.crm_quote_items;
create policy "sales staff read crm quote items"
on public.crm_quote_items
for select to authenticated
using (public.staff_has_capability('sales.read'));

drop policy if exists "sales staff read crm sales" on public.crm_sales;
create policy "sales staff read crm sales"
on public.crm_sales
for select to authenticated
using (public.staff_has_capability('sales.read'));

drop policy if exists "sales staff read crm sale items" on public.crm_sale_items;
create policy "sales staff read crm sale items"
on public.crm_sale_items
for select to authenticated
using (public.staff_has_capability('sales.read'));

drop policy if exists "sales staff read crm invoices" on public.crm_invoices;
create policy "sales staff read crm invoices"
on public.crm_invoices
for select to authenticated
using (public.staff_has_capability('sales.read'));

drop policy if exists "sales staff read crm receipts" on public.crm_receipts;
create policy "sales staff read crm receipts"
on public.crm_receipts
for select to authenticated
using (public.staff_has_capability('sales.read'));

-- Message-bank content is Marketing-owned. Its current application management
-- path is server-side, so authenticated clients only require read access.
drop policy if exists "marketing staff read conversation message bank" on public.conversation_message_bank;
create policy "marketing staff read conversation message bank"
on public.conversation_message_bank
for select to authenticated
using (public.is_marketing_staff());

-- ---------------------------------------------------------------------------
-- 4. Spin/Cash-Off tables.
-- ---------------------------------------------------------------------------
-- Spin players are guests rather than authenticated users, so there is no safe
-- auth.uid()-to-player ownership key. Public gameplay therefore stays behind
-- canonical wheel RPCs / server service-role routes. Direct REST access is
-- Marketing staff read-only.

drop policy if exists "marketing staff read spin user prizes" on public.spin_user_prizes;
create policy "marketing staff read spin user prizes" on public.spin_user_prizes
for select to authenticated using (public.is_marketing_staff());

drop policy if exists "marketing staff read spin players" on public.spin_players;
create policy "marketing staff read spin players" on public.spin_players
for select to authenticated using (public.is_marketing_staff());

drop policy if exists "marketing staff read spin cashout requests" on public.spin_cashout_requests;
create policy "marketing staff read spin cashout requests" on public.spin_cashout_requests
for select to authenticated using (public.is_marketing_staff());

drop policy if exists "marketing staff read spin prizes" on public.spin_prizes;
create policy "marketing staff read spin prizes" on public.spin_prizes
for select to authenticated using (public.is_marketing_staff());

drop policy if exists "marketing staff read spin dm clicks" on public.spin_dm_clicks;
create policy "marketing staff read spin dm clicks" on public.spin_dm_clicks
for select to authenticated using (public.is_marketing_staff());

drop policy if exists "marketing staff read spin referrals" on public.spin_referrals;
create policy "marketing staff read spin referrals" on public.spin_referrals
for select to authenticated using (public.is_marketing_staff());

drop policy if exists "marketing staff read spin logs" on public.spin_logs;
create policy "marketing staff read spin logs" on public.spin_logs
for select to authenticated using (public.is_marketing_staff());

drop policy if exists "marketing staff read spin game settings" on public.spin_game_settings;
create policy "marketing staff read spin game settings" on public.spin_game_settings
for select to authenticated using (public.is_marketing_staff());

drop policy if exists "marketing staff read spin letter segments" on public.spin_letter_segments;
create policy "marketing staff read spin letter segments" on public.spin_letter_segments
for select to authenticated using (public.is_marketing_staff());

drop policy if exists "marketing staff read spin rule groups" on public.spin_rule_groups;
create policy "marketing staff read spin rule groups" on public.spin_rule_groups
for select to authenticated using (public.is_marketing_staff());

drop policy if exists "marketing staff read spin rule items" on public.spin_rule_items;
create policy "marketing staff read spin rule items" on public.spin_rule_items
for select to authenticated using (public.is_marketing_staff());

drop policy if exists "marketing staff read spin transactions" on public.spin_transactions;
create policy "marketing staff read spin transactions" on public.spin_transactions
for select to authenticated using (public.is_marketing_staff());

drop policy if exists "marketing staff read spin user rule usage" on public.spin_user_rule_usage;
create policy "marketing staff read spin user rule usage" on public.spin_user_rule_usage
for select to authenticated using (public.is_marketing_staff());

drop policy if exists "marketing staff read spin referral awards" on public.spin_referral_awards;
create policy "marketing staff read spin referral awards" on public.spin_referral_awards
for select to authenticated using (public.is_marketing_staff());

-- ---------------------------------------------------------------------------
-- 5. SECURITY DEFINER views -> caller-RLS-aware SECURITY INVOKER views.
-- ---------------------------------------------------------------------------

alter view public.identity_lifetime_value set (security_invoker = true);
alter view public.leaderboard set (security_invoker = true);
alter view public.sms_campaign_recipient_details set (security_invoker = true);
alter view public.sales_customer_summary set (security_invoker = true);

-- The SMS detail view would remain effectively public if these two legacy base
-- table policies stayed anonymous. SMS dashboard data is internal Marketing
-- data, so replace blanket anon access with Marketing-staff access.
drop policy if exists "sms dashboard insert recipients" on public.sms_campaign_recipients;
drop policy if exists "sms dashboard read recipients" on public.sms_campaign_recipients;
drop policy if exists "sms dashboard update recipients" on public.sms_campaign_recipients;
drop policy if exists "sms dashboard read leads" on public.sms_leads;
drop policy if exists "sms dashboard update leads" on public.sms_leads;

revoke all on table public.sms_campaign_recipients from anon;
revoke all on table public.sms_leads from anon;

drop policy if exists "marketing staff read sms campaign recipients" on public.sms_campaign_recipients;
create policy "marketing staff read sms campaign recipients"
on public.sms_campaign_recipients
for select to authenticated
using (public.is_marketing_staff());

drop policy if exists "marketing staff manage sms campaign recipients" on public.sms_campaign_recipients;
create policy "marketing staff manage sms campaign recipients"
on public.sms_campaign_recipients
for all to authenticated
using (public.is_marketing_staff())
with check (public.is_marketing_staff());

drop policy if exists "marketing staff read sms leads" on public.sms_leads;
create policy "marketing staff read sms leads"
on public.sms_leads
for select to authenticated
using (public.is_marketing_staff());

drop policy if exists "marketing staff update sms leads" on public.sms_leads;
create policy "marketing staff update sms leads"
on public.sms_leads
for update to authenticated
using (public.is_marketing_staff())
with check (public.is_marketing_staff());
