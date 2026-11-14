// [MERGE] Finance · Payables: supplier bills (stock now, pay later) and other money owed.
import { Card } from '@/components/ui/card';
import { StatGrid, StatTile } from '@/components/ui/stat-tile';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BreakdownCard } from '@/components/finance/breakdown';
import { backPath, Field, FormCard, Forms, Input, Note, Notice, PageHead, Section, Select, Two } from '@/components/finance/ui';
import { addSupplierBillAction, paySupplierBillAction } from '../actions';
import { requireFinancePage } from '@/lib/finance/access';
import { getFinanceReference, getPayables } from '@/lib/finance/data';
import { addDays, formatDay } from '@/lib/finance/dates';
import type { SearchParams } from '@/lib/finance/filters';
import { naira } from '@/lib/finance/format';

export default async function FinancePayablesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireFinancePage('payables');
  const params = await searchParams;
  const back = backPath('/modules/finance/payables', params);
  const [ref, data] = await Promise.all([getFinanceReference(), getPayables()]);
  const manage = ref.can_manage;
  const open = data.bills.filter((b) => b.left > 0);
  const status = (b: (typeof data.bills)[number]) =>
    b.status === 'paid' ? <Badge variant="success">Paid</Badge>
      : b.status === 'overdue' ? <Badge variant="danger">{b.days_late} days overdue</Badge>
        : b.status === 'part_paid' ? <Badge variant="warning">Part paid</Badge> : <Badge variant="default">Not due yet</Badge>;

  return (
    <div className="space-y-6">
      <PageHead title="Payables" sub="Who EmmyTech owes right now" />
      <Notice params={params} />
      {!manage ? <Note>View only. Administrators add supplier bills and record payments.</Note> : null}
      <StatGrid className="lg:grid-cols-3">
        <StatTile label="We owe suppliers" value={naira(data.owed)} tone="secondary" description={`${data.open_count} open ${data.open_count === 1 ? 'bill' : 'bills'}.`} />
        <StatTile label="Overdue" value={naira(data.overdue)} tone="danger" description="Past the agreed payment date." />
        <StatTile label="Other payables" value={naira(data.other_total)} tone="purple" description="Ambassador payouts, commissions and Spin Wheel cash-outs not yet paid." />
      </StatGrid>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BreakdownCard title="Owed by supplier" total={data.owed} empty="Nothing owed to suppliers."
          rows={data.by_supplier.map((s) => ({ key: s.supplier_name, label: s.supplier_name, amount: s.owed, count: s.open, muted: s.overdue }))} />
        <Card className="p-5">
          <h2 className="text-sm font-extrabold text-slate-950">Other payables</h2>
          <dl className="mt-4 space-y-3 text-sm">
            {[
              ['Ambassador payouts', data.other.ambassador_payouts],
              ['Ambassador commissions earned', data.other.commissions_earned],
              ['Spin Wheel cash-outs', data.other.spin_cashouts],
            ].map(([label, v]) => {
              const value = v as { amount: number; count: number };
              return (
                <div key={label as string} className="flex items-baseline justify-between gap-3">
                  <dt className="font-bold text-slate-700">{label as string}<span className="block text-xs font-normal text-slate-400">{value.count} waiting</span></dt>
                  <dd className="font-[family-name:var(--font-mono)] font-extrabold">{naira(value.amount)}</dd>
                </div>
              );
            })}
          </dl>
          <div className="mt-4"><Note>These are paid out from Marketing. Finance shows them so the full picture is here.</Note></div>
        </Card>
      </div>

      {manage ? (
        <Forms>
          <FormCard title="Add a supplier bill" hint="Stock taken now, paid later. In EmmyTech OS, Operations can create this when stock arrives on credit." action={addSupplierBillAction} back={back} submit="Save bill">
            <Two>
              <Select name="supplier" defaultValue=""><option value="">Choose supplier…</option>{data.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
              <Input name="new_supplier" placeholder="…or type a new supplier" maxLength={120} />
            </Two>
            <Two>
              <Input name="ref" placeholder="Invoice number" required maxLength={60} />
              <Input name="amount" type="number" min="1" step="0.01" placeholder="Amount ₦" required />
            </Two>
            <Two>
              <Field label="Bill date"><Input name="bill_date" type="date" defaultValue={ref.today} required /></Field>
              <Field label="Pay by"><Input name="due_date" type="date" defaultValue={addDays(ref.today, 30)} required /></Field>
            </Two>
            <Input name="note" placeholder="What was supplied? (optional)" />
          </FormCard>
          {open.length > 0 ? (
            <FormCard title="Pay a supplier" hint="Part payments are fine. Money leaves the account you choose." action={paySupplierBillAction} back={back} submit="Save payment">
              <Select name="bill" required>{open.map((b) => <option key={b.id} value={b.id}>{b.supplier_name} · {b.ref} · owes {naira(b.left)}</option>)}</Select>
              <Two>
                <Input name="amount" type="number" min="1" step="0.01" placeholder="Amount ₦" required />
                <Input name="date" type="date" defaultValue={ref.today} max={ref.today} required />
              </Two>
              <Field label="Paid from"><Select name="account" required>{ref.accounts.filter((a) => a.active).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
            </FormCard>
          ) : null}
        </Forms>
      ) : null}

      <Section title="Supplier bills">
        <Table>
          <TableHeader><TableRow><TableHead>Supplier</TableHead><TableHead>Invoice</TableHead><TableHead>Bill date</TableHead><TableHead>Pay by</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Paid</TableHead><TableHead className="text-right">Still owed</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {data.bills.map((b) => (
              <TableRow key={b.id} className={b.status === 'paid' ? 'opacity-60' : undefined}>
                <TableCell>{b.supplier_name}</TableCell>
                <TableCell className="whitespace-nowrap font-bold">{b.ref}<span className="block text-xs font-normal text-slate-400">{b.note}</span></TableCell>
                <TableCell className="whitespace-nowrap">{formatDay(b.bill_date)}</TableCell>
                <TableCell className="whitespace-nowrap">{formatDay(b.due_date)}</TableCell>
                <TableCell className="text-right font-[family-name:var(--font-mono)]">{naira(b.amount)}</TableCell>
                <TableCell className="text-right font-[family-name:var(--font-mono)]">{naira(b.paid)}</TableCell>
                <TableCell className="text-right font-[family-name:var(--font-mono)] font-bold">{naira(b.left)}</TableCell>
                <TableCell>{status(b)}</TableCell>
              </TableRow>
            ))}
            {data.bills.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center text-slate-400">No supplier bills yet.</TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </Section>

      <Section title="Supplier payments">
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Supplier</TableHead><TableHead>Invoice</TableHead><TableHead>Paid from</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
          <TableBody>
            {data.payments.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="whitespace-nowrap text-slate-500">{formatDay(p.date)}</TableCell>
                <TableCell>{p.supplier_name}</TableCell>
                <TableCell>{p.ref}</TableCell>
                <TableCell>{p.account_name}</TableCell>
                <TableCell className="text-right font-[family-name:var(--font-mono)]">{naira(p.amount)}</TableCell>
              </TableRow>
            ))}
            {data.payments.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-slate-400">No supplier payments yet.</TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </Section>
    </div>
  );
}
