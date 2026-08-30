export const ORDER_STATUS_SEQUENCE = [
  'new',
  'confirmed',
  'stock_check',
  'assigned',
  'picking',
  'packing',
  'ready_dispatch',
  'dispatched',
  'delivered',
  'completed',
] as const;

export type NormalOrderStatus = (typeof ORDER_STATUS_SEQUENCE)[number];
export type OrderStatus = NormalOrderStatus | 'on_hold' | 'cancelled';

const STATUS_LABELS: Record<OrderStatus, string> = {
  new: 'New',
  confirmed: 'Confirmed',
  stock_check: 'Stock Check',
  assigned: 'Assigned',
  picking: 'Picking',
  packing: 'Packing',
  ready_dispatch: 'Ready for Dispatch',
  dispatched: 'Dispatched',
  delivered: 'Delivered',
  completed: 'Completed',
  on_hold: 'On Hold',
  cancelled: 'Cancelled',
};

export function getOrderStatusLabel(status: OrderStatus): string {
  return STATUS_LABELS[status];
}

export function getSkippedOrderStatuses(current: OrderStatus, next: OrderStatus): NormalOrderStatus[] {
  if (current === 'on_hold') return [];
  const currentIndex = ORDER_STATUS_SEQUENCE.indexOf(current as NormalOrderStatus);
  const nextIndex = ORDER_STATUS_SEQUENCE.indexOf(next as NormalOrderStatus);
  if (currentIndex < 0 || nextIndex <= currentIndex + 1) return [];
  return ORDER_STATUS_SEQUENCE.slice(currentIndex + 1, nextIndex) as NormalOrderStatus[];
}

export function requiresStatusTransitionReason(current: OrderStatus, next: OrderStatus): boolean {
  return getSkippedOrderStatuses(current, next).length > 0;
}

export function canTransitionOrderStatus(current: OrderStatus, next: OrderStatus): boolean {
  if (current === next) return false;
  if (current === 'completed' || current === 'cancelled') return false;

  if (current === 'on_hold') {
    return (
      next === 'cancelled' ||
      (next !== 'completed' && ORDER_STATUS_SEQUENCE.includes(next as NormalOrderStatus))
    );
  }

  if (next === 'on_hold' || next === 'cancelled') return true;

  const currentIndex = ORDER_STATUS_SEQUENCE.indexOf(current as NormalOrderStatus);
  const nextIndex = ORDER_STATUS_SEQUENCE.indexOf(next as NormalOrderStatus);
  return currentIndex >= 0 && nextIndex > currentIndex;
}
