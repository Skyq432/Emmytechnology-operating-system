'use client';

import Link from 'next/link';
import { useActionState, useEffect, useMemo, useState } from 'react';
import { Plus, Search, UserCheck, Wrench } from 'lucide-react';
import { createRepairAction, type SalesActionState } from '@/app/modules/operations/sales-actions';
import { HelpTip } from '@/components/ui/help-tip';
import type { OperationsIdentitySummary, OperationsRepair } from '@/lib/operations/types';

const initialState: SalesActionState = { success: false, message: '' };
const money = (value: number) => `₦${Number(value || 0).toLocaleString('en-NG',{maximumFractionDigits:0})}`;

type RepairCardOption = { id: string; card_code: string; status: string };

export function RepairsClient({ repairs, availableCards }: { repairs: OperationsRepair[]; availableCards: RepairCardOption[] }) {
  const [state, action, pending] = useActionState(createRepairAction, initialState);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [identityQuery, setIdentityQuery] = useState('');
  const [identityResults, setIdentityResults] = useState<OperationsIdentitySummary[]>([]);
  const [identityLoading, setIdentityLoading] = useState(false);
  const [selectedIdentity, setSelectedIdentity] = useState<OperationsIdentitySummary | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');

  useEffect(() => {
    if (identityQuery.trim().length < 3 || selectedIdentity) {
      setIdentityResults([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      setIdentityLoading(true);
      try {
        const response = await fetch(`/api/operations/identities?q=${encodeURIComponent(identityQuery.trim())}`);
        const body = await response.json();
        setIdentityResults(response.ok ? body.results || [] : []);
      } finally {
        setIdentityLoading(false);
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [identityQuery, selectedIdentity]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return repairs;
    return repairs.filter((r) => [r.repair_code,r.customer_name,r.customer_phone,r.brand,r.model,r.serial_or_imei,r.fault_reported].filter(Boolean).join(' ').toLowerCase().includes(q));
  }, [repairs,search]);

  function chooseIdentity(identity: OperationsIdentitySummary) {
    setSelectedIdentity(identity);
    setIdentityQuery(identity.primary_name || identity.primary_phone || identity.identity_code);
    setCustomerName(identity.primary_name || '');
    setCustomerPhone(identity.primary_phone || '');
    setCustomerEmail(identity.primary_email || '');
    setIdentityResults([]);
  }

  function clearIdentity() {
    setSelectedIdentity(null);
    setIdentityQuery('');
    setCustomerName('');
    setCustomerPhone('');
    setCustomerEmail('');
  }

  return <div className="mx-auto max-w-[1500px]">
    <div className="mb-5 flex flex-col justify-between gap-4 md:flex-row md:items-end">
      <div><div className="flex items-center gap-2"><p className="text-xs font-black uppercase tracking-[0.16em] text-[#032489]">After-sales</p><HelpTip text="Repairs are separate from normal sales Orders. They can still link back to the customer, original Order or exact device." label="About Repairs" /></div><h1 className="mt-1.5 text-3xl font-black tracking-[-0.035em]">Repairs</h1><p className="mt-2 text-sm text-slate-500">Track faults, diagnosis, parts, labour, technician, warranty and collection.</p></div>
      <button onClick={() => setShowCreate((v) => !v)} className="inline-flex items-center gap-2 self-start rounded-lg bg-[#032489] px-4 py-2.5 text-sm font-bold text-white"><Plus className="h-4 w-4" /> {showCreate ? 'Close form' : 'New repair'}</button>
    </div>

    {showCreate && <form action={action} className="mb-5 space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <section className="rounded-xl bg-slate-50 p-4">
        <div className="mb-3 flex items-center gap-2"><p className="text-xs font-black uppercase tracking-wide text-slate-500">1. Customer</p><HelpTip text="Search EmmyTech CRM first. If there is no match, enter the customer details and the system will create the CRM Identity automatically when the repair is created." label="About repair customer identity" /></div>
        <div className="relative max-w-2xl">
          <input value={identityQuery} onChange={(e) => { setSelectedIdentity(null); setIdentityQuery(e.target.value); }} className="input" placeholder="Find by phone, email or name..." />
          {identityLoading && <p className="mt-2 text-xs text-slate-400">Checking EmmyTech identities...</p>}
          {identityResults.length > 0 && <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">{identityResults.map((identity) => <button type="button" key={identity.id} onClick={() => chooseIdentity(identity)} className="flex w-full items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 text-left last:border-0 hover:bg-blue-50"><div><p className="text-sm font-bold text-slate-800">{identity.primary_name || identity.primary_phone || identity.identity_code}</p><p className="mt-1 text-xs text-slate-500">{identity.primary_phone || 'No phone'} · {identity.primary_email || 'No email'}</p></div><span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black text-[#032489]">{identity.identity_code}</span></button>)}</div>}
        </div>
        {selectedIdentity && <div className="mt-3 flex flex-col justify-between gap-3 rounded-lg border border-blue-100 bg-white p-3 sm:flex-row sm:items-center"><div className="flex items-start gap-3"><UserCheck className="mt-0.5 h-4 w-4 text-[#032489]" /><div><p className="text-sm font-black text-slate-800">Using existing Identity: {selectedIdentity.identity_code}</p><p className="mt-1 text-xs text-slate-500">CRM: Stage {selectedIdentity.crm_stage} {selectedIdentity.crm_stage_name}</p></div></div><button type="button" onClick={clearIdentity} className="text-xs font-bold text-slate-500 hover:text-[#032489]">Use someone else</button></div>}
        <input type="hidden" name="identity_id" value={selectedIdentity?.id || ''} />
        <div className="mt-4 grid gap-4 md:grid-cols-3"><Field label="Customer name"><input name="customer_name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="input" required /></Field><Field label="Phone"><input name="customer_phone" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="input" /></Field><Field label="Email"><input name="customer_email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} className="input" /></Field></div>
      </section>

      <section><p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-500">2. Device & Repair Card</p><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Repair Card"><select name="card_id" className="input" defaultValue="" required><option value="" disabled>Choose available card</option>{availableCards.map((card) => <option key={card.id} value={card.id}>{card.card_code}</option>)}</select></Field><Field label="Device type"><select name="device_type" className="input"><option>Phone</option><option>Laptop</option><option>Accessory</option><option>Other</option></select></Field><Field label="Purchased from us?"><select name="purchased_from_us" className="input" defaultValue="not_sure"><option value="yes">Yes</option><option value="no">No</option><option value="not_sure">Not sure</option></select></Field><Field label="Brand"><input name="brand" className="input" /></Field>
        <Field label="Model"><input name="model" className="input" /></Field><Field label="Serial / IMEI"><input name="serial_or_imei" className="input" /></Field><Field label="Condition received"><input name="condition_received" className="input" placeholder="e.g. Cracked Screen" /></Field><Field label="Accessories received"><input name="accessories_received" className="input" placeholder="e.g. Charger, case" /></Field>
      </div>{availableCards.length === 0 && <p className="mt-3 text-sm font-bold text-amber-700">No Repair Card is currently available. A repair cannot be checked in until a card is returned or restored.</p>}</section>

      <section><p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-500">3. Repair work</p><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="md:col-span-2"><Field label="Fault reported"><textarea name="fault_reported" required className="input min-h-20" /></Field></div><div className="md:col-span-2"><Field label="Technician diagnosis"><textarea name="diagnosis" className="input min-h-20" /></Field></div>
        <Field label="Repair type"><input name="repair_type" className="input" placeholder="Screen Replacement" /></Field><Field label="Parts replaced"><input name="parts_replaced" className="input" /></Field><Field label="Technician"><input name="technician_name" className="input" /></Field><Field label="Condition returned"><input name="condition_returned" className="input" /></Field>
      </div></section>
      <section><p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-500">4. Money & warranty</p><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><Field label="Parts cost"><input name="parts_cost" type="number" min="0" defaultValue="0" className="input" /></Field><Field label="Labour cost"><input name="labour_cost" type="number" min="0" defaultValue="0" className="input" /></Field><Field label="Initial amount"><input name="amount_charged" type="number" min="0" defaultValue="0" className="input" /></Field><Field label="Repair warranty"><input name="warranty_period" className="input" placeholder="1 Month" /></Field><Field label="Warranty expiry"><input name="warranty_expires_at" type="date" className="input" /></Field><div className="md:col-span-2 xl:col-span-3"><Field label="Notes"><input name="notes" className="input" /></Field></div></div></section>
      {state.message && <p className={`rounded-lg px-3 py-2 text-sm font-bold ${state.success ? 'bg-blue-50 text-blue-700' : 'bg-rose-50 text-rose-700'}`}>{state.message}</p>}
      <button disabled={pending || availableCards.length === 0} className="rounded-lg bg-[#032489] px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">{pending ? 'Creating...' : 'Create repair & assign card'}</button>
    </form>}

    <div className="mb-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm"><Search className="h-4 w-4 text-slate-400" /><input value={search} onChange={(e)=>setSearch(e.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="Search repair, customer, device, serial or fault..." /></div>
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">{filtered.length === 0 ? <div className="py-16 text-center"><Wrench className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-700">No repair jobs found</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Job</th><th className="px-5 py-3">Customer</th><th className="px-5 py-3">Device</th><th className="px-5 py-3">Fault</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Charged</th><th className="px-5 py-3">Profit</th></tr></thead><tbody className="divide-y divide-slate-100">{filtered.map((r)=><tr key={r.id}><td className="px-5 py-4 font-black"><Link href={`/modules/operations/repairs/${r.id}`} className="text-[#032489] hover:underline">{r.repair_code}</Link></td><td className="px-5 py-4"><div className="font-bold text-slate-800">{r.customer_name || 'Unknown'}</div><div className="mt-1 text-xs text-slate-400">{r.customer_phone || '—'}</div></td><td className="px-5 py-4 text-slate-600">{[r.brand,r.model].filter(Boolean).join(' ') || r.device_type || '—'}</td><td className="px-5 py-4 max-w-xs truncate text-slate-600">{r.fault_reported}</td><td className="px-5 py-4"><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black capitalize text-[#032489]">{r.status.replaceAll('_',' ')}</span></td><td className="px-5 py-4 font-bold text-slate-800">{money(r.amount_charged)}</td><td className="px-5 py-4 font-black text-[#032489]">{money(r.repair_profit)}</td></tr>)}</tbody></table></div>}</div>
    <style jsx>{`.input{width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;font-size:14px;outline:none;background:#fff}.input:focus{border-color:#032489;box-shadow:0 0 0 3px rgba(3,36,137,.08)}`}</style>
  </div>;
}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span>{children}</label>}
