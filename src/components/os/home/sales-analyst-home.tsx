import { BadgeCheck, FileText, ShoppingBag, TrendingUp } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { StatGrid, StatTile } from '@/components/ui/stat-tile';
import { getServerReportingRange } from '@/lib/reporting-period-server';
import { getUnifiedSalesOverview } from '@/lib/sales/unified-report-server';
import type { InternalRole } from '@/lib/auth/roles';

const money = (value: number) => `₦${Number(value || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

export async function SalesAnalystHome({ name }: { role: InternalRole; name: string }) {
  const range = await getServerReportingRange();
  const data = await getUnifiedSalesOverview(range);
  const firstName = name.split(' ')[0] || name;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Sales Performance" title={`Good to see you, ${firstName}`} />

      <StatGrid>
        <StatTile label="Sales Value" value={money(data.salesValue)} icon={<ShoppingBag className="h-[15px] w-[15px]" />} tone="primary" />
        <StatTile label="Cash Collected" value={money(data.cashCollected)} icon={<TrendingUp className="h-[15px] w-[15px]" />} tone="success" />
        <StatTile label="Outstanding" value={money(data.outstanding)} icon={<BadgeCheck className="h-[15px] w-[15px]" />} tone="secondary" />
        <StatTile label="Gross Margin" value={`${Number(data.grossMargin || 0).toFixed(1)}%`} icon={<FileText className="h-[15px] w-[15px]" />} tone="neutral" />
      </StatGrid>

      <StatGrid>
        <StatTile label="Direct Sales" value={data.directSales} tone="neutral" />
        <StatTile label="Orders" value={data.orders} tone="neutral" />
        <StatTile label="Quotations Published" value={data.quotationsPublished} tone="neutral" />
        <StatTile label="Quotations Accepted" value={data.quotationsAccepted} tone="neutral" />
      </StatGrid>

      <p className="text-center text-[11.5px] text-slate-500">Read-only view — Sales Analyst access has no transactional actions.</p>
    </div>
  );
}
