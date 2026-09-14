# Supabase Security Review — 2026-09-12

Project: `autndhyvgfndaiahonlx` (`Emmytech ambassadors`)

This report documents the production security changes made from the security branch. It is intended to be reviewed before merge.

## 1. RLS remediation

RLS is now enabled on all 41 tables identified by the review. Direct anonymous table grants were removed from all 41. Public Spin Wheel/visitor behavior continues through constrained RPCs and service-role server routes rather than direct REST table access.

### Marketing-only read policies

The following tables have authenticated `SELECT` policies using `public.is_marketing_staff()`:

- `ambassador_bonuses`
- `identity_ambassador_conflicts`
- `identity_match_suggestions`
- `lead_events`
- `referral_route_logs`
- `conversation_message_bank`
- `spin_user_prizes`
- `spin_players`
- `spin_cashout_requests`
- `spin_prizes`
- `spin_dm_clicks`
- `spin_referrals`
- `spin_logs`
- `spin_game_settings`
- `spin_letter_segments`
- `spin_rule_groups`
- `spin_rule_items`
- `spin_transactions`
- `spin_user_rule_usage`
- `spin_referral_awards`

### Internal CRM/Sales/Operations read policies

The following tables are readable by Marketing staff or staff with `sales.read` / `operations.read`:

`public.is_marketing_staff() OR public.staff_has_any_capability(ARRAY['sales.read','operations.read'])`

- `identities`
- `identity_signals`
- `identity_events`
- `identity_signal_weights`
- `lead_signals`
- `product_interests`
- `crm_followups`
- `crm_communications`
- `crm_files`
- `crm_funnel_stages`
- `crm_funnel_events`
- `crm_products`

### Sales-commercial read policies

The following tables require `public.staff_has_capability('sales.read')` for direct authenticated reads:

- `crm_quotes`
- `crm_quote_items`
- `crm_sales`
- `crm_sale_items`
- `crm_invoices`
- `crm_receipts`

Direct write policies were intentionally not added to these commercial/financial tables. Sales/Operations writes remain behind guarded RPCs or service-role server paths.

### `admin_notifications`

- `SELECT`: Marketing staff only.
- `UPDATE`: Marketing staff only.
- authenticated table UPDATE privilege was removed and re-granted only on column `is_read`.

### `crm_notifications`

- `SELECT`: `created_for = auth.uid()` or Admin/Super Admin via `is_admin()`.
- `UPDATE`: same recipient/admin predicate.
- authenticated table UPDATE privilege was narrowed to columns `status` and `read_at`.

### `crm_audit_logs`

- `SELECT`: Admin/Super Admin only via `is_admin()`.
- no direct authenticated write policy.

### Spin Wheel ownership decision

The Spin Wheel users are guest identities, not Supabase Auth users, so `auth.uid()` cannot be used as an honest ownership boundary for `spin_players` and related tables. Rather than introducing an insecure pseudo-owner policy, anonymous direct table REST access was removed. Existing guest behavior remains behind the canonical wheel/session/handoff RPCs, which use visitor/session/handoff tokens and request idempotency where appropriate.

## 2. SMS base-table hardening required by invoker views

The review requested `sms_campaign_recipient_details` become caller-RLS-aware. Its underlying SMS tables had legacy anonymous policies, so those were also corrected; otherwise changing the view alone would not secure the data.

### `sms_campaign_recipients`

Removed legacy anon policies:
- `sms dashboard insert recipients`
- `sms dashboard read recipients`
- `sms dashboard update recipients`

Removed anonymous table privileges.

Added authenticated Marketing policies:
- Marketing staff read recipients.
- Marketing staff manage recipients.

### `sms_leads`

Removed legacy anon policies:
- `sms dashboard read leads`
- `sms dashboard update leads`

Removed anonymous table privileges.

Added authenticated Marketing policies:
- Marketing staff read leads.
- Marketing staff update leads.

Public SMS click/handoff flows remain RPC-based.

## 3. SECURITY DEFINER views

All four reviewed views now have `security_invoker=true`:

- `identity_lifetime_value`
- `leaderboard`
- `sms_campaign_recipient_details`
- `sales_customer_summary`

Catalog verification confirmed the setting on all four views.

## 4. Named SECURITY DEFINER function audit

