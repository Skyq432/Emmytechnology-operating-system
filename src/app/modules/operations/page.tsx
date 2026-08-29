import { OperationsOverview } from '@/components/operations/operations-overview';
import { getOperationsOverview } from '@/lib/operations/server';

export default async function OperationsPage() {
  const data = await getOperationsOverview();
  return <OperationsOverview data={data} />;
}
