import { PageHeader } from '@/components/ui/page-header';
import CommandCentreWorkSummary from '@/components/work/command-centre-work-summary';
import { CrmMarketingOverviewSection } from '@/components/os/home/crm-marketing-overview-section';
import { getMarketingOverview } from '@/lib/os/home-server';
import { getMyWorkDashboard } from '@/lib/work/server';
import type { InternalRole } from '@/lib/auth/roles';

export async function MarketingManagerHome({ name }: { role: InternalRole; name: string }) {
  const [overview, workSummary] = await Promise.all([getMarketingOverview(), getMyWorkDashboard()]);
  const firstName = name.split(' ')[0] || name;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Marketing" title={`Good to see you, ${firstName}`} />
      <CommandCentreWorkSummary summary={workSummary} />
      <CrmMarketingOverviewSection data={overview} />
    </div>
  );
}
