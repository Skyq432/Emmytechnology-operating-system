import { SalesOverview } from '@/components/sales/sales-overview';
import { getUnifiedSalesOverview } from '@/lib/sales/unified-report-server';

export default async function SalesPage() {
  const data = await getUnifiedSalesOverview();
  return <SalesOverview data={data} />;
}
