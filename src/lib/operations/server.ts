import { createClient } from '@/lib/supabase-server';
import type {
  OperationsInventoryItem,
  OperationsOrder,
  OperationsOrderEvent,
  OperationsOverview,
  OperationsWebsiteLink,
  OperationsPriority,
  OperationsSource,
  WebsiteRelationshipType,
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

  if (profileError || profile?.role !== 'admin') {
    throw new Error('Not authorized');
  }

  return { supabase, user };
}

export async function getOperationsOverview(): Promise<OperationsOverview> {
  const { supabase } = await requireAdmin();

  const [
    openOrdersResult,
    urgentOrdersResult,
    awaitingDispatchResult,
    inventoryResult,
    websiteLinksResult,
    recentOrdersResult,
    recentEventsResult,
    balancesResult,
  ] = await Promise.all([
    supabase
      .from('ops_orders')
      .select('id', { count: 'exact', head: true })
      .not('status', 'in', '(completed,cancelled)'),
    supabase
      .from('ops_orders')
      .select('id', { count: 'exact', head: true })
      .eq('priority', 'urgent')
      .not('status', 'in', '(completed,cancelled)'),
    supabase
      .from('ops_orders')
      .select('id', { count: 'exact', head: true })
      .in('status', ['ready_dispatch', 'dispatched']),
    supabase
      .from('ops_inventory_items')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true),
    supabase
      .from('ops_website_product_links')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true),
    supabase
      .from('ops_orders')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(6),
    supabase
      .from('ops_order_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(8),
    supabase
      .from('ops_stock_balances')
      .select('inventory_item_id,reorder_level,on_hand'),
  ]);

  const errors = [
    openOrdersResult.error,
    urgentOrdersResult.error,
    awaitingDispatchResult.error,
    inventoryResult.error,
    websiteLinksResult.error,
    recentOrdersResult.error,
    recentEventsResult.error,
    balancesResult.error,
  ].filter(Boolean);

  if (errors.length) throw new Error(errors[0]!.message);

  const totals = new Map<string, { onHand: number; reorderLevel: number }>();
  for (const row of balancesResult.data || []) {
    const current = totals.get(row.inventory_item_id) || {
      onHand: 0,
      reorderLevel: Number(row.reorder_level || 0),
    };
    current.onHand += Number(row.on_hand || 0);
    current.reorderLevel = Number(row.reorder_level || 0);
    totals.set(row.inventory_item_id, current);
  }

  const lowStockItems = Array.from(totals.values()).filter(
    (row) => row.onHand <= row.reorderLevel
  ).length;

  return {
    openOrders: openOrdersResult.count ?? 0,
    urgentOrders: urgentOrdersResult.count ?? 0,
    awaitingDispatch: awaitingDispatchResult.count ?? 0,
    inventoryItems: inventoryResult.count ?? 0,
    lowStockItems,
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

export async function getOperationsInventory(): Promise<OperationsInventoryItem[]> {
  const { supabase } = await requireAdmin();
  const [{ data: items, error: itemError }, { data: balances, error: balanceError }] =
    await Promise.all([
      supabase.from('ops_inventory_items').select('*').order('name'),
      supabase.from('ops_stock_balances').select('inventory_item_id,on_hand'),
    ]);

  if (itemError) throw new Error(itemError.message);
  if (balanceError) throw new Error(balanceError.message);

  const totals = new Map<string, number>();
  for (const row of balances || []) {
    totals.set(
      row.inventory_item_id,
      (totals.get(row.inventory_item_id) || 0) + Number(row.on_hand || 0)
    );
  }

  return ((items || []) as OperationsInventoryItem[]).map((item) => ({
    ...item,
    on_hand: totals.get(item.id) || 0,
  }));
}

export async function getWebsiteProductLinks(): Promise<{
  links: OperationsWebsiteLink[];
  inventory: OperationsInventoryItem[];
  websiteProducts: Array<{ id: string; name: string; slug: string; status: string | null }>;
}> {
  const { supabase } = await requireAdmin();
  const [linksResult, inventoryResult, productsResult] = await Promise.all([
    supabase
      .from('ops_website_product_links')
      .select('*, inventory_item:ops_inventory_items(sku,name), website_product:products(name,slug,status)')
      .order('created_at', { ascending: false }),
    supabase.from('ops_inventory_items').select('*').eq('is_active', true).order('name'),
    supabase.from('products').select('id,name,slug,status').order('name'),
  ]);

  if (linksResult.error) throw new Error(linksResult.error.message);
  if (inventoryResult.error) throw new Error(inventoryResult.error.message);
  if (productsResult.error) throw new Error(productsResult.error.message);

  return {
    links: (linksResult.data || []) as OperationsWebsiteLink[],
    inventory: (inventoryResult.data || []) as OperationsInventoryItem[],
    websiteProducts: productsResult.data || [],
  };
}

export async function createOperationsOrder(input: {
  sourceType: OperationsSource;
  sourceReference?: string | null;
  referenceLabel?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  priority: OperationsPriority;
  currentTeam?: string | null;
  dueAt?: string | null;
  items: Array<{
    inventoryItemId?: string | null;
    websiteProductId?: string | null;
    itemName: string;
    quantity: number;
    unitPrice?: number | null;
    note?: string | null;
  }>;
}) {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc('ops_create_order', {
    p_source_type: input.sourceType,
    p_source_reference: input.sourceReference ?? '',
    p_reference_label: input.referenceLabel ?? '',
    p_customer_name: input.customerName ?? '',
    p_customer_phone: input.customerPhone ?? '',
    p_customer_email: input.customerEmail ?? '',
    p_priority: input.priority,
    p_current_team: input.currentTeam ?? '',
    p_due_at: input.dueAt ?? null,
    p_items: input.items.map((item) => ({
      inventory_item_id: item.inventoryItemId ?? '',
      website_product_id: item.websiteProductId ?? '',
      item_name: item.itemName,
      quantity: item.quantity,
      unit_price: item.unitPrice ?? '',
      note: item.note ?? '',
    })),
  });

  return error
    ? { success: false as const, message: error.message }
    : { success: true as const, message: 'Order created', data };
}

export async function changeOperationsOrderStatus(
  orderId: string,
  status: OrderStatus,
  note?: string
) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc('ops_change_order_status', {
    p_order_id: orderId,
    p_new_status: status,
    p_note: note ?? null,
  });

  return error
    ? { success: false as const, message: error.message }
    : { success: true as const, message: 'Order status updated' };
}

