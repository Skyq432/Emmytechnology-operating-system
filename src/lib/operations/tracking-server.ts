import { createClient } from '@/lib/supabase-server';
import type { OperationsOrderDetail } from './types';

const stageNames: Record<number, string> = {
  1: 'Awareness', 2: 'Interest', 3: 'Consideration', 4: 'Intent', 5: 'Purchase',
  6: 'Onboarding', 7: 'Satisfaction', 8: 'Loyalty', 9: 'Expansion', 10: 'Advocacy',
};

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

export async function getOperationsOrderDetail(orderId: string): Promise<OperationsOrderDetail> {
  const { supabase } = await requireAdmin();
  const [orderResult, eventsResult, handoffsResult, usersResult, reservationsResult, locationsResult] = await Promise.all([
    supabase.from('ops_orders').select('*, items:ops_order_items(*)').eq('id', orderId).single(),
    supabase.from('ops_order_events').select('*').eq('order_id', orderId).order('created_at', { ascending: false }),
    supabase.from('ops_order_handoffs').select('*').eq('order_id', orderId).order('created_at', { ascending: false }),
    supabase.from('users').select('id,name,email').order('name'),
    supabase.from('ops_inventory_reservations').select('*').eq('order_id', orderId).order('created_at', { ascending: false }),
    supabase.from('ops_locations').select('id,code,name,location_type').eq('is_active', true).order('name'),
  ]);

  if (orderResult.error) throw new Error(orderResult.error.message);
  if (eventsResult.error) throw new Error(eventsResult.error.message);
  if (handoffsResult.error) throw new Error(handoffsResult.error.message);
  if (usersResult.error) throw new Error(usersResult.error.message);
  if (reservationsResult.error) throw new Error(reservationsResult.error.message);
  if (locationsResult.error) throw new Error(locationsResult.error.message);

  const order = orderResult.data as OperationsOrderDetail['order'];
  let identity: OperationsOrderDetail['identity'] = null;
  let ambassador: OperationsOrderDetail['ambassador'] = null;

  if (order.identity_id) {
    const [{ data: identityRow }, { data: stage }] = await Promise.all([
      supabase.from('identities').select('id,identity_code,primary_name,primary_phone,primary_email').eq('id', order.identity_id).maybeSingle(),
      supabase.rpc('ops_current_crm_stage', { p_identity_id: order.identity_id }),
    ]);
    if (identityRow) identity = { ...identityRow, crm_stage: Number(stage || 0) };
  }

  if (order.ambassador_id) {
    const { data: ambassadorRow } = await supabase
      .from('ambassadors')
      .select('id,display_name,ambassador_tag,user_id')
      .eq('id', order.ambassador_id)
      .maybeSingle();
    if (ambassadorRow) {
      let name = ambassadorRow.display_name || ambassadorRow.ambassador_tag || 'Ambassador';
      if (!ambassadorRow.display_name && ambassadorRow.user_id) {
        const { data: userRow } = await supabase.from('users').select('name,email').eq('id', ambassadorRow.user_id).maybeSingle();
        name = userRow?.name || userRow?.email || name;
      }
      ambassador = { id: ambassadorRow.id, name };
    }
  }

  return {
    order,
    events: (eventsResult.data || []) as OperationsOrderDetail['events'],
    handoffs: (handoffsResult.data || []) as OperationsOrderDetail['handoffs'],
    reservations: (reservationsResult.data || []) as OperationsOrderDetail['reservations'],
    users: usersResult.data || [],
    locations: (locationsResult.data || []) as OperationsOrderDetail['locations'],
    identity,
    ambassador,
  };
}

export async function createOperationsHandover(input: {
  orderId: string;
  toTeam: string;
  toUserId?: string | null;
  note?: string | null;
}) {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc('ops_create_handover', {
    p_order_id: input.orderId,
    p_to_team: input.toTeam,
    p_to_user_id: input.toUserId ?? null,
    p_note: input.note ?? null,
  });
  return error
    ? { success: false as const, message: error.message }
    : { success: true as const, message: 'Handover requested', data };
}

export async function acknowledgeOperationsHandover(handoverId: string, note?: string | null) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc('ops_acknowledge_handover', {
    p_handover_id: handoverId,
    p_note: note ?? null,
  });
  return error
    ? { success: false as const, message: error.message }
    : { success: true as const, message: 'Handover acknowledged' };
}

export function getCrmStageName(stage: number) {
  return stageNames[stage] || 'Unknown';
}
