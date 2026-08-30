export const ORDER_ITEM_TYPES = ['laptop', 'phone', 'accessory', 'solar', 'other'] as const;

export type OrderItemType = (typeof ORDER_ITEM_TYPES)[number];
export type DerivedPaymentStatus = 'unpaid' | 'partial' | 'paid';

const specFields: Record<OrderItemType, readonly string[]> = {
  laptop: [
    'generation',
    'processor_type',
    'processor_speed_ghz',
    'ram',
    'storage_size',
    'storage_type',
    'screen_size',
    'touchscreen',
    'colour',
    'os_installed',
    'charger_included',
    'bag_included',
  ],
  phone: [
    'storage_capacity',
    'ram',
    'colour',
    'network_type',
    'sim_type',
    'accessories_included',
  ],
  accessory: ['category', 'subcategory', 'compatible_with', 'colour'],
  solar: ['system_capacity', 'brand', 'model_spec'],
  other: [],
};

export function getOrderItemTypeLabel(type: OrderItemType) {
  return ({
    laptop: 'Laptop',
    phone: 'Phone',
    accessory: 'Accessory',
    solar: 'Solar',
    other: 'Other',
  } satisfies Record<OrderItemType, string>)[type];
}

export function getRelevantSpecFields(type: OrderItemType): readonly string[] {
  return specFields[type];
}

export function calculateBalanceDue(totalAmount: number, amountPaid: number) {
  return Math.max(0, Number(totalAmount || 0) - Number(amountPaid || 0));
}

export function derivePaymentStatus(totalAmount: number, amountPaid: number): DerivedPaymentStatus {
  const total = Math.max(0, Number(totalAmount || 0));
  const paid = Math.max(0, Number(amountPaid || 0));
  if (total > 0 && paid >= total) return 'paid';
  if (paid > 0) return 'partial';
  return 'unpaid';
}

export function calculateRepairProfit(input: {
  amountCharged: number;
  partsCost: number;
  labourCost: number;
}) {
  return Number(input.amountCharged || 0) - Number(input.partsCost || 0) - Number(input.labourCost || 0);
}
