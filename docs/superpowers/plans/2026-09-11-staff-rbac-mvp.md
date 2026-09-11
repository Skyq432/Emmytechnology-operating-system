# EmmyTech Staff RBAC MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow EmmyTech internal staff to register through role-bound invite links, sign into EmmyTech OS, see only the departments/navigation relevant to their role, and let authorised administrators manage staff roles and invitations.

**Architecture:** Keep the existing `public.users`, `invite_links`, Supabase Auth, Ambassador programme, Sales and Operations systems. Add one centralized TypeScript role policy used by the Command Centre and module layouts, and harden PostgreSQL invite handling so the database—not signup metadata—determines the invited role. Preserve legacy `admin` as a compatibility role while introducing named staff roles.

**Tech Stack:** Next.js 16.2.6, React 19.2.4, TypeScript, Supabase JS 2.106.2, Supabase SSR 0.10.3, PostgreSQL, Node built-in test runner.

**Spec:** `docs/superpowers/specs/2026-09-11-staff-rbac-mvp-design.md`

## Global Constraints

- Work only on `feature/staff-rbac-mvp` until explicit approval to merge.
- Do not remove or rename the existing `admin` or `ambassador` roles.
- Keep the existing public invite URL `/auth/invite?code=...`.
- Do not trust client-supplied signup role metadata for role assignment.
- Do not broaden `ops_is_admin()` to all staff; existing sensitive Sales/Operations RPCs remain restrictive until individually migrated.
- Use Supabase migrations for DDL/function changes and keep the migration backward compatible.
- Do not auto-assign concrete employees to roles based only on name matching; use the Administration UI or an explicitly approved data update.

---

### Task 1: Central role and access policy

