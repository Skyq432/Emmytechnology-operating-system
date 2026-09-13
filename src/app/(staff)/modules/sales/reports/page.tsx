import { getServerReportingRange } from '@/lib/reporting-period-server';
import { getUnifiedSalesReportSummary } from '@/lib/sales/unified-report-server';
import { StatGrid, StatTile } from '@/components/ui/stat-tile';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

const money = (value: number) => `₦${Number(value || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

export default async function SalesReportsPage() {
  const range = await getServerReportingRange();
  const report = await getUnifiedSalesReportSummary(range);
  const rows = [
    ['Gross Sales', money(report.grossSales), 'Confirmed Orders, Direct Sales and commercially active Repair value'],
    ['Repair Sales', money(report.repairSales), 'Repair commercial value included in overall Sales'],
    ['Cash Collected', money(report.cashCollected), 'Payments received during the selected period'],
    ['Outstanding', money(report.outstanding), 'Current unpaid balance on transactions sold during the selected period'],
    ['Gross Profit', money(report.grossProfit), 'Selling/service value minus frozen cost basis'],
    ['Gross Margin', `${report.grossMargin.toFixed(1)}%`, 'Gross profit ÷ gross sales'],
    ['Cash Refunded', money(report.cashRefunded), 'Refund money recorded during the selected period'],
    ['Net Cash', money(report.netCash), 'Period cash collected minus period cash refunded'],
    ['Quoted Value', money(report.quotedValue), 'Potential revenue created during the selected period'],
    ['Approved / Completed Returns', String(report.returns), 'Return records created during the selected period'],
  ] as const;
  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Commercial reporting</p><h1 className="mt-2 text-3xl font-black text-emmy-primary">Sales Reports</h1><p className="mt-2 text-sm text-slate-500">Orders, Direct Sales and Repair revenue share one reporting view while their operational records remain in their original modules.</p></div>
      <StatGrid className="sm:grid-cols-2 xl:grid-cols-3">
        {rows.map(([label, value, note]) => <StatTile key={label} label={label} value={value} description={note} tone="neutral" />)}
      </StatGrid>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reporting definition</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 text-sm leading-6 text-slate-500">
          A payment received this period against an older transaction contributes to this period&apos;s Cash Collected without creating a second sale. Quotations remain potential revenue until converted. Repair records stay canonical in Operations and are projected into Sales reporting rather than copied.
        </CardContent>
      </Card>
    </div>
  );
}
