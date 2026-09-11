import { ReportingPeriodProvider } from '@/components/reporting/reporting-period-context';
import { SalesShell } from '@/components/sales/sales-shell';
import { requireModuleAccess } from '@/lib/auth/server';

export default async function SalesLayout({ children }: { children: React.ReactNode }) {
  const { role } = await requireModuleAccess('sales');

  return (
    <ReportingPeriodProvider>
      <SalesShell role={role}>{children}</SalesShell>
    </ReportingPeriodProvider>
  );
}
