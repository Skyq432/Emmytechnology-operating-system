import { createClient } from '@/lib/supabase-server';
import type { ReportingRange } from '@/lib/reporting-period';
import type { TransferCarrierType } from './transfer';

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Not authenticated');
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') throw new Error('Not authorized');
  return { supabase, user };
}

export async function getOperationsTransfers(range: ReportingRange) {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from('ops_stock_transfers')
    .select(`
      *,
      inventory_item:ops_inventory_items(sku,name),
      from_location:ops_locations!ops_stock_transfers_from_location_id_fkey(code,name),
      to_location:ops_locations!ops_stock_transfers_to_location_id_fkey(code,name),
      order:ops_orders(order_code,customer_name),
      carrier_user:users!ops_stock_transfers_carrier_user_id_fkey(name,email)
    `)
    .gte('created_at', range.startIso)
    .lt('created_at', range.endExclusiveIso)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getTransferFormData() {
  const { supabase } = await requireAdmin();
  const [inventoryResult, locationsResult, usersResult, reservationsResult] = await Promise.all([
    supabase.from('ops_inventory_availability').select('*').gt('on_hand', 0),
    supabase.from('ops_locations').select('id,code,name,location_type').eq('is_active', true).order('name'),
    supabase.from('users').select('id,name,email').eq('role', 'admin').order('name'),
    supabase.from('ops_inventory_reservations').select(`
      id,order_id,order_item_id,inventory_item_id,location_id,quantity,status,
      order:ops_orders(order_code,customer_name),
      order_item:ops_order_items(item_name)
    `).eq('status', 'active'),
  ]);
  const errors = [inventoryResult.error, locationsResult.error, usersResult.error, reservationsResult.error].filter(Boolean);
  if (errors.length) throw new Error(errors[0]!.message);
  return {
    availability: inventoryResult.data || [],
    locations: locationsResult.data || [],
    users: usersResult.data || [],
    reservations: reservationsResult.data || [],
  };
}

export async function startOperationsTransfer(input: {
  inventoryItemId: string;
  fromLocationId: string;
  toLocationId: string;
  quantity: number;
  orderId?: string | null;
  orderItemId?: string | null;
  carrierType: TransferCarrierType;
  carrierUserId?: string | null;
  carrierName?: string | null;
  carrierPhone?: string | null;
  carrierReference?: string | null;
  reason?: string | null;
  note?: string | null;
}) {
  const { supabase } = await requireAdmin();
  if (!input.inventoryItemId || !input.fromLocationId || !input.toLocationId) {
    return { success: false as const, message: 'Choose an item, source and destination.', orderId: input.orderId || null };
  }
  const { data, error } = await supabase.rpc('ops_start_stock_transfer', {
    p_inventory_item_id: input.inventoryItemId,
    p_from_location_id: input.fromLocationId,
    p_to_location_id: input.toLocationId,
    p_quantity: input.quantity,
    p_order_id: input.orderId ?? null,
    p_order_item_id: input.orderItemId ?? null,
    p_carrier_type: input.carrierType,
    p_carrier_user_id: input.carrierUserId ?? null,
    p_carrier_name: input.carrierName ?? null,
    p_carrier_phone: input.carrierPhone ?? null,
    p_carrier_reference: input.carrierReference ?? null,
    p_reason: input.reason ?? null,
    p_note: input.note ?? null,
  });
  return error
    ? { success: false as const, message: error.message, orderId: input.orderId || null }
    : { success: true as const, message: 'Transfer started. Stock is now In Transit.', data, orderId: input.orderId || null };
}

export async function receiveOperationsTransfer(transferId: string, note?: string) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc('ops_receive_stock_transfer', { p_transfer_id: transferId, p_note: note || null });
  return error ? { success: false as const, message: error.message } : { success: true as const, message: 'Transfer received.' };
}

export async function cancelOperationsTransfer(transferId: string, note?: string) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc('ops_cancel_stock_transfer', { p_transfer_id: transferId, p_note: note || null });
  return error ? { success: false as const, message: error.message } : { success: true as const, message: 'Transfer cancelled and stock returned to source.' };
}
