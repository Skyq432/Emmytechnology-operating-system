'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase-server';

export type DraftFulfilmentActionState = { success: boolean; message: string };
const fail = (message: string): DraftFulfilmentActionState => ({ success: false, message });

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Not authenticated');
  const { data: profile, error: profileError } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (profileError || profile?.role !== 'admin') throw new Error('Not authorized');
  return supabase;
}

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
    const supabase = await requireAdmin();
    const { data: order, error: orderError } = await supabase
      .from('ops_orders')
      .select('commercial_state')
      .eq('id', orderId)
      .single();
    if (orderError) return fail(orderError.message);
    if (order.commercial_state !== 'draft') return fail('Fulfilment source can only change while the Order is Draft.');

    const { error } = await supabase
      .from('ops_order_items')
      .update({
        fulfilment_source: source,
        source_location_id: source === 'internal' ? locationId : null,
      })
      .eq('id', itemId)
      .eq('order_id', orderId);

    if (error) return fail(error.message);
    revalidatePath(`/modules/operations/orders/${orderId}`);
    revalidatePath('/modules/operations/orders');
    revalidatePath('/modules/sales/orders');
    return { success: true, message: source === 'internal' ? 'Internal stock source saved.' : 'Fulfilment source saved.' };
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Unable to save fulfilment source.');
  }
}
