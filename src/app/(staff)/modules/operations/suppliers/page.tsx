import { SuppliersClient } from '@/components/operations/suppliers/suppliers-client';
import { getOperationsSuppliers } from '@/lib/operations/sales-server';

export default async function SuppliersPage() {
  const suppliers = await getOperationsSuppliers();
  return <SuppliersClient suppliers={suppliers} />;
}
