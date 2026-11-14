// [MERGE] Finance · Budgets: monthly limits per category against approved spending.
import { StatGrid, StatTile } from '@/components/ui/stat-tile';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BreakdownCard } from '@/components/finance/breakdown';
import { financeFieldClass, financeLabelClass } from '@/components/finance/styles';
import { ActionButton, backPath, FormCard, Forms, Input, Note, Notice, PageHead, Section, Select, StatusPill, Two } from '@/components/finance/ui';
import { copyBudgetsAction, deleteBudgetAction, setBudgetAction } from '../actions';
import { requireFinancePage } from '@/lib/finance/access';
import { getBudgets, getFinanceReference } from '@/lib/finance/data';
import { first, type SearchParams } from '@/lib/finance/filters';
import { naira } from '@/lib/finance/format';

const monthName = (m: string) => new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${m.slice(0, 7)}-01T00:00:00Z`));

function monthsFrom(start: string, today: string): string[] {
  const out: string[] = [];
  let [y, m] = start.slice(0, 7).split('-').map(Number);
  const [ty, tm] = today.slice(0, 7).split('-').map(Number);
  const endY = tm === 12 ? ty + 1 : ty, endM = tm === 12 ? 1 : tm + 1; // include next month for planning
  while ((y < endY || (y === endY && m <= endM)) && out.length < 60) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1; if (m > 12) { m = 1; y += 1; }
  }
  return out.reverse();
}

export default async function FinanceBudgetsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireFinancePage('budgets');
  const params = await searchParams;
  const back = backPath('/modules/finance/budgets', params);
  const ref = await getFinanceReference();
  const months = monthsFrom(ref.start_date, ref.today);
  const month = months.includes(first(params.month) ?? '') ? first(params.month)! : ref.today.slice(0, 7);
  const data = await getBudgets(`${month}-01`);
  const manage = ref.can_manage;
  const used = data.budgeted ? Math.round((data.spent / data.budgeted) * 100) : 0;

  return (
    <div className="space-y-6">
      <PageHead
        title="Budgets"
        sub="Monthly spending limits against what was actually spent"
        right={
          <form method="get" className="flex items-end gap-2">
            <label className={financeLabelClass}>Month
              <select name="month" defaultValue={month} className={financeFieldClass}>{months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}</select>
            </label>
            <button type="submit" className="h-10 rounded-xl bg-emmy-primary px-5 text-sm font-semibold text-white">Show</button>
          </form>
        }
      />
      <Notice params={params} />
      {!manage ? <Note>View only. Administrators set budgets.</Note> : null}
      <StatGrid className="lg:grid-cols-3">
        <StatTile label="Budgeted" value={naira(data.budgeted)} tone="primary" description={`${data.rows.length} budgets for ${monthName(month)}.`} />
        <StatTile label="Spent so far" value={naira(data.spent)} tone="danger" description={`${used}% of the total budget.`} />
        <StatTile label="Over the limit" value={String(data.over.length)} tone="secondary" description={data.over.join(', ') || 'None'} />
      </StatGrid>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BreakdownCard title="Budget used" total={data.budgeted} empty="No budgets set for this month."
          rows={data.rows.map((g) => ({ key: g.id, label: `${g.category}${g.branch_name ? ` · ${g.branch_name}` : ''} · ${g.used}% of ${naira(g.amount)}`, amount: g.actual, count: 0, muted: g.level !== 'ok' }))} />
        <Note>Only approved expenses count. Petty cash waiting for approval is not counted yet. Amber from 80%, red from 100%. Expenses with no budget still show in Reports.</Note>
      </div>
      {manage ? (
        <Forms>
          <FormCard title={`Set a budget for ${monthName(month)}`} hint="A monthly limit for one category, for all branches or one branch." action={setBudgetAction} back={back} submit="Save budget">
            <input type="hidden" name="month" value={month} />
            <Two>
              <Select name="category" required>{ref.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
              <Select name="branch" defaultValue=""><option value="">All branches</option>{ref.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
            </Two>
            <Input name="amount" type="number" min="1" step="0.01" placeholder="Limit ₦" required />
          </FormCard>
          {data.rows.length > 0 ? (
            <FormCard title="Copy to next month" hint="Copies these budgets into next month, skipping any already set there." action={copyBudgetsAction} back={back} submit="Copy budgets">
              <input type="hidden" name="month" value={month} />
            </FormCard>
          ) : null}
        </Forms>
      ) : null}
      <Section title={monthName(month)}>
        <Table>
          <TableHeader><TableRow><TableHead>Category</TableHead><TableHead>Branch</TableHead><TableHead className="text-right">Budget</TableHead><TableHead className="text-right">Spent</TableHead><TableHead className="text-right">Left</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {data.rows.map((g) => (
              <TableRow key={g.id}>
                <TableCell>{g.category}</TableCell>
                <TableCell>{g.branch_name ?? 'All branches'}</TableCell>
                <TableCell className="text-right font-[family-name:var(--font-mono)]">{naira(g.amount)}</TableCell>
                <TableCell className="text-right font-[family-name:var(--font-mono)]">{naira(g.actual)}</TableCell>
                <TableCell className={`text-right font-[family-name:var(--font-mono)] ${g.left < 0 ? 'text-red-600' : ''}`}>{naira(g.left)}</TableCell>
                <TableCell><StatusPill status={g.level} /> <span className="text-xs text-slate-500">{g.used}%</span></TableCell>
                <TableCell className="text-right">{manage ? <ActionButton action={deleteBudgetAction} back={back} fields={{ budget: g.id }} label="Remove" /> : null}</TableCell>
              </TableRow>
            ))}
            {data.rows.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-slate-400">No budgets set for this month.</TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </Section>
    </div>
  );
}
