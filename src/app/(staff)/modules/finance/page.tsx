// [MERGE] Finance · Overview
import { AlertTriangle, ArrowLeftRight, CalendarRange, Clock, RotateCcw, TrendingUp, Wallet, Building2 } from 'lucide-react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { StatGrid, StatTile } from '@/components/ui/stat-tile';
import { BreakdownCard, DailyBars, type BreakdownRow } from '@/components/finance/breakdown';
import { PeriodFields } from '@/components/finance/period-fields';
import { financeFieldClass, financeLabelClass } from '@/components/finance/styles';
import { requireFinancePage } from '@/lib/finance/access';
import { getCostStatus, getFinanceBranches, getFinanceOverview, getFinancePosition } from '@/lib/finance/data';
import { eachDay, formatDay, type Period } from '@/lib/finance/dates';
import { parseOverviewFilters, type SearchParams } from '@/lib/finance/filters';
import { getFinancePeriod, PERIOD_FROM_PAGE } from '@/lib/finance/period-source';
import { branchLabel, methodLabel, naira, sourceLabel } from '@/lib/finance/format';

const DAILY_CHART_MAX_DAYS = 62;

function moneyInHref(period: Period, extra: Record<string, string | null | undefined>): string {
  const query = new URLSearchParams({ period: period.key });
  if (period.key === 'custom') {
    query.set('from', period.from);
    query.set('to', period.to);
  }
  for (const [key, value] of Object.entries(extra)) if (value) query.set(key, value);
  return `/modules/finance/money-in?${query.toString()}`;
}

