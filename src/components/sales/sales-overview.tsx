import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { StatGrid, StatTile } from '@/components/ui/stat-tile';
import { Badge } from '@/components/ui/badge';
import type { SalesOverviewData } from '@/lib/sales/types';

const money = (value: number) => `₦${Number(value || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

export function SalesOverview({ data }: { data: SalesOverviewData }) {
  const cards = [
    { label: 'Sales Value', value: money(data.salesValue), note: 'Confirmed commercial value' },
    { label: 'Cash Collected', value: money(data.cashCollected), note: 'Money actually received' },
    { label: 'Outstanding', value: money(data.outstanding), note: 'Customer balances still due' },
    { label: 'Gross Profit', value: money(data.grossProfit), note: 'Frozen selling value minus cost basis' },
    { label: 'Gross Margin', value: `${Number(data.grossMargin || 0).toFixed(1)}%`, note: 'Gross profit ÷ sales value' },
  ];

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Commercial performance</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-emmy-primary">Sales Overview</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Sales Value, actual cash collected and outstanding balances remain separate so commercial performance is never confused with cash flow.</p>
      </div>

      <StatGrid className="sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => <StatTile key={card.label} label={card.label} value={card.value} description={card.note} tone="neutral" />)}
      </StatGrid>

      <StatGrid className="md:grid-cols-4">
        <StatTile label="Direct Sales" value={data.directSales} tone="neutral" />
        <StatTile label="Orders" value={data.orders} tone="neutral" />
        <StatTile label="Published Quotes" value={data.quotationsPublished} tone="neutral" />
        <StatTile label="Accepted Quotes" value={data.quotationsAccepted} tone="neutral" />
      </StatGrid>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Needs attention</CardTitle>
          <CardDescription>Commercial items that need a staff decision.</CardDescription>
        </CardHeader>
        <div className="divide-y divide-slate-100 border-t border-slate-100">
          {data.attention.map((item) => (
            <Link href={item.href} key={item.key} className="flex items-center justify-between gap-4 p-4 transition hover:bg-slate-50">
              <span className="text-sm font-semibold text-slate-700">{item.label}</span>
              <Badge variant={item.count > 0 ? 'warning' : 'outline'}>{item.count}</Badge>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
