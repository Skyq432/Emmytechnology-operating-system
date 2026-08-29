import { InventoryClient } from '@/components/operations/inventory/inventory-client';
import { getOperationsInventory, getOperationsLocations } from '@/lib/operations/server';

export default async function OperationsInventoryPage() {
  const [items, locations] = await Promise.all([
    getOperationsInventory(),
    getOperationsLocations(),
  ]);
  return <InventoryClient items={items} locations={locations} />;
}
