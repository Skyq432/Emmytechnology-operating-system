import { redirect } from 'next/navigation';
import { SalesOverview } from '@/components/sales/sales-overview';
import { requireModuleAccess } from '@/lib/auth/server';
import { getServerReportingRange } from '@/lib/reporting-period-server';
import { getUnifiedSalesOverview } from '@/lib/sales/unified-report-server';

export default async function SalesPage() {
  const { role } = await requireModuleAccess('sales');
  if (role === 'front_desk' || role === 'technician') redirect('/modules/sales/direct');

  const range = await getServerReportingRange();
  const data = await getUnifiedSalesOverview(range);
  return <SalesOverview data={data} />;
}
