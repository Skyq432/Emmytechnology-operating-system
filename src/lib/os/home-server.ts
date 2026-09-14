import { requireInternalUser } from '@/lib/auth/server';

function throwIfError(error: { message: string } | null, context: string): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

/**
 * Admin/Super Admin control-tower snapshot. Kept here (rather than growing
 * work/server.ts or operations/server.ts) since it's a cross-domain aggregate
 * specific to the admin home, not owned by any one module.
 */
export async function getAdminOverview() {
  const { supabase, role } = await requireInternalUser();
  if (role !== 'admin' && role !== 'super_admin') {
    throw new Error('Only Admin or Super Admin can view the Admin overview');
  }

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [staffResult, todaysPaymentsResult, openRepairsResult, unreadReviewsResult] = await Promise.all([
    supabase.from('users').select('id', { count: 'exact', head: true }).neq('role', 'ambassador'),
    supabase.from('sales_unified_payments').select('amount').eq('is_void', false).gte('paid_at', startOfDay.toISOString()),
    supabase.from('ops_repairs').select('id', { count: 'exact', head: true }).not('status', 'in', '(collected,cancelled)'),
    supabase.from('admin_notifications').select('id', { count: 'exact', head: true }).eq('is_read', false),
  ]);

  throwIfError(staffResult.error, 'Unable to load staff count');
  throwIfError(todaysPaymentsResult.error, 'Unable to load today’s sales');
  throwIfError(openRepairsResult.error, 'Unable to load open repairs');
  throwIfError(unreadReviewsResult.error, 'Unable to load pending reviews');

  const todaysSales = (todaysPaymentsResult.data || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);

  return {
    staffCount: staffResult.count ?? 0,
    todaysSales,
    openRepairs: openRepairsResult.count ?? 0,
    pendingReviews: unreadReviewsResult.count ?? 0,
  };
}

/**
 * Shared CRM/marketing snapshot for the growth-lead and marketing-manager homes.
 * No pre-existing marketing/CRM overview function was found to reuse (checked
 * src/lib/marketing and src/lib/crm) — this is genuinely net-new.
 */
export async function getMarketingOverview() {
  const { supabase, role } = await requireInternalUser();
  if (role !== 'admin' && role !== 'super_admin' && role !== 'growth_lead' && role !== 'marketing_manager') {
    throw new Error('Not authorized to view the Marketing overview');
  }

  const [activeAmbassadorsResult, leadsResult, conversionsResult, needsReviewResult] = await Promise.all([
    supabase.from('ambassadors').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('leads').select('id', { count: 'exact', head: true }),
    supabase.from('conversions').select('id', { count: 'exact', head: true }),
    supabase.from('conversions').select('id', { count: 'exact', head: true }).eq('admin_attention_required', true),
  ]);

  throwIfError(activeAmbassadorsResult.error, 'Unable to load active ambassadors');
  throwIfError(leadsResult.error, 'Unable to load leads');
  throwIfError(conversionsResult.error, 'Unable to load conversions');
  throwIfError(needsReviewResult.error, 'Unable to load conversions needing review');

  return {
    activeAmbassadors: activeAmbassadorsResult.count ?? 0,
    totalLeads: leadsResult.count ?? 0,
    totalConversions: conversionsResult.count ?? 0,
    needsReview: needsReviewResult.count ?? 0,
  };
}
