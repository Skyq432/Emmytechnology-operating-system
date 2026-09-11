import AmbassadorStyleDashboard from '@/components/os/ambassador-style-dashboard';
import { requireInternalUser } from '@/lib/auth/server';

export default async function Home() {
  const { user, profile, role } = await requireInternalUser();

  return (
    <AmbassadorStyleDashboard
      administratorName={profile.name || user.email || 'EmmyTech Staff'}
      role={role}
    />
  );
}
