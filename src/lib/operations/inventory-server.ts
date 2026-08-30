import { createClient } from '@/lib/supabase-server';
import type { OrderItemType } from './sales-model';

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Not authenticated');
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') throw new Error('Not authorized');
  return { supabase };
}

export async function createInventoryItemWithOpeningStock(input: {
  name: string;
  description?: string | null;
  category?: string | null;
  unit?: string;
  serialTracking?: boolean;
  reorderLevel?: number;
  itemType: OrderItemType;
  brand?: string | null;
  model?: string | null;
  condition?: string | null;
  defaultUnitCost?: number | null;
  defaultSellingPrice?: number | null;
  preferredSupplierId?: string | null;
  specs?: Record<string, unknown>;
  openingLocationId?: string | null;
  openingQuantity?: number;
}) {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc('ops_create_inventory_item', {
    p_name: input.name,
    p_description: input.description || null,
    p_category: input.category || null,
    p_unit: input.unit || 'item',
    p_serial_tracking: Boolean(input.serialTracking),
    p_reorder_level: Math.max(0, Number(input.reorderLevel || 0)),
    p_item_type: input.itemType,
    p_brand: input.brand || null,
    p_model: input.model || null,
    p_default_condition: input.condition || null,
    p_default_unit_cost: input.defaultUnitCost == null ? null : Math.max(0, Number(input.defaultUnitCost)),
    p_default_selling_price: input.defaultSellingPrice == null ? null : Math.max(0, Number(input.defaultSellingPrice)),
    p_preferred_supplier_id: input.preferredSupplierId || null,
    p_specs: input.specs || {},
    p_opening_location_id: input.openingLocationId || null,
    p_opening_quantity: Math.max(0, Number(input.openingQuantity || 0)),
  });
  return error ? { success: false as const, message: error.message } : { success: true as const, message: `Inventory item created: ${data.sku}`, data };
}

export async function addInventoryStock(input: {
  inventoryItemId: string;
  locationId: string;
  quantity: number;
  unitCost?: number | null;
  supplierId?: string | null;
  note?: string | null;
}) {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc('ops_add_inventory_stock', {
    p_inventory_item_id: input.inventoryItemId,
    p_location_id: input.locationId,
    p_quantity: Math.max(0, Number(input.quantity || 0)),
    p_unit_cost: input.unitCost == null ? null : Math.max(0, Number(input.unitCost)),
    p_supplier_id: input.supplierId || null,
    p_note: input.note || null,
  });
  return error ? { success: false as const, message: error.message } : { success: true as const, message: 'Stock added', data };
}
