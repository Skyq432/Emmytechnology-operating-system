'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { ArrowLeft, Smartphone } from 'lucide-react';
import { createInventoryUnitAction, type SalesActionState } from '@/app/modules/operations/sales-actions';
import { addInventoryStockAction, type InventoryActionState } from '@/app/modules/operations/inventory-actions';
import { HelpTip } from '@/components/ui/help-tip';
import type { OperationsInventoryItem, OperationsInventoryUnit, OperationsLocation, OperationsSupplier } from '@/lib/operations/types';

const initialSales: SalesActionState = { success: false, message: '' };
const initialInventory: InventoryActionState = { success: false, message: '' };
const money = (value: number | null | undefined) => value == null ? '—' : `₦${Number(value).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

export function InventoryDetail({ item, units, locations, suppliers }: {
  item: OperationsInventoryItem;
  units: OperationsInventoryUnit[];
  locations: OperationsLocation[];
  suppliers: OperationsSupplier[];
}) {
  const [unitState, unitAction, unitPending] = useActionState(createInventoryUnitAction, initialSales);
  const [stockState, stockAction, stockPending] = useActionState(addInventoryStockAction, initialInventory);
  const specEntries = Object.entries(item.specs || {}).filter(([, value]) => value !== '' && value !== null && value !== false);

  return <div className="mx-auto max-w-[1400px]">
    <Link href="/modules/operations/inventory" className="mb-4 inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-[#032489]"><ArrowLeft className="h-4 w-4" /> Back to inventory</Link>
    <div className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div><div className="flex items-center gap-2"><h1 className="text-2xl font-black text-[#032489]">{item.name}</h1><HelpTip text="SKU identifies the item type. Serial/IMEI is only for items you choose to track one physical unit at a time." label="About inventory identity" /></div><p className="mt-1 text-sm font-bold text-slate-500">{item.sku}{item.brand ? ` · ${item.brand}` : ''}{item.model ? ` · ${item.model}` : ''}</p><p className="mt-2 text-sm capitalize text-slate-500">{item.item_type || 'other'} · {item.serial_tracking ? 'Serial / IMEI tracking' : 'Quantity tracking'}</p></div>
        <div className="grid gap-2 sm:grid-cols-3"><Info label="Condition" value={item.default_condition || '—'} /><Info label="Default cost" value={money(item.default_unit_cost)} /><Info label="Selling price" value={money(item.default_selling_price)} /></div>
      </div>
      {specEntries.length > 0 && <div className="mt-5 border-t border-slate-100 pt-4"><p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-400">Technical details</p><div className="flex flex-wrap gap-2">{specEntries.map(([key,value]) => <span key={key} className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600"><strong className="capitalize text-slate-800">{key.replaceAll('_',' ')}:</strong> {String(value)}</span>)}</div></div>}
    </div>

    {item.serial_tracking ? <>
      <form action={unitAction} className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2"><h2 className="text-sm font-black text-slate-900">Add individual device</h2><HelpTip text="Use this when each device must be individually traceable. Enter a Serial number or IMEI." label="About serialized units" /></div>
        <input type="hidden" name="inventory_item_id" value={item.id} />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Serial number"><input name="serial_number" className="input" /></Field><Field label="IMEI 1"><input name="imei_1" className="input" /></Field><Field label="IMEI 2"><input name="imei_2" className="input" /></Field><Field label="Condition"><input name="condition" className="input" defaultValue={item.default_condition || ''} /></Field>
          <Field label="Acquisition date"><input name="acquisition_date" type="date" className="input" /></Field><Field label="Unit cost"><input name="unit_cost" type="number" min="0" className="input" defaultValue={item.default_unit_cost ?? ''} /></Field>
          <Field label="Supplier"><select name="supplier_id" className="input" defaultValue={item.preferred_supplier_id || ''}><option value="">No supplier selected</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          <Field label="Location"><select name="location_id" className="input" defaultValue=""><option value="">Choose location</option>{locations.filter((l) => l.code !== 'TRANSIT').map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
          <div className="md:col-span-2 xl:col-span-4"><Field label="Note"><input name="note" className="input" /></Field></div>
        </div>
        {unitState.message && <p className={`mt-3 text-sm font-bold ${unitState.success ? 'text-blue-700' : 'text-rose-700'}`}>{unitState.message}</p>}
        <button disabled={unitPending} className="mt-4 rounded-lg bg-[#032489] px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">{unitPending ? 'Adding...' : 'Add device'}</button>
      </form>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-black text-slate-900">Individual devices</h2><p className="mt-1 text-xs text-slate-500">{units.length} device{units.length === 1 ? '' : 's'} recorded</p></div>
        {units.length === 0 ? <div className="py-14 text-center"><Smartphone className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-700">No serial or IMEI recorded yet</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Serial / IMEI</th><th className="px-5 py-3">Condition</th><th className="px-5 py-3">Location</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Supplier</th><th className="px-5 py-3">Cost</th></tr></thead><tbody className="divide-y divide-slate-100">{units.map((u) => <tr key={u.id}><td className="px-5 py-4"><div className="font-black text-[#032489]">{u.serial_number || u.imei_1 || u.imei_2}</div></td><td className="px-5 py-4 text-slate-600">{u.condition || '—'}</td><td className="px-5 py-4 text-slate-600">{u.location?.name || '—'}</td><td className="px-5 py-4"><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black capitalize text-[#032489]">{u.status.replaceAll('_',' ')}</span></td><td className="px-5 py-4 text-slate-600">{u.supplier?.name || '—'}</td><td className="px-5 py-4 font-bold text-slate-800">{money(u.unit_cost)}</td></tr>)}</tbody></table></div>}
      </section>
    </> : <form action={stockAction} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2"><h2 className="text-sm font-black text-slate-900">Add stock</h2><HelpTip text="Use this whenever more identical units arrive. Quantity stock increases at the selected location." label="About adding stock" /></div>
      <input type="hidden" name="inventory_item_id" value={item.id} />
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Location"><select name="location_id" required className="input" defaultValue=""><option value="">Choose location</option>{locations.filter((l) => l.code !== 'TRANSIT').map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
        <Field label="Quantity"><input name="quantity" type="number" min="1" required className="input" /></Field>
        <Field label="Unit cost"><input name="unit_cost" type="number" min="0" className="input" defaultValue={item.default_unit_cost ?? ''} /></Field>
        <Field label="Supplier"><select name="supplier_id" className="input" defaultValue={item.preferred_supplier_id || ''}><option value="">No supplier selected</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <div className="md:col-span-2 xl:col-span-4"><Field label="Reason / note"><input name="note" className="input" placeholder="New stock received" /></Field></div>
      </div>
      {stockState.message && <p className={`mt-3 text-sm font-bold ${stockState.success ? 'text-blue-700' : 'text-rose-700'}`}>{stockState.message}</p>}
      <button disabled={stockPending} className="mt-4 rounded-lg bg-[#032489] px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">{stockPending ? 'Adding stock...' : 'Add stock'}</button>
    </form>}
    <style jsx>{`.input{width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;font-size:14px;outline:none;background:#fff}.input:focus{border-color:#032489;box-shadow:0 0 0 3px rgba(3,36,137,.08)}`}</style>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span>{children}</label>; }
function Info({ label, value }: { label: string; value: string }) { return <div className="min-w-[130px] rounded-lg bg-slate-50 px-3 py-2"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div><div className="mt-1 text-sm font-black text-slate-800">{value}</div></div>; }
