// [MERGE] Finance · Receivables: who owes EmmyTech right now, and how late.
import { StatGrid, StatTile } from '@/components/ui/stat-tile';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { financeFieldClass, financeLabelClass } from '@/components/finance/styles';
import { Note, Notice, PageHead } from '@/components/finance/ui';
import { requireFinancePage } from '@/lib/finance/access';
import { getFinanceBranches, getReceivables } from '@/lib/finance/data';
import { formatDay } from '@/lib/finance/dates';
import { first, parseBranch, type SearchParams } from '@/lib/finance/filters';
import { naira } from '@/lib/finance/format';
import type { AgeBucket } from '@/lib/finance/types';

const BUCKETS: Array<[AgeBucket, string, 'primary' | 'secondary' | 'danger']> = [
  ['not_due', 'Not due yet', 'primary'], ['d1_30', '1–30 days late', 'secondary'], ['d31_60', '31–60 days late', 'danger'], ['d60', 'Over 60 days late', 'danger'],
];

/** WhatsApp link: to the customer's number when we have it, otherwise pick a contact. */
function reminderLink(phone: string | null, message: string): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  const intl = digits.startsWith('0') && digits.length === 11 ? `234${digits.slice(1)}` : digits;
  return `https://wa.me/${intl.length >= 11 ? intl : ''}?text=${encodeURIComponent(message)}`;
}

export default async function FinanceReceivablesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireFinancePage('receivables');
  const params = await searchParams;
  const branch = parseBranch(first(params.branch));
  const [branches, data] = await Promise.all([getFinanceBranches(), getReceivables(branch.noBranch ? null : branch.branchId)]);

  return (
    <div className="space-y-6">
      <PageHead
        title="Receivables"
        sub={`Who owes EmmyTech right now · ${branch.branchId ? branches.find((b) => b.id === branch.branchId)?.name : 'All branches'}`}
        right={
          <form method="get" className="flex items-end gap-2">
            <label className={financeLabelClass}>Branch
              <select name="branch" defaultValue={branch.noBranch ? '' : branch.value} className={financeFieldClass}>
                <option value="">All branches</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
            <button type="submit" className="h-10 rounded-xl bg-emmy-primary px-5 text-sm font-semibold text-white">Show</button>
          </form>
        }
      />
      <Notice params={params} />
      <StatGrid>
        {BUCKETS.map(([key, label, tone]) => (
          <StatTile key={key} label={label} value={naira(data.buckets[key].amount)} tone={tone} description={`${data.buckets[key].count} customer ${data.buckets[key].count === 1 ? 'balance' : 'balances'}.`} />
        ))}
      </StatGrid>
      <Table>
        <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Customer</TableHead><TableHead>Branch</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-right">Paid</TableHead><TableHead className="text-right">Owed</TableHead><TableHead>Due</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>
          {data.rows.map((r) => {
            const name = (r.customer ?? '').replace(/^TEST /, '') || 'there';
            const message = `Hello ${name}, this is EmmyTech. A friendly reminder that ${naira(r.owed)} is still due on ${r.code}. Thank you!`;
            return (
              <TableRow key={`${r.kind}-${r.id}`}>
                <TableCell className="whitespace-nowrap font-bold">{r.code}</TableCell>
                <TableCell>{r.customer ?? '—'}</TableCell>
                <TableCell className="whitespace-nowrap">{r.branch_name ?? 'No branch'}</TableCell>
                <TableCell className="text-right font-[family-name:var(--font-mono)]">{naira(r.total)}</TableCell>
                <TableCell className="text-right font-[family-name:var(--font-mono)]">{naira(r.paid)}</TableCell>
                <TableCell className="text-right font-[family-name:var(--font-mono)] font-bold">{naira(r.owed)}</TableCell>
                <TableCell className="whitespace-nowrap">{r.due_date ? formatDay(r.due_date) : '—'}<span className="block text-xs text-slate-400">{r.note}</span></TableCell>
                <TableCell>
                  {r.days_late > 0 ? <Badge variant={r.days_late > 30 ? 'danger' : 'warning'}>{r.days_late} days late</Badge> : <Badge variant="default">Not due yet</Badge>}
                </TableCell>
                <TableCell className="text-right">
                  <a href={reminderLink(r.phone, message)} target="_blank" rel="noopener" className="inline-flex h-8 items-center whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 no-underline hover:text-emmy-primary">WhatsApp reminder</a>
                </TableCell>
              </TableRow>
            );
          })}
          {data.rows.length === 0 ? <TableRow><TableCell colSpan={9} className="text-center text-slate-400">Nobody owes EmmyTech anything right now.</TableCell></TableRow> : null}
        </TableBody>
      </Table>
      <Note>Sales on credit use the due date agreed in Sales. Other sales are due on the day of sale. Repairs are due when collected.</Note>
    </div>
  );
}
