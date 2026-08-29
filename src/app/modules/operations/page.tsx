import { OperationsOverview } from '@/components/operations/operations-overview';
import {
  getOperationsOverviewForRange,
  getOperationsReportingRange,
} from '@/lib/operations/reporting-server';

export default async function OperationsPage() {
  const range = await getOperationsReportingRange();
  const data = await getOperationsOverviewForRange(range);
  return <OperationsOverview data={data} />;
}
