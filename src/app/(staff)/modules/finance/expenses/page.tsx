// [MERGE] Finance · Expenses: spending, petty cash approval, categories.
import { StatGrid, StatTile } from '@/components/ui/stat-tile';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BreakdownCard } from '@/components/finance/breakdown';
import { PeriodFields } from '@/components/finance/period-fields';
import { financeFieldClass, financeLabelClass } from '@/components/finance/styles';
import { ActionButton, backPath, Field, FormCard, Forms, Input, Note, Notice, PageHead, Section, Select, StatusPill, Two } from '@/components/finance/ui';
import { addCategoryAction, addExpenseAction, decideExpenseAction } from '../actions';
import { requireFinancePage } from '@/lib/finance/access';
import { getExpenses, getFinanceReference } from '@/lib/finance/data';
import { formatDay } from '@/lib/finance/dates';
import { first, parseBranch, parseOverviewFilters, type SearchParams } from '@/lib/finance/filters';
import { getFinancePeriod, PERIOD_FROM_PAGE } from '@/lib/finance/period-source';
import { naira } from '@/lib/finance/format';
import { receiptLabel } from '@/lib/finance/receipts';
import type { FinanceExpense } from '@/lib/finance/types';

const UUID = /^[0-9a-f-]{36}$/i;
const STATUSES = ['approved', 'pending', 'rejected'];

function Receipt({ e }: { e: FinanceExpense }) {
  if (!e.receipt_path) return <span className="text-amber-700">No receipt</span>;
  return <a href={`/modules/finance/receipt?expense=${e.id}`} target="_blank" rel="noopener" className="whitespace-nowrap font-semibold text-emmy-primary">📎 {receiptLabel(e.receipt_path)}</a>;
}

