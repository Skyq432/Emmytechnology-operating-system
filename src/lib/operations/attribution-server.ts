import { createClient } from '@/lib/supabase-server';

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Not authenticated');
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') throw new Error('Not authorized');
  return { supabase, user };
}

export async function getOperationsAmbassadors() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from('ambassadors')
    .select('id,display_name,ambassador_tag,user_id,users(name,email)')
    .eq('status', 'active')
    .order('display_name');
  if (error) throw new Error(error.message);
  return (data || []).map((row: any) => ({
    id: row.id as string,
    name: row.display_name || row.users?.name || row.users?.email || row.ambassador_tag || 'Ambassador',
    tag: row.ambassador_tag || null,
  }));
}

export async function updateDraftOrderAttribution(input: {
  orderId: string;
  ambassadorId: string | null;
  commissionRate: number;
  attributionSource: 'automatic' | 'manual_admin';
}) {
  const { supabase, user } = await requireAdmin();
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
        ? `${input.attributionSource === 'automatic' ? 'Automatically detected' : 'Manually assigned by Admin'} before confirmation`
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
