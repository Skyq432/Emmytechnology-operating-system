import { OrdersClient } from '@/components/operations/orders/orders-client';
import {
  getOperationsInventory,
  getOperationsOrders,
  getWebsiteProductLinks,
} from '@/lib/operations/server';

export default async function OperationsOrdersPage() {
  const [orders, inventory, websiteLinkData] = await Promise.all([
    getOperationsOrders(),
    getOperationsInventory(),
    getWebsiteProductLinks(),
  ]);

  return (
    <OrdersClient
      orders={orders}
      inventory={inventory}
      websiteProducts={websiteLinkData.websiteProducts}
    />
  );
}
