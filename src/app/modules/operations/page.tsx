import { redirect } from 'next/navigation';
import { OperationsOverview } from '@/components/operations/operations-overview';
import { requireModuleAccess } from '@/lib/auth/server';
import {
  getOperationsOverviewForRange,
  getOperationsReportingRange,
} from '@/lib/operations/reporting-server';

export default async function OperationsPage() {
  const { role } = await requireModuleAccess('operations');
  if (role === 'front_desk') redirect('/modules/operations/orders');

  const range = await getOperationsReportingRange();
  const data = await getOperationsOverviewForRange(range);
  return <OperationsOverview data={data} />;
}
