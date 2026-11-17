// [MERGE] Finance · Reports: profit and loss by branch for one month.
import Link from 'next/link';
import { StatGrid, StatTile } from '@/components/ui/stat-tile';
import { financeFieldClass, financeLabelClass } from '@/components/finance/styles';
import { Note, Notice, PageHead, Section } from '@/components/finance/ui';
import { requireFinancePage } from '@/lib/finance/access';
import { getFinanceReference, getProfitAndLoss } from '@/lib/finance/data';
import { first, type SearchParams } from '@/lib/finance/filters';
import { naira } from '@/lib/finance/format';
import { buildPnl } from '@/lib/finance/pnl';
import { canSeeCost } from '@/lib/finance/permissions';

const monthName = (m: string) => new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${m.slice(0, 7)}-01T00:00:00Z`));

function monthsFrom(start: string, today: string): string[] {
  const out: string[] = [];
  let [y, m] = start.slice(0, 7).split('-').map(Number);
  const [ty, tm] = today.slice(0, 7).split('-').map(Number);
  while ((y < ty || (y === ty && m <= tm)) && out.length < 60) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1; if (m > 12) { m = 1; y += 1; }
  }
  return out.length ? out.reverse() : [today.slice(0, 7)];
}

export default async function FinanceReportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const viewer = await requireFinancePage('reports');
  const params = await searchParams;
  const ref = await getFinanceReference();
  const months = monthsFrom(ref.start_date, ref.today);
  const month = months.includes(first(params.month) ?? '') ? first(params.month)! : months[0];
  const raw = await getProfitAndLoss(`${month}-01`);
  const pnl = buildPnl(raw);
  const payrollIn = raw.payroll_status === 'approved' || raw.payroll_status === 'paid';
  const soFar = month === ref.today.slice(0, 7);
  const missing = pnl.costMissing;
  const notFinal = missing.count > 0;

  return (
    <div className="space-y-6">
      <PageHead
        title="Reports"
        sub="Profit and loss by branch"
        right={
          <div className="flex flex-wrap items-end gap-2">
            <form method="get" className="flex items-end gap-2">
              <label className={financeLabelClass}>Month
                <select name="month" defaultValue={month} className={financeFieldClass}>{months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}</select>
              </label>
              <button type="submit" className="h-10 rounded-xl bg-emmy-primary px-5 text-sm font-semibold text-white">Show</button>
            </form>
            <a href={`/modules/finance/reports/export?month=${month}`} className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 no-underline hover:text-emmy-primary">⤓ Download CSV</a>
          </div>
        }
      />
      <Notice params={params} />
      <StatGrid>
        <StatTile label="Revenue" value={naira(pnl.revenue)} tone="success" description="Sales and finished repairs, less refunds." />
        <StatTile label="Gross profit" value={naira(pnl.grossProfit)} tone="primary" description={`${pnl.revenue ? Math.round((pnl.grossProfit / pnl.revenue) * 100) : 0}% of revenue.`} />
        <StatTile label="Expenses and salaries" value={naira(pnl.expenses + pnl.salaries)} tone="danger" description={payrollIn ? 'Salaries included.' : 'Salaries not yet approved for this month.'} />
        <StatTile label="Net profit" value={<span className={pnl.netProfit < 0 ? 'text-red-600' : ''}>{naira(pnl.netProfit)}</span>} tone={pnl.netProfit < 0 ? 'danger' : 'success'} description={notFinal ? `Not final: ${missing.count} ${missing.count === 1 ? 'sale has' : 'sales have'} no real cost yet.` : `${monthName(month)}${soFar ? ' so far' : ''}.`} />
      </StatGrid>
      {notFinal ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <strong>Not final.</strong> {missing.count} {missing.count === 1 ? 'sale' : 'sales'} in {monthName(month)} ({naira(missing.value)} sold) {missing.count === 1 ? 'has' : 'have'} no real cost, so cost of goods is too low and profit is too high.
          {canSeeCost(viewer.role) ? <> <Link href="/modules/finance/costs?view=missing" className="font-bold text-red-800 underline">Add the real costs</Link></> : ' The Supreme Administrator adds them in Product costs.'}
        </div>
      ) : null}
      {!payrollIn ? <Note tone="amber">{monthName(month)} salaries are not approved yet, so they are not in this report. Approve them in Payroll to include them.</Note> : null}
      <Section title={monthName(month)}>
        <div className="w-full overflow-auto rounded-2xl border border-border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-muted text-[11px] font-bold uppercase tracking-wide text-ink-muted">
              <tr><th className="px-4 py-3" />{pnl.columns.map((c) => <th key={c.key} className="px-4 py-3 text-right">{c.name}</th>)}<th className="px-4 py-3 text-right">Total</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pnl.rows.map((r) => (
                <tr key={r.label} className={r.style === 'total' ? 'bg-surface-muted' : undefined}>
                  <td className={`px-4 py-3 ${r.style === 'sub' ? 'pl-8 text-slate-500' : 'font-extrabold'}`}>{r.label}</td>
                  {pnl.columns.map((c) => <MoneyCell key={c.key} value={r.values[c.key] ?? 0} strong={r.style !== 'sub'} />)}
                  <MoneyCell value={r.total} strong />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <Note>Sales count when confirmed, repairs when ready or collected. Company-wide holds sales with no branch and costs not tied to a branch. Free POS and transfers between accounts are not income or costs. Cost of goods uses real product cost only (Product costs), never staff base prices.</Note>
    </div>
  );
}

function MoneyCell({ value, strong }: { value: number; strong: boolean }) {
  return (
    <td className={`px-4 py-3 text-right font-[family-name:var(--font-mono)] tabular-nums ${value < 0 ? 'text-red-600' : ''} ${strong ? 'font-extrabold' : ''}`}>{naira(value)}</td>
  );
}
