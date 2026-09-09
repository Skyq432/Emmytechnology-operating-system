import { InventoryDetail } from '@/components/operations/inventory/inventory-detail';
import { getInventoryItemDetail } from '@/lib/operations/sales-server';

export default async function InventoryItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getInventoryItemDetail(id);
  return <InventoryDetail {...data} />;
}
