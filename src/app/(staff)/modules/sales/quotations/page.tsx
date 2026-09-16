import { QuotationWorkspace } from '@/components/sales/quotation-workspace';
import { getSalesInventoryCatalog, getSalesMarginContext, getSalesQuotations } from '@/lib/sales/read-server';

export default async function QuotationsPage() {
  const [quotations, catalog, marginContext] = await Promise.all([
    getSalesQuotations(),
    getSalesInventoryCatalog(),
    getSalesMarginContext(),
  ]);

  return (
    <QuotationWorkspace
      quotations={quotations as never[]}
      inventory={catalog.items as never[]}
      marginContext={marginContext}
    />
  );
}
