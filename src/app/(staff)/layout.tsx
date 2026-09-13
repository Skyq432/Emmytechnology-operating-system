import { AppShell } from '@/components/os/app-shell';
import { requireInternalUser } from '@/lib/auth/server';

// Wraps every staff-facing route (home + all /modules/*) in one persistent
// shell. /auth/* stays outside this group (unauthenticated, no chrome), as do
// the unrelated public routes (city-foundation, donor-preview, quote/[token]).
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, role } = await requireInternalUser();

  return (
    <AppShell role={role} name={profile.name || user.email || 'EmmyTech Staff'} currentUserId={user.id}>
      {children}
    </AppShell>
  );
}
