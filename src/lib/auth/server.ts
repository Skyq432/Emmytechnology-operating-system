import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { canAccessModule, isInternalRole, type InternalRole, type ModuleSlug } from '@/lib/auth/roles';

export async function requireInternalUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/auth/login');

  const { data: profile, error } = await supabase
    .from('users')
    .select('id, name, email, role, avatar_url')
    .eq('id', user.id)
    .single();

  if (error || !profile || !isInternalRole(profile.role)) {
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
