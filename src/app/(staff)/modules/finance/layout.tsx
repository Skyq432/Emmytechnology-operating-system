// [SWAP → EmmyTech OS] Replaces the test-build layout at merge.
// Same frame as Sales and Operations: the shared report period bar on top, and the
// Finance sections in the sidebar (getModuleSubNav), so no tabs here.
import { Badge } from '@/components/ui/badge';
import { OperationsPeriodBar } from '@/components/operations/operations-period-bar';
import { ReportingPeriodProvider } from '@/components/reporting/reporting-period-context';
import { requireFinanceUser } from '@/lib/finance/access';
import { canViewFinance } from '@/lib/finance/permissions';

const VIEW_ONLY_ROLES = new Set(['growth_lead', 'sales_analyst']);

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireFinanceUser();
  const showBar = canViewFinance(viewer.role);

  return (
    <ReportingPeriodProvider>
      <div className="mx-auto max-w-[1400px] space-y-5">
        {showBar ? <OperationsPeriodBar moduleLabel="Finance" helpText="Sets the dates for the Finance Overview, Money In and Expenses, and for Sales, Operations, Marketing and CRM wherever you go next." /> : null}
        {VIEW_ONLY_ROLES.has(viewer.role) ? <div className="flex justify-end"><Badge variant="outline">View only</Badge></div> : null}
        {children}
      </div>
    </ReportingPeriodProvider>
  );
}
