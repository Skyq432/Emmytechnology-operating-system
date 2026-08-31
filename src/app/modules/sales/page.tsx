import { SalesOverview } from '@/components/sales/sales-overview';
import { getSalesOverview } from '@/lib/sales/server';

export default async function SalesPage() {
  const data = await getSalesOverview();
  return <SalesOverview data={data} />;
}
