import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { DashboardSidebar } from '@/components/marketing/sidebar';
import { DashboardHeader } from '@/components/marketing/header';
import { ReportingPeriodProvider } from '@/components/reporting/reporting-period-context';

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();

  const role = profile?.role || 'ambassador';

  if (role !== 'admin') {
    redirect('/');
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardSidebar role={role} user={user} />

      <ReportingPeriodProvider>
        <div className="flex min-h-screen flex-col lg:ml-[270px]">
          <DashboardHeader user={user} profile={profile} />
          <main className="flex-1 overflow-auto p-4 sm:p-6 lg:px-[30px] lg:py-[26px]">
            {children}
          </main>
        </div>
      </ReportingPeriodProvider>
    </div>
  );
}
