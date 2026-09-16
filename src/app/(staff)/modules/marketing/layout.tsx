import { MarketingContextBar } from '@/components/marketing/marketing-context-bar';
import { OperationsPeriodBar } from '@/components/operations/operations-period-bar';
import { ReportingPeriodProvider } from '@/components/reporting/reporting-period-context';
import { requireModuleAccess } from '@/lib/auth/server';

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess('marketing');

  return (
    <ReportingPeriodProvider>
      <MarketingContextBar />
      <OperationsPeriodBar moduleLabel="Marketing" />
      {children}
    </ReportingPeriodProvider>
  );
}
