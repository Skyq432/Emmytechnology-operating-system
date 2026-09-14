'use server';

import { revalidatePath } from 'next/cache';
import { applyRepairCashOff } from '@/lib/operations/cash-off-server';

export type RepairCashOffActionState = { success: boolean; message: string };

export async function applyRepairCashOffAction(
  _previous: RepairCashOffActionState,
  formData: FormData,
): Promise<RepairCashOffActionState> {
  const repairId = String(formData.get('repair_id') || '');
  const targetAmount = Number(formData.get('cash_off_amount') || 0);
  if (!repairId) return { success: false, message: 'Repair is required.' };
  if (!Number.isFinite(targetAmount) || targetAmount < 0) return { success: false, message: 'Enter a valid Cash-Off amount.' };

  const result = await applyRepairCashOff(repairId, targetAmount);
  if (result.success) {
    revalidatePath(`/modules/operations/repairs/${repairId}`);
    revalidatePath('/modules/operations/repairs');
  }
  return { success: result.success, message: result.message };
}
