'use client';

import Link from 'next/link';
import { useActionState, useMemo, useState } from 'react';
import { Plus, Search, UserCheck, Wrench } from 'lucide-react';
import { createRepairAction, type SalesActionState } from '@/app/(staff)/modules/operations/sales-actions';
import { HelpTip } from '@/components/ui/help-tip';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ActionResult } from '@/components/ui/alert';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { IdentityPicker } from '@/components/shared/identity-picker';
import type { OperationsIdentitySummary, OperationsRepair } from '@/lib/operations/types';

const initialState: SalesActionState = { success: false, message: '' };
const money = (value: number) => `₦${Number(value || 0).toLocaleString('en-NG',{maximumFractionDigits:0})}`;

type RepairCardOption = { id: string; card_code: string; status: string };

export function RepairsClient({ repairs, availableCards }: { repairs: OperationsRepair[]; availableCards: RepairCardOption[] }) {
  const [state, action, pending] = useActionState(createRepairAction, initialState);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [identityQuery, setIdentityQuery] = useState('');
  const [selectedIdentity, setSelectedIdentity] = useState<OperationsIdentitySummary | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return repairs;
    return repairs.filter((r) => [r.repair_code,r.customer_name,r.customer_phone,r.brand,r.model,r.serial_or_imei,r.fault_reported].filter(Boolean).join(' ').toLowerCase().includes(q));
  }, [repairs,search]);

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

  return <div className="mx-auto max-w-[1500px]">
    <div className="mb-5 flex flex-col justify-between gap-4 md:flex-row md:items-end">
      <div><div className="flex items-center gap-2"><p className="text-xs font-black uppercase tracking-[0.16em] text-emmy-primary">After-sales</p><HelpTip text="Repairs are separate from normal sales Orders. They can still link back to the customer, original Order or exact device." label="About Repairs" /></div><h1 className="mt-1.5 text-3xl font-black tracking-[-0.035em]">Repairs</h1><p className="mt-2 text-sm text-slate-500">Track faults, diagnosis, parts, labour, technician, warranty and collection.</p></div>
      <Button onClick={() => setShowCreate((v) => !v)} className="self-start"><Plus className="h-4 w-4" /> {showCreate ? 'Close form' : 'New repair'}</Button>
    </div>

    {showCreate && <form action={action} className="mb-5 space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <section className="rounded-xl bg-slate-50 p-4">
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
      </section>

      <section><p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-500">2. Device & Repair Card</p><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Repair Card"><Select name="card_id" defaultValue="" required><option value="" disabled>Choose available card</option>{availableCards.map((card) => <option key={card.id} value={card.id}>{card.card_code}</option>)}</Select></Field><Field label="Device type"><Select name="device_type"><option>Phone</option><option>Laptop</option><option>Accessory</option><option>Other</option></Select></Field><Field label="Purchased from us?"><Select name="purchased_from_us" defaultValue="not_sure"><option value="yes">Yes</option><option value="no">No</option><option value="not_sure">Not sure</option></Select></Field><Field label="Brand"><Input name="brand" /></Field>
        <Field label="Model"><Input name="model" /></Field><Field label="Serial / IMEI"><Input name="serial_or_imei" /></Field><Field label="Condition received"><Input name="condition_received" placeholder="e.g. Cracked Screen" /></Field><Field label="Accessories received"><Input name="accessories_received" placeholder="e.g. Charger, case" /></Field>
      </div>{availableCards.length === 0 && <p className="mt-3 text-sm font-bold text-amber-700">No Repair Card is currently available. A repair cannot be checked in until a card is returned or restored.</p>}</section>

      <section><p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-500">3. Repair work</p><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="md:col-span-2"><Field label="Fault reported"><Textarea name="fault_reported" required className="min-h-20" /></Field></div><div className="md:col-span-2"><Field label="Technician diagnosis"><Textarea name="diagnosis" className="min-h-20" /></Field></div>
        <Field label="Repair type"><Input name="repair_type" placeholder="Screen Replacement" /></Field><Field label="Parts replaced"><Input name="parts_replaced" /></Field><Field label="Technician"><Input name="technician_name" /></Field><Field label="Condition returned"><Input name="condition_returned" /></Field>
      </div></section>
      <section><p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-500">4. Money & warranty</p><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><Field label="Parts cost"><Input name="parts_cost" type="number" min="0" defaultValue="0" /></Field><Field label="Labour cost"><Input name="labour_cost" type="number" min="0" defaultValue="0" /></Field><Field label="Initial amount"><Input name="amount_charged" type="number" min="0" defaultValue="0" /></Field><Field label="Repair warranty"><Input name="warranty_period" placeholder="1 Month" /></Field><Field label="Warranty expiry"><Input name="warranty_expires_at" type="date" /></Field><div className="md:col-span-2 xl:col-span-3"><Field label="Notes"><Input name="notes" /></Field></div></div></section>
      <ActionResult state={state} />
      <Button type="submit" disabled={pending || availableCards.length === 0}>{pending ? 'Creating...' : 'Create repair & assign card'}</Button>
    </form>}

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
