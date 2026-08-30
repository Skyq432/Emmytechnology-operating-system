'use client';

import Link from 'next/link';
import { useActionState, useMemo, useState } from 'react';
import { Boxes, Plus, Search } from 'lucide-react';
import { HelpTip } from '@/components/ui/help-tip';
import { OPERATIONS_HELP } from '@/lib/operations/help';
import { createInventoryItemAction, type OperationsActionState } from '@/app/modules/operations/actions';
import type { OperationsInventoryItem, OperationsLocation } from '@/lib/operations/types';

const initialState: OperationsActionState = { success: false, message: '' };

export function InventoryClient({ items, locations }: { items: OperationsInventoryItem[]; locations: OperationsLocation[] }) {
  const [state, formAction, pending] = useActionState(createInventoryItemAction, initialState);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [location, setLocation] = useState('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchesSearch = !q || [item.sku, item.name, item.brand, item.category, item.description].filter(Boolean).join(' ').toLowerCase().includes(q);
      if (!matchesSearch) return false;
      if (location === 'all') return true;
      return item.location_balances?.some((row) => row.location_id === location && (row.on_hand > 0 || row.reserved > 0));
    });
  }, [items, search, location]);

  const selectedLocation = locations.find((item) => item.id === location);
  const totals = items.reduce((acc, item) => {
    const rows = location === 'all' ? item.location_balances || [] : (item.location_balances || []).filter((row) => row.location_id === location);
    acc.onHand += rows.reduce((sum, row) => sum + row.on_hand, 0);
    acc.reserved += rows.reduce((sum, row) => sum + row.reserved, 0);
    acc.available += rows.reduce((sum, row) => sum + row.available, 0);
    return acc;
  }, { onHand: 0, reserved: 0, available: 0 });

  const lowStock = items.filter((item) => Number(item.available || 0) <= item.reorder_level).length;

  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="mb-5 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="flex items-center gap-2"><p className="text-xs font-black uppercase tracking-[0.16em] text-[#032489]">Internal stock</p><HelpTip text="Inventory shows what EmmyTech physically has. Products on the website are separate unless they are linked." label="About Inventory" /></div>
          <h1 className="mt-1.5 text-3xl font-black tracking-[-0.035em]">Inventory</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">See what is in Sango, UI or moving between locations. Open an item to manage Serial/IMEI devices when needed.</p>
        </div>
        <button onClick={() => setShowCreate((value) => !value)} className="inline-flex items-center gap-2 self-start rounded-lg bg-[#032489] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#021d70]"><Plus className="h-4 w-4" /> {showCreate ? 'Close form' : 'Add item'}</button>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <MiniStat label="On hand" value={totals.onHand} help="The physical quantity currently recorded at the selected location." />
        <MiniStat label="Reserved" value={totals.reserved} help="Items kept aside for confirmed orders. They are still physically here but should not be sold again." />
        <MiniStat label="Available" value={totals.available} help="What staff can still sell now after removing reserved quantities." />
        <MiniStat label="Low stock items" value={lowStock} help={OPERATIONS_HELP.lowStock} />
      </div>

      {showCreate && (
        <form action={formAction} className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2"><h2 className="text-sm font-black text-slate-900">Add inventory item</h2><HelpTip text="You only enter the item details. EmmyTech creates the SKU automatically, for example ET-INV-000001." label="About automatic SKU" /></div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Item name"><input name="name" required className="input" placeholder="HP EliteBook 840 G8 Grade A" /></Field>
            <Field label="Category"><input name="category" className="input" placeholder="Laptop / Phone / Spare / Packaging" /></Field>
            <Field label="Unit"><input name="unit" className="input" defaultValue="item" /></Field>
            <Field label="Reorder level"><input name="reorder_level" type="number" min="0" defaultValue="0" className="input" /></Field>
            <label className="flex items-center gap-3 self-end rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-600"><input name="serial_tracking" type="checkbox" className="h-4 w-4" /> Track Serial / IMEI</label>
            <Field label="Description"><input name="description" className="input" placeholder="Simple internal note" /></Field>
          </div>
          {state.message && <p className={`mt-4 text-sm font-bold ${state.success ? 'text-blue-700' : 'text-rose-700'}`}>{state.message}</p>}
          <button disabled={pending} className="mt-5 rounded-lg bg-[#032489] px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">{pending ? 'Creating...' : 'Create item'}</button>
        </form>
      )}

      <div className="mb-3 flex flex-col gap-3 sm:flex-row">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm"><Search className="h-4 w-4 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="Search SKU, item, brand or category..." /></div>
        <select value={location} onChange={(e) => setLocation(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm outline-none"><option value="all">All locations</option>{locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {filtered.length === 0 ? <div className="py-14 text-center"><Boxes className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-700">No inventory items here</p><p className="mt-1 text-xs text-slate-500">Try another location or add an item.</p></div> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[950px] text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">SKU</th><th className="px-5 py-3">Item</th><th className="px-5 py-3">Location</th><th className="px-5 py-3">On hand</th><th className="px-5 py-3">Reserved</th><th className="px-5 py-3">Available</th><th className="px-5 py-3">Tracking</th><th className="px-5 py-3">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{filtered.map((item) => {
            const rows = location === 'all' ? item.location_balances || [] : (item.location_balances || []).filter((row) => row.location_id === location);
            const onHand = rows.reduce((sum, row) => sum + row.on_hand, 0);
            const reserved = rows.reduce((sum, row) => sum + row.reserved, 0);
            const available = rows.reduce((sum, row) => sum + row.available, 0);
            return <tr key={item.id} className="hover:bg-slate-50/70"><td className="px-5 py-4 font-black"><Link href={`/modules/operations/inventory/${item.id}`} className="text-[#032489] hover:underline">{item.sku}</Link></td><td className="px-5 py-4"><div className="font-bold text-slate-800">{item.name}</div>{item.brand && <div className="mt-1 text-xs text-slate-400">{item.brand}</div>}{item.description && <div className="mt-1 max-w-md truncate text-xs text-slate-400">{item.description}</div>}</td><td className="px-5 py-4 text-slate-600">{selectedLocation?.name || (rows.filter((row) => row.on_hand > 0 || row.reserved > 0).map((row) => row.location_name).join(', ') || 'No stock')}</td><td className="px-5 py-4 font-black text-slate-900">{onHand}</td><td className="px-5 py-4 font-bold text-amber-700">{reserved}</td><td className="px-5 py-4 font-black text-[#032489]">{available}</td><td className="px-5 py-4 text-slate-600">{item.serial_tracking ? 'Serial / IMEI' : 'Quantity'}</td><td className="px-5 py-4"><Link href={`/modules/operations/inventory/${item.id}`} className="text-xs font-black text-[#032489] hover:underline">Open details</Link></td></tr>;
          })}</tbody></table></div>
        )}
      </div>
      <style jsx>{`.input{width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;font-size:14px;outline:none;background:#fff}.input:focus{border-color:#032489;box-shadow:0 0 0 3px rgba(3,36,137,.08)}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span>{children}</label>; }
function MiniStat({ label, value, help }: { label: string; value: number; help: string }) { return <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"><div className="flex items-center gap-1.5"><span className="text-xs font-bold text-slate-500">{label}</span><HelpTip text={help} label={`About ${label}`} /></div><div className="mt-1 text-2xl font-black text-slate-950">{value}</div></div>; }
