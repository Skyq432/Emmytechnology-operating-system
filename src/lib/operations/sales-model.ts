export const ORDER_ITEM_TYPES = ['laptop', 'phone', 'accessory', 'solar', 'other'] as const;

export type OrderItemType = (typeof ORDER_ITEM_TYPES)[number];
export type DerivedPaymentStatus = 'unpaid' | 'partial' | 'paid';

const specFields: Record<OrderItemType, readonly string[]> = {
  laptop: [
    'serial_number',
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

// Shared with the New Order / Direct Sale forms (which collect these values) and
// the receipt PDF (which prints whichever of them were actually filled in).
export const ORDER_ITEM_SPEC_LABELS: Record<string, string> = {
  serial_number: 'Serial number', generation: 'Generation', processor_type: 'Processor type', processor_speed_ghz: 'Processor speed (GHz)',
  ram: 'RAM', storage_size: 'Storage size', storage_type: 'Storage type', screen_size: 'Screen size',
  touchscreen: 'Touchscreen?', colour: 'Colour', os_installed: 'OS installed', charger_included: 'Charger included?',
  bag_included: 'Bag included?', storage_capacity: 'Storage capacity', network_type: 'Network type',
  sim_type: 'SIM type', accessories_included: 'Accessories included', category: 'Sub-category',
  subcategory: 'Sub-category', compatible_with: 'Compatible with', system_capacity: 'System capacity',
  brand: 'Brand', model_spec: 'Model / spec',
};

export const ORDER_ITEM_BOOLEAN_SPEC_KEYS = new Set(['touchscreen', 'charger_included', 'bag_included']);

// Field order per category, so the receipt's spec summary reads in a sensible
// order instead of however the JSON happens to serialize.
export function orderedSpecEntries(type: OrderItemType | null | undefined, specs: Record<string, unknown> | null | undefined) {
  if (!specs) return [] as Array<[string, unknown]>;
  const order = type ? specFields[type] : Object.keys(specs);
  return order
    .filter((key) => specs[key] !== null && specs[key] !== undefined && specs[key] !== '')
    .map((key) => [key, specs[key]] as [string, unknown]);
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
