// [MERGE] Finance · Payroll. Individual pay: Supreme Administrator only (the database
// returns totals only to everyone else, so nothing private reaches their browser).
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ActionButton, backPath, FormCard, Forms, Input, Note, Notice, PageHead, Section, Select, StatusPill, Two } from '@/components/finance/ui';
import { financeFieldClass, financeLabelClass } from '@/components/finance/styles';
import { addAdvanceAction, approvePayRunAction, createPayRunAction, markPayRunPaidAction, setPayProfileAction } from '../actions';
import { requireFinancePage } from '@/lib/finance/access';
import { getFinanceReference, getPayroll } from '@/lib/finance/data';
import { formatDay } from '@/lib/finance/dates';
import { first, type SearchParams } from '@/lib/finance/filters';
import { naira } from '@/lib/finance/format';

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Supreme Administrator', admin: 'Administrator', growth_lead: 'Growth Lead', marketing_manager: 'Marketing Manager',
  front_desk: 'Front Desk', operations_lead: 'Operations Lead', technician: 'Technician', sales_analyst: 'Sales Analyst',
};
const monthName = (m: string) => new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${m.slice(0, 7)}-01T00:00:00Z`));
const mono = 'text-right font-[family-name:var(--font-mono)] tabular-nums';

export default async function FinancePayrollPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireFinancePage('payroll');
  const params = await searchParams;
  const back = backPath('/modules/finance/payroll', params);
  const monthParam = /^\d{4}-\d{2}$/.test(first(params.month) ?? '') ? `${first(params.month)}-01` : null;
  const [ref, data] = await Promise.all([getFinanceReference(), getPayroll(monthParam)]);
  const thisMonth = `${ref.today.slice(0, 7)}-01`;

  const runsTable = (
    <Table>
      <TableHeader><TableRow><TableHead>Month</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Staff</TableHead><TableHead className="text-right">Gross pay</TableHead><TableHead className="text-right">Advance repayments</TableHead><TableHead className="text-right">Take-home paid out</TableHead><TableHead>Paid</TableHead></TableRow></TableHeader>
      <TableBody>
        {data.runs.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="whitespace-nowrap font-bold">{data.is_owner ? <a href={`?month=${r.month.slice(0, 7)}`} className="text-emmy-primary no-underline">{monthName(r.month)}</a> : monthName(r.month)}</TableCell>
            <TableCell><StatusPill status={r.status} /></TableCell>
            <TableCell className="text-right">{r.totals.people}</TableCell>
            <TableCell className={mono}>{naira(r.totals.gross)}</TableCell>
            <TableCell className={mono}>{naira(r.totals.deductions)}</TableCell>
            <TableCell className={`${mono} font-bold`}>{naira(r.totals.net)}</TableCell>
            <TableCell className="whitespace-nowrap text-slate-500">{r.paid_date ? `${formatDay(r.paid_date)} · ${r.account_name}` : ''}</TableCell>
          </TableRow>
        ))}
        {data.runs.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-slate-400">No salary runs yet.</TableCell></TableRow> : null}
      </TableBody>
    </Table>
  );

  if (!data.is_owner) {
    return (
      <div className="space-y-6">
        <PageHead title="Payroll" sub="Monthly salary runs" />
        <Notice params={params} />
        <Note>Individual pay is visible to the Supreme Administrator only. You can see the totals.</Note>
        {runsTable}
      </div>
    );
  }

  const run = data.run;
  const staff = ref.staff.filter((s) => s.role !== 'super_admin');
  const active = ref.accounts.filter((a) => a.active);

  return (
    <div className="space-y-6">
      <PageHead title="Payroll" sub="Staff pay, salary advances and monthly salary runs · Supreme Administrator only" />
      <Notice params={params} />

      {run ? (
        <Section title={`${monthName(run.month)} salaries`}>
          <div className="flex items-center gap-2"><StatusPill status={run.status} />
            {run.status === 'draft' ? <span className="text-xs text-amber-800">Draft: figures update as sales and advances change. Approving locks them.</span> : null}
          </div>
          <Table>
            <TableHeader><TableRow><TableHead>Staff</TableHead><TableHead className="text-right">Salary</TableHead><TableHead className="text-right">Allowance</TableHead><TableHead className="text-right">Commission</TableHead><TableHead className="text-right">Advance repayment</TableHead><TableHead className="text-right">Take-home</TableHead></TableRow></TableHeader>
            <TableBody>
              {run.lines.map((l) => (
                <TableRow key={l.user_id}>
                  <TableCell>{l.name}<span className="block text-xs text-slate-400">{ROLE_LABELS[l.role] ?? l.role}</span></TableCell>
                  <TableCell className={mono}>{naira(l.salary)}</TableCell>
                  <TableCell className={mono}>{naira(l.allowance)}</TableCell>
                  <TableCell className={mono}>{naira(l.commission)}{l.commission ? <span className="block text-[11px] text-slate-400">on {naira(l.sales)} sales</span> : null}</TableCell>
                  <TableCell className={mono}>{l.deduction ? `−${naira(l.deduction)}` : '—'}</TableCell>
                  <TableCell className={`${mono} font-bold`}>{naira(l.net)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-surface-muted font-extrabold">
                <TableCell>Total</TableCell>
                <TableCell className={mono}>{naira(run.lines.reduce((t, l) => t + l.salary, 0))}</TableCell>
                <TableCell className={mono}>{naira(run.lines.reduce((t, l) => t + l.allowance, 0))}</TableCell>
                <TableCell className={mono}>{naira(run.totals.commission)}</TableCell>
                <TableCell className={mono}>{run.totals.deductions ? `−${naira(run.totals.deductions)}` : '—'}</TableCell>
                <TableCell className={mono}>{naira(run.totals.net)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
          {run.status === 'draft' ? (
            <ActionButton action={approvePayRunAction} back={back} fields={{ run: run.id }} label={`Approve ${monthName(run.month)} salaries`} tone="primary" />
          ) : run.status === 'approved' ? (
            <form action={markPayRunPaidAction} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="_back" value={back} />
              <input type="hidden" name="run" value={run.id} />
              <label className={financeLabelClass}>Paid from<select name="account" required className={financeFieldClass}>{active.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
              <label className={financeLabelClass}>Pay date<input type="date" name="date" defaultValue={ref.today} max={ref.today} required className={financeFieldClass} /></label>
              <button type="submit" className="h-10 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white">Mark as paid</button>
            </form>
          ) : (
            <p className="text-sm text-slate-500">Paid on {formatDay(run.paid_date!)} from {run.account_name}. It shows as money out of that account and as salaries in Reports.</p>
          )}
        </Section>
      ) : null}

      <Section title="All salary runs">{runsTable}</Section>

      <Section title="Pay profiles">
        <Table>
          <TableHeader><TableRow><TableHead>Staff</TableHead><TableHead className="text-right">Salary</TableHead><TableHead className="text-right">Allowance</TableHead><TableHead className="text-right">Commission</TableHead><TableHead className="text-right">Advance still owed</TableHead></TableRow></TableHeader>
          <TableBody>
            {(data.profiles ?? []).map((p) => (
              <TableRow key={p.user_id}>
                <TableCell>{p.name}</TableCell>
                <TableCell className={mono}>{naira(p.salary)}</TableCell>
                <TableCell className={mono}>{naira(p.allowance)}</TableCell>
                <TableCell className="text-right">{p.commission_percent ? `${p.commission_percent}% of their sales` : '—'}</TableCell>
                <TableCell className={mono}>{p.advance_left ? naira(p.advance_left) : '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Forms>
        <FormCard title="Set a staff member's pay" hint="Monthly. Commission is optional and zero unless you set it." action={setPayProfileAction} back={back} submit="Save pay">
          <Select name="user" required>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
          <Two>
            <Input name="salary" type="number" min="0" step="0.01" placeholder="Salary ₦" required />
            <Input name="allowance" type="number" min="0" step="0.01" placeholder="Allowance ₦" />
          </Two>
          <Input name="commission" type="number" min="0" max="20" step="0.5" placeholder="Commission % of their confirmed sales (optional)" />
        </FormCard>
        <FormCard title="Give a salary advance" hint="Paid out now, taken back from salary each month until cleared." action={addAdvanceAction} back={back} submit="Save advance">
          <Select name="user" required>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
          <Two>
            <Input name="amount" type="number" min="1" step="0.01" placeholder="Amount ₦" required />
            <Input name="per_month" type="number" min="1" step="0.01" placeholder="Take back per month ₦" required />
          </Two>
          <Two>
            <Select name="account" required>{active.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
            <Input name="date" type="date" defaultValue={ref.today} max={ref.today} required />
          </Two>
        </FormCard>
        {data.runs.some((r) => r.month.slice(0, 7) === thisMonth.slice(0, 7)) ? null : (
          <FormCard title={`Start ${monthName(thisMonth)} salaries`} hint="Creates a draft from everyone's pay, commission and advances." action={createPayRunAction} back={back} submit="Create salary run">
            <input type="hidden" name="month" value={thisMonth} />
          </FormCard>
        )}
      </Forms>

      {(data.advances ?? []).length > 0 ? (
        <Section title="Salary advances given">
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Staff</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Per month</TableHead><TableHead>Paid from</TableHead></TableRow></TableHeader>
            <TableBody>
              {(data.advances ?? []).map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="whitespace-nowrap text-slate-500">{formatDay(a.date)}</TableCell>
                  <TableCell>{a.name}</TableCell>
                  <TableCell className={mono}>{naira(a.amount)}</TableCell>
                  <TableCell className={mono}>{naira(a.per_month)}</TableCell>
                  <TableCell>{a.account_name}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>
      ) : null}
    </div>
  );
}
