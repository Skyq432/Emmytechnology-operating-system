import { InventoryDetail } from '@/components/operations/inventory/inventory-detail';
import { RealCostCard } from '@/components/finance/cost-ui';
import { Notice } from '@/components/finance/ui';
import { getFinanceViewer } from '@/lib/finance/access';
import { getInventoryRealCost } from '@/lib/finance/data';
import type { SearchParams } from '@/lib/finance/filters';
import { canSeeCost } from '@/lib/finance/permissions';
import { getInventoryItemDetail } from '@/lib/operations/sales-server';
import type { InventoryRealCost } from '@/lib/finance/types';

export default async function InventoryItemPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const { id } = await params;
  const query = await searchParams;
  const [data, viewer] = await Promise.all([getInventoryItemDetail(id), getFinanceViewer()]);

  // Real cost (Finance) is private: only loaded, and only sent to the browser,
  // for the Supreme Administrator, Growth Lead and Sales Analyst. The database
  // checks the role again. If it fails, the rest of the page still works.
  let realCost: InventoryRealCost | null = null;
  if (canSeeCost(viewer?.role)) {
    try { realCost = await getInventoryRealCost(data.item.id); } catch { realCost = null; }
  }

  return (
    <InventoryDetail
      {...data}
      realCost={realCost ? (
        <>
          <div className="mb-3"><Notice params={query} /></div>
          <RealCostCard itemId={data.item.id} cost={realCost} back={`/modules/operations/inventory/${data.item.id}`} />
        </>
      ) : null}
    />
  );
}