export async function createInventoryItem(input: {
  sku: string;
  name: string;
  description?: string | null;
  category?: string | null;
  unit?: string;
  serialTracking?: boolean;
  reorderLevel?: number;
}) {
  const { supabase, user } = await requireAdmin();
  const { data, error } = await supabase
    .from('ops_inventory_items')
    .insert({
      sku: input.sku.trim(),
      name: input.name.trim(),
      description: input.description?.trim() || null,
      category: input.category?.trim() || null,
      unit: input.unit?.trim() || 'item',
      serial_tracking: Boolean(input.serialTracking),
      reorder_level: Math.max(0, Number(input.reorderLevel || 0)),
      created_by: user.id,
    })
    .select('*')
    .single();

  return error
    ? { success: false as const, message: error.message }
    : { success: true as const, message: 'Inventory item created', data };
}

export async function createWebsiteProductLink(input: {
  inventoryItemId: string;
  websiteProductId: string;
  relationshipType: WebsiteRelationshipType;
  websiteAllocation?: number | null;
  stockSyncEnabled?: boolean;
}) {
  const { supabase, user } = await requireAdmin();
  const { data, error } = await supabase
    .from('ops_website_product_links')
    .insert({
      inventory_item_id: input.inventoryItemId,
      website_product_id: input.websiteProductId,
      relationship_type: input.relationshipType,
      website_allocation: input.websiteAllocation ?? null,
      stock_sync_enabled: Boolean(input.stockSyncEnabled),
      created_by: user.id,
    })
    .select('*')
    .single();

  return error
    ? { success: false as const, message: error.message }
    : { success: true as const, message: 'Website product linked', data };
}
