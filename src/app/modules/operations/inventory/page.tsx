import { InventoryClient } from '@/components/operations/inventory/inventory-client';
import { getOperationsLocations } from '@/lib/operations/server';
import { getOperationsSuppliers } from '@/lib/operations/sales-server';
import {
  getOperationsInventoryForRange,
  getOperationsReportingRange,
} from '@/lib/operations/reporting-server';

export default async function OperationsInventoryPage() {
  const range = await getOperationsReportingRange();
  const [items, locations, suppliers] = await Promise.all([
    getOperationsInventoryForRange(range),
    getOperationsLocations(),
    getOperationsSuppliers(),
  ]);
  return <InventoryClient items={items} locations={locations} suppliers={suppliers} />;
}
