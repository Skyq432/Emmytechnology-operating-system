import { ReturnsWorkspace } from '@/components/sales/returns-workspace';
import { getSalesOrders, getSalesReturns } from '@/lib/sales/read-server';

export default async function SalesReturnsPage() {
  const [orders, returns] = await Promise.all([getSalesOrders(), getSalesReturns()]);
  return <ReturnsWorkspace orders={orders as never[]} returns={returns as never[]} />;
}
