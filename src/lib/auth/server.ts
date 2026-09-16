import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { canAccessModule, isInternalRole, type InternalRole, type ModuleSlug } from '@/lib/auth/roles';

// A single request commonly calls requireInternalUser/requireSalesActor/requireStaffCapability
// more than once (once per data loader) — each previously re-ran auth.getUser() plus a users
// SELECT from scratch. cache() dedupes this to one round trip per request regardless of how
// many call sites ask for it, since it's keyed by request, not by caller.
export const getCachedAuthContext = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, profile: null };

  const { data: profile } = await supabase
    .from('users')
    .select('id, name, email, role, avatar_url')
    .eq('id', user.id)
    .single();

  return { supabase, user, profile };
});

export async function requireInternalUser() {
  const { supabase, user, profile } = await getCachedAuthContext();

  if (!user) redirect('/auth/login');

  if (!profile || !isInternalRole(profile.role)) {
    redirect('/auth/login');
  }

  return {
    supabase,
    user,
    profile,
    role: profile.role as InternalRole,
  };
}

export async function requireModuleAccess(module: ModuleSlug) {
  const context = await requireInternalUser();
  if (!canAccessModule(context.role, module)) redirect('/');
  return context;
}
