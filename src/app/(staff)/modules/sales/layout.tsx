import { ReportingPeriodProvider } from '@/components/reporting/reporting-period-context';
import { OperationsPeriodBar } from '@/components/operations/operations-period-bar';
import { requireModuleAccess } from '@/lib/auth/server';

export default async function SalesLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess('sales');

  return (
    <ReportingPeriodProvider>
      <OperationsPeriodBar moduleLabel="Sales" />
      {children}
    </ReportingPeriodProvider>
  );
}
