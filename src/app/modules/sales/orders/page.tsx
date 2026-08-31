import { OrdersWorkspace } from '@/components/sales/orders-workspace';
import { getSalesOrders } from '@/lib/sales/read-server';

export default async function SalesOrdersPage() {
  const orders = await getSalesOrders();
  return <OrdersWorkspace orders={orders as never[]} />;
}
