import { QuotationWorkspace } from '@/components/sales/quotation-workspace';
import { getSalesInventoryCatalog, getSalesQuotations } from '@/lib/sales/read-server';

export default async function QuotationsPage() {
  const [quotations, catalog] = await Promise.all([
    getSalesQuotations(),
    getSalesInventoryCatalog(),
  ]);

  return (
    <QuotationWorkspace
      quotations={quotations as never[]}
      inventory={catalog.items as never[]}
    />
  );
}
