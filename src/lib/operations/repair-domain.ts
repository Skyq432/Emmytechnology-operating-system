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

export type RepairWorkflowAction = {
  key:
    | 'start_diagnosis'
    | 'publish_quote'
    | 'await_payment'
    | 'await_parts'
    | 'start_repair'
    | 'quality_check'
    | 'ready_collection'
    | 'resume_rework'
    | 'cancel';
  label: string;
  status?: RepairStatus;
};

export function getRepairWorkflowActions(input: {
  status: RepairStatus;
  quoteStatus: RepairQuoteStatus | null;
  amountPaid: number;
  requiredBeforeStart: number;
}): RepairWorkflowAction[] {
  const cancel: RepairWorkflowAction = {
    key: 'cancel',
    label: 'Cancel Repair',
    status: 'cancelled',
  };
  const gateMet = canStartRepair({
    quoteStatus: input.quoteStatus,
    amountPaid: input.amountPaid,
    requiredBeforeStart: input.requiredBeforeStart,
  });

  switch (input.status) {
    case 'received':
      return [
        { key: 'start_diagnosis', label: 'Start Diagnosis', status: 'diagnosing' },
        cancel,
      ];
    case 'diagnosing':
      return [{ key: 'publish_quote', label: 'Publish Repair Quote' }, cancel];
    case 'awaiting_customer_approval':
      if (input.quoteStatus !== 'approved') return [cancel];
      if (!gateMet) {
        return [
          { key: 'await_payment', label: 'Awaiting Payment', status: 'awaiting_payment' },
          cancel,
        ];
      }
      return [
        { key: 'await_parts', label: 'Waiting for Parts', status: 'awaiting_parts' },
        { key: 'start_repair', label: 'Start Repair', status: 'in_progress' },
        cancel,
      ];
    case 'awaiting_payment':
      if (!gateMet) return [cancel];
      return [
        { key: 'await_parts', label: 'Waiting for Parts', status: 'awaiting_parts' },
        { key: 'start_repair', label: 'Start Repair', status: 'in_progress' },
        cancel,
      ];
    case 'awaiting_parts':
      return gateMet
        ? [{ key: 'start_repair', label: 'Start Repair', status: 'in_progress' }, cancel]
        : [cancel];
    case 'in_progress':
      return [
        { key: 'quality_check', label: 'Send to Quality Check', status: 'quality_check' },
        cancel,
      ];
    case 'quality_check':
      return [
        { key: 'ready_collection', label: 'Mark Ready for Collection', status: 'ready_collection' },
        { key: 'resume_rework', label: 'Needs Rework', status: 'rework' },
        cancel,
      ];
    case 'ready_collection':
      return [{ key: 'resume_rework', label: 'Return to Rework', status: 'rework' }, cancel];
    case 'rework':
      return [
        { key: 'start_repair', label: 'Resume Repair', status: 'in_progress' },
        { key: 'quality_check', label: 'Send to Quality Check', status: 'quality_check' },
        { key: 'publish_quote', label: 'Publish Revised Quote' },
        cancel,
      ];
    case 'collected':
    case 'cancelled':
      return [];
  }
}