export default async function FinanceExpensesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireFinancePage('expenses');
  const params = await searchParams;
  const back = backPath('/modules/finance/expenses', params);
  const { period } = parseOverviewFilters(params, new Date(), await getFinancePeriod(params));
  const branch = parseBranch(first(params.branch));
  const category = UUID.test(first(params.category) ?? '') ? first(params.category)! : null;
  const status = STATUSES.includes(first(params.status) ?? '') ? first(params.status)! : null;
  const [ref, data] = await Promise.all([getFinanceReference(), getExpenses(period, branch.noBranch ? null : branch.branchId, category, status)]);
  const manage = ref.can_manage;
  const active = ref.accounts.filter((a) => a.active);

  return (
    <div className="space-y-6">
      <PageHead title="Expenses" sub={`What EmmyTech spends · ${period.label}`} />
      <Notice params={params} />
      {!manage ? <Note>View only. Administrators record expenses and approve petty cash.</Note> : null}

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_8px_26px_rgba(15,23,42,0.045)]">
        {PERIOD_FROM_PAGE ? <PeriodFields period={period} /> : null}
        <label className={financeLabelClass}>Branch
          <select name="branch" defaultValue={branch.noBranch ? '' : branch.value} className={financeFieldClass}>
            <option value="">All branches</option>{ref.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <label className={financeLabelClass}>Category
          <select name="category" defaultValue={category ?? ''} className={financeFieldClass}>
            <option value="">All categories</option>{ref.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className={financeLabelClass}>Status
          <select name="status" defaultValue={status ?? ''} className={financeFieldClass}>
            <option value="">All</option><option value="approved">Approved</option><option value="pending">Waiting</option><option value="rejected">Rejected</option>
          </select>
        </label>
        <button type="submit" className="h-10 rounded-xl bg-emmy-primary px-5 text-sm font-semibold text-white">Show</button>
      </form>

      <StatGrid className="lg:grid-cols-3">
        <StatTile label="Spent (approved)" value={naira(data.approved.amount)} tone="danger" description={`${data.approved.count} expenses in this period.`} />
        <StatTile label="Petty cash waiting" value={naira(data.pending.reduce((t, e) => t + e.amount, 0))} tone="secondary" description={`${data.pending.length} from staff, not counted until approved.`} />
        <StatTile label="Missing receipts" value={String(data.missing_receipts)} tone="primary" description="Approved expenses with no receipt photo." />
      </StatGrid>

      {data.pending.length > 0 ? (
        <Section title="Petty cash waiting for approval">
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Staff</TableHead><TableHead>What</TableHead><TableHead>Paid from</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Receipt</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {data.pending.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap text-slate-500">{formatDay(e.date)}</TableCell>
                  <TableCell className="whitespace-nowrap">{e.created_by_name}</TableCell>
                  <TableCell>{e.category} · {e.payee}<span className="block text-xs text-slate-400">{e.note}</span></TableCell>
                  <TableCell className="whitespace-nowrap">{e.account_name}</TableCell>
                  <TableCell className="text-right font-[family-name:var(--font-mono)] font-bold">{naira(e.amount)}</TableCell>
                  <TableCell><Receipt e={e} /></TableCell>
                  <TableCell className="text-right">
                    {manage ? (
                      <div className="flex justify-end gap-2">
                        <ActionButton action={decideExpenseAction} back={back} fields={{ expense: e.id, decision: 'approve' }} label="Approve" tone="green" />
                        <ActionButton action={decideExpenseAction} back={back} fields={{ expense: e.id, decision: 'reject' }} label="Reject" tone="red" />
                      </div>
                    ) : <StatusPill status="pending" />}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BreakdownCard title="Spent by category" total={data.approved.amount} empty="No approved expenses in this period."
          rows={data.by_category.map((c) => ({ key: c.category, label: c.category, amount: c.amount, count: c.count }))} />
        <Note>Front Desk, Technicians and Operations Leads log what they spend from their branch cash drawer under Petty cash, with a receipt photo. It appears above for an admin to approve or reject. Staff only see their own entries, never totals.</Note>
      </div>

      {manage ? (
        <Forms>
          <FormCard title="Record an expense" hint="Money EmmyTech spent. Recorded by an admin, so it counts straight away." action={addExpenseAction} back={back} submit="Save expense">
            <Two>
              <Select name="category" required>{ref.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
              <Input name="amount" type="number" min="1" step="0.01" placeholder="Amount ₦" required />
            </Two>
            <Input name="payee" placeholder="Paid to (person or business)" required maxLength={120} />
            <Two>
              <Select name="branch" defaultValue=""><option value="">Company-wide</option>{ref.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
              <Select name="account" required>{active.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
            </Two>
            <Two>
              <Input name="date" type="date" defaultValue={ref.today} max={ref.today} required />
              <Field label="Receipt (photo or PDF)"><input name="receipt" type="file" accept="image/*,.pdf" className="text-sm" /></Field>
            </Two>
            <Input name="note" placeholder="What was it for? (optional)" />
          </FormCard>
          <FormCard title="Expense categories" hint={ref.categories.map((c) => c.name).join(' · ')} action={addCategoryAction} back={back} submit="Add category">
            <Input name="name" placeholder="New category" required maxLength={60} />
          </FormCard>
        </Forms>
      ) : null}

      <Section title="All expenses">
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Category</TableHead><TableHead>Paid to</TableHead><TableHead>Branch</TableHead><TableHead>Paid from</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Receipt</TableHead><TableHead>Recorded by</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {data.rows.map((e) => (
              <TableRow key={e.id} className={e.status === 'rejected' ? 'opacity-60' : undefined}>
                <TableCell className="whitespace-nowrap text-slate-500">{formatDay(e.date)}</TableCell>
                <TableCell className="whitespace-nowrap">{e.category}</TableCell>
                <TableCell>{e.payee}<span className="block text-xs text-slate-400">{e.note}</span></TableCell>
                <TableCell className="whitespace-nowrap">{e.branch_name ?? 'Company-wide'}</TableCell>
                <TableCell className="whitespace-nowrap">{e.account_name}</TableCell>
                <TableCell className="text-right font-[family-name:var(--font-mono)] font-bold">{naira(e.amount)}</TableCell>
                <TableCell><Receipt e={e} /></TableCell>
                <TableCell className="whitespace-nowrap text-slate-500">{e.created_by_name}{e.is_petty ? ' · petty cash' : ''}</TableCell>
                <TableCell><StatusPill status={e.status} /></TableCell>
              </TableRow>
            ))}
            {data.rows.length === 0 ? <TableRow><TableCell colSpan={9} className="text-center text-slate-400">No expenses match these filters.</TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </Section>
    </div>
  );
}
