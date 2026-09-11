import AmbassadorStyleDashboard from '@/components/os/ambassador-style-dashboard';
import { requireInternalUser } from '@/lib/auth/server';
import { getMyWorkDashboard } from '@/lib/work/server';

export default async function Home() {
  const { user, profile, role } = await requireInternalUser();
  const workSummary = await getMyWorkDashboard();

  return (
    <AmbassadorStyleDashboard
      administratorName={profile.name || user.email || 'EmmyTech Staff'}
      currentUserId={user.id}
      role={role}
      workSummary={workSummary}
    />
  );
}
