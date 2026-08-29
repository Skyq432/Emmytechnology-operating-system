import { createClient } from '@/lib/supabase-server';
import type {
  OperationsInventoryItem,
  OperationsLocation,
  OperationsOrder,
  OperationsOrderEvent,
  OperationsOverview,
  OperationsWebsiteLink,
  OperationsPriority,
  OperationsSource,
  WebsiteRelationshipType,
  FulfilmentSource,
} from './types';
import type { OrderStatus } from './domain';

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Not authenticated');

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profileError || profile?.role !== 'admin') throw new Error('Not authorized');
  return { supabase, user };
}

export async function getOperationsOverview(): Promise<OperationsOverview> {
  const { supabase } = await requireAdmin();
  const [openOrdersResult, urgentOrdersResult, awaitingDispatchResult, inventoryResult, websiteLinksResult, recentOrdersResult, recentEventsResult, availabilityResult] = await Promise.all([
    supabase.from('ops_orders').select('id', { count: 'exact', head: true }).not('status', 'in', '(completed,cancelled)'),
    supabase.from('ops_orders').select('id', { count: 'exact', head: true }).eq('priority', 'urgent').not('status', 'in', '(completed,cancelled)'),
    supabase.from('ops_orders').select('id', { count: 'exact', head: true }).in('status', ['ready_dispatch', 'dispatched']),
    supabase.from('ops_inventory_items').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('ops_website_product_links').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('ops_orders').select('*').order('updated_at', { ascending: false }).limit(6),
    supabase.from('ops_order_events').select('*').order('created_at', { ascending: false }).limit(8),
    supabase.from('ops_inventory_availability').select('inventory_item_id,reorder_level,on_hand,reserved,available'),
  ]);

  const errors = [openOrdersResult.error, urgentOrdersResult.error, awaitingDispatchResult.error, inventoryResult.error, websiteLinksResult.error, recentOrdersResult.error, recentEventsResult.error, availabilityResult.error].filter(Boolean);
  if (errors.length) throw new Error(errors[0]!.message);

  const totals = new Map<string, { available: number; reorderLevel: number }>();
  for (const row of availabilityResult.data || []) {
    const current = totals.get(row.inventory_item_id) || { available: 0, reorderLevel: Number(row.reorder_level || 0) };
    current.available += Number(row.available || 0);
    current.reorderLevel = Number(row.reorder_level || 0);
    totals.set(row.inventory_item_id, current);
  }

  return {
    openOrders: openOrdersResult.count ?? 0,
    urgentOrders: urgentOrdersResult.count ?? 0,
    awaitingDispatch: awaitingDispatchResult.count ?? 0,
    inventoryItems: inventoryResult.count ?? 0,
    lowStockItems: Array.from(totals.values()).filter((row) => row.available <= row.reorderLevel).length,
    websiteLinks: websiteLinksResult.count ?? 0,
    recentOrders: (recentOrdersResult.data || []) as OperationsOrder[],
    recentEvents: (recentEventsResult.data || []) as OperationsOrderEvent[],
  };
}

export async function getOperationsOrders(): Promise<OperationsOrder[]> {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from('ops_orders')
    .select('*, items:ops_order_items(*)')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as OperationsOrder[];
}

export async function getOperationsLocations(): Promise<OperationsLocation[]> {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from('ops_locations')
    .select('id,code,name,location_type')
    .eq('is_active', true)
    .order('name');
  if (error) throw new Error(error.message);
  return (data || []) as OperationsLocation[];
}

export async function getOperationsInventory(): Promise<OperationsInventoryItem[]> {
  const { supabase } = await requireAdmin();
  const [{ data: items, error: itemError }, { data: availability, error: availabilityError }] = await Promise.all([
    supabase.from('ops_inventory_items').select('*').order('name'),
    supabase.from('ops_inventory_availability').select('*'),
  ]);
  if (itemError) throw new Error(itemError.message);
  if (availabilityError) throw new Error(availabilityError.message);

  const grouped = new Map<string, OperationsInventoryItem['location_balances']>();
  for (const row of availability || []) {
    const rows = grouped.get(row.inventory_item_id) || [];
    rows.push({
      location_id: row.location_id,
      location_code: row.location_code,
      location_name: row.location_name,
      on_hand: Number(row.on_hand || 0),
      reserved: Number(row.reserved || 0),
      available: Number(row.available || 0),
    });
    grouped.set(row.inventory_item_id, rows);
  }

  return ((items || []) as OperationsInventoryItem[]).map((item) => {
    const locationBalances = grouped.get(item.id) || [];
    return {
      ...item,
      location_balances: locationBalances,
      on_hand: locationBalances.reduce((sum, row) => sum + row.on_hand, 0),
      reserved: locationBalances.reduce((sum, row) => sum + row.reserved, 0),
      available: locationBalances.reduce((sum, row) => sum + row.available, 0),
    };
  });
}

