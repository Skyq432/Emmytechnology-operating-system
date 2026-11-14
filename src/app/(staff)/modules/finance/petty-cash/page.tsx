// [MERGE] Finance · Petty cash: branch staff log what they spend; an admin approves it.
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { backPath, Field, FormCard, Input, Note, Notice, PageHead, Section, Select, StatusPill, Two } from '@/components/finance/ui';
import { logPettyCashAction } from '../actions';
import { requireFinancePage } from '@/lib/finance/access';
import { getFinanceReference, getMyPettyCash } from '@/lib/finance/data';
import { formatDay } from '@/lib/finance/dates';
import type { SearchParams } from '@/lib/finance/filters';
import { naira } from '@/lib/finance/format';
import { receiptLabel } from '@/lib/finance/receipts';

export default async function FinancePettyCashPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireFinancePage('pettyCash');
  const params = await searchParams;
  const back = backPath('/modules/finance/petty-cash', params);
  const [ref, mine] = await Promise.all([getFinanceReference(), getMyPettyCash()]);

  return (
    <div className="space-y-6">
      <PageHead title="Petty cash" sub={mine.branch_name ? `Money you spend from the ${mine.branch_name} cash drawer. An admin approves it.` : 'Money you spend from your branch cash drawer.'} />
      <Notice params={params} />
      {mine.branch_name ? (
        <div className="max-w-xl">
          <FormCard title="Log spending" hint="Take a photo of the receipt if you have one." action={logPettyCashAction} back={back} submit="Send for approval">
            <Two>
              <Select name="category" required>{ref.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
              <Input name="amount" type="number" min="1" step="0.01" placeholder="Amount ₦" required />
            </Two>
            <Input name="payee" placeholder="Paid to" required maxLength={120} />
            <Input name="note" placeholder="What was it for?" required />
            <Two>
              <Input name="date" type="date" defaultValue={ref.today} max={ref.today} required />
              <Field label="Receipt (photo or PDF)"><input name="receipt" type="file" accept="image/*,.pdf" capture="environment" className="text-sm" /></Field>
            </Two>
          </FormCard>
        </div>
      ) : (
        <Note tone="amber">Your profile has no branch, so there is no cash drawer to log against. Ask an admin to set your branch.</Note>
      )}
      <Section title="My entries">
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Category</TableHead><TableHead>Paid to</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Receipt</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {mine.rows.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="whitespace-nowrap text-slate-500">{formatDay(e.date)}</TableCell>
                <TableCell>{e.category}</TableCell>
                <TableCell>{e.payee}<span className="block text-xs text-slate-400">{e.note}</span></TableCell>
                <TableCell className="text-right font-[family-name:var(--font-mono)] font-bold">{naira(e.amount)}</TableCell>
                <TableCell>{e.receipt_path ? <a className="font-semibold text-emmy-primary" target="_blank" rel="noopener" href={`/modules/finance/receipt?expense=${e.id}`}>📎 {receiptLabel(e.receipt_path)}</a> : '—'}</TableCell>
                <TableCell><StatusPill status={e.status} />{e.decision_note ? <span className="block text-xs text-slate-400">{e.decision_note}</span> : null}</TableCell>
              </TableRow>
            ))}
            {mine.rows.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-slate-400">You have not logged anything yet.</TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </Section>
    </div>
  );
}
