import { OrdersClient } from '@/components/operations/orders/orders-client';
import {
  getOperationsLocations,
  getWebsiteProductLinks,
} from '@/lib/operations/server';
import { getOperationsAmbassadors } from '@/lib/operations/attribution-server';
import {
  getOperationsInventoryForRange,
  getOperationsOrdersForRange,
  getOperationsReportingRange,
} from '@/lib/operations/reporting-server';

export default async function OperationsOrdersPage() {
  const range = await getOperationsReportingRange();
  const [orders, inventory, locations, websiteLinkData, ambassadors] = await Promise.all([
    getOperationsOrdersForRange(range),
    getOperationsInventoryForRange(range),
    getOperationsLocations(),
    getWebsiteProductLinks(),
    getOperationsAmbassadors(),
  ]);

  return (
    <OrdersClient
      orders={orders}
      inventory={inventory}
      locations={locations}
      websiteProducts={websiteLinkData.websiteProducts}
      ambassadors={ambassadors}
    />
  );
}
