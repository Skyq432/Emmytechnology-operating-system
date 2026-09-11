# EmmyTech Staff RBAC MVP Design

## Goal

Make EmmyTech OS usable by internal staff today without replacing the existing Ambassador programme. Staff register through the existing invite flow, the invite determines their role, and the OS shows only the departments and navigation appropriate to that role.

## Roles

- `super_admin` — CEO / supreme administrator; full OS access and staff-role administration.
- `growth_lead` — CRM, Marketing, Sales, Operations and Reports; commercial visibility but not supreme system administration.
- `marketing_manager` — Marketing plus CRM visibility.
- `front_desk` — CRM, Sales and Operations for customer-facing work.
- `operations_lead` — CRM, Sales and Operations with broad operations responsibility and UI-office customer coverage.
- `technician` — CRM, limited Sales and limited Operations focused on repairs, stock lookup and customer handling.
- `sales_analyst` — CRM, Sales and Reports, primarily analytical/read-oriented.
- `admin` — legacy compatibility role during migration.
- `ambassador` — existing Ambassador programme; not an internal OS staff role.

## Department access

| Role | CRM | Marketing | Sales | Operations | Finance | Reports | Administration |
| --- | --- | --- | --- | --- | --- | --- | --- |
| super_admin | yes | yes | yes | yes | yes | yes | yes |
| admin | yes | yes | yes | yes | yes | yes | yes |
| growth_lead | yes | yes | yes | yes | no | yes | no |
| marketing_manager | yes | yes | no | no | no | no | no |
| front_desk | yes | no | yes | yes | no | no | no |
| operations_lead | yes | no | yes | yes | no | no | no |
| technician | yes | no | yes | yes | no | no | no |
| sales_analyst | yes | no | yes | no | no | yes | no |

## Sales navigation for MVP

- `super_admin`, `admin`, `growth_lead`: all Sales navigation.
- `front_desk`, `operations_lead`: Overview, Direct Sale, Orders, Payments, Receipts, Customers.
- `technician`: Direct Sale, Receipts, Customers.
- `sales_analyst`: Overview, Quotations, Orders, Customers, Reports.

## Operations navigation for MVP

- `super_admin`, `admin`, `growth_lead`, `operations_lead`: all Operations navigation.
- `front_desk`: Orders, Inventory, Transfers, Repairs.
- `technician`: Inventory, Repairs.

## Invite rules

1. Keep one invite system and one public route: `/auth/invite?code=...`.
2. `invite_links.role` is the source of truth. Signup metadata must never be trusted to choose a higher role.
3. `super_admin` and legacy `admin` may create staff invitations.
4. `marketing_manager` and `growth_lead` may create Ambassador invitations, but not staff invitations.
5. Invite use is incremented exactly once for every successful invited account, including staff.
6. Existing Ambassador invitations remain compatible.

## Administration MVP

`/modules/administration` becomes the staff control centre for `super_admin` and legacy `admin` during migration. It must show internal users, their roles, allow a permitted administrator to change a role, and generate one-use staff invitation links with configurable expiry.

## Security boundaries

- Navigation hiding is not authorization.
- Top-level department routes must enforce role access server-side.
- Staff invitation role selection must be enforced in PostgreSQL, not only in the browser.
- Existing `admin` is retained temporarily so current production users and RPCs keep working while specific backend actions are migrated to fine-grained permissions.
- This MVP does not claim complete fine-grained action authorization for every Sales/Operations RPC. Existing admin-only RPCs remain restrictive until individually migrated.

## Compatibility

Do not break existing `admin` or `ambassador` users. Do not deploy directly from the feature branch. Merge only after local build/tests and role-flow testing.