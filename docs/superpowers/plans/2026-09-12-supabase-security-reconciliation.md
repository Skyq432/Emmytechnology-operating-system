# Supabase Security Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconcile repository migration history with production and remove the Supabase security advisor findings without breaking EmmyTech staff, ambassador, Spin Wheel, Sales, Operations, or CRM workflows.

**Architecture:** Treat the live `supabase_migrations.schema_migrations` ledger as the historical source of truth. Historical drift is corrected in Git only and is never replayed. All new security changes are forward-only SQL migrations committed before being applied to production. RLS policies use existing role/capability helpers; public guest workflows keep only the narrowly required RPC surface.

**Tech Stack:** PostgreSQL 17 / Supabase RLS and Auth, Next.js 16, TypeScript, GitHub Actions.

**Spec:** User security review request in the 2026-09-12 conversation.

## Global Constraints

- Never replay an already-live historical migration.
- Every new schema, policy, grant, view, or function change must exist in `supabase/migrations/` before live application.
- No blanket `USING (true)` staff policy for sensitive tables.
- Preserve guest Spin Wheel and public quotation/invite flows through narrowly allowed RPC/server paths, not direct table exposure.
- Do not merge to `main` until the review report and verification are complete.
- Re-run Supabase security advisors after production migration application.

---

### Task 1: Reconcile migration history

**Files:**
- Create/rename canonical historical files under `supabase/migrations/`
- Move non-live files to `supabase/migrations_archive/`
- Create `docs/security/2026-09-12-supabase-migration-reconciliation.md`

- [ ] Capture the exact production migration ledger (version, name, SQL hash).
- [ ] Match existing repo files to live migrations by SQL hash where possible.
- [ ] Reconstruct live-only or SQL-different historical files from `supabase_migrations.schema_migrations.statements`.
- [ ] Archive repo-only migrations rather than leaving them pending.
- [ ] Verify active historical filenames exactly match production versions and document every mapping.

### Task 2: Add RLS and minimal policies

**Files:**
- Create `supabase/migrations/20260912*_security_remediation.sql`
- Create `docs/security/2026-09-12-supabase-security-review.md`

- [ ] Enable RLS on all 41 reviewed tables.
- [ ] Give identity/customer reads only to internal staff that need CRM/Sales/Operations data.
- [ ] Give Marketing/admin tables only to marketing staff/admin roles as appropriate.
- [ ] Keep Spin Wheel guest data behind server/service-role or public RPCs; do not expose direct guest table access.
- [ ] Give CRM financial tables only to staff with sales access and restrict mutation to appropriate management capabilities/service role.
- [ ] Verify no listed table remains RLS-disabled.

### Task 3: Convert definer views to invoker

- [ ] Set `security_invoker=true` on `identity_lifetime_value`, `leaderboard`, `sms_campaign_recipient_details`, and `sales_customer_summary`.
- [ ] Verify their base-table RLS/policies are compatible and tighten any underlying anonymous policy that would defeat invoker security.

### Task 4: Harden SECURITY DEFINER functions

- [ ] Bind caller-supplied admin IDs to `auth.uid()` for `process_payout`, `admin_add_ambassador_bonus`, `admin_create_conversion`, and `merge_identities`.
- [ ] Confirm `hard_delete_ambassador` and `set_staff_role` use authenticated role checks and update legacy role checks where needed.
- [ ] Confirm Sales/Operations privileged functions use capability/admin checks.
- [ ] Revoke direct execution of trigger/helper functions from `PUBLIC`, `anon`, and `authenticated` when they are not APIs.
- [ ] Revoke anonymous execution from internal RPCs and explicitly grant only required authenticated/public functions.
- [ ] Document retained public RPC allowlist and revoked functions.

### Task 5: Fix mutable function search paths

- [ ] Set `search_path = public, pg_temp` on the 13 advisor-listed functions.
- [ ] Verify the advisor no longer flags any of them.

### Task 6: Enable leaked-password protection

- [ ] Enable Supabase Auth leaked-password protection using the available supported management surface.
- [ ] Verify the Auth security advisor no longer reports it. If the current connector cannot mutate Auth config, document the exact blocker rather than falsely claiming success.

### Task 7: Verify application compatibility and security

- [ ] Run auth, work, commercial, lint, and production build checks.
- [ ] Re-run Supabase security advisors.
- [ ] Run targeted SQL checks for RLS flags, view security mode, function grants, function search paths, and migration ledger.
- [ ] Remove temporary audit-only workflow before review.
- [ ] Publish line-by-line review report on the security branch; do not merge without explicit approval.
