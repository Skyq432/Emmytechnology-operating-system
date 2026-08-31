import { SalesOverview } from '@/components/sales/sales-overview';
import { getServerReportingRange } from '@/lib/reporting-period-server';
import { getUnifiedSalesOverview } from '@/lib/sales/unified-report-server';

export default async function SalesPage() {
  const range = await getServerReportingRange();
  const data = await getUnifiedSalesOverview(range);
  return <SalesOverview data={data} />;
}
