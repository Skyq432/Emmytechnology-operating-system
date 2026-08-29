export type CommercialState = 'draft' | 'confirmed' | 'cancelled';
export type CommissionStatus = 'none' | 'pending' | 'earned' | 'paid' | 'cancelled';
export type PaymentStatus = 'unpaid' | 'partial' | 'paid' | 'refund_pending' | 'refunded';

export type OrderTotalsInput = {
  subtotal: number;
  discountAmount?: number;
  cashOffAmount?: number;
  deliveryCharge?: number;
};

export type OrderTotals = {
  subtotal: number;
  discountAmount: number;
  cashOffAmount: number;
  deliveryCharge: number;
  totalAmount: number;
};

function money(value: number | undefined) {
  return Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0);
}

export function calculateOrderTotals(input: OrderTotalsInput): OrderTotals {
  const subtotal = money(input.subtotal);
  const discountAmount = money(input.discountAmount);
  const cashOffAmount = money(input.cashOffAmount);
  const deliveryCharge = money(input.deliveryCharge);
  const totalAmount = Math.max(0, subtotal - discountAmount - cashOffAmount + deliveryCharge);

  return { subtotal, discountAmount, cashOffAmount, deliveryCharge, totalAmount };
}

export function canConfirmOrder(state: CommercialState) {
  return state === 'draft';
}

export function shouldAdvanceCrmToPurchase(currentStage: number | null | undefined) {
  if (currentStage == null || !Number.isFinite(currentStage)) return true;
  return currentStage < 5;
}
