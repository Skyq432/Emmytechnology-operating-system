export type RepairStatus =
  | 'received'
  | 'diagnosing'
  | 'awaiting_customer_approval'
  | 'awaiting_payment'
  | 'awaiting_parts'
  | 'in_progress'
  | 'quality_check'
  | 'ready_collection'
  | 'rework'
  | 'collected'
  | 'cancelled';

export type RepairPaymentRequirement = 'none' | 'partial' | 'full';
export type RepairQuoteStatus = 'draft' | 'published' | 'approved' | 'declined' | 'superseded';

export const REPAIR_STATUS_SEQUENCE: RepairStatus[] = [
  'received',
  'diagnosing',
  'awaiting_customer_approval',
  'awaiting_payment',
  'awaiting_parts',
  'in_progress',
  'quality_check',
  'ready_collection',
  'rework',
  'collected',
  'cancelled',
];

export function requiredBeforeRepairStart(
  rule: RepairPaymentRequirement,
  quoteAmount: number,
  partialAmount: number
) {
  if (rule === 'none') return 0;
  if (rule === 'full') return Math.max(0, quoteAmount);
  return Math.min(Math.max(0, partialAmount), Math.max(0, quoteAmount));
}

export function canStartRepair(input: {
  quoteStatus: RepairQuoteStatus | null;
  amountPaid: number;
  requiredBeforeStart: number;
}) {
  return input.quoteStatus === 'approved' && input.amountPaid >= input.requiredBeforeStart;
}

export function deriveRepairPaymentStatus(
  total: number,
  paid: number
): 'unpaid' | 'partial' | 'paid' {
  if (total > 0 && paid >= total) return 'paid';
  if (paid > 0) return 'partial';
  return 'unpaid';
}

export const canBeginHandover = (status: RepairStatus) => status === 'ready_collection';

export function canCompleteRepairCollection(input: {
  finalAccepted: boolean;
  balanceDue: number;
  cardResolved: boolean;
}) {
  return input.finalAccepted && input.balanceDue <= 0 && input.cardResolved;
}