### `process_payout`

Status: **hardened, authenticated-only**.

Added/confirmed:
- supplied `p_admin_id` must equal `auth.uid()`;
- caller must pass `is_admin()`;
- payout amount must be positive;
- ambassador row is locked before balance mutation;
- insufficient-balance check;
- audit actor is `auth.uid()`.

### `admin_add_ambassador_bonus`

Status: **hardened, authenticated-only**.

Added:
- `p_admin_id = auth.uid()` binding;
- `is_admin()` requirement;
- positive amount validation;
- audit actor uses `auth.uid()`.

### `hard_delete_ambassador`

Status: **hardened, authenticated-only**.

Changed legacy literal-admin behavior to `is_admin()`, so both Admin/Super Admin semantics are respected by the centralized database role helper.

### `set_staff_role`

Status: **confirmed guarded, authenticated-only**.

Existing implementation derives/checks the caller through `auth.uid()` and verifies administrator authority before changing roles. Anonymous execution is removed.

### `remove_ambassador_on_admin`

Status: **direct execution revoked**.

This is a trigger/helper routine, not an API. EXECUTE is revoked from `PUBLIC`, `anon`, and `authenticated`.

### `admin_create_conversion`

Status: **hardened, authenticated-only**.

Added:
- supplied `p_admin_id` must match `auth.uid()`;
- caller must pass `is_marketing_staff()`;
- audit actor is the authenticated user.

### `merge_identities`

Status: **direct execution revoked**.

The legacy routine trusted a caller-supplied admin UUID. The current UI uses the separately guarded explained-merge workflow, so this primitive is now backend/service-role only. EXECUTE is revoked from `PUBLIC`, `anon`, and `authenticated`.

### `ops_record_order_payment`

Status: **confirmed guarded, authenticated-only**.

Existing body requires `staff_has_capability('sales.payment.record')`.

### `ops_record_repair_payment`

Status: **confirmed guarded, authenticated-only**.

Existing body requires `staff_has_capability('operations.repair.finance')`.

### `sales_record_refund`

Status: **confirmed guarded, authenticated-only**.

Existing body checks `ops_is_admin()` before privileged action.

### `sales_void_document`

Status: **confirmed guarded, authenticated-only**.

Existing body checks `ops_is_admin()`.

### `sales_approve_return`

Status: **confirmed guarded, authenticated-only**.

Existing body checks `ops_is_admin()`.

### `sales_approve_credit_release`

Status: **confirmed guarded, authenticated-only**.

Existing body checks `ops_is_admin()`.

## 5. Additional legacy privileged RPC fixes

The audit found older Marketing/Admin functions that accepted a `p_admin_id` argument without binding it to the actual authenticated session. These were corrected as part of the same forward security migration:

Authenticated Marketing staff (`p_admin_id = auth.uid()` + `is_marketing_staff()`):
- `admin_create_lead`
- `approve_lead_edit_request`
- `reject_lead_edit_request`
- `approve_lead_for_ambassador`
- `reject_lead_for_ambassador`

Authenticated Admin/Super Admin (`p_admin_id = auth.uid()` + `is_admin()`):
- `resolve_conversion_no_commission`
- `add_commission_to_conversion`

## 6. SECURITY DEFINER EXECUTE surface

Before remediation, the database exposed approximately:
- 141 SECURITY DEFINER routines to `anon`;
- 165 SECURITY DEFINER routines to `authenticated`.

The remediation revokes EXECUTE from `PUBLIC`, `anon`, and `authenticated` for every public-schema SECURITY DEFINER routine by default, then explicitly re-grants only the application allowlists.

Current verified counts:
- **19** anon-executable SECURITY DEFINER functions;
- **100** authenticated-executable SECURITY DEFINER functions;
- **190** total SECURITY DEFINER functions in the public schema.

### Direct execution revoked completely

At minimum the following reviewed/service/helper routines are explicitly closed to ordinary API roles:
- `merge_identities(uuid,uuid,uuid,text)`
- `remove_ambassador_on_admin()`
- `update_ambassador_balance_on_payout()`
- `sms_set_updated_at()`
- `ops_touch_updated_at()`

### Intentional anonymous SECURITY DEFINER allowlist

These 19 RPCs remain callable anonymously because they are the public customer/visitor surface:

