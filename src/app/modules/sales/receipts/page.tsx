import { ReceiptsWorkspace } from '@/components/sales/receipts-workspace';
import { getSalesDocuments } from '@/lib/sales/read-server';

export default async function SalesReceiptsPage() {
  const documents = await getSalesDocuments();
  return <ReceiptsWorkspace documents={documents as never[]} />;
}
