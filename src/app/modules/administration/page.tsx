import { StaffAdmin } from '@/components/administration/staff-admin';
import { requireModuleAccess } from '@/lib/auth/server';

export default async function AdministrationPage() {
  const { supabase, role, user } = await requireModuleAccess('administration');
  const [staffResult, locationsResult] = await Promise.all([
    supabase
      .from('users')
      .select('id, name, email, role, created_at, default_location_id')
      .neq('role', 'ambassador')
      .order('name', { ascending: true }),
    supabase
      .from('ops_locations')
      .select('id, code, name')
      .eq('is_active', true)
      .eq('location_type', 'store')
      .order('name', { ascending: true }),
  ]);

  if (staffResult.error) throw new Error(`Unable to load EmmyTech staff: ${staffResult.error.message}`);
  if (locationsResult.error) throw new Error(`Unable to load EmmyTech branches: ${locationsResult.error.message}`);

  return (
    <StaffAdmin
      initialStaff={staffResult.data || []}
      locations={locationsResult.data || []}
      currentRole={role}
      currentUserId={user.id}
    />
  );
}
