import { NewOrderForm } from '@/components/sales/new-order-form';
import { OrdersWorkspace } from '@/components/sales/orders-workspace';
import { getSalesInventoryCatalog, getSalesOrders } from '@/lib/sales/read-server';

export default async function SalesOrdersPage() {
  const [orders, catalog] = await Promise.all([
    getSalesOrders(),
    getSalesInventoryCatalog(),
  ]);

  return (
    <div className="space-y-6">
      <NewOrderForm inventory={catalog.items as never[]} />
      <OrdersWorkspace orders={orders as never[]} />
    </div>
  );
}