**Files:**
- Create: `src/lib/auth/roles.ts`
- Create: `src/lib/auth/roles.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces `EmmyRole`, `ModuleSlug`, `ROLE_LABELS`, `isInternalRole()`, `canAccessModule()`, `accessibleModules()`, `salesNavKeys()`, `operationsNavKeys()`, `canCreateStaffInvite()`, and `canCreateAmbassadorInvite()`.
- Later UI/layout tasks consume these functions rather than duplicating role conditions.

- [ ] **Step 1: Write failing role-policy tests**

Tests cover all roles from the spec, exact department visibility, exact Sales and Operations navigation sets, and invite-authority rules.

- [ ] **Step 2: Run the isolated role-policy test and verify RED**

Run:
```bash
node --experimental-strip-types --test src/lib/auth/roles.test.ts
```
Expected: FAIL because `roles.ts` does not yet exist.

- [ ] **Step 3: Implement the minimal centralized policy**

Use literal role/module unions and explicit allow-lists. Unknown roles and `ambassador` must not be treated as internal staff.

- [ ] **Step 4: Run role-policy tests and verify GREEN**

Run:
```bash
node --experimental-strip-types --test src/lib/auth/roles.test.ts
```
Expected: all role-policy tests pass.

- [ ] **Step 5: Add `test:auth` script**

Add:
```json
"test:auth": "node --experimental-strip-types --test src/lib/auth/*.test.ts src/lib/marketing/invite-route.test.ts"
```

---

### Task 2: Secure role-bound invite backend

**Files:**
- Create: `supabase/migrations/20260911093000_staff_rbac_invites.sql`
- Create: `src/lib/auth/invite-contract.test.ts`
- Modify: `src/app/auth/invite/page.tsx`
- Modify: `src/app/modules/marketing/invite/page.tsx`

**Interfaces:**
- Produces database-supported staff roles, secure invite role assignment, `generate_invite_link(..., p_role)`, and `set_staff_role(p_user_id, p_role)`.
- Keeps the existing three-argument Ambassador invite call compatible.

- [ ] **Step 1: Inspect current constraints, invite policies and function signatures**

Read-only SQL verifies the existing `users_role_check`, `invite_links` constraints/RLS policies, and grants before migration.

- [ ] **Step 2: Write failing invite-contract tests**

Tests require the public invite page to remain at `/auth/invite`, dynamically distinguish staff vs Ambassador copy, and require the Marketing invite page to request an Ambassador-role invite explicitly.

- [ ] **Step 3: Verify the invite-contract tests fail for the intended missing behavior**

Run:
```bash
node --experimental-strip-types --test src/lib/auth/invite-contract.test.ts src/lib/marketing/invite-route.test.ts
```
Expected: staff-copy/role-generation assertions fail while the existing route contract stays intact.

- [ ] **Step 4: Create backward-compatible PostgreSQL migration**

The migration must:
```sql
-- 1. Allow admin, ambassador, super_admin, growth_lead,
--    marketing_manager, front_desk, operations_lead,
--    technician, sales_analyst in public.users.role.
-- 2. Validate invite_links.role.
-- 3. Add is_internal_staff_role(text).
-- 4. Add role-aware generate_invite_link with authorization based on auth.uid().
-- 5. Make invite_links.role authoritative in handle_new_invite_user().
-- 6. Ensure an invite use is consumed exactly once.
-- 7. Make validate_invite_code validation-only.
-- 8. Stop handle_new_user() from duplicating invited-user provisioning.
-- 9. Remove Ambassador records when users move to an internal role.
-- 10. Add set_staff_role(uuid,text) restricted to super_admin/legacy admin.
```

- [ ] **Step 5: Apply the migration to the EmmyTech Supabase project**

Use `Supabase.apply_migration`, then query `pg_get_functiondef`, role constraints and triggers to confirm the deployed definitions.

- [ ] **Step 6: Update both invite UIs**

The Marketing invite screen explicitly generates `ambassador` links. The public signup page displays `Join EmmyTech Staff` plus a friendly role label when the invite role is internal, while retaining `Join EmmyTech Ambassador` for Ambassador links.

- [ ] **Step 7: Re-run invite tests**

Expected: all invite and route-contract tests pass.

---

### Task 3: Internal login and Command Centre access

**Files:**
- Create: `src/lib/auth/server.ts`
- Create: `src/lib/auth/access-contract.test.ts`
- Modify: `src/app/auth/login/page.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/components/os/ambassador-style-dashboard.tsx`
- Modify: `src/app/modules/[slug]/page.tsx`

**Interfaces:**
- Produces `requireInternalUser()` and `requireModuleAccess(module)` server helpers.
- Command Centre receives the current role and filters department cards using `canAccessModule()`.

- [ ] **Step 1: Write failing access-contract tests**

Tests assert that login accepts internal roles instead of only `admin`, home no longer hardcodes `role !== 'admin'`, the dashboard filters department cards through the centralized policy, and dynamic modules call a server-side access guard.

- [ ] **Step 2: Run the tests and verify RED**

- [ ] **Step 3: Implement server auth helpers and internal-role login**

Unauthenticated users redirect to `/auth/login`; `ambassador`/unknown roles cannot enter the internal OS. Module access is checked server-side before rendering.

- [ ] **Step 4: Make Command Centre role-aware**

Filter cards according to the spec and render a friendly role label instead of always `Administrator`.

- [ ] **Step 5: Guard the dynamic CRM/placeholder module route**

`/modules/crm`, `/modules/reports`, `/modules/finance`, and placeholder module entries must enforce the same centralized module policy.

- [ ] **Step 6: Re-run access tests**

Expected: all access-contract tests pass.

---

### Task 4: Administration staff control centre

**Files:**
- Create: `src/app/modules/administration/page.tsx`
- Create: `src/components/administration/staff-admin.tsx`
- Create: `src/lib/auth/administration-contract.test.ts`

**Interfaces:**
- Server page consumes `requireModuleAccess('administration')`.
- Client calls `generate_invite_link` with selected staff role and `set_staff_role` for role changes.

- [ ] **Step 1: Write failing Administration contract tests**

Tests require a static Administration route, server-side Administration access guard, staff list, staff-role selector, one-use invite default, seven-day expiry default, and the role-aware invite RPC call.

- [ ] **Step 2: Run tests and verify RED**

- [ ] **Step 3: Implement the Administration server page**

Fetch non-Ambassador users needed for the staff list and pass them to the client component.

- [ ] **Step 4: Implement staff management UI**

Show staff name/email/role, allow authorized role changes, generate one-use staff invite links, copy the public invite URL, and show errors/success states.

- [ ] **Step 5: Run tests and verify GREEN**

---

### Task 5: Role-aware Marketing, Sales and Operations workspaces

**Files:**
- Modify: `src/app/modules/marketing/layout.tsx`
- Modify: `src/components/marketing/sidebar.tsx`
- Modify: `src/app/modules/sales/layout.tsx`
- Modify: `src/components/sales/sales-shell.tsx`
- Modify: `src/app/modules/operations/layout.tsx`
- Modify: `src/components/operations/operations-shell.tsx`
- Create: `src/lib/auth/workspace-contract.test.ts`

**Interfaces:**
- Layouts consume `requireModuleAccess()`.
- Sales and Operations shells consume the current role and filter their existing navigation using `salesNavKeys()` / `operationsNavKeys()`.

- [ ] **Step 1: Write failing workspace-contract tests**

Tests require centralized server guards in all three layouts and role-based filtering in Sales/Operations shells.

- [ ] **Step 2: Run tests and verify RED**

- [ ] **Step 3: Replace exact-admin layout checks with centralized module access**

Marketing admits `super_admin`, `admin`, `growth_lead`, `marketing_manager`; Sales/Operations follow the central department matrix.

- [ ] **Step 4: Filter Sales and Operations navigation**

Do not delete routes. Render only allowed nav keys for the current role and replace hardcoded `Administrator` text with a friendly role label.

- [ ] **Step 5: Keep Marketing's full current solution visible to approved Marketing roles**

Grace-style `marketing_manager` access includes Ambassador, Spin Wheel, leads, conversions, WhatsApp intake, products, invitations, settings and existing Marketing solutions.

- [ ] **Step 6: Run workspace tests and verify GREEN**

---

### Task 6: Integration verification and handoff

**Files:**
- No production files unless a verification defect is found.

**Interfaces:**
- Verifies the feature branch, deployed Supabase schema/functions and existing commercial tests together.

- [ ] **Step 1: Run auth/RBAC contract tests**

```bash
npm run test:auth
```
Expected: PASS.

- [ ] **Step 2: Run existing Operations and Sales tests**

```bash
npm run test:commercial
```
Expected: PASS.

- [ ] **Step 3: Run lint and production build**

```bash
npm run lint
npm run build
```
Expected: both succeed.

- [ ] **Step 4: Run Supabase smoke checks**

Verify allowed role constraint, invite generation authorization, role-authoritative invite provisioning functions, and staff role-management function definitions. Do not create real staff accounts solely for a smoke test.

- [ ] **Step 5: Compare feature branch against main**

Review every changed file and ensure no unrelated production changes or credentials are present.

- [ ] **Step 6: Prepare user testing commands**

```powershell
git fetch origin
git switch feature/staff-rbac-mvp
npm install
npm run test:auth
npm run test:commercial
npm run lint
npm run build
npm run dev
```

Manual acceptance flow:
1. Sign in as existing admin.
2. Open Administration.
3. Generate one staff invitation for a non-production test email.
4. Register through the generated `/auth/invite?code=...` URL.
5. Verify the created user receives the invite's database role, not an editable client role.
6. Sign in as that user and confirm Command Centre cards/nav match the role matrix.
7. Verify a disallowed department URL redirects/denies access.
8. Verify an existing Ambassador invite still produces an Ambassador account.

- [ ] **Step 7: Do not merge until user approves the tested branch**
