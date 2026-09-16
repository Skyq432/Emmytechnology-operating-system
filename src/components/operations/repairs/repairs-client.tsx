'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useActionState, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Plus, Search, UserCheck, Wrench } from 'lucide-react';
import { createRepairAction, type SalesActionState } from '@/app/(staff)/modules/operations/sales-actions';
import { REPAIR_STATUS_SEQUENCE, type RepairStatus } from '@/lib/operations/repair-domain';
import { HelpTip } from '@/components/ui/help-tip';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ActionResult } from '@/components/ui/alert';
import { StepProgress } from '@/components/ui/step-progress';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { IdentityPicker } from '@/components/shared/identity-picker';
import type { OperationsIdentitySummary, OperationsRepair } from '@/lib/operations/types';

const initialState: SalesActionState = { success: false, message: '' };
const money = (value: number) => `₦${Number(value || 0).toLocaleString('en-NG',{maximumFractionDigits:0})}`;
const STEPS = ['Customer', 'Device & Repair Card', 'Repair work'];
const STEP_ORDER: Step[] = ['customer', 'device', 'work'];
const DRAFT_KEY = 'emmytech-repair-intake-draft';

type RepairCardOption = { id: string; card_code: string; status: string };
type Step = 'customer' | 'device' | 'work';
type RepairDraft = {
  step: Step;
  identityQuery: string;
  selectedIdentity: OperationsIdentitySummary | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  issueCard: boolean;
  cardId: string;
  deviceType: string;
  purchasedFromUs: string;
  brand: string;
  model: string;
  serialOrImei: string;
  conditionReceived: string;
  accessoriesReceived: string;
  faultReported: string;
};

function subscribeToDraft(callback: () => void) {
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}
function getDraftSnapshot() {
  return window.localStorage.getItem(DRAFT_KEY);
}
function getServerDraftSnapshot() {
  return null;
}

