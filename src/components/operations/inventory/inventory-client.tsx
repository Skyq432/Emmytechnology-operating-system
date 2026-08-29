'use client';

import { useActionState, useMemo, useState } from 'react';
import { Boxes, Plus, Search } from 'lucide-react';
import { HelpTip } from '@/components/ui/help-tip';
import { OPERATIONS_HELP } from '@/lib/operations/help';
import {
  createInventoryItemAction,
  type OperationsActionState,
} from '@/app/modules/operations/actions';
import type { OperationsInventoryItem } from '@/lib/operations/types';

const initialState: OperationsActionState = { success: false, message: '' };

export function InventoryClient({ items }: { items: OperationsInventoryItem[] }) {
  const [state, formAction, pending] = useActionState(createInventoryItemAction, initialState);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (!q) return true;
      return [item.sku, item.name, item.category, item.description]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [items, search]);

  const lowStock = items.filter((item) => Number(item.on_hand || 0) <= item.reorder_level).length;
  const totalOnHand = items.reduce((sum, item) => sum + Number(item.on_hand || 0), 0);

  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="mb-5 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#032489]">Internal stock</p>
            <HelpTip text="Inventory is for items EmmyTech keeps or uses inside the business. It is separate from the website Product list." label="About Inventory" />
          </div>
          <h1 className="mt-1.5 text-3xl font-black tracking-[-0.035em]">Inventory</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Keep track of internal items, quantities and low-stock levels.</p>
        </div>
        <button
          onClick={() => setShowCreate((value) => !value)}
          className="inline-flex items-center gap-2 self-start rounded-lg bg-[#032489] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#021d70]"
        >
          <Plus className="h-4 w-4" /> {showCreate ? 'Close form' : 'Add item'}
        </button>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <MiniStat label="Items" value={items.length} help="How many different internal items Operations is tracking." />
        <MiniStat label="On hand" value={totalOnHand} help="The total quantity currently recorded across all internal items." />
        <MiniStat label="Low stock" value={lowStock} help={OPERATIONS_HELP.lowStock} />
      </div>

      {showCreate && (
        <form action={formAction} className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <h2 className="text-sm font-black text-slate-900">Add inventory item</h2>
            <HelpTip text={OPERATIONS_HELP.createInventory} label="About adding an inventory item" />
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Internal SKU"><input name="sku" required className="input" placeholder="ET-LAP-840G8-A" /></Field>
            <Field label="Item name"><input name="name" required className="input" placeholder="HP EliteBook 840 G8 Grade A" /></Field>
            <Field label="Category"><input name="category" className="input" placeholder="Laptop / Spare / Packaging" /></Field>
            <Field label="Unit"><input name="unit" className="input" defaultValue="item" /></Field>
            <Field label="Reorder level"><input name="reorder_level" type="number" min="0" defaultValue="0" className="input" /></Field>
            <label className="flex items-center gap-3 self-end rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-600">
              <input name="serial_tracking" type="checkbox" className="h-4 w-4" /> Track individual serials
            </label>
            <Field label="Description"><input name="description" className="input" placeholder="Simple internal note" /></Field>
          </div>

          {state.message && <p className={`mt-4 text-sm font-bold ${state.success ? 'text-blue-700' : 'text-rose-700'}`}>{state.message}</p>}
          <button disabled={pending} className="mt-5 rounded-lg bg-[#032489] px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">
            {pending ? 'Creating...' : 'Create item'}
          </button>
        </form>
      )}

      <div className="mb-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
        <Search className="h-4 w-4 text-slate-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="Search SKU, item or category..." />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {filtered.length === 0 ? (
          <div className="py-14 text-center">
            <Boxes className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 text-sm font-bold text-slate-700">No inventory items yet</p>
            <p className="mt-1 text-xs text-slate-500">Add an item when Operations needs to track it.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr><th className="px-5 py-3">SKU</th><th className="px-5 py-3">Item</th><th className="px-5 py-3">Category</th><th className="px-5 py-3">On hand</th><th className="px-5 py-3">Reorder</th><th className="px-5 py-3">Tracking</th><th className="px-5 py-3">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((item) => {
                  const low = Number(item.on_hand || 0) <= item.reorder_level;
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-4 font-black text-[#032489]">{item.sku}</td>
                      <td className="px-5 py-4"><div className="font-bold text-slate-800">{item.name}</div>{item.description && <div className="mt-1 max-w-md truncate text-xs text-slate-400">{item.description}</div>}</td>
                      <td className="px-5 py-4 text-slate-600">{item.category || '—'}</td>
                      <td className="px-5 py-4"><span className={`text-base font-black ${low ? 'text-rose-600' : 'text-slate-900'}`}>{item.on_hand || 0}</span> <span className="text-xs text-slate-400">{item.unit}</span></td>
                      <td className="px-5 py-4 font-semibold text-slate-600">{item.reorder_level}</td>
                      <td className="px-5 py-4 text-slate-600">{item.serial_tracking ? 'Serialized' : 'Quantity'}</td>
                      <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-black ${item.is_active ? 'bg-blue-50 text-[#032489]' : 'bg-slate-100 text-slate-500'}`}>{item.is_active ? 'Active' : 'Inactive'}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <style jsx>{`.input{width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;font-size:14px;outline:none;background:#fff}.input:focus{border-color:#032489;box-shadow:0 0 0 3px rgba(3,36,137,.08)}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span>{children}</label>;
}

function MiniStat({ label, value, help }: { label: string; value: number; help: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-center gap-1.5"><span className="text-xs font-bold text-slate-500">{label}</span><HelpTip text={help} label={`About ${label}`} /></div>
      <div className="mt-1 text-2xl font-black text-slate-950">{value}</div>
    </div>
  );
}
