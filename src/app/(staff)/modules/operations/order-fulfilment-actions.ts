'use server';

import { revalidatePath } from 'next/cache';
import { requireStaffCapability } from '@/lib/auth/capability-server';

export type DraftFulfilmentActionState = { success: boolean; message: string };
const fail = (message: string): DraftFulfilmentActionState => ({ success: false, message });

export async function saveDraftFulfilmentSourceAction(
  _prev: DraftFulfilmentActionState,
  formData: FormData,
): Promise<DraftFulfilmentActionState> {
  const orderId = String(formData.get('order_id') || '');
  const itemId = String(formData.get('item_id') || '');
  const source = String(formData.get('fulfilment_source') || 'internal');
  const locationId = String(formData.get('source_location_id') || '') || null;

  if (!orderId || !itemId) return fail('Order item is required.');
  if (!['internal', 'supplier', 'dropship', 'manual'].includes(source)) return fail('Choose a valid fulfilment source.');
  if (source === 'internal' && !locationId) return fail('Choose the internal stock location.');

  try {
    // A SECURITY DEFINER RPC, not a raw client-side UPDATE: ops_order_items' only
    // write RLS policy requires the 'admin'/'super_admin' role specifically, which
    // would silently no-op this save (0 rows affected, no error) for front_desk and
    // anyone else with just operations.order.manage.
    const { supabase } = await requireStaffCapability('operations.order.manage');
    const { error } = await supabase.rpc('ops_set_order_item_fulfilment_source', {
      p_order_id: orderId,
      p_item_id: itemId,
      p_fulfilment_source: source,
      p_source_location_id: source === 'internal' ? locationId : null,
    });

    if (error) return fail(error.message);
    revalidatePath(`/modules/operations/orders/${orderId}`);
    revalidatePath('/modules/operations/orders');
    revalidatePath('/modules/sales/orders');
    return { success: true, message: source === 'internal' ? 'Internal stock source saved.' : 'Fulfilment source saved.' };
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Unable to save fulfilment source.');
  }
}
