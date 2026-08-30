import { RepairsClient } from '@/components/operations/repairs/repairs-client';
import { getOperationsRepairs } from '@/lib/operations/sales-server';

export default async function RepairsPage() {
  const repairs = await getOperationsRepairs();
  return <RepairsClient repairs={repairs} />;
}
