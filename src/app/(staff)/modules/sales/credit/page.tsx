import { getSalesCredit, getSalesOutstanding, type OutstandingRow } from '@/lib/sales/read-server';
import { getServerReportingRange } from '@/lib/reporting-period-server';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { StatGrid, StatTile } from '@/components/ui/stat-tile';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const money = (value: number) => `₦${Number(value || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
const day = (value: string | null) => (value ? new Date(value).toLocaleDateString('en-NG', { dateStyle: 'medium' }) : '—');

const sum = (rows: OutstandingRow[]) => rows.reduce((total, row) => total + row.outstanding, 0);

function OutstandingTable({ rows, empty }: { rows: OutstandingRow[]; empty: string }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Code</TableHead>
          <TableHead>Customer</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Staff</TableHead>
          <TableHead>Since</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead className="text-right">Paid</TableHead>
          <TableHead className="text-right">Balance</TableHead>
          <TableHead>Credit</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={`${row.sourceType}-${row.id}`}>
            <TableCell className="font-black text-slate-800">{row.code}</TableCell>
            <TableCell><div className="font-bold text-slate-800">{row.customerName || 'Customer'}</div><div className="text-xs text-slate-400">{row.customerPhone || 'No phone'}</div></TableCell>
            <TableCell>{row.sourceType === 'repair' ? 'Repair' : row.salesChannel === 'direct_sale' ? 'Direct Sale' : 'Order'}</TableCell>
            <TableCell className="text-slate-600">{row.staffName || '—'}</TableCell>
            <TableCell className="text-slate-600">{day(row.since)}{row.daysOwing !== null ? <div className="text-xs text-slate-400">{row.daysOwing} day{row.daysOwing === 1 ? '' : 's'}</div> : null}</TableCell>
            <TableCell className="text-right">{money(row.total)}</TableCell>
            <TableCell className="text-right">{money(row.paid)}</TableCell>
            <TableCell className="text-right font-black text-slate-900">{money(row.outstanding)}</TableCell>
            <TableCell>
              {row.credit
                ? <Badge variant={row.credit.overdue ? 'danger' : 'warning'}>{row.credit.overdue ? 'Overdue' : `Due ${day(row.credit.dueAt)}`}</Badge>
                : <span className="text-xs text-slate-400">None</span>}
            </TableCell>
          </TableRow>
        ))}
        {!rows.length && empty ? <TableRow><TableCell colSpan={9} className="text-center text-slate-400">{empty}</TableCell></TableRow> : null}
      </TableBody>
    </Table>
  );
}

export default async function SalesCreditPage() {
  const range = await getServerReportingRange();
  const [outstanding, credit] = await Promise.all([getSalesOutstanding(), getSalesCredit()]);
  // Same rule as the Sales Overview "Outstanding" tile: a balance belongs to the time
  // frame its sale/repair was confirmed in.
  const start = new Date(range.startIso).getTime();
  const end = new Date(range.endExclusiveIso).getTime();
  const inRange = (row: OutstandingRow) => {
    if (!row.since) return false;
    const at = new Date(row.since).getTime();
    return at >= start && at < end;
  };
  const inPeriod = outstanding.filter(inRange);
  const otherPeriods = outstanding.filter((row) => !inRange(row));
  const total = sum(inPeriod);
  const otherTotal = sum(otherPeriods);
  const overallTotal = total + otherTotal;
  const sales = inPeriod.filter((row) => row.sourceType === 'order');
  const repairs = inPeriod.filter((row) => row.sourceType === 'repair');
  const overdueCredit = credit.filter((row) => row.overdue).length;

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Money customers still owe</p>
        <h1 className="mt-2 text-3xl font-black text-emmy-primary">Credit & Outstanding</h1>
        <p className="mt-2 text-sm text-slate-500">Every confirmed sale and repair with a balance still due, for the Sales time frame above. Deleted sales are left out. Admin-approved credit is shown on the balance it covers.</p>
      </div>

      <StatGrid>
        <StatTile label="Outstanding" value={money(total)} description={`${inPeriod.length} open balance${inPeriod.length === 1 ? '' : 's'} · ${range.shortLabel}`} tone="secondary" />
        <StatTile label="Sales owing" value={money(sales.reduce((sum, row) => sum + row.outstanding, 0))} description={`${sales.length} sale${sales.length === 1 ? '' : 's'}`} tone="primary" />
        <StatTile label="Repairs owing" value={money(repairs.reduce((sum, row) => sum + row.outstanding, 0))} description={`${repairs.length} repair${repairs.length === 1 ? '' : 's'}`} tone="purple" />
        <StatTile label="Overdue credit" value={overdueCredit} description="Admin credit past its due date" tone={overdueCredit ? 'danger' : 'neutral'} />
      </StatGrid>

      <Card className="p-5">
        <h2 className="text-lg font-black text-slate-900">Outstanding balances · {range.label} · {money(total)}</h2>
        <p className="mt-0.5 text-xs text-slate-500">{range.shortLabel}. These balances add up to the Outstanding figure on the Sales Overview for the same time frame. Oldest first.</p>
        <div className="mt-4">
          <OutstandingTable rows={inPeriod} empty="Nothing is owed in this time frame." />
        </div>
      </Card>

      {otherPeriods.length ? (
        <Card className="p-5">
          <h2 className="text-lg font-black text-slate-900">Still owed from other time frames · {money(otherTotal)}</h2>
          <p className="mt-0.5 text-xs text-slate-500">Older balances (and any outside the selected dates) are still owed, so they stay visible here. Total owed overall: {money(overallTotal)}.</p>
          <div className="mt-4">
            <OutstandingTable rows={otherPeriods} empty="" />
          </div>
        </Card>
      ) : null}

      <div>
        <h2 className="text-lg font-black text-slate-900">Admin-approved credit</h2>
        <p className="mt-0.5 text-xs text-slate-500">Full payment is the normal rule. These are approvals to hand over stock before the balance is paid.</p>
      </div>
      <div className="space-y-3">
        {credit.map((row) => {
          const order = row.order as { order_code?: string; customer_name?: string; customer_phone?: string; total_amount?: number; balance_due?: number } | null;
          return (
            <Card key={row.id} className={row.overdue ? 'border-rose-300 p-5' : 'p-5'}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-black text-slate-900">{order?.order_code || 'Order'} · {order?.customer_name || 'Customer'}</div>
                  <div className="mt-1 text-xs text-slate-400">{order?.customer_phone || 'No phone'} · due {new Date(row.due_at).toLocaleString('en-NG')}</div>
                </div>
                <Badge variant={row.overdue ? 'danger' : row.status === 'active' ? 'warning' : 'outline'}>{row.overdue ? 'OVERDUE' : row.status.toUpperCase()}</Badge>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-slate-50 p-3"><div className="text-[10px] font-black uppercase text-slate-400">Approved balance</div><div className="mt-1 font-black">{money(row.approved_outstanding_amount)}</div></div>
                <div className="rounded-xl bg-slate-50 p-3"><div className="text-[10px] font-black uppercase text-slate-400">Order total</div><div className="mt-1 font-black">{money(Number(order?.total_amount || 0))}</div></div>
                <div className="rounded-xl bg-slate-50 p-3"><div className="text-[10px] font-black uppercase text-slate-400">Reason</div><div className="mt-1 text-sm font-semibold">{row.reason}</div></div>
              </div>
            </Card>
          );
        })}
        {!credit.length ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-400">No credit releases have been approved.</div> : null}
      </div>
    </div>
  );
}
