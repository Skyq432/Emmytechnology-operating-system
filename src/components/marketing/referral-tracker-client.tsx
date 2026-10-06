'use client';

import { useActionState, useMemo, useState } from 'react';
import {
  addCardholderAction,
  addDepositAction,
  addPosEntryAction,
  addReferralAction,
  updateCardholderStatusAction,
  updateReferralPaymentAction,
  type ReferralTrackerActionState,
} from '@/app/(staff)/modules/referral-tracker-actions';
import { IdentityPicker } from '@/components/shared/identity-picker';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ActionResult } from '@/components/ui/alert';
import { StatGrid, StatTile } from '@/components/ui/stat-tile';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { CardholderRow, DepositRow, PosRow, ReferralRow, ReferralTrackerSummary } from '@/lib/marketing/referral-tracker-server';
import type { OperationsIdentitySummary } from '@/lib/operations/types';

const initialState: ReferralTrackerActionState = { success: false, message: '' };
const money = (value: number | null | undefined) => `₦${Number(value || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
// Phone numbers can be stored with or without the leading 0, so cross-matching compares
// the last 10 digits, not exact strings.
const phoneTail = (value: string | null | undefined) => String(value || '').replace(/\D/g, '').slice(-10);
const REFERRAL_TRACKER_IDENTITY_ENDPOINT = '/api/referral-tracker/identities';
// Referrals and Card Holders are pure autofill convenience — nothing here ever calls
// resolveOrCreate*Identity, so the default "a new Identity will be resolved when you
// save" copy would be a flat-out lie.
const REFERRAL_TRACKER_NO_MATCH_HINT = 'No existing CRM match. This name/phone is saved as typed on this record only — nothing is created in the CRM from this page.';
// POS/Deposits are the opposite: the person is deliberately also resolved into a real,
// searchable Supabase Identity, linked directly on the record (see resolveReferralTrackerIdentity).
const POS_NO_MATCH_HINT = 'No existing CRM match. A new Identity will be created from this name/phone so this person can be found again later.';

export function ReferralTrackerClient({
  referrals,
  cardholders,
  posEntries,
  deposits,
  summary,
}: {
  referrals: ReferralRow[];
  cardholders: CardholderRow[];
  posEntries: PosRow[];
  deposits: DepositRow[];
  summary: ReferralTrackerSummary;
}) {
  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Referral Card program · Card Holders · Free POS · Deposits</p>
        <h1 className="mt-2 text-3xl font-black text-emmy-primary">Referral Tracker</h1>
        <p className="mt-2 text-sm text-slate-500">Referral Card program, Card Holders, the Free POS Tracker and POS Deposits — stored natively in Supabase.</p>
      </div>

      <StatGrid>
        <StatTile label="Total referrals" value={summary.total_referrals ?? 0} tone="primary" />
        <StatTile label="Total revenue" value={money(summary.total_revenue)} tone="success" />
        <StatTile label="Commission outstanding" value={money(summary.commission_outstanding)} tone="secondary" />
        <StatTile label="Free POS withdrawals" value={money(summary.pos_total_withdrawals)} description={`${summary.pos_transactions ?? 0} transactions`} tone="purple" />
        <StatTile label="POS deposits / transfers" value={money(summary.deposit_total)} description={`${summary.deposit_transactions ?? 0} transactions`} tone="neutral" />
      </StatGrid>

      <ReferralsSection referrals={referrals} cardholders={cardholders} />
      <CardholdersSection cardholders={cardholders} />
      {/* Anchor target for the dedicated "POS" shortcut on the front-desk dashboard and
          Sales sidebar — front desk uses withdrawals/deposits far more often than
          referrals or card holders, so that link skips straight past those. */}
      <div id="pos" className="space-y-5 scroll-mt-4">
        <PosSection posEntries={posEntries} />
        <DepositsSection deposits={deposits} />
      </div>
    </div>
  );
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="text-lg font-black text-slate-900">{title}</h2>
      <p className="mt-0.5 text-xs text-slate-500">{description}</p>
    </div>
  );
}

function ReferralsSection({ referrals, cardholders }: { referrals: ReferralRow[]; cardholders: CardholderRow[] }) {
  const [state, action, pending] = useActionState(addReferralAction, initialState);

  const [referralCode, setReferralCode] = useState('');
  const [referrerLookupPhone, setReferrerLookupPhone] = useState('');
  const [referredClientQuery, setReferredClientQuery] = useState('');
  const [referredClientSelected, setReferredClientSelected] = useState<OperationsIdentitySummary | null>(null);
  const [referredClient, setReferredClient] = useState('');
  const [clientPhone, setClientPhone] = useState('');

  // The referrer's own card (already in Card Holders) already carries their referral
  // code — no need to retype it if we can already see it. Purely a lookup helper; the
  // matched code is just used to fill the field above, nothing extra is submitted.
  const matchedCardholder = useMemo(() => {
    const tail = phoneTail(referrerLookupPhone);
    if (tail.length < 7) return null;
    return cardholders.find((row) => phoneTail(row.phone_number) === tail) || null;
  }, [referrerLookupPhone, cardholders]);

  function chooseReferredClient(identity: OperationsIdentitySummary | null) {
    setReferredClientSelected(identity);
    if (identity) {
      setReferredClient(identity.primary_name || '');
      setClientPhone(identity.primary_phone || '');
      setReferredClientQuery(identity.primary_name || identity.primary_phone || identity.identity_code);
    }
  }

  return (
    <Card className="p-5">
      <SectionHeader title="Referral Tracker" description="Referral code must already exist in Card Holders — commission is computed automatically and an unknown code is rejected." />

      <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <summary className="cursor-pointer text-sm font-bold text-emmy-primary">+ Record a new referral</summary>
        <form action={action} onSubmit={() => { setReferralCode(''); setReferrerLookupPhone(''); setReferredClientQuery(''); setReferredClientSelected(null); setReferredClient(''); setClientPhone(''); }} className="mt-4 grid gap-3 md:grid-cols-3">
          <Field label="Referral code (must be an existing card holder)">
            <Input name="referral_code" list="known-referral-codes" placeholder="e.g. EMM-104" value={referralCode} onChange={(e) => setReferralCode(e.target.value)} />
            <datalist id="known-referral-codes">
              {cardholders.filter((c) => c.referral_code).map((c) => <option key={c.id} value={c.referral_code ?? undefined} />)}
            </datalist>
          </Field>
          <Field label="Look up a card holder by phone (optional)">
            <Input placeholder="080... — finds their code below" value={referrerLookupPhone} onChange={(e) => setReferrerLookupPhone(e.target.value)} />
            {matchedCardholder && matchedCardholder.referral_code && matchedCardholder.referral_code !== referralCode ? (
              <button type="button" onClick={() => setReferralCode(matchedCardholder.referral_code || '')} className="mt-1 text-xs font-bold text-emmy-primary">
                Found: use code {matchedCardholder.referral_code}
              </button>
            ) : null}
          </Field>
          <div className="relative md:col-span-1">
            <Field label="Referred client — search existing customers">
              <IdentityPicker
                renderHiddenFields={false}
                searchEndpoint={REFERRAL_TRACKER_IDENTITY_ENDPOINT}
                noMatchHint={REFERRAL_TRACKER_NO_MATCH_HINT}
                query={referredClientQuery}
                onQueryChange={(value) => { setReferredClientSelected(null); setReferredClientQuery(value); setReferredClient(value); }}
                selected={referredClientSelected}
                onSelect={chooseReferredClient}
                placeholder="Search name, phone or CRM code..."
              />
            </Field>
          </div>
          <input type="hidden" name="referred_client" value={referredClient} />
          <Field label="Client phone"><Input name="client_phone" placeholder="080..." value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} /></Field>
          <Field label="Referral date"><Input name="referral_date" type="date" /></Field>
          <Field label="Revenue (₦)"><Input name="revenue" type="number" min="0" step="0.01" /></Field>
          <div className="md:col-span-3"><Field label="Notes"><Input name="notes" placeholder="Optional" /></Field></div>
          <div className="md:col-span-3 flex items-center gap-3">
            <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save referral'}</Button>
            <ActionResult state={state} />
          </div>
        </form>
      </details>

      <div className="mt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Referral code</TableHead>
              <TableHead>Referred client</TableHead>
              <TableHead>Revenue</TableHead>
              <TableHead>Commission</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Update payment</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {referrals.map((row) => <ReferralRowItem key={row.id} row={row} />)}
            {!referrals.length && <TableRow><TableCell colSpan={6} className="text-center text-slate-400">No referrals recorded yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

function ReferralRowItem({ row }: { row: ReferralRow }) {
  const [state, action, pending] = useActionState(updateReferralPaymentAction, initialState);
  const paid = (row.payment_status || '').toLowerCase() === 'paid';

  return (
    <TableRow>
      <TableCell className="font-bold">{row.referral_code || '—'}</TableCell>
      <TableCell>{row.referred_client || '—'}<div className="text-xs text-slate-400">{row.client_phone || ''}</div></TableCell>
      <TableCell>{money(row.revenue)}</TableCell>
      <TableCell>{money(row.commission)}{row.commission_rate != null ? <div className="text-xs text-slate-400">{(row.commission_rate * 100).toFixed(0)}% rate</div> : null}</TableCell>
      <TableCell><Badge variant={paid ? 'success' : 'warning'}>{row.payment_status || 'Pending'}</Badge>{paid && <div className="mt-1 text-xs text-slate-400">{money(row.commission_paid)} paid</div>}</TableCell>
      <TableCell>
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={row.id} />
          <Select name="payment_status" defaultValue={row.payment_status || 'Pending'} className="h-8 w-28 text-xs">
            <option value="Pending">Pending</option>
            <option value="Paid">Paid</option>
          </Select>
          <Button type="submit" size="sm" variant="outline" disabled={pending}>{pending ? '…' : 'Save'}</Button>
        </form>
        <ActionResult state={state} className="mt-1" />
      </TableCell>
    </TableRow>
  );
}

function CardholdersSection({ cardholders }: { cardholders: CardholderRow[] }) {
  const [state, action, pending] = useActionState(addCardholderAction, initialState);

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<OperationsIdentitySummary | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [notes, setNotes] = useState('');

  function choose(identity: OperationsIdentitySummary | null) {
    setSelected(identity);
    if (identity) {
      setPhoneNumber(identity.primary_phone || '');
      setQuery(identity.primary_name || identity.primary_phone || identity.identity_code);
      if (!notes && identity.primary_name) setNotes(identity.primary_name);
    }
  }

  return (
    <Card className="p-5">
      <SectionHeader title="Referral Card Holders" description="Everyone who has been given a physical Referral Card. Referral codes must be unique." />

      <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <summary className="cursor-pointer text-sm font-bold text-emmy-primary">+ Add a card holder</summary>
        <form action={action} onSubmit={() => { setQuery(''); setSelected(null); setPhoneNumber(''); setNotes(''); }} className="mt-4 grid gap-3 md:grid-cols-3">
          <Field label="Referral code"><Input name="referral_code" placeholder="e.g. EMM-104" /></Field>
          <Field label="Search existing customers">
            <IdentityPicker
              renderHiddenFields={false}
              searchEndpoint={REFERRAL_TRACKER_IDENTITY_ENDPOINT}
              noMatchHint={REFERRAL_TRACKER_NO_MATCH_HINT}
              query={query}
              onQueryChange={(value) => { setSelected(null); setQuery(value); }}
              selected={selected}
              onSelect={choose}
              placeholder="Search name, phone or CRM code..."
            />
          </Field>
          <Field label="Phone number"><Input name="phone_number" placeholder="080..." value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} /></Field>
          <Field label="Date card given"><Input name="date_card_given" type="date" /></Field>
          <Field label="Card status">
            <Select name="card_status" defaultValue="Active">
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </Select>
          </Field>
          <div className="md:col-span-2"><Field label="Notes"><Input name="notes" placeholder="Optional" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field></div>
          <div className="md:col-span-3 flex items-center gap-3">
            <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Add card holder'}</Button>
            <ActionResult state={state} />
          </div>
        </form>
      </details>

      <div className="mt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Referral code</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Date given</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Update status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cardholders.map((row) => <CardholderRowItem key={row.id} row={row} />)}
            {!cardholders.length && <TableRow><TableCell colSpan={5} className="text-center text-slate-400">No card holders recorded yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

function CardholderRowItem({ row }: { row: CardholderRow }) {
  const [state, action, pending] = useActionState(updateCardholderStatusAction, initialState);
  const active = (row.card_status || '').toLowerCase() === 'active';

  return (
    <TableRow>
      <TableCell className="font-bold">{row.referral_code || '—'}</TableCell>
      <TableCell>{row.phone_number || '—'}</TableCell>
      <TableCell>{row.date_card_given || '—'}</TableCell>
      <TableCell><Badge variant={active ? 'success' : 'outline'}>{row.card_status || 'Unknown'}</Badge></TableCell>
      <TableCell>
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={row.id} />
          <Select name="card_status" defaultValue={row.card_status || 'Active'} className="h-8 w-28 text-xs">
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </Select>
          <Button type="submit" size="sm" variant="outline" disabled={pending}>{pending ? '…' : 'Save'}</Button>
        </form>
        <ActionResult state={state} className="mt-1" />
      </TableCell>
    </TableRow>
  );
}

function PosSection({ posEntries }: { posEntries: PosRow[] }) {
  const [state, action, pending] = useActionState(addPosEntryAction, initialState);

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<OperationsIdentitySummary | null>(null);
  const [clientName, setClientName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');

  function choose(identity: OperationsIdentitySummary | null) {
    setSelected(identity);
    if (identity) {
      setClientName(identity.primary_name || '');
      setPhoneNumber(identity.primary_phone || '');
      setQuery(identity.primary_name || identity.primary_phone || identity.identity_code);
    }
  }

  return (
    <Card className="p-5">
      <SectionHeader title="Free POS Tracker" description="Cash withdrawals through the free POS service. The client is also recorded as a CRM Identity, linked directly on this record, so this person can be found again later." />

      <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <summary className="cursor-pointer text-sm font-bold text-emmy-primary">+ Record a withdrawal</summary>
        <form action={action} onSubmit={() => { setQuery(''); setSelected(null); setClientName(''); setPhoneNumber(''); }} className="mt-4 grid gap-3 md:grid-cols-4">
          <input type="hidden" name="identity_id" value={selected?.id ?? ''} />
          <Field label="Date"><Input name="date" type="date" /></Field>
          <Field label="Search existing customers">
            <IdentityPicker
              renderHiddenFields={false}
              searchEndpoint={REFERRAL_TRACKER_IDENTITY_ENDPOINT}
              noMatchHint={POS_NO_MATCH_HINT}
              query={query}
              onQueryChange={(value) => { setSelected(null); setQuery(value); setClientName(value); }}
              selected={selected}
              onSelect={choose}
              placeholder="Search name, phone or CRM code..."
            />
          </Field>
          <Field label="Client name"><Input name="client_name" placeholder="Customer name" value={clientName} onChange={(e) => setClientName(e.target.value)} /></Field>
          <Field label="Phone number"><Input name="phone_number" placeholder="080..." value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} /></Field>
          <Field label="Amount withdrawn (₦)"><Input name="amount_withdrawn" type="number" min="0" step="0.01" /></Field>
          <div className="md:col-span-4 flex items-center gap-3">
            <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Record withdrawal'}</Button>
            <ActionResult state={state} />
          </div>
        </form>
      </details>

      <div className="mt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Amount withdrawn</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {posEntries.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.date || '—'}</TableCell>
                <TableCell className="font-bold">{row.client_name || '—'}</TableCell>
                <TableCell>{row.phone_number || '—'}</TableCell>
                <TableCell>{money(row.amount_withdrawn)}</TableCell>
              </TableRow>
            ))}
            {!posEntries.length && <TableRow><TableCell colSpan={4} className="text-center text-slate-400">No POS withdrawals recorded yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

function DepositsSection({ deposits }: { deposits: DepositRow[] }) {
  const [state, action, pending] = useActionState(addDepositAction, initialState);

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<OperationsIdentitySummary | null>(null);
  const [clientName, setClientName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');

  function choose(identity: OperationsIdentitySummary | null) {
    setSelected(identity);
    if (identity) {
      setClientName(identity.primary_name || '');
      setPhoneNumber(identity.primary_phone || '');
      setQuery(identity.primary_name || identity.primary_phone || identity.identity_code);
    }
  }

  return (
    <Card className="p-5">
      <SectionHeader title="POS Deposits" description="Cash deposits / transfers received through the POS service. The client is also recorded as a CRM Identity, linked directly on this record, so this person can be found again later." />

      <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <summary className="cursor-pointer text-sm font-bold text-emmy-primary">+ Record a deposit</summary>
        <form action={action} onSubmit={() => { setQuery(''); setSelected(null); setClientName(''); setPhoneNumber(''); }} className="mt-4 grid gap-3 md:grid-cols-4">
          <input type="hidden" name="identity_id" value={selected?.id ?? ''} />
          <Field label="Date"><Input name="date" type="date" /></Field>
          <Field label="Search existing customers">
            <IdentityPicker
              renderHiddenFields={false}
              searchEndpoint={REFERRAL_TRACKER_IDENTITY_ENDPOINT}
              noMatchHint={POS_NO_MATCH_HINT}
              query={query}
              onQueryChange={(value) => { setSelected(null); setQuery(value); setClientName(value); }}
              selected={selected}
              onSelect={choose}
              placeholder="Search name, phone or CRM code..."
            />
          </Field>
          <Field label="Client name"><Input name="client_name" placeholder="Customer name" value={clientName} onChange={(e) => setClientName(e.target.value)} /></Field>
          <Field label="Phone number"><Input name="phone_number" placeholder="080..." value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} /></Field>
          <Field label="Amount deposited (₦)"><Input name="amount" type="number" min="0" step="0.01" /></Field>
          <div className="md:col-span-4 flex items-center gap-3">
            <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Record deposit'}</Button>
            <ActionResult state={state} />
          </div>
        </form>
      </details>

      <div className="mt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deposits.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.date || '—'}</TableCell>
                <TableCell className="font-bold">{row.client_name || '—'}</TableCell>
                <TableCell>{row.phone_number || '—'}</TableCell>
                <TableCell>{money(row.amount)}</TableCell>
              </TableRow>
            ))}
            {!deposits.length && <TableRow><TableCell colSpan={4} className="text-center text-slate-400">No deposits recorded yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span>
      {children}
    </label>
  );
}
