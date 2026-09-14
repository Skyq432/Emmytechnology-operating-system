import { ReportingPeriodProvider } from '@/components/reporting/reporting-period-context';
import { OperationsPeriodBar } from '@/components/operations/operations-period-bar';
import { requireModuleAccess } from '@/lib/auth/server';

export default async function OperationsLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess('operations');

  return (
    <ReportingPeriodProvider>
      <OperationsPeriodBar />
      {children}
    </ReportingPeriodProvider>
  );
}
