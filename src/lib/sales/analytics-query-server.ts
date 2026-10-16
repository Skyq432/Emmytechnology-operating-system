import { getCachedAuthContext } from '@/lib/auth/server';
import { canAccessSalesAnalyticsConsole, isInternalRole } from '@/lib/auth/roles';

/**
 * Backs the Sales SQL Console — lets sales_analyst (+ admins) write and run their own
 * read-only SQL against the database. Not gated by canAccessModule('sales') alone:
 * front_desk, operations_lead and technician all have that module too, but shouldn't
 * get a raw query console, so this checks canAccessSalesAnalyticsConsole directly,
 * same pattern as the Referral Tracker's requireMarketingAccess().
 *
 * The real safety boundary isn't in this file — it's that run_sales_analytics_query()
 * executes the query under a role with nothing but SELECT granted (see
 * supabase/migrations/20261016180849_sales_analytics_sql_console.sql). This check is
 * just who gets to call the RPC at all.
 */
async function requireSalesAnalyticsAccess() {
  const { user, profile, supabase } = await getCachedAuthContext();
  if (!user) throw new Error('Not authenticated');
  if (!profile || !isInternalRole(profile.role) || !canAccessSalesAnalyticsConsole(profile.role)) {
    throw new Error('Not authorized');
  }
  return supabase;
}

export type AnalyticsQueryResult = {
  rows: Record<string, unknown>[];
  columns: string[];
  rowCount: number;
  truncated: boolean;
};

export async function runAnalyticsQuery(sql: string): Promise<AnalyticsQueryResult> {
  const supabase = await requireSalesAnalyticsAccess();
  const { data, error } = await supabase.rpc('run_sales_analytics_query', { p_sql: sql });
  if (error) throw new Error(error.message);

  const rows = (data?.rows ?? []) as Record<string, unknown>[];
  const columns = rows.length ? Object.keys(rows[0]) : [];

  return {
    rows,
    columns,
    rowCount: Number(data?.row_count ?? rows.length),
    truncated: Boolean(data?.truncated),
  };
}
