# Supabase Migration Reconciliation — 2026-09-12

Project: `autndhyvgfndaiahonlx` (`Emmytech ambassadors`)

## Source of truth

The production table `supabase_migrations.schema_migrations` was treated as the historical source of truth. Its `version`, `name`, and stored SQL `statements` were exported and used to rebuild `supabase/migrations/` exactly as production recorded them. Historical migrations were **not re-applied**.

The active migration directory now uses the live production versions, including the previously missing production baseline, older Spin/Cash-Off/CRM/Operations/Sales migrations, the full 2026-09-11 staff/work-management batch, and the 2026-09-12 security migrations.

## Why migration files were rebuilt instead of renamed blindly

Several repo files represented the same conceptual migration under a different local timestamp, while others differed materially from what production recorded. Merely renaming the local files would make `migration list` look cleaner but would still produce a database different from production when replayed from scratch.

The reconciliation therefore exported the exact SQL stored in the live migration ledger and regenerated the active historical files from that SQL.

## 2026-09-11 production versions

| Live version | Live migration name |
| --- | --- |
| `20260911084208` | `staff_rbac_invites_20260911` |
| `20260911084926` | `temporary_invite_validation_compat_20260911` |
| `20260911090452` | `super_admin_legacy_compat_20260911` |
| `20260911090704` | `marketing_staff_access_20260911` |
| `20260911093030` | `staff_operational_capabilities_20260911` |
| `20260911093234` | `protect_pricing_exceptions_20260911` |
| `20260911093735` | `repair_technical_write_boundary_20260911` |
| `20260911093928` | `staff_customer_lookup_20260911` |
| `20260911101257` | `work_management_foundation_20260911` |
| `20260911101320` | `work_management_grant_hardening_20260911` |
| `20260911101420` | `work_assignment_requested_dates_20260911` |
| `20260911101608` | `work_task_lifecycle_rpcs_20260911` |
| `20260911101849` | `work_goals_20260911` |
| `20260911103901` | `work_notifications_20260911` |
| `20260911104349` | `work_notifications_harden_updates_20260911` |
| `20260911110148` | `remove_temporary_invite_validation_compat_20260911` |

## 2026-09-12 security/reconciliation versions

| Live version | Live migration name |
| --- | --- |
| `20260912031144` | `security_rls_and_views_20260912` |
| `20260912031221` | `security_function_hardening_20260912` |
| `20260912031510` | `temporary_migration_history_export_20260912` |
| `20260912031751` | `remove_temporary_migration_history_export_20260912` |

The temporary export helper exposed only the migration ledger SQL, which is repository content, and no application/user data. It was removed immediately after the exact production migration history had been reconstructed.

## Repo-only migrations

The following migrations did not exist in the production migration ledger under the same name/version and did not have a matching live migration SQL hash. They are no longer in the active migration path and were preserved for forensic/history purposes under `supabase/migrations_archive/2026-09-12-pre-reconciliation/`:

1. `20260727180026_ambassador_baseline_snapshot.sql`
2. `20260731183000_ambassador_spin_attribution.sql`
3. `20260801123000_unified_visitor_timeline_whatsapp_merge.sql`
4. `20260820121030_account_for_all_ambassador_spin_referrals.sql`
5. `20260820122137_restrict_ambassador_notification_updates.sql`
6. `20260820133404_keep_ambassador_lead_totals_in_sync.sql`
7. `20260820140000_ambassador_lead_submission_approval.sql`
8. `20260820150000_conversion_first_ambassador_leaderboard.sql`
9. `20260907163000_sales_identity_customer_summary.sql`

This avoids Supabase treating them as pending migrations while preserving the old repository state for review.

## Other archived files

`supabase/migrations_archive/2026-09-12-pre-reconciliation/` also contains the pre-reconciliation local copies of migrations whose timestamps or SQL differed from production. The active directory is the canonical production history; the archive is not consumed by Supabase CLI migration commands.

## Process rule going forward

For this repository, every schema/RLS/view/function/grant change must follow this order:

1. Create the SQL migration file in `supabase/migrations/` on the feature/security branch.
2. Review/commit that file with the application change that depends on it.
3. Apply that exact SQL to Supabase.
4. If the remote migration runner assigns a different production timestamp, align the repository filename to the recorded live version immediately in the same branch.
5. Never make an untracked dashboard/MCP schema edit without a matching committed migration.
6. Never use `migration repair` or replay historical migrations merely to make migration metadata look aligned.

## Verification evidence

The reconciliation workflow exported the live ledger and verified the active migration filename/version set before committing the reconstructed files. The production ledger was then queried again after the temporary helper cleanup, and the cleanup was aligned to its exact production version (`20260912031751`).