export function RepairsClient({ repairs, availableCards }: { repairs: OperationsRepair[]; availableCards: RepairCardOption[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, action, pending] = useActionState(createRepairAction, initialState);
  const [showCreate, setShowCreate] = useState(false);
  const [step, setStep] = useState<Step>('customer');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<RepairStatus | 'all' | 'uncollected'>(() => {
    const fromUrl = searchParams.get('status');
    if (fromUrl === 'uncollected') return 'uncollected';
    return fromUrl && REPAIR_STATUS_SEQUENCE.includes(fromUrl as RepairStatus) ? (fromUrl as RepairStatus) : 'all';
  });
  const [identityQuery, setIdentityQuery] = useState('');
  const [selectedIdentity, setSelectedIdentity] = useState<OperationsIdentitySummary | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [issueCard, setIssueCard] = useState(true);
  const [cardId, setCardId] = useState('');
  const [deviceType, setDeviceType] = useState('Phone');
  const [purchasedFromUs, setPurchasedFromUs] = useState('not_sure');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [serialOrImei, setSerialOrImei] = useState('');
  const [conditionReceived, setConditionReceived] = useState('');
  const [accessoriesReceived, setAccessoriesReceived] = useState('');
  const [faultReported, setFaultReported] = useState('');
  const [draftRestored, setDraftRestored] = useState(false);

  // Whether an in-progress intake is sitting in localStorage — read via
  // useSyncExternalStore (not an effect) so the server-rendered pass and the
  // client's first render agree (server always sees no draft) with no flash.
  const savedDraftRaw = useSyncExternalStore(subscribeToDraft, getDraftSnapshot, getServerDraftSnapshot);
  const savedDraft = useMemo<Partial<RepairDraft> | null>(() => {
    if (!savedDraftRaw) return null;
    try {
      return JSON.parse(savedDraftRaw) as Partial<RepairDraft>;
    } catch {
      return null;
    }
  }, [savedDraftRaw]);

  // Resuming is a real user action (a button click), not something that should
  // happen silently on mount — that keeps every setState call here inside an
  // event handler, never an effect.
  function resumeDraft() {
    if (!savedDraft) return;
    if (savedDraft.selectedIdentity) setSelectedIdentity(savedDraft.selectedIdentity);
    if (savedDraft.identityQuery) setIdentityQuery(savedDraft.identityQuery);
    if (savedDraft.customerName) setCustomerName(savedDraft.customerName);
    if (savedDraft.customerPhone) setCustomerPhone(savedDraft.customerPhone);
    if (savedDraft.customerEmail) setCustomerEmail(savedDraft.customerEmail);
    if (savedDraft.issueCard !== undefined) setIssueCard(savedDraft.issueCard);
    if (savedDraft.cardId) setCardId(savedDraft.cardId);
    if (savedDraft.deviceType) setDeviceType(savedDraft.deviceType);
    if (savedDraft.purchasedFromUs) setPurchasedFromUs(savedDraft.purchasedFromUs);
    if (savedDraft.brand) setBrand(savedDraft.brand);
    if (savedDraft.model) setModel(savedDraft.model);
    if (savedDraft.serialOrImei) setSerialOrImei(savedDraft.serialOrImei);
    if (savedDraft.conditionReceived) setConditionReceived(savedDraft.conditionReceived);
    if (savedDraft.accessoriesReceived) setAccessoriesReceived(savedDraft.accessoriesReceived);
    if (savedDraft.faultReported) setFaultReported(savedDraft.faultReported);
    if (savedDraft.step) setStep(savedDraft.step);
    setShowCreate(true);
    setDraftRestored(true);
  }

  function discardDraft() {
    window.localStorage.removeItem(DRAFT_KEY);
    window.dispatchEvent(new StorageEvent('storage'));
  }

  // Persist on every change while the form is open — cleared on successful create
  // or an explicit Cancel, so it never outlives the intake it belongs to.
  useEffect(() => {
    if (!showCreate) return;
    const draft: RepairDraft = {
      step, identityQuery, selectedIdentity, customerName, customerPhone, customerEmail,
      issueCard, cardId, deviceType, purchasedFromUs, brand, model, serialOrImei, conditionReceived,
      accessoriesReceived, faultReported,
    };
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Storage unavailable (private window, quota) — draft resilience is a nicety, not required.
    }
  }, [showCreate, step, identityQuery, selectedIdentity, customerName, customerPhone, customerEmail, issueCard, cardId, deviceType, purchasedFromUs, brand, model, serialOrImei, conditionReceived, accessoriesReceived, faultReported]);

  useEffect(() => {
    const repairId = (state.data as { repairId?: string } | undefined)?.repairId;
    if (state.success && repairId) {
      window.localStorage.removeItem(DRAFT_KEY);
      router.push(`/modules/operations/repairs/${repairId}`);
    }
  }, [state, router]);

  const statusCounts = useMemo(() => {
    const counts = new Map<RepairStatus, number>();
    for (const r of repairs) counts.set(r.status, (counts.get(r.status) || 0) + 1);
    return counts;
  }, [repairs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return repairs.filter((r) => {
      if (statusFilter === 'uncollected' && (r.status === 'collected' || r.status === 'cancelled')) return false;
      else if (statusFilter !== 'all' && statusFilter !== 'uncollected' && r.status !== statusFilter) return false;
      if (!q) return true;
      return [r.repair_code,r.customer_name,r.customer_phone,r.brand,r.model,r.serial_or_imei,r.fault_reported].filter(Boolean).join(' ').toLowerCase().includes(q);
    });
  }, [repairs,search,statusFilter]);

  function chooseIdentity(identity: OperationsIdentitySummary | null) {
    if (!identity) {
      clearIdentity();
      return;
    }
    setSelectedIdentity(identity);
    setIdentityQuery(identity.primary_name || identity.primary_phone || identity.identity_code);
    setCustomerName(identity.primary_name || '');
    setCustomerPhone(identity.primary_phone || '');
    setCustomerEmail(identity.primary_email || '');
  }

  function clearIdentity() {
    setSelectedIdentity(null);
    setIdentityQuery('');
    setCustomerName('');
    setCustomerPhone('');
    setCustomerEmail('');
  }

  function resetIntake() {
    setShowCreate(false);
    setStep('customer');
    clearIdentity();
    setIssueCard(true);
    setCardId('');
    setDeviceType('Phone');
    setPurchasedFromUs('not_sure');
    setBrand('');
    setModel('');
    setSerialOrImei('');
    setConditionReceived('');
    setAccessoriesReceived('');
    setFaultReported('');
    setDraftRestored(false);
    window.localStorage.removeItem(DRAFT_KEY);
    window.dispatchEvent(new StorageEvent('storage'));
  }

  const stepIndex = STEP_ORDER.indexOf(step);

  return <div className="mx-auto max-w-[1500px]">
    <div className="mb-5 flex flex-col justify-between gap-4 md:flex-row md:items-end">
      <div><div className="flex items-center gap-2"><p className="text-xs font-black uppercase tracking-[0.16em] text-emmy-primary">After-sales</p><HelpTip text="Repairs are separate from normal sales Orders. They can still link back to the customer, original Order or exact device." label="About Repairs" /></div><h1 className="mt-1.5 text-3xl font-black tracking-[-0.035em]">Repairs</h1><p className="mt-2 text-sm text-slate-500">Track faults, diagnosis, parts, labour, technician, warranty and collection.</p></div>
      <Button onClick={() => (showCreate ? resetIntake() : setShowCreate(true))} className="self-start"><Plus className="h-4 w-4" /> {showCreate ? 'Close form' : 'New repair'}</Button>
    </div>

    {!showCreate && savedDraft && (
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
        <p className="text-sm font-bold text-emmy-primary">You have an unfinished repair intake{savedDraft.customerName ? ` for ${savedDraft.customerName}` : ''}.</p>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={discardDraft}>Discard</Button>
          <Button size="sm" onClick={resumeDraft}>Resume</Button>
        </div>
      </div>
    )}

    {showCreate && <form action={action} className="mb-5 space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <StepProgress steps={STEPS} current={stepIndex} />
      {draftRestored && <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold text-emmy-primary">Restored your in-progress intake — pick up where you left off.</p>}

      <section hidden={step !== 'customer'} className="rounded-xl bg-slate-50 p-4">
        <div className="mb-3 flex items-center gap-2"><p className="text-xs font-black uppercase tracking-wide text-slate-500">1. Customer</p><HelpTip text="Search EmmyTech CRM first. If there is no match, enter the customer details and the system will create the CRM Identity automatically when the repair is created." label="About repair customer identity" /></div>
        <div className="max-w-2xl">
          <IdentityPicker
            renderHiddenFields={false}
            query={identityQuery}
            onQueryChange={(value) => { setSelectedIdentity(null); setIdentityQuery(value); }}
            selected={selectedIdentity}
            onSelect={chooseIdentity}
            placeholder="Find by phone, email or name..."
          />
        </div>
        {selectedIdentity && <div className="mt-3 flex flex-col justify-between gap-3 rounded-lg border border-blue-100 bg-white p-3 sm:flex-row sm:items-center"><div className="flex items-start gap-3"><UserCheck className="mt-0.5 h-4 w-4 text-emmy-primary" /><div><p className="text-sm font-black text-slate-800">Using existing Identity: {selectedIdentity.identity_code}</p><p className="mt-1 text-xs text-slate-500">CRM: Stage {selectedIdentity.crm_stage} {selectedIdentity.crm_stage_name}</p></div></div><button type="button" onClick={clearIdentity} className="text-xs font-bold text-slate-500 hover:text-emmy-primary">Use someone else</button></div>}
        <input type="hidden" name="identity_id" value={selectedIdentity?.id || ''} />
        <div className="mt-4 grid gap-4 md:grid-cols-3"><Field label="Customer name"><Input name="customer_name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} required /></Field><Field label="Phone"><Input name="customer_phone" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} /></Field><Field label="Email"><Input name="customer_email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} /></Field></div>
        <div className="mt-4 flex gap-2">
          <Button type="button" onClick={resetIntake} variant="ghost">Cancel</Button>
          <Button type="button" disabled={!customerName.trim()} onClick={() => setStep('device')}>Continue</Button>
        </div>
      </section>

      <section hidden={step !== 'device'}><p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-500">2. Device & Repair Card</p>
        <label className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-700">
          <input type="checkbox" checked={issueCard} onChange={(e) => { setIssueCard(e.target.checked); if (!e.target.checked) setCardId(''); }} className="h-4 w-4" />
          Issue a Repair Card for this job
        </label>
        {!issueCard && <p className="mb-3 text-xs text-slate-500">No card, PIN or handover steps — use this for family/trusted customers or same-day collection.</p>}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {issueCard && <Field label="Repair Card"><Select name="card_id" value={cardId} onChange={(e) => setCardId(e.target.value)} required><option value="" disabled>Choose available card</option>{availableCards.map((card) => <option key={card.id} value={card.id}>{card.card_code}</option>)}</Select></Field>}<Field label="Device type"><Select name="device_type" value={deviceType} onChange={(e) => setDeviceType(e.target.value)}><option>Phone</option><option>Laptop</option><option>Accessory</option><option>Other</option></Select></Field><Field label="Purchased from us?"><Select name="purchased_from_us" value={purchasedFromUs} onChange={(e) => setPurchasedFromUs(e.target.value)}><option value="yes">Yes</option><option value="no">No</option><option value="not_sure">Not sure</option></Select></Field><Field label="Brand"><Input name="brand" value={brand} onChange={(e) => setBrand(e.target.value)} /></Field>
        <Field label="Model"><Input name="model" value={model} onChange={(e) => setModel(e.target.value)} /></Field><Field label="Serial / IMEI"><Input name="serial_or_imei" value={serialOrImei} onChange={(e) => setSerialOrImei(e.target.value)} /></Field><Field label="Condition received"><Input name="condition_received" value={conditionReceived} onChange={(e) => setConditionReceived(e.target.value)} placeholder="e.g. Cracked Screen" /></Field><Field label="Accessories received"><Input name="accessories_received" value={accessoriesReceived} onChange={(e) => setAccessoriesReceived(e.target.value)} placeholder="e.g. Charger, case" /></Field>
      </div>{issueCard && availableCards.length === 0 && <p className="mt-3 text-sm font-bold text-amber-700">No Repair Card is currently available. A repair cannot be checked in until a card is returned or restored, or issue this one without a card.</p>}
        <div className="mt-4 flex gap-2">
          <Button type="button" onClick={resetIntake} variant="ghost">Cancel</Button>
          <Button type="button" variant="outline" onClick={() => setStep('customer')}>Back</Button>
          <Button type="button" disabled={issueCard && !cardId} onClick={() => setStep('work')}>Continue</Button>
        </div>
      </section>

      <section hidden={step !== 'work'}><p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-500">3. Repair work</p>
        <Field label="Fault reported"><Textarea name="fault_reported" value={faultReported} onChange={(e) => setFaultReported(e.target.value)} required className="min-h-20" /></Field>
        <p className="mt-4 text-xs text-slate-500">Diagnosis, technician, parts, cost and warranty are collected afterward, one step at a time, from the repair&apos;s own page — no need to work those out now.</p>
        <ActionResult state={state} />
        <div className="mt-4 flex gap-2">
          <Button type="button" onClick={resetIntake} variant="ghost">Cancel</Button>
          <Button type="button" variant="outline" onClick={() => setStep('device')}>Back</Button>
          <Button type="submit" disabled={pending || (issueCard && availableCards.length === 0) || !faultReported.trim()}>{pending ? 'Creating...' : issueCard ? 'Create repair & assign card' : 'Create repair'}</Button>
        </div>
      </section>
    </form>}

    <div className="mb-3 flex flex-wrap items-stretch gap-2">
      <button type="button" onClick={() => setStatusFilter('all')} className={`rounded-xl border px-3 py-2 text-left shadow-sm transition-colors ${statusFilter === 'all' ? 'border-emmy-primary bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
        <div className="text-lg font-black leading-none text-slate-900">{repairs.length}</div>
        <div className="mt-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">All</div>
      </button>
      <button type="button" onClick={() => setStatusFilter(statusFilter === 'uncollected' ? 'all' : 'uncollected')} className={`rounded-xl border px-3 py-2 text-left shadow-sm transition-colors ${statusFilter === 'uncollected' ? 'border-emmy-primary bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
        <div className="text-lg font-black leading-none text-slate-900">{repairs.filter((r) => r.status !== 'collected' && r.status !== 'cancelled').length}</div>
        <div className="mt-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">Not collected yet</div>
      </button>
      <button type="button" onClick={() => setStatusFilter(statusFilter === 'collected' ? 'all' : 'collected')} className={`rounded-xl border px-3 py-2 text-left shadow-sm transition-colors ${statusFilter === 'collected' ? 'border-emmy-primary bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
        <div className="text-lg font-black leading-none text-slate-900">{statusCounts.get('collected') || 0}</div>
        <div className="mt-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">Collected</div>
      </button>
      <Select
        value={REPAIR_STATUS_SEQUENCE.includes(statusFilter as RepairStatus) && statusFilter !== 'collected' ? statusFilter : ''}
        onChange={(e) => setStatusFilter((e.target.value || 'all') as RepairStatus | 'all' | 'uncollected')}
        className="w-auto"
      >
        <option value="">More statuses…</option>
        {REPAIR_STATUS_SEQUENCE.filter((status) => status !== 'collected').map((status) => (
          <option key={status} value={status}>
            {status.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())} ({statusCounts.get(status) || 0})
          </option>
        ))}
      </Select>
    </div>

    <div className="mb-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm"><Search className="h-4 w-4 text-slate-400" /><input value={search} onChange={(e)=>setSearch(e.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="Search repair, customer, device, serial or fault..." /></div>

    {filtered.length === 0 ? (
      <div className="rounded-xl border border-slate-200 bg-white py-16 text-center shadow-sm">
        <Wrench className="mx-auto h-8 w-8 text-slate-300" />
        <p className="mt-3 text-sm font-bold text-slate-700">No repair jobs found</p>
      </div>
    ) : (
      <Table>
        <TableHeader>
          <TableRow><TableHead>Job</TableHead><TableHead>Customer</TableHead><TableHead>Device</TableHead><TableHead>Fault</TableHead><TableHead>Status</TableHead><TableHead>Charged</TableHead><TableHead>Profit</TableHead></TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-black"><Link href={`/modules/operations/repairs/${r.id}`} className="text-emmy-primary hover:underline">{r.repair_code}</Link></TableCell>
              <TableCell><div className="font-bold text-slate-800">{r.customer_name || 'Unknown'}</div><div className="mt-1 text-xs text-slate-400">{r.customer_phone || '—'}</div></TableCell>
              <TableCell className="text-slate-600">{[r.brand,r.model].filter(Boolean).join(' ') || r.device_type || '—'}</TableCell>
              <TableCell className="max-w-xs truncate text-slate-600">{r.fault_reported}</TableCell>
              <TableCell><Badge className="capitalize">{r.status.replaceAll('_',' ')}</Badge></TableCell>
              <TableCell className="font-bold text-slate-800">{money(r.amount_charged)}</TableCell>
              <TableCell className="font-black text-emmy-primary">{money(r.repair_profit)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )}
  </div>;
}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span>{children}</label>}
