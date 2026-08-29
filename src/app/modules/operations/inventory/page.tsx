import { InventoryClient } from '@/components/operations/inventory/inventory-client';
import { getOperationsInventory } from '@/lib/operations/server';

export default async function OperationsInventoryPage() {
  const items = await getOperationsInventory();
  return <InventoryClient items={items} />;
}
