import { NewOrderForm } from '@/components/sales/new-order-form';
import { OrdersWorkspace } from '@/components/sales/orders-workspace';
import { getSalesInventoryCatalog, getSalesMarginContext, getSalesOrders } from '@/lib/sales/read-server';

export default async function SalesOrdersPage() {
  const [orders, catalog, marginContext] = await Promise.all([
    getSalesOrders(),
    getSalesInventoryCatalog(),
    getSalesMarginContext(),
  ]);

  return (
    <div className="space-y-6">
      <NewOrderForm inventory={catalog.items as never[]} marginContext={marginContext} />
      <OrdersWorkspace orders={orders as never[]} />
    </div>
  );
}
