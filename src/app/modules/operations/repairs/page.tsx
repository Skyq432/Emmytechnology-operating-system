import { RepairsClient } from '@/components/operations/repairs/repairs-client';
import { getAvailableRepairCards } from '@/lib/operations/repair-server';
import { getOperationsRepairs } from '@/lib/operations/sales-server';

export default async function RepairsPage() {
  const [repairs, availableCards] = await Promise.all([
    getOperationsRepairs(),
    getAvailableRepairCards(),
  ]);
  return <RepairsClient repairs={repairs} availableCards={availableCards} />;
}
