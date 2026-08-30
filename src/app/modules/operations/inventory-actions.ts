'use server';

import { revalidatePath } from 'next/cache';
import { addInventoryStock, createInventoryItemWithOpeningStock } from '@/lib/operations/inventory-server';
import type { OrderItemType } from '@/lib/operations/sales-model';

export type InventoryActionState = { success: boolean; message: string };
const fail = (message: string): InventoryActionState => ({ success: false, message });

function buildSpecs(formData: FormData, itemType: OrderItemType) {
  const specs: Record<string, unknown> = {};
  const keysByType: Record<OrderItemType, string[]> = {
    laptop: ['generation','processor_type','processor_speed_ghz','ram','storage_size','storage_type','screen_size','touchscreen','colour','os_installed','charger_included','bag_included'],
    phone: ['storage_capacity','ram','colour','network_type','sim_type','accessories_included'],
    accessory: ['subcategory','compatible_with','colour'],
    solar: ['system_capacity'],
    other: [],
  };
  for (const key of keysByType[itemType]) {
    const raw = formData.get(key);
    if (raw === null) continue;
    if (['touchscreen','charger_included','bag_included'].includes(key)) specs[key] = raw === 'on';
    else if (String(raw).trim()) specs[key] = String(raw).trim();
  }
  return specs;
}

export async function createInventoryItemEnhancedAction(
  _previousState: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const name = String(formData.get('name') || '').trim();
  if (!name) return fail('Item name is required.');
  const itemType = String(formData.get('item_type') || 'other') as OrderItemType;
  const serialTracking = formData.get('serial_tracking') === 'on';
  const openingQuantity = Math.max(0, Number(formData.get('opening_quantity') || 0));
  const openingLocationId = String(formData.get('opening_location_id') || '') || null;
  if (!serialTracking && openingQuantity > 0 && !openingLocationId) return fail('Choose where the opening stock is located.');
  if (serialTracking && openingQuantity > 0) return fail('Serialized items are added one device at a time after the item is created.');

  const result = await createInventoryItemWithOpeningStock({
    name,
    description: String(formData.get('description') || ''),
    category: String(formData.get('category') || ''),
    unit: String(formData.get('unit') || 'item'),
    serialTracking,
    reorderLevel: Number(formData.get('reorder_level') || 0),
    itemType,
    brand: String(formData.get('brand') || ''),
    model: String(formData.get('model') || ''),
    condition: String(formData.get('condition') || ''),
    defaultUnitCost: String(formData.get('default_unit_cost') || '') ? Number(formData.get('default_unit_cost')) : null,
    defaultSellingPrice: String(formData.get('default_selling_price') || '') ? Number(formData.get('default_selling_price')) : null,
    preferredSupplierId: String(formData.get('preferred_supplier_id') || '') || null,
    specs: buildSpecs(formData, itemType),
    openingLocationId,
    openingQuantity,
  });
  if (result.success) {
    revalidatePath('/modules/operations');
    revalidatePath('/modules/operations/inventory');
  }
  return { success: result.success, message: result.message };
}

export async function addInventoryStockAction(
  _previousState: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const inventoryItemId = String(formData.get('inventory_item_id') || '');
  const locationId = String(formData.get('location_id') || '');
  const quantity = Number(formData.get('quantity') || 0);
  if (!inventoryItemId || !locationId) return fail('Choose an inventory item and location.');
  if (quantity <= 0) return fail('Quantity must be greater than zero.');
  const result = await addInventoryStock({
    inventoryItemId,
    locationId,
    quantity,
    unitCost: String(formData.get('unit_cost') || '') ? Number(formData.get('unit_cost')) : null,
    supplierId: String(formData.get('supplier_id') || '') || null,
    note: String(formData.get('note') || ''),
  });
  if (result.success) {
    revalidatePath('/modules/operations');
    revalidatePath('/modules/operations/inventory');
    revalidatePath(`/modules/operations/inventory/${inventoryItemId}`);
  }
  return { success: result.success, message: result.message };
}