export default async function FinanceOverviewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireFinancePage('overview');
  const params = await searchParams;
  const filters = parseOverviewFilters(params, new Date(), await getFinancePeriod(params));
  const { period, branch } = filters;
  const [branches, overview, position, costStatus] = await Promise.all([
    getFinanceBranches(), getFinanceOverview(period, branch.branchId), getFinancePosition(period), getCostStatus(),
  ]);

  const branchName = branch.branchId ? branches.find((item) => item.id === branch.branchId)?.name ?? 'Selected branch' : 'All branches';
  const total = overview.money_in.amount;
  const keepBranch = branch.branchId;

  const methodRows: BreakdownRow[] = overview.by_method.map((row) => ({
    key: row.method,
    label: methodLabel(row.method),
    amount: row.amount,
    count: row.count,
    href: moneyInHref(period, { method: row.method, branch: keepBranch }),
  }));
  const sourceRows: BreakdownRow[] = overview.by_source.map((row) => ({
    key: row.source,
    label: sourceLabel(row.source),
    amount: row.amount,
    count: row.count,
    href: moneyInHref(period, { source: row.source, branch: keepBranch }),
  }));
  const branchRows: BreakdownRow[] = overview.by_branch.map((row) => ({
    key: row.branch_id ?? 'none',
    label: branchLabel(row.branch_name),
    amount: row.amount,
    count: row.count,
    muted: !row.branch_id,
    href: moneyInHref(period, { branch: row.branch_id ?? 'none' }),
  }));

  const days = eachDay(period.from, period.to);
  const dayValues = new Map(overview.by_day.map((row) => [row.day, row.amount]));
  const checks = overview.data_checks;
  const budgetUsed = position.budget.budgeted ? Math.round((position.budget.spent / position.budget.budgeted) * 100) : 0;
  const hasChecks = checks.no_branch_count > 0 || checks.split_count > 0 || checks.other_method_count > 0 ||
    position.unassigned.count > 0 || position.pending_petty.count > 0 || position.payables.overdue > 0 || position.budget.over.length > 0;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Finance</p>
        <h1 className="mt-2 text-3xl font-black text-emmy-primary">Overview</h1>
        <p className="mt-2 text-sm text-slate-500">
          {period.label} · {branchName}
        </p>
      </div>

      {costStatus.missing > 0 ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <div className="text-sm text-red-900">
            <p className="font-extrabold">Required: {costStatus.missing} {costStatus.missing === 1 ? 'sale needs' : 'sales need'} a real cost</p>
            <p className="mt-0.5 text-xs text-red-800/80">
              {costStatus.missing_products} {costStatus.missing_products === 1 ? 'product' : 'products'} with no real cost, {naira(costStatus.missing_value)} sold since {formatDay(costStatus.from)}.
              Profit is not final until these are costed.{costStatus.can_see_cost ? '' : ' The Supreme Administrator adds them.'}
            </p>
          </div>
          {costStatus.can_see_cost ? (
            <Link href="/modules/finance/costs?view=missing" className="inline-flex h-9 items-center rounded-xl bg-red-600 px-4 text-sm font-semibold text-white no-underline hover:bg-red-700">
              {costStatus.can_edit ? 'Add real costs' : 'See which'}
            </Link>
          ) : null}
        </div>
      ) : null}

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_8px_26px_rgba(15,23,42,0.045)]">
        {PERIOD_FROM_PAGE ? <PeriodFields period={period} /> : null}
        <label className={financeLabelClass}>
          Branch
          <select name="branch" defaultValue={branch.value} className={financeFieldClass}>
            <option value="">All branches</option>
            {branches.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="h-10 rounded-xl bg-emmy-primary px-5 text-sm font-semibold text-white shadow-sm hover:bg-emmy-primary-light">
          Show
        </button>
      </form>

      <StatGrid>
        <StatTile
          label="Money in"
          value={naira(overview.money_in.amount)}
          tone="success"
          icon={<TrendingUp className="h-4 w-4" />}
          description={`${overview.money_in.count} customer ${overview.money_in.count === 1 ? 'payment' : 'payments'} from sales and repairs.`}
        />
        <StatTile
          label="Refunds paid"
          value={naira(overview.refunds.amount)}
          tone="danger"
          icon={<RotateCcw className="h-4 w-4" />}
          description={`${overview.refunds.count} ${overview.refunds.count === 1 ? 'refund' : 'refunds'} paid back to customers.`}
        />
        <StatTile
          label="Net cash in"
          value={naira(overview.net_cash_in)}
          tone="primary"
          icon={<Wallet className="h-4 w-4" />}
          description="Money in minus refunds."
        />
        <StatTile
          label="Customers owe us now"
          value={naira(overview.owed_now.amount)}
          tone="secondary"
          icon={<AlertTriangle className="h-4 w-4" />}
          description={`${overview.owed_now.count} unpaid ${overview.owed_now.count === 1 ? 'balance' : 'balances'} today (all dates, not just this period).`}
        />
      </StatGrid>

      <p className="pt-1 text-xs font-bold text-slate-400">Money out and position · company-wide</p>
      <StatGrid>
        <StatTile
          label="Money out"
          value={naira(position.money_out_total)}
          tone="danger"
          icon={<CalendarRange className="h-4 w-4" />}
          description={`Expenses ${naira(position.money_out.expenses)} · Suppliers ${naira(position.money_out.suppliers)} · Salaries ${naira(position.money_out.salaries)} in this period.`}
        />
        <StatTile
          label="In all accounts now"
          value={naira(position.accounts_total)}
          tone="purple"
          icon={<Building2 className="h-4 w-4" />}
          description={`${position.account_count} accounts${position.unassigned.count ? ` · ${naira(position.unassigned.amount)} not yet placed` : ''}.`}
        />
        <StatTile
          label="We owe suppliers"
          value={naira(position.payables.owed)}
          tone="secondary"
          icon={<Clock className="h-4 w-4" />}
          description={`${position.payables.overdue ? `${naira(position.payables.overdue)} overdue. ` : 'Nothing overdue. '}Plus ${naira(position.payables.other)} other payables.`}
        />
        <StatTile
          label="Budget used this month"
          value={`${budgetUsed}%`}
          tone="primary"
          icon={<Wallet className="h-4 w-4" />}
          description={`${naira(position.budget.spent)} of ${naira(position.budget.budgeted)} budgeted.`}
        />
      </StatGrid>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <BreakdownCard title="By payment method" rows={methodRows} total={total} />
        <BreakdownCard title="By source" rows={sourceRows} total={total} />
        {branch.branchId ? (
          <Card className="p-5">
            <h2 className="text-sm font-extrabold text-slate-950">Also in this period</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <Line label="Sales confirmed" value={naira(overview.sales_confirmed.amount)} note={`${overview.sales_confirmed.count} orders`} />
              <Line label="Cash Off used" value={naira(overview.cash_off_used)} note="discount, not cash" />
              <Line label="Voided payments" value={naira(overview.voided.amount)} note={`${overview.voided.count} not counted`} />
            </dl>
          </Card>
        ) : (
          <BreakdownCard title="By branch" rows={branchRows} total={total} />
        )}
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-extrabold text-slate-950">Money in per day</h2>
          <span className="text-xs text-slate-400">Lagos time</span>
        </div>
        <div className="mt-4">
          {days.length <= DAILY_CHART_MAX_DAYS ? (
            <DailyBars days={days} values={dayValues} />
          ) : (
            <p className="text-sm text-slate-400">Choose a period of 2 months or less to see the daily chart.</p>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {!branch.branchId ? (
          <Card className="p-5">
            <h2 className="text-sm font-extrabold text-slate-950">Also in this period</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <Line label="Sales confirmed" value={naira(overview.sales_confirmed.amount)} note={`${overview.sales_confirmed.count} orders and direct sales confirmed`} />
              <Line label="Cash Off used" value={naira(overview.cash_off_used)} note="customer reward discount, not cash received" />
              <Line label="Voided payments" value={naira(overview.voided.amount)} note={`${overview.voided.count} cancelled entries, not counted above`} />
            </dl>
          </Card>
        ) : null}

        <Card className="p-5">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4 text-violet-600" />
            <h2 className="text-sm font-extrabold text-slate-950">Free POS service</h2>
          </div>
          <dl className="mt-4 space-y-3 text-sm">
            <Line label="Cash withdrawals" value={naira(overview.free_pos.withdrawals_amount)} note={`${overview.free_pos.withdrawals_count} · card paid into our POS, cash paid out`} />
            <Line label="Deposits / transfers" value={naira(overview.free_pos.deposits_amount)} note={`${overview.free_pos.deposits_count} · cash taken in, transfer sent out`} />
          </dl>
          <p className="mt-4 rounded-xl bg-violet-50 px-3 py-2 text-xs leading-5 text-violet-800">
            This is EmmyTech&apos;s money moving between the cash drawer and the POS or bank account. It is not income, so it is not in Money in. It does change account balances and the daily cash count.
          </p>
        </Card>

        {hasChecks ? (
          <Card className="p-5">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <h2 className="text-sm font-extrabold text-slate-950">Needs a look</h2>
            </div>
            <ul className="mt-4 space-y-3 text-sm text-slate-600">
              {checks.no_branch_count > 0 ? (
                <li>
                  <a className="font-bold text-emmy-primary no-underline hover:underline" href={moneyInHref(period, { branch: 'none' })}>
                    {checks.no_branch_count} {checks.no_branch_count === 1 ? 'payment' : 'payments'} with no branch ({naira(checks.no_branch_amount)})
                  </a>
                  <span className="block text-xs text-slate-400">These can&apos;t be counted under Sango or UI.</span>
                </li>
              ) : null}
              {checks.split_count > 0 ? (
                <li>
                  <a className="font-bold text-emmy-primary no-underline hover:underline" href={moneyInHref(period, { method: 'split', branch: keepBranch })}>
                    {checks.split_count} split {checks.split_count === 1 ? 'payment' : 'payments'} ({naira(checks.split_amount)})
                  </a>
                  <span className="block text-xs text-slate-400">We can&apos;t yet tell how much went to cash, POS or transfer.</span>
                </li>
              ) : null}
              {checks.other_method_count > 0 ? (
                <li>
                  <a className="font-bold text-emmy-primary no-underline hover:underline" href={moneyInHref(period, { method: 'other', branch: keepBranch })}>
                    {checks.other_method_count} {checks.other_method_count === 1 ? 'payment' : 'payments'} marked &ldquo;Other&rdquo; ({naira(checks.other_method_amount)})
                  </a>
                  <span className="block text-xs text-slate-400">The payment method wasn&apos;t recorded.</span>
                </li>
              ) : null}
              {position.unassigned.count > 0 ? (
                <li>
                  <Link className="font-bold text-emmy-primary no-underline hover:underline" href="/modules/finance/accounts">
                    {position.unassigned.count} {position.unassigned.count === 1 ? 'movement' : 'movements'} not placed in an account ({naira(position.unassigned.amount)})
                  </Link>
                  <span className="block text-xs text-slate-400">Say which account received or paid the money.</span>
                </li>
              ) : null}
              {position.pending_petty.count > 0 ? (
                <li>
                  <Link className="font-bold text-emmy-primary no-underline hover:underline" href="/modules/finance/expenses">
                    {position.pending_petty.count} petty cash {position.pending_petty.count === 1 ? 'entry' : 'entries'} waiting for approval ({naira(position.pending_petty.amount)})
                  </Link>
                  <span className="block text-xs text-slate-400">Not counted until an admin approves.</span>
                </li>
              ) : null}
              {position.payables.overdue > 0 ? (
                <li>
                  <Link className="font-bold text-emmy-primary no-underline hover:underline" href="/modules/finance/payables">{naira(position.payables.overdue)} overdue to suppliers</Link>
                  <span className="block text-xs text-slate-400">Past the agreed payment date.</span>
                </li>
              ) : null}
              {position.budget.over.length > 0 ? (
                <li>
                  <Link className="font-bold text-emmy-primary no-underline hover:underline" href="/modules/finance/budgets">
                    {position.budget.over.length} {position.budget.over.length === 1 ? 'budget' : 'budgets'} over the limit this month
                  </Link>
                  <span className="block text-xs text-slate-400">{position.budget.over.join(', ')}</span>
                </li>
              ) : null}
            </ul>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function Line({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="min-w-0">
        <span className="font-bold text-slate-700">{label}</span>
        {note ? <span className="block text-xs text-slate-400">{note}</span> : null}
      </dt>
      <dd className="shrink-0 font-[family-name:var(--font-mono)] font-extrabold tabular-nums text-slate-900">{value}</dd>
    </div>
  );
}
