import { hasCapability } from '@/lib/auth/roles';
import { requireStaffCapability } from '@/lib/auth/capability-server';

export async function getRepairCashOffContext(identityId: string | null) {
  const { supabase, role } = await requireStaffCapability('operations.repair.read');
  const canApply = hasCapability(role, 'operations.repair.finance');
  if (!identityId || !canApply) return { balance: 0, canApply };

  const { data, error } = await supabase
    .from('cash_off_accounts')
    .select('balance')
    .eq('identity_id', identityId)
    .maybeSingle();

  if (error) throw new Error(`Unable to load Cash-Off balance: ${error.message}`);
  return { balance: Number(data?.balance || 0), canApply };
}

export async function applyRepairCashOff(repairId: string, targetAmount: number) {
  const { supabase } = await requireStaffCapability('operations.repair.finance');
  const { data, error } = await supabase.rpc('ops_apply_repair_cash_off', {
    p_repair_id: repairId,
    p_target_amount: Math.max(0, Number(targetAmount || 0)),
  });

  if (error) return { success: false as const, message: error.message };
  return { success: true as const, message: 'Cash-Off applied to repair', data };
}
