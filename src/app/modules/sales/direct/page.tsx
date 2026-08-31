import { DirectSaleWorkspace } from '@/components/sales/direct-sale-workspace';
import { getSalesInventoryCatalog } from '@/lib/sales/read-server';

export default async function DirectSalePage() {
  const data = await getSalesInventoryCatalog();
  return <DirectSaleWorkspace inventory={data.items as never[]} availability={data.availability as never[]} units={data.units as never[]} locations={data.locations as never[]} />;
}
