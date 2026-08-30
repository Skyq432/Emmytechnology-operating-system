'use client';

import { useActionState, useState } from 'react';
import { Plus, UsersRound } from 'lucide-react';
import { HelpTip } from '@/components/ui/help-tip';
import { createSupplierAction, type SalesActionState } from '@/app/modules/operations/sales-actions';
import type { OperationsSupplier } from '@/lib/operations/types';

const initialState: SalesActionState = { success: false, message: '' };

export function SuppliersClient({ suppliers }: { suppliers: OperationsSupplier[] }) {
  const [state, action, pending] = useActionState(createSupplierAction, initialState);
  const [showCreate, setShowCreate] = useState(false);
  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="mb-5 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="flex items-center gap-2"><p className="text-xs font-black uppercase tracking-[0.16em] text-[#032489]">Sourcing</p><HelpTip text="Save suppliers once so stock, serialized devices and future receiving records can point to the same supplier." label="About Suppliers" /></div>
          <h1 className="mt-1.5 text-3xl font-black tracking-[-0.035em]">Suppliers</h1>
          <p className="mt-2 text-sm text-slate-500">People and companies EmmyTech buys products or parts from.</p>
        </div>
        <button onClick={() => setShowCreate((v) => !v)} className="inline-flex items-center gap-2 self-start rounded-lg bg-[#032489] px-4 py-2.5 text-sm font-bold text-white"><Plus className="h-4 w-4" /> {showCreate ? 'Close form' : 'Add supplier'}</button>
      </div>

      {showCreate && <form action={action} className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Supplier name"><input name="name" required className="input" /></Field>
          <Field label="Phone"><input name="phone" className="input" /></Field>
          <Field label="Email"><input name="email" type="email" className="input" /></Field>
          <Field label="Address"><input name="address" className="input" /></Field>
          <div className="md:col-span-2 xl:col-span-4"><Field label="Notes"><textarea name="notes" className="input min-h-20" /></Field></div>
        </div>
        {state.message && <p className={`mt-3 text-sm font-bold ${state.success ? 'text-blue-700' : 'text-rose-700'}`}>{state.message}</p>}
        <button disabled={pending} className="mt-4 rounded-lg bg-[#032489] px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">{pending ? 'Saving...' : 'Save supplier'}</button>
      </form>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {suppliers.length === 0 ? <div className="py-16 text-center"><UsersRound className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-700">No suppliers yet</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Supplier</th><th className="px-5 py-3">Phone</th><th className="px-5 py-3">Email</th><th className="px-5 py-3">Address</th><th className="px-5 py-3">Notes</th></tr></thead><tbody className="divide-y divide-slate-100">{suppliers.map((s) => <tr key={s.id}><td className="px-5 py-4 font-black text-slate-900">{s.name}</td><td className="px-5 py-4 text-slate-600">{s.phone || '—'}</td><td className="px-5 py-4 text-slate-600">{s.email || '—'}</td><td className="px-5 py-4 text-slate-600">{s.address || '—'}</td><td className="px-5 py-4 text-slate-500">{s.notes || '—'}</td></tr>)}</tbody></table></div>}
      </div>
      <style jsx>{`.input{width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;font-size:14px;outline:none;background:#fff}.input:focus{border-color:#032489;box-shadow:0 0 0 3px rgba(3,36,137,.08)}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span>{children}</label>; }