1. `bootstrap_canonical_wheel_visitor`
2. `complete_canonical_wheel_spin`
3. `consume_sms_product_handoff`
4. `consume_website_wheel_handoff`
5. `create_quote_lead`
6. `create_sms_product_handoff`
7. `create_website_wheel_handoff`
8. `get_canonical_wheel_state`
9. `get_cashoff_recommendations`
10. `get_invite_link`
11. `record_sms_campaign_click`
12. `register_visitor_session`
13. `register_website_visitor`
14. `sales_public_quotation_view`
15. `sales_public_quote_decide`
16. `track_product_event`
17. `track_website_behavior`
18. `track_whatsapp_referral_click`
19. `track_whatsapp_referral_click_v2`

Review rationale:
- canonical wheel RPCs validate visitor/session tokens and spin requests; spin completion uses request-id idempotency;
- SMS and website handoffs validate opaque/hashes or tracking tokens;
- public quotation view/decision requires a SHA-256-hashed token, expiration/revocation checks, and current-version checks;
- invite lookup returns only active/unexpired/under-use invite metadata for a supplied code;
- visitor/tracking RPCs validate accepted event types and/or registered visitor context;
- `create_quote_lead` validates required visitor/name/phone input;
- `get_cashoff_recommendations` returns recommendation/product data rather than privileged internal data.

### Authenticated allowlist note

The authenticated allowlist covers:
- RLS/RBAC helper routines needed by policy evaluation;
- current Marketing admin workflows;
- Operations RPCs;
- Sales RPCs;
- Work Management RPCs;
- the same public guest RPCs.

The specifically requested high-risk functions are all either guarded or revoked as detailed above. Two internal helper-style RPCs, `upsert_identity_from_signals` and `ops_current_crm_stage`, remain authenticated because existing Operations code calls them directly; they were not part of the named sensitive list and should be candidates for a later wrapper/refactor if the authenticated RPC surface is reduced further.

## 7. Mutable search_path fixes

All 13 review-listed functions now have `search_path = public, pg_temp`:

- `generate_ambassador_assets`
- `award_points`
- `approve_activity`
- `approve_conversion`
- `update_ambassador_balance_on_payout`
- `set_custom_referral_code`
- `generate_lead_code`
- `normalize_ng_phone`
- `sms_set_updated_at`
- `normalize_contact_phone`
- `ops_touch_updated_at`
- `ops_crm_stage_from_slug`
- `is_internal_staff_role`

Supabase security advisors no longer report the mutable-search-path finding for these functions.

## 8. Application compatibility correction

The Marketing Spin Wheel server route still authorized only the literal legacy role `admin`. That would block the live RBAC roles (`super_admin`, `growth_lead`, `marketing_manager`) even though the database policies were correct.

`src/app/api/marketing/spin-wheel/route.ts` now uses:
- `isInternalRole(profile.role)`
- `canAccessModule(profile.role, 'marketing')`

A contract test was added in `src/lib/auth/marketing-api-contract.test.ts`.

## 9. Leaked password protection

Status: **blocked by current Supabase plan / management surface; not falsely marked complete**.

Supabase's current documentation states leaked-password protection is available on Pro plan and above. This project is on the Free plan. The available Supabase connector also does not expose an Auth configuration mutation action, and leaked-password protection is Auth configuration rather than PostgreSQL schema, so it cannot honestly be implemented as a SQL migration.

The Supabase security advisor therefore still reports `Leaked Password Protection Disabled`.

To close this last item, the project owner must first approve/perform a plan upgrade to Pro or above; leaked-password protection can then be enabled in Supabase Auth settings. No paid upgrade was performed automatically.

## 10. Advisor outcome

After the two security migrations:

Resolved from the reported review:
- 41 RLS-disabled-table findings;
- 4 SECURITY DEFINER view findings;
- 13 mutable function search_path findings;
- blanket anonymous/authenticated EXECUTE exposure on SECURITY DEFINER routines substantially reduced;
- named legacy privilege-escalation functions hardened or revoked.

Remaining requested item:
- leaked-password protection, blocked by the current Free plan as documented above.

There may still be unrelated Supabase security-advisor warnings outside the scope of the supplied list; this report does not claim the project has zero advisor warnings globally.
