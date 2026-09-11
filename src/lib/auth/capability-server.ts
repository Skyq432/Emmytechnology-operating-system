import { createClient } from '@/lib/supabase-server';
import { hasCapability, type InternalRole, type StaffCapability } from './roles';

export async function requireStaffCapability(capability: StaffCapability) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Not authenticated');

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile || !hasCapability(profile.role, capability)) {
    throw new Error('Not authorized');
  }

  return {
    supabase,
    user,
    role: profile.role as InternalRole,
  };
}
