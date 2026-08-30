'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { ArrowLeft, Smartphone } from 'lucide-react';
import { createInventoryUnitAction, type SalesActionState } from '@/app/modules/operations/sales-actions';
import { HelpTip } from '@/components/ui/help-tip';
import type { OperationsInventoryItem, OperationsInventoryUnit, OperationsLocation, OperationsSupplier } from '@/lib/operations/types';

const initialState: SalesActionState = { success: false, message: '' };
const money = (value: number | null | undefined) => value == null ? '—' : `₦${Number(value).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

export function InventoryDetail({ item, units, locations, suppliers }: {
  item: OperationsInventoryItem;
  units: OperationsInventoryUnit[];
  locations: OperationsLocation[];
  suppliers: OperationsSupplier[];
}) {
  const [state, action, pending] = useActionState(createInventoryUnitAction, initialState);
  return <div className="mx-auto max-w-[1400px]">
    <Link href="/modules/operations/inventory" className="mb-4 inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-[#032489]"><ArrowLeft className="h-4 w-4" /> Back to inventory</Link>
    <div className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div><div className="flex items-center gap-2"><h1 className="text-2xl font-black text-[#032489]">{item.name}</h1><HelpTip text="SKU identifies the item type. Serial number or IMEI identifies one exact physical device." label="About inventory identity" /></div><p className="mt-1 text-sm font-bold text-slate-500">{item.sku}{item.brand ? ` · ${item.brand}` : ''}</p><p className="mt-2 text-sm text-slate-500">{item.description || 'No description'}</p></div>
        <div className="grid gap-2 sm:grid-cols-3"><Info label="Condition" value={item.default_condition || '—'} /><Info label="Default cost" value={money(item.default_unit_cost)} /><Info label="Selling price" value={money(item.default_selling_price)} /></div>
      </div>
    </div>

    {item.serial_tracking ? <>
      <form action={action} className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2"><h2 className="text-sm font-black text-slate-900">Add individual device</h2><HelpTip text="Use this for one phone or laptop. Enter its serial number or IMEI so EmmyTech can follow that exact device from supplier to customer or repair." label="About serialized units" /></div>
        <input type="hidden" name="inventory_item_id" value={item.id} />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Serial number"><input name="serial_number" className="input" /></Field>
          <Field label="IMEI 1"><input name="imei_1" className="input" /></Field>
          <Field label="IMEI 2"><input name="imei_2" className="input" /></Field>
          <Field label="Condition"><input name="condition" className="input" defaultValue={item.default_condition || ''} /></Field>
          <Field label="Acquisition date"><input name="acquisition_date" type="date" className="input" /></Field>
          <Field label="Unit cost"><input name="unit_cost" type="number" min="0" className="input" defaultValue={item.default_unit_cost ?? ''} /></Field>
          <Field label="Supplier"><select name="supplier_id" className="input" defaultValue={item.preferred_supplier_id || ''}><option value="">No supplier selected</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          <Field label="Location"><select name="location_id" className="input" defaultValue=""><option value="">Choose location</option>{locations.filter((l) => l.code !== 'TRANSIT').map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
          <div className="md:col-span-2 xl:col-span-4"><Field label="Note"><input name="note" className="input" /></Field></div>
        </div>
        {state.message && <p className={`mt-3 text-sm font-bold ${state.success ? 'text-blue-700' : 'text-rose-700'}`}>{state.message}</p>}
        <button disabled={pending} className="mt-4 rounded-lg bg-[#032489] px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">{pending ? 'Adding...' : 'Add device'}</button>
      </form>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-black text-slate-900">Individual devices</h2><p className="mt-1 text-xs text-slate-500">{units.length} device{units.length === 1 ? '' : 's'} recorded</p></div>
        {units.length === 0 ? <div className="py-14 text-center"><Smartphone className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-700">No serial or IMEI recorded yet</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Serial / IMEI</th><th className="px-5 py-3">Condition</th><th className="px-5 py-3">Location</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Supplier</th><th className="px-5 py-3">Cost</th></tr></thead><tbody className="divide-y divide-slate-100">{units.map((u) => <tr key={u.id}><td className="px-5 py-4"><div className="font-black text-[#032489]">{u.serial_number || u.imei_1 || u.imei_2}</div>{u.serial_number && u.imei_1 && <div className="mt-1 text-xs text-slate-400">IMEI {u.imei_1}</div>}</td><td className="px-5 py-4 text-slate-600">{u.condition || '—'}</td><td className="px-5 py-4 text-slate-600">{u.location?.name || '—'}</td><td className="px-5 py-4"><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black capitalize text-[#032489]">{u.status.replaceAll('_',' ')}</span></td><td className="px-5 py-4 text-slate-600">{u.supplier?.name || '—'}</td><td className="px-5 py-4 font-bold text-slate-800">{money(u.unit_cost)}</td></tr>)}</tbody></table></div>}
      </section>
    </> : <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm"><p className="text-sm font-bold text-slate-700">This item uses quantity tracking.</p><p className="mt-2 text-xs text-slate-500">Serial/IMEI tracking is only shown for serialized items.</p></div>}
    <style jsx>{`.input{width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;font-size:14px;outline:none;background:#fff}.input:focus{border-color:#032489;box-shadow:0 0 0 3px rgba(3,36,137,.08)}`}</style>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span>{children}</label>; }
function Info({ label, value }: { label: string; value: string }) { return <div className="min-w-[130px] rounded-lg bg-slate-50 px-3 py-2"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div><div className="mt-1 text-sm font-black text-slate-800">{value}</div></div>; }
