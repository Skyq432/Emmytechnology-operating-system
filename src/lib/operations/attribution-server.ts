import { requireStaffCapability } from '@/lib/auth/capability-server';

export async function getOperationsAmbassadors() {
  // Read-only capability: this only lists ambassadors for a dropdown, it doesn't write
  // attribution. Called for every order detail page, so it must not require more than
  // operations.read — technician, sales_analyst and marketing_manager can all view an
  // order but don't have operations.order.manage, and previously crashed the whole page
  // (an uncaught "Not authorized" thrown inside an un-caught Promise.all). The actual
  // write, updateDraftOrderAttribution, still independently requires operations.order.manage.
  const { supabase } = await requireStaffCapability('operations.read');
  const { data, error } = await supabase
    .from('ambassadors')
    .select('id,display_name,ambassador_tag,user_id,users(name,email)')
    .eq('status', 'active')
    .order('display_name');
  if (error) throw new Error(error.message);
  return (data || []).map((row) => {
    const user = Array.isArray(row.users) ? row.users[0] : row.users;
    return {
      id: row.id as string,
      name: row.display_name || user?.name || user?.email || row.ambassador_tag || 'Ambassador',
      tag: row.ambassador_tag || null,
    };
  });
}

export async function updateDraftOrderAttribution(input: {
  orderId: string;
  ambassadorId: string | null;
  commissionRate: number;
  attributionSource: 'automatic' | 'manual_admin';
}) {
  const { supabase, user } = await requireStaffCapability('operations.order.manage');
  const { data: order, error: orderError } = await supabase
    .from('ops_orders')
    .select('id,commercial_state')
    .eq('id', input.orderId)
    .single();
  if (orderError) return { success: false as const, message: orderError.message };
  if (order.commercial_state !== 'draft') return { success: false as const, message: 'Attribution can only be changed while the order is Draft.' };

  const ambassadorId = input.ambassadorId || null;
  const rate = ambassadorId ? Math.max(0, Number(input.commissionRate || 0)) : 0;
  const { error } = await supabase
    .from('ops_orders')
    .update({
      ambassador_id: ambassadorId,
      commission_rate: rate,
      commission_amount: 0,
      commission_status: 'none',
      attribution_note: ambassadorId
        ? `${input.attributionSource === 'automatic' ? 'Automatically detected' : 'Manually assigned by authorised staff'} before confirmation`
        : 'No Ambassador attribution',
    })
    .eq('id', input.orderId)
    .eq('commercial_state', 'draft');
  if (error) return { success: false as const, message: error.message };

  await supabase.from('ops_order_events').insert({
    order_id: input.orderId,
    event_type: 'attribution_updated',
    title: ambassadorId ? 'Ambassador attribution updated' : 'Ambassador attribution removed',
    actor_id: user.id,
    metadata: { ambassador_id: ambassadorId, commission_rate: rate, attribution_source: input.attributionSource },
  });

  return { success: true as const, message: ambassadorId ? 'Ambassador and commission updated.' : 'Ambassador attribution removed.' };
}
