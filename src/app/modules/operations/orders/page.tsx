import { OrdersClient } from '@/components/operations/orders/orders-client';
import {
  getOperationsInventory,
  getOperationsLocations,
  getOperationsOrders,
  getWebsiteProductLinks,
} from '@/lib/operations/server';

export default async function OperationsOrdersPage() {
  const [orders, inventory, locations, websiteLinkData] = await Promise.all([
    getOperationsOrders(),
    getOperationsInventory(),
    getOperationsLocations(),
    getWebsiteProductLinks(),
  ]);

  return (
    <OrdersClient
      orders={orders}
      inventory={inventory}
      locations={locations}
      websiteProducts={websiteLinkData.websiteProducts}
    />
  );
}
