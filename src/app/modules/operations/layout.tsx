import { OperationsShell } from '@/components/operations/operations-shell';
import { ReportingPeriodProvider } from '@/components/reporting/reporting-period-context';
import { requireModuleAccess } from '@/lib/auth/server';

export default async function OperationsLayout({ children }: { children: React.ReactNode }) {
  const { role } = await requireModuleAccess('operations');

  return (
    <ReportingPeriodProvider>
      <OperationsShell role={role}>{children}</OperationsShell>
    </ReportingPeriodProvider>
  );
}
