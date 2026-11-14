// [MERGE] Finance · Accounts: balances, statements, transfers, default accounts, cash counts.
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ACCOUNT_TYPE_LABELS, ActionButton, backPath, Field, FormCard, Forms, Input, Note, Notice, PageHead, Section, Select, Two } from '@/components/finance/ui';
import { financeFieldClass } from '@/components/finance/styles';
import {
  addAccountAction, addTransferAction, assignPaymentAccountAction, saveCashCountAction, setAccountActiveAction,
  setAccountRuleAction, setStartDateAction, toggleStatementMatchAction,
} from '../actions';
import { requireFinancePage } from '@/lib/finance/access';
import { getAccountsOverview, getAccountStatement, getCashCounts, getFinanceReference } from '@/lib/finance/data';
import { formatDay } from '@/lib/finance/dates';
import { first, type SearchParams } from '@/lib/finance/filters';
import { METHOD_LABELS, naira } from '@/lib/finance/format';

const UUID = /^[0-9a-f-]{36}$/i;

export default async function FinanceAccountsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireFinancePage('accounts');
  const params = await searchParams;
  const back = backPath('/modules/finance/accounts', params);
  const [ref, overview] = await Promise.all([getFinanceReference(), getAccountsOverview()]);
  const manage = ref.can_manage;

  const chosen = first(params.account);
  const selected = overview.accounts.find((a) => a.id === chosen) ?? overview.accounts.find((a) => a.type === 'cash') ?? overview.accounts[0];
  const drawers = overview.accounts.filter((a) => a.type === 'cash' && a.active);
  const cashAccount = drawers.find((d) => d.id === first(params.cash_account)) ?? drawers[0];
  const cashDay = /^\d{4}-\d{2}-\d{2}$/.test(first(params.cash_day) ?? '') ? first(params.cash_day)! : ref.today;
  const [statement, cash] = await Promise.all([
    selected ? getAccountStatement(selected.id) : Promise.resolve(null),
    getCashCounts(cashAccount && UUID.test(cashAccount.id) ? cashAccount.id : null, cashDay),
  ]);
  const active = ref.accounts.filter((a) => a.active);
  const linkFor = (id: string) => `/modules/finance/accounts?account=${id}${cashAccount ? `&cash_account=${cashAccount.id}&cash_day=${cashDay}` : ''}`;

  return (
    <div className="space-y-6">
      <PageHead
        title="Accounts"
        sub={`Banks, mobile money, POS terminals and cash drawers · balances from ${formatDay(overview.start_date)} (Finance start)`}
        right={
          <Card className="px-5 py-3">
            <div className="text-xs font-bold text-slate-500">Total in all accounts</div>
            <div className="font-[family-name:var(--font-mono)] text-2xl font-extrabold tabular-nums">{naira(overview.total)}</div>
          </Card>
        }
      />
      <Notice params={params} />
      {!manage ? <Note>View only. Administrators add accounts, move money and count cash.</Note> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {overview.accounts.map((a) => (
          <a key={a.id} href={linkFor(a.id)} className={`block rounded-2xl border bg-white p-5 no-underline shadow-[0_8px_26px_rgba(15,23,42,0.045)] ${a.id === selected?.id ? 'border-emmy-primary ring-2 ring-emmy-primary/15' : 'border-slate-200/90'} ${a.active ? '' : 'opacity-55'}`}>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{ACCOUNT_TYPE_LABELS[a.type]}{a.active ? '' : ' · archived'}</div>
            <div className="mt-1 font-extrabold text-slate-950">{a.name}</div>
            <div className={`mt-3 font-[family-name:var(--font-mono)] text-2xl font-extrabold tabular-nums ${a.balance < 0 ? 'text-red-600' : 'text-slate-950'}`}>{naira(a.balance)}</div>
            <div className="mt-1 text-xs text-slate-500">{[a.provider, a.last4 ? `••${a.last4}` : null, a.branch_name ?? 'Company-wide'].filter(Boolean).join(' · ')}</div>
          </a>
        ))}
        {overview.accounts.length === 0 ? <Card className="p-6 text-sm text-slate-500">No accounts yet. Add EmmyTech&apos;s first account below.</Card> : null}
      </div>

      {overview.unassigned.length > 0 ? (
        <Section title="Money not placed in an account" sub="Split or “Other” payments, or a branch with no default account. Say which account it went into so balances are right.">
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>What</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Account</TableHead></TableRow></TableHeader>
            <TableBody>
              {overview.unassigned.map((u) => (
                <TableRow key={`${u.source_type}-${u.source_id}`}>
                  <TableCell className="whitespace-nowrap text-slate-500">{formatDay(u.day)}</TableCell>
                  <TableCell>{u.label}</TableCell>
                  <TableCell className={`text-right font-[family-name:var(--font-mono)] font-bold ${u.amount < 0 ? 'text-red-600' : ''}`}>{naira(u.amount)}</TableCell>
                  <TableCell>
                    {manage ? (
                      <form action={assignPaymentAccountAction} className="flex gap-2">
                        <input type="hidden" name="_back" value={back} />
                        <input type="hidden" name="source_type" value={u.source_type} />
                        <input type="hidden" name="source_id" value={u.source_id} />
                        <select name="account" required className={`${financeFieldClass} h-8 text-xs`} defaultValue="">
                          <option value="" disabled>Choose account…</option>
                          {active.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                        <button type="submit" className="h-8 rounded-lg bg-emmy-primary px-3 text-xs font-bold text-white">Place</button>
                      </form>
                    ) : <span className="text-amber-700">Not placed</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>
      ) : null}

      {manage ? (
        <Forms>
          <FormCard title="Add an account" hint="When EmmyTech opens a new account (Kuda, Moniepoint…), add it here. No developer needed." action={addAccountAction} back={back} submit="Add account">
            <Input name="name" placeholder="Name, e.g. Kuda – Main" required maxLength={80} />
            <Two>
              <Select name="type" defaultValue="bank">{Object.entries(ACCOUNT_TYPE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
              <Input name="provider" placeholder="Provider, e.g. Kuda" />
            </Two>
            <Two>
              <Input name="last4" placeholder="Last 4 digits" inputMode="numeric" maxLength={4} pattern="[0-9]{4}" />
              <Select name="branch" defaultValue=""><option value="">Company-wide</option>{ref.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
            </Two>
            <Field label={`Balance on ${formatDay(overview.start_date)} (Finance start)`}><Input name="opening" type="number" min="0" step="0.01" defaultValue="0" /></Field>
          </FormCard>

          <FormCard title="Move money between accounts" hint="For example banking the day's cash, or POS settlement into the bank." action={addTransferAction} back={back} submit="Save transfer">
            <Field label="From"><Select name="from" required defaultValue={drawers[0]?.id}>{active.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
            <Field label="To"><Select name="to" required defaultValue={active.find((a) => a.type === 'bank')?.id}>{active.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
            <Two>
              <Input name="amount" type="number" min="1" step="0.01" placeholder="Amount ₦" required />
              <Input name="date" type="date" defaultValue={ref.today} max={ref.today} required />
            </Two>
            <Input name="note" placeholder="Note (optional)" />
          </FormCard>

          <Card className="p-5">
            <div className="grid gap-3">
              <div>
                <h2 className="text-sm font-extrabold text-slate-950">Daily cash count</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">At closing, count the drawer. The system shows what should be there.</p>
              </div>
              {cashAccount ? (
                <>
                  <form method="get" className="grid grid-cols-[1fr_auto_auto] gap-2">
                    {selected ? <input type="hidden" name="account" value={selected.id} /> : null}
                    <select name="cash_account" defaultValue={cashAccount.id} className={financeFieldClass}>{drawers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
                    <input type="date" name="cash_day" defaultValue={cashDay} max={ref.today} className={financeFieldClass} />
                    <button type="submit" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold">Check</button>
                  </form>
                  <Note>Expected in <strong>{cashAccount.name}</strong> at the end of {formatDay(cashDay)}: <strong className="font-[family-name:var(--font-mono)]">{naira(cash.expected ?? 0)}</strong></Note>
                  <form action={saveCashCountAction} className="grid gap-3">
                    <input type="hidden" name="_back" value={back} />
                    <input type="hidden" name="account" value={cashAccount.id} />
                    <input type="hidden" name="date" value={cashDay} />
                    <Input name="counted" type="number" min="0" step="0.01" placeholder="Cash counted ₦" required />
                    <Input name="reason" placeholder="Reason, if it doesn't match" />
                    <button type="submit" className="h-10 rounded-xl bg-emmy-primary px-5 text-sm font-semibold text-white">Save count</button>
                  </form>
                </>
              ) : <p className="text-sm text-slate-400">Add a cash drawer account first.</p>}
            </div>
          </Card>
        </Forms>
      ) : null}

      <Section title="Default accounts" sub="Where a payment lands when staff record it, by branch and method. A branch rule wins over an “any branch” rule.">
        <Table>
          <TableHeader><TableRow><TableHead>Branch</TableHead><TableHead>Method</TableHead><TableHead>Goes into</TableHead></TableRow></TableHeader>
          <TableBody>
            {overview.rules.map((r) => (
              <TableRow key={`${r.branch_id}-${r.method}`}>
                <TableCell>{r.branch_name ?? 'Any branch'}</TableCell>
                <TableCell>{METHOD_LABELS[r.method]}</TableCell>
                <TableCell className="font-semibold">{r.account_name}</TableCell>
              </TableRow>
            ))}
            {overview.rules.length === 0 ? <TableRow><TableCell colSpan={3} className="text-center text-slate-400">No defaults yet: every payment will need placing by hand.</TableCell></TableRow> : null}
          </TableBody>
        </Table>
        {manage ? (
          <form action={setAccountRuleAction} className="mt-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="_back" value={back} />
            <Field label="Branch"><Select name="branch" defaultValue=""><option value="">Any branch</option>{ref.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
            <Field label="Method"><Select name="method" defaultValue="cash">{Object.entries(METHOD_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
            <Field label="Goes into"><Select name="account" defaultValue=""><option value="">— remove this default —</option>{active.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
            <button type="submit" className="h-10 rounded-xl bg-emmy-primary px-5 text-sm font-semibold text-white">Save default</button>
          </form>
        ) : null}
      </Section>

      {selected && statement ? (
        <Section title={`Statement · ${selected.name}`}>
          {manage ? (
            <div className="flex gap-2">
              <ActionButton action={setAccountActiveAction} back={back} fields={{ account: selected.id, active: selected.active ? '0' : '1' }} label={selected.active ? 'Archive this account' : 'Bring this account back'} />
            </div>
          ) : null}
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>What</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Balance</TableHead><TableHead className="text-right">Bank statement</TableHead></TableRow></TableHeader>
            <TableBody>
              {statement.rows.map((r) => (
                <TableRow key={`${r.source_type}-${r.source_id}-${r.amount}`}>
                  <TableCell className="whitespace-nowrap text-slate-500">{formatDay(r.day)}</TableCell>
                  <TableCell>{r.label}</TableCell>
                  <TableCell className={`whitespace-nowrap text-right font-[family-name:var(--font-mono)] ${r.amount < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{r.amount > 0 ? '+' : ''}{naira(r.amount)}</TableCell>
                  <TableCell className="whitespace-nowrap text-right font-[family-name:var(--font-mono)] font-bold">{naira(r.balance)}</TableCell>
                  <TableCell className="text-right">
                    {manage ? (
                      <ActionButton action={toggleStatementMatchAction} back={back} fields={{ source_type: r.source_type, source_id: r.source_id, account: selected.id }} label={r.matched ? '✓ Seen' : 'Mark seen'} tone={r.matched ? 'green' : 'ghost'} />
                    ) : r.matched ? <span className="text-xs font-bold text-emerald-700">✓ Seen</span> : null}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="whitespace-nowrap text-slate-400">{formatDay(statement.start_date)}</TableCell>
                <TableCell className="text-slate-400">Opening balance</TableCell>
                <TableCell />
                <TableCell className="text-right font-[family-name:var(--font-mono)] text-slate-400">{naira(statement.opening)}</TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </Section>
      ) : null}

      <Section title="Cash counts">
        <Table>
          <TableHeader><TableRow><TableHead>Day</TableHead><TableHead>Drawer</TableHead><TableHead className="text-right">Expected</TableHead><TableHead className="text-right">Counted</TableHead><TableHead className="text-right">Difference</TableHead><TableHead>Reason</TableHead><TableHead>Counted by</TableHead></TableRow></TableHeader>
          <TableBody>
            {cash.counts.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="whitespace-nowrap">{formatDay(c.date)}</TableCell>
                <TableCell>{c.account_name}</TableCell>
                <TableCell className="text-right font-[family-name:var(--font-mono)]">{naira(c.expected)}</TableCell>
                <TableCell className="text-right font-[family-name:var(--font-mono)]">{naira(c.counted)}</TableCell>
                <TableCell className={`text-right font-[family-name:var(--font-mono)] font-bold ${c.difference ? 'text-red-600' : 'text-emerald-700'}`}>{c.difference > 0 ? '+' : ''}{naira(c.difference)}</TableCell>
                <TableCell className="text-slate-500">{c.reason ?? (c.difference ? '' : 'Matches')}{c.expected_now !== c.expected ? <span className="block text-xs text-amber-700">Records changed since: expected is now {naira(c.expected_now)}</span> : null}</TableCell>
                <TableCell className="whitespace-nowrap text-slate-500">{c.counted_by}</TableCell>
              </TableRow>
            ))}
            {cash.counts.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-slate-400">No cash counts yet.</TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </Section>

      {ref.is_owner ? (
        <Card className="max-w-xl p-5">
          <form action={setStartDateAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="_back" value={back} />
            <Field label="Finance counts from (first day of a month)"><Input name="start" type="month" defaultValue={overview.start_date.slice(0, 7)} required /></Field>
            <button type="submit" className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold">Save start month</button>
          </form>
          <p className="mt-2 text-xs text-slate-500">Balances count from this date. Set it to the month you start entering Finance data. Supreme Administrator only.</p>
        </Card>
      ) : null}
    </div>
  );
}