export async function getWebsiteProductLinks(): Promise<{
  links: OperationsWebsiteLink[];
  inventory: OperationsInventoryItem[];
  websiteProducts: Array<{ id: string; name: string; slug: string; status: string | null; price: number | null; sale_price: number | null }>;
}> {
  const { supabase } = await requireAdmin();
  const [linksResult, inventoryResult, productsResult] = await Promise.all([
    supabase.from('ops_website_product_links').select('*, inventory_item:ops_inventory_items(sku,name), website_product:products(name,slug,status)').order('created_at', { ascending: false }),
    supabase.from('ops_inventory_items').select('*').eq('is_active', true).order('name'),
    supabase.from('products').select('id,name,slug,status,price,sale_price').order('name'),
  ]);
  if (linksResult.error) throw new Error(linksResult.error.message);
  if (inventoryResult.error) throw new Error(inventoryResult.error.message);
  if (productsResult.error) throw new Error(productsResult.error.message);
  return {
    links: (linksResult.data || []) as OperationsWebsiteLink[],
    inventory: (inventoryResult.data || []) as OperationsInventoryItem[],
    websiteProducts: (productsResult.data || []).map((row) => ({ ...row, price: row.price == null ? null : Number(row.price), sale_price: row.sale_price == null ? null : Number(row.sale_price) })),
  };
}

export async function createOperationsOrder(input: {
  sourceType: OperationsSource;
  sourceReference?: string | null;
  referenceLabel?: string | null;
  identityId?: string | null;
  leadId?: string | null;
  ambassadorId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  priority: OperationsPriority;
  currentTeam?: string | null;
  dueAt?: string | null;
  discountType?: string | null;
  discountAmount?: number;
  discountPercentage?: number;
  discountReason?: string | null;
  cashOffAmount?: number;
  deliveryCharge?: number;
  commissionRate?: number;
  acquisitionSource?: string | null;
  items: Array<{
    inventoryItemId?: string | null;
    websiteProductId?: string | null;
    itemName: string;
    quantity: number;
    unitPrice?: number | null;
    listPrice?: number | null;
    lineDiscountAmount?: number;
    fulfilmentSource?: FulfilmentSource;
    sourceLocationId?: string | null;
    note?: string | null;
  }>;
}) {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc('ops_create_draft_order', {
    p_source_type: input.sourceType,
    p_source_reference: input.sourceReference ?? '',
    p_reference_label: input.referenceLabel ?? '',
    p_identity_id: input.identityId ?? null,
    p_lead_id: input.leadId ?? null,
    p_ambassador_id: input.ambassadorId ?? null,
    p_customer_name: input.customerName ?? '',
    p_customer_phone: input.customerPhone ?? '',
    p_customer_email: input.customerEmail ?? '',
    p_priority: input.priority,
    p_current_team: input.currentTeam ?? '',
    p_due_at: input.dueAt ?? null,
    p_discount_type: input.discountType ?? '',
    p_discount_amount: Math.max(0, Number(input.discountAmount || 0)),
    p_discount_percentage: Math.max(0, Number(input.discountPercentage || 0)),
    p_discount_reason: input.discountReason ?? '',
    p_cash_off_amount: Math.max(0, Number(input.cashOffAmount || 0)),
    p_delivery_charge: Math.max(0, Number(input.deliveryCharge || 0)),
    p_commission_rate: Math.max(0, Number(input.commissionRate || 0)),
    p_acquisition_source: input.acquisitionSource ?? '',
    p_items: input.items.map((item) => ({
      inventory_item_id: item.inventoryItemId ?? '',
      website_product_id: item.websiteProductId ?? '',
      item_name: item.itemName,
      quantity: item.quantity,
      unit_price: item.unitPrice ?? 0,
      list_price: item.listPrice ?? item.unitPrice ?? 0,
      line_discount_amount: item.lineDiscountAmount ?? 0,
      fulfilment_source: item.fulfilmentSource ?? 'manual',
      source_location_id: item.sourceLocationId ?? '',
      note: item.note ?? '',
    })),
  });
  return error ? { success: false as const, message: error.message } : { success: true as const, message: 'Draft order created', data };
}

export async function confirmOperationsOrder(orderId: string) {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc('ops_confirm_order', { p_order_id: orderId });
  return error ? { success: false as const, message: error.message } : { success: true as const, message: 'Order confirmed', data };
}

export async function changeOperationsOrderStatus(orderId: string, status: OrderStatus, note?: string) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc('ops_change_order_status', { p_order_id: orderId, p_new_status: status, p_note: note ?? null });
  return error ? { success: false as const, message: error.message } : { success: true as const, message: 'Order status updated' };
}

export async function createInventoryItem(input: {
  name: string;
  description?: string | null;
  category?: string | null;
  unit?: string;
  serialTracking?: boolean;
  reorderLevel?: number;
}) {
  const { supabase, user } = await requireAdmin();
  const { data, error } = await supabase.from('ops_inventory_items').insert({
    name: input.name.trim(),
    description: input.description?.trim() || null,
    category: input.category?.trim() || null,
    unit: input.unit?.trim() || 'item',
    serial_tracking: Boolean(input.serialTracking),
    reorder_level: Math.max(0, Number(input.reorderLevel || 0)),
    created_by: user.id,
  }).select('*').single();
  return error ? { success: false as const, message: error.message } : { success: true as const, message: `Inventory item created: ${data.sku}`, data };
}

export async function createWebsiteProductLink(input: {
  inventoryItemId: string;
  websiteProductId: string;
  relationshipType: WebsiteRelationshipType;
  websiteAllocation?: number | null;
  stockSyncEnabled?: boolean;
}) {
  const { supabase, user } = await requireAdmin();
  const { data, error } = await supabase.from('ops_website_product_links').insert({
    inventory_item_id: input.inventoryItemId,
    website_product_id: input.websiteProductId,
    relationship_type: input.relationshipType,
    website_allocation: input.websiteAllocation ?? null,
    stock_sync_enabled: Boolean(input.stockSyncEnabled),
    created_by: user.id,
  }).select('*').single();
  return error ? { success: false as const, message: error.message } : { success: true as const, message: 'Website product linked', data };
}
