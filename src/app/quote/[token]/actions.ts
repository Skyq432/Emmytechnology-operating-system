'use server';

import { createClient } from '@/lib/supabase-server';

export async function decidePublicQuotation(formData: FormData) {
  const token = String(formData.get('token') || '');
  const decision = String(formData.get('decision') || '');
  if (!token || !['accepted', 'declined'].includes(decision)) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc('sales_public_quote_decide', {
    p_token: token,
    p_decision: decision,
  });
  if (error) throw new Error(error.message);
}
