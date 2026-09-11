import { DashboardSidebar } from '@/components/marketing/sidebar';
import { DashboardHeader } from '@/components/marketing/header';
import { ReportingPeriodProvider } from '@/components/reporting/reporting-period-context';
import { requireModuleAccess } from '@/lib/auth/server';

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, role } = await requireModuleAccess('marketing');

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardSidebar role={role} user={user} />

      <ReportingPeriodProvider>
        <div className="flex min-h-screen flex-col lg:ml-[270px]">
          <DashboardHeader user={user} profile={profile} />
          <main className="flex-1 overflow-auto p-4 sm:p-6 lg:px-[30px] lg:py-[26px]">{children}</main>
        </div>
      </ReportingPeriodProvider>
    </div>
  );
}
