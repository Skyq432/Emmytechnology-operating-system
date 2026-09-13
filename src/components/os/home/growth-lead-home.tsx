import { ClipboardList, ShoppingBag, TrendingUp, Truck } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { StatGrid, StatTile } from '@/components/ui/stat-tile';
import CommandCentreWorkSummary from '@/components/work/command-centre-work-summary';
import { CrmMarketingOverviewSection } from '@/components/os/home/crm-marketing-overview-section';
import { getMarketingOverview } from '@/lib/os/home-server';
import { getOperationsOverview } from '@/lib/operations/server';
import { getServerReportingRange } from '@/lib/reporting-period-server';
import { getUnifiedSalesOverview } from '@/lib/sales/unified-report-server';
import { getMyWorkDashboard } from '@/lib/work/server';
import type { InternalRole } from '@/lib/auth/roles';

const money = (value: number) => `₦${Number(value || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

export async function GrowthLeadHome({ name }: { role: InternalRole; name: string }) {
  const range = await getServerReportingRange();
  const [marketing, sales, operations, workSummary] = await Promise.all([
    getMarketingOverview(),
    getUnifiedSalesOverview(range),
    getOperationsOverview(),
    getMyWorkDashboard(),
  ]);
  const firstName = name.split(' ')[0] || name;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Growth" title={`Good to see you, ${firstName}`} />
      <CrmMarketingOverviewSection data={marketing} />

      <div>
        <div className="text-sm font-extrabold text-slate-950">Sales &amp; Ops Snapshot</div>
        <div className="mt-0.5 text-xs text-slate-500">The rest of the business, at a glance</div>
        <StatGrid className="mt-4">
          <StatTile label="Sales Value" value={money(sales.salesValue)} icon={<ShoppingBag className="h-[15px] w-[15px]" />} tone="primary" />
          <StatTile label="Cash Collected" value={money(sales.cashCollected)} icon={<TrendingUp className="h-[15px] w-[15px]" />} tone="success" />
          <StatTile label="Open Orders" value={operations.openOrders} icon={<ClipboardList className="h-[15px] w-[15px]" />} tone="secondary" />
          <StatTile label="Awaiting Dispatch" value={operations.awaitingDispatch} icon={<Truck className="h-[15px] w-[15px]" />} tone="neutral" />
        </StatGrid>
      </div>

      <CommandCentreWorkSummary summary={workSummary} />
    </div>
  );
}
