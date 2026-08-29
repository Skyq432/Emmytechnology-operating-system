import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase-server';
import { getReportingRange, type ReportingPreset, type ReportingRange } from '@/lib/reporting-period';
import type { OperationsInventoryItem, OperationsOrder, OperationsOrderEvent, OperationsOverview } from './types';

const COOKIE_KEY = 'emmytech-reporting-period-v1';

type StoredPeriod = { preset: ReportingPreset; startDate?: string; endDate?: string };

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Not authenticated');
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') throw new Error('Not authorized');
  return supabase;
}

export async function getOperationsReportingRange(): Promise<ReportingRange> {
  const store = await cookies();
  const raw = store.get(COOKIE_KEY)?.value;
  if (!raw) return getReportingRange('this_month');
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as StoredPeriod;
    return getReportingRange(parsed.preset || 'this_month', parsed.startDate, parsed.endDate);
  } catch {
    return getReportingRange('this_month');
  }
}

export async function getOperationsOrdersForRange(range: ReportingRange): Promise<OperationsOrder[]> {
  const supabase = await requireAdmin();
  const { data, error } = await supabase
    .from('ops_orders')
    .select('*, items:ops_order_items(*)')
    .gte('created_at', range.startIso)
    .lt('created_at', range.endExclusiveIso)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as OperationsOrder[];
}

export async function getOperationsOverviewForRange(range: ReportingRange): Promise<OperationsOverview> {
  const supabase = await requireAdmin();
  const period = (query: any, column = 'created_at') => query.gte(column, range.startIso).lt(column, range.endExclusiveIso);
  const [open, urgent, dispatch, inventory, links, orders, events, availability] = await Promise.all([
    period(supabase.from('ops_orders').select('id', { count: 'exact', head: true }).not('status', 'in', '(completed,cancelled)')),
    period(supabase.from('ops_orders').select('id', { count: 'exact', head: true }).eq('priority', 'urgent').not('status', 'in', '(completed,cancelled)')),
    period(supabase.from('ops_orders').select('id', { count: 'exact', head: true }).in('status', ['ready_dispatch', 'dispatched'])),
    supabase.from('ops_inventory_items').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('ops_website_product_links').select('id', { count: 'exact', head: true }).eq('is_active', true),
    period(supabase.from('ops_orders').select('*')).order('updated_at', { ascending: false }).limit(6),
    period(supabase.from('ops_order_events').select('*')).order('created_at', { ascending: false }).limit(8),
    supabase.from('ops_inventory_availability').select('inventory_item_id,reorder_level,available'),
  ]);
  const errors = [open.error, urgent.error, dispatch.error, inventory.error, links.error, orders.error, events.error, availability.error].filter(Boolean);
  if (errors.length) throw new Error(errors[0]!.message);
  const totals = new Map<string, { available: number; reorderLevel: number }>();
  for (const row of availability.data || []) {
    const current = totals.get(row.inventory_item_id) || { available: 0, reorderLevel: Number(row.reorder_level || 0) };
    current.available += Number(row.available || 0);
    totals.set(row.inventory_item_id, current);
  }
  return {
    openOrders: open.count ?? 0,
    urgentOrders: urgent.count ?? 0,
    awaitingDispatch: dispatch.count ?? 0,
    inventoryItems: inventory.count ?? 0,
    lowStockItems: Array.from(totals.values()).filter((x) => x.available <= x.reorderLevel).length,
    websiteLinks: links.count ?? 0,
    recentOrders: (orders.data || []) as OperationsOrder[],
    recentEvents: (events.data || []) as OperationsOrderEvent[],
  };
}

export async function getOperationsInventoryForRange(range: ReportingRange): Promise<OperationsInventoryItem[]> {
  const supabase = await requireAdmin();
  const [itemsResult, locationsResult, movementsResult, reservationsResult] = await Promise.all([
    supabase.from('ops_inventory_items').select('*').order('name'),
    supabase.from('ops_locations').select('id,code,name').eq('is_active', true),
    supabase.from('ops_stock_movements').select('inventory_item_id,location_id,quantity_delta,created_at').lt('created_at', range.endExclusiveIso),
    supabase.from('ops_inventory_reservations').select('inventory_item_id,location_id,quantity,status,created_at,released_at,fulfilled_at').lt('created_at', range.endExclusiveIso),
  ]);
  const errors = [itemsResult.error, locationsResult.error, movementsResult.error, reservationsResult.error].filter(Boolean);
  if (errors.length) throw new Error(errors[0]!.message);
  const locations = new Map((locationsResult.data || []).map((x) => [x.id, x]));
  const stock = new Map<string, number>();
  for (const row of movementsResult.data || []) {
    const key = `${row.inventory_item_id}:${row.location_id}`;
    stock.set(key, (stock.get(key) || 0) + Number(row.quantity_delta || 0));
  }
  const reserved = new Map<string, number>();
  for (const row of reservationsResult.data || []) {
    const endedBeforeRangeEnd =
      (row.released_at && row.released_at < range.endExclusiveIso) ||
      (row.fulfilled_at && row.fulfilled_at < range.endExclusiveIso);
    if (endedBeforeRangeEnd) continue;
    if (row.status === 'cancelled' && !row.released_at) continue;
    const key = `${row.inventory_item_id}:${row.location_id}`;
    reserved.set(key, (reserved.get(key) || 0) + Number(row.quantity || 0));
  }
  return ((itemsResult.data || []) as OperationsInventoryItem[]).map((item) => {
    const location_balances = Array.from(locations.values()).map((location) => {
      const key = `${item.id}:${location.id}`;
      const on_hand = stock.get(key) || 0;
      const reservedQty = reserved.get(key) || 0;
      return { location_id: location.id, location_code: location.code, location_name: location.name, on_hand, reserved: reservedQty, available: Math.max(0, on_hand - reservedQty) };
    });
    return {
      ...item,
      location_balances,
      on_hand: location_balances.reduce((sum, x) => sum + x.on_hand, 0),
      reserved: location_balances.reduce((sum, x) => sum + x.reserved, 0),
      available: location_balances.reduce((sum, x) => sum + x.available, 0),
    };
  });
}
