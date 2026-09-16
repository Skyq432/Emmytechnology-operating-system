import { getCachedAuthContext } from './server';
import { hasCapability, type InternalRole, type StaffCapability } from './roles';

export async function requireStaffCapability(capability: StaffCapability) {
  const { supabase, user, profile } = await getCachedAuthContext();
  if (!user) throw new Error('Not authenticated');

  if (!profile || !hasCapability(profile.role, capability)) {
    throw new Error('Not authorized');
  }

  return {
    supabase,
    user,
    role: profile.role as InternalRole,
  };
}
