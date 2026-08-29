import { createClient } from '@/lib/supabase-server';
import type { OperationsOrderDetail } from './types';

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
  const [orderResult, eventsResult, handoffsResult, usersResult] = await Promise.all([
    supabase
      .from('ops_orders')
      .select('*, items:ops_order_items(*)')
      .eq('id', orderId)
      .single(),
    supabase
      .from('ops_order_events')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false }),
    supabase
      .from('ops_order_handoffs')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false }),
    supabase.from('users').select('id,name,email').order('name'),
  ]);

  if (orderResult.error) throw new Error(orderResult.error.message);
  if (eventsResult.error) throw new Error(eventsResult.error.message);
  if (handoffsResult.error) throw new Error(handoffsResult.error.message);
  if (usersResult.error) throw new Error(usersResult.error.message);

  return {
    order: orderResult.data as OperationsOrderDetail['order'],
    events: (eventsResult.data || []) as OperationsOrderDetail['events'],
    handoffs: (handoffsResult.data || []) as OperationsOrderDetail['handoffs'],
    users: usersResult.data || [],
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
