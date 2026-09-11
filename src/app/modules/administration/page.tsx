import { StaffAdmin } from '@/components/administration/staff-admin';
import { requireModuleAccess } from '@/lib/auth/server';

export default async function AdministrationPage() {
  const { supabase, role, user } = await requireModuleAccess('administration');
  const { data: staff, error } = await supabase
    .from('users')
    .select('id, name, email, role, created_at')
    .neq('role', 'ambassador')
    .order('name', { ascending: true });

  if (error) throw new Error(`Unable to load EmmyTech staff: ${error.message}`);

  return <StaffAdmin initialStaff={staff || []} currentRole={role} currentUserId={user.id} />;
}
