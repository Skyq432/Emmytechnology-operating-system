// [MERGE] Finance · Money In: every customer payment, filterable, with CSV download.
import { ChevronLeft, ChevronRight, Download, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PeriodFields } from '@/components/finance/period-fields';
import { financeFieldClass, financeLabelClass } from '@/components/finance/styles';
import { requireFinancePage } from '@/lib/finance/access';
import { getFinanceBranches, listMoneyIn } from '@/lib/finance/data';
import { MONEY_IN_PAGE_SIZE, moneyInQuery, parseMoneyInFilters, type SearchParams } from '@/lib/finance/filters';
import { getFinancePeriod, PERIOD_FROM_PAGE } from '@/lib/finance/period-source';
import { branchLabel, lagosDateTimeLabel, methodLabel, METHOD_LABELS, naira, sourceLabel, SOURCE_LABELS } from '@/lib/finance/format';

export default async function FinanceMoneyInPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireFinancePage('moneyIn');
  const params = await searchParams;
  const filters = parseMoneyInFilters(params, new Date(), await getFinancePeriod(params));
  const offset = (filters.page - 1) * MONEY_IN_PAGE_SIZE;
  const [branches, result] = await Promise.all([getFinanceBranches(), listMoneyIn(filters, MONEY_IN_PAGE_SIZE, offset)]);

  const pageCount = Math.max(1, Math.ceil(result.total_count / MONEY_IN_PAGE_SIZE));
  const firstRow = result.total_count === 0 ? 0 : offset + 1;
  const lastRow = Math.min(offset + MONEY_IN_PAGE_SIZE, result.total_count);
  const exportHref = `/modules/finance/money-in/export${moneyInQuery(filters, { page: null })}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Finance</p>
          <h1 className="mt-2 text-3xl font-black text-emmy-primary">Money In</h1>
          <p className="mt-2 text-sm text-slate-500">
            Every customer payment from sales orders, direct sales and repairs · {filters.period.label}
          </p>
        </div>
        <a
          href={exportHref}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 no-underline shadow-sm hover:border-emmy-primary/25 hover:text-emmy-primary"
        >
          <Download className="h-4 w-4" />
          Download CSV
        </a>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_8px_26px_rgba(15,23,42,0.045)]">
        {PERIOD_FROM_PAGE ? <PeriodFields period={filters.period} /> : null}
        <label className={financeLabelClass}>
          Branch
          <select name="branch" defaultValue={filters.branch.value} className={financeFieldClass}>
            <option value="">All branches</option>
            {branches.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
            <option value="none">No branch recorded</option>
          </select>
        </label>
        <label className={financeLabelClass}>
          Method
          <select name="method" defaultValue={filters.method ?? ''} className={financeFieldClass}>
            <option value="">All methods</option>
            {Object.entries(METHOD_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className={financeLabelClass}>
          Source
          <select name="source" defaultValue={filters.source ?? ''} className={financeFieldClass}>
            <option value="">All sources</option>
            {Object.entries(SOURCE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className={`${financeLabelClass} min-w-[200px] flex-1`}>
          Search
          <span className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input name="q" defaultValue={filters.search} placeholder="Code, customer or reference" className={`${financeFieldClass} w-full pl-9`} />
          </span>
        </label>
        <label className="flex h-10 items-center gap-2 text-sm font-semibold text-slate-600">
          <input type="checkbox" name="void" value="1" defaultChecked={filters.includeVoid} className="h-4 w-4 accent-[#032489]" />
          Show voided
        </label>
        <button type="submit" className="h-10 rounded-xl bg-emmy-primary px-5 text-sm font-semibold text-white shadow-sm hover:bg-emmy-primary-light">
          Show
        </button>
      </form>

      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
        <span className="text-slate-500">
          <strong className="text-slate-900">{result.total_count}</strong> {result.total_count === 1 ? 'payment' : 'payments'}
        </span>
        <span className="text-slate-500">
          Total received <strong className="font-[family-name:var(--font-mono)] text-slate-900">{naira(result.total_amount)}</strong>
        </span>
        {filters.includeVoid && result.void_count > 0 ? <span className="text-slate-400">{result.void_count} voided shown, not counted in the total</span> : null}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Code</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Branch</TableHead>
            <TableHead>Method</TableHead>
            <TableHead>Received into</TableHead>
            <TableHead>Reference</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Recorded by</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.rows.map((row) => (
            <TableRow key={`${row.source_type}-${row.payment_id}`} className={row.is_void ? 'opacity-60' : undefined}>
              <TableCell className="whitespace-nowrap text-slate-500">{lagosDateTimeLabel(row.paid_at)}</TableCell>
              <TableCell className="whitespace-nowrap">{sourceLabel(row.sales_channel)}</TableCell>
              <TableCell className="whitespace-nowrap font-bold text-slate-800">{row.source_code}</TableCell>
              <TableCell>{row.customer_name || '—'}</TableCell>
              <TableCell className={row.branch_name ? undefined : 'text-amber-700'}>{branchLabel(row.branch_name)}</TableCell>
              <TableCell className="whitespace-nowrap">{methodLabel(row.payment_method)}</TableCell>
              <TableCell className={row.account_name ? 'whitespace-nowrap' : 'whitespace-nowrap text-amber-700'}>{row.account_name || 'Not placed'}</TableCell>
              <TableCell className="text-slate-500">{row.reference || '—'}</TableCell>
              <TableCell className="whitespace-nowrap text-right font-[family-name:var(--font-mono)] font-black tabular-nums">
                {row.is_void ? <s>{naira(row.amount)}</s> : naira(row.amount)}
              </TableCell>
              <TableCell className="whitespace-nowrap text-slate-500">
                {row.is_void ? <Badge variant="danger">Void</Badge> : row.recorded_by_name || '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {result.rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">No payments match these filters.</div>
      ) : null}

      {pageCount > 1 ? (
        <nav className="flex items-center justify-between gap-3 text-sm" aria-label="Pages">
          <span className="text-slate-500">
            Showing {firstRow}–{lastRow} of {result.total_count}
          </span>
          <span className="flex gap-2">
            <PageLink disabled={filters.page <= 1} href={moneyInQuery(filters, { page: String(filters.page - 1) })} label="Previous">
              <ChevronLeft className="h-4 w-4" />
            </PageLink>
            <PageLink disabled={filters.page >= pageCount} href={moneyInQuery(filters, { page: String(filters.page + 1) })} label="Next">
              <ChevronRight className="h-4 w-4" />
            </PageLink>
          </span>
        </nav>
      ) : null}
    </div>
  );
}

function PageLink({ href, disabled, label, children }: { href: string; disabled: boolean; label: string; children: React.ReactNode }) {
  const className = 'inline-flex h-9 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 font-semibold no-underline shadow-sm';
  if (disabled) {
    return (
      <span className={`${className} text-slate-300`} aria-disabled>
        {label === 'Previous' ? children : null}
        {label}
        {label === 'Next' ? children : null}
      </span>
    );
  }
  return (
    <a href={href || '?'} className={`${className} text-slate-700 hover:text-emmy-primary`}>
      {label === 'Previous' ? children : null}
      {label}
      {label === 'Next' ? children : null}
    </a>
  );
}
