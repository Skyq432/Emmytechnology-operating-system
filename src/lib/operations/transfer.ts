export type TransferStatus = 'in_transit' | 'received' | 'cancelled';
export type TransferCarrierType =
  | 'emmytech_staff'
  | 'dispatch_rider'
  | 'supplier_delivery'
  | 'courier'
  | 'emmytech_vehicle'
  | 'other';

export function canCreateTransfer(input: { from: string; to: string }) {
  if (!input.from || !input.to) return false;
  if (input.from === input.to) return false;
  if (input.to === 'TRANSIT') return false;
  return true;
}

export function canReceiveTransfer(status: TransferStatus | string) {
  return status === 'in_transit';
}

export function canCancelTransfer(status: TransferStatus | string) {
  return status === 'in_transit';
}
