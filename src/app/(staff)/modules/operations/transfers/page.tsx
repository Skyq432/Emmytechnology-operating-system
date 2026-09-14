import { TransfersClient } from '@/components/operations/transfers/transfers-client';
import { getOperationsReportingRange } from '@/lib/operations/reporting-server';
import { getOperationsTransfers, getTransferFormData } from '@/lib/operations/transfer-server';

export default async function OperationsTransfersPage() {
  const range = await getOperationsReportingRange();
  const [transfers, formData] = await Promise.all([
    getOperationsTransfers(range),
    getTransferFormData(),
  ]);
  return <TransfersClient transfers={transfers} {...formData} />;
}
