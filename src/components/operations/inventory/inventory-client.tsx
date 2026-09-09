'use client';

import Link from 'next/link';
import { useActionState, useMemo, useState } from 'react';
import { Boxes, Plus, Search } from 'lucide-react';
import { HelpTip } from '@/components/ui/help-tip';
import { OPERATIONS_HELP } from '@/lib/operations/help';
import { createInventoryItemEnhancedAction, type InventoryActionState } from '@/app/modules/operations/inventory-actions';
import type { OperationsInventoryItem, OperationsLocation, OperationsSupplier } from '@/lib/operations/types';
import type { OrderItemType } from '@/lib/operations/sales-model';

const initialState: InventoryActionState = { success: false, message: '' };

export function InventoryClient({ items, locations, suppliers }: { items: OperationsInventoryItem[]; locations: OperationsLocation[]; suppliers: OperationsSupplier[] }) {
  const [state, formAction, pending] = useActionState(createInventoryItemEnhancedAction, initialState);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [location, setLocation] = useState('all');
  const [itemType, setItemType] = useState<OrderItemType>('other');
  const [serialTracking, setSerialTracking] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchesSearch = !q || [item.sku, item.name, item.brand, item.model, item.category, item.description].filter(Boolean).join(' ').toLowerCase().includes(q);
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
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Quantity items can be received in bulk. Serialized items keep one Serial/IMEI record per device.</p>
        </div>
        <button onClick={() => setShowCreate((value) => !value)} className="inline-flex items-center gap-2 self-start rounded-lg bg-[#032489] px-4 py-2.5 text-sm font-bold text-white"><Plus className="h-4 w-4" /> {showCreate ? 'Close form' : 'Add item'}</button>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <MiniStat label="On hand" value={totals.onHand} help="The physical quantity currently recorded at the selected location." />
        <MiniStat label="Reserved" value={totals.reserved} help="Items kept aside for confirmed orders." />
        <MiniStat label="Available" value={totals.available} help="What staff can still sell now after reserved quantities are removed." />
        <MiniStat label="Low stock items" value={lowStock} help={OPERATIONS_HELP.lowStock} />
      </div>

      {showCreate && (
        <form action={formAction} className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2"><h2 className="text-lg font-black text-slate-900">Add inventory item</h2><HelpTip text="Create the item once. Quantity stock can be added immediately; serialized devices are added individually after creation." label="About inventory creation" /></div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Item type"><select name="item_type" className="input" value={itemType} onChange={(e) => setItemType(e.target.value as OrderItemType)}><option value="laptop">Laptop</option><option value="phone">Phone</option><option value="accessory">Accessory</option><option value="solar">Solar</option><option value="other">Other</option></select></Field>
            <Field label="Item name"><input name="name" required className="input" placeholder="HP EliteBook 840 G8" /></Field>
            <Field label="Brand"><input name="brand" className="input" placeholder="HP / Samsung / Logitech" /></Field>
            <Field label="Model / variant"><input name="model" className="input" placeholder="840 G8 / Galaxy A15" /></Field>
            <Field label="Category"><input name="category" className="input" placeholder="Laptop / Phone / Charger" /></Field>
            <Field label="Condition"><input name="condition" className="input" placeholder="Brand New / Grade A" /></Field>
            <Field label="Default cost"><input name="default_unit_cost" type="number" min="0" className="input" placeholder="0" /></Field>
            <Field label="Selling price"><input name="default_selling_price" type="number" min="0" className="input" placeholder="0" /></Field>
            <Field label="Preferred supplier"><select name="preferred_supplier_id" className="input" defaultValue=""><option value="">None</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></Field>
            <Field label="Unit"><input name="unit" className="input" defaultValue="item" /></Field>
            <Field label="Reorder level"><input name="reorder_level" type="number" min="0" defaultValue="0" className="input" /></Field>
            <Field label="Description"><input name="description" className="input" placeholder="Simple internal note" /></Field>
          </div>

          <TechnicalFields itemType={itemType} />

          <div className="mt-5 grid gap-4 rounded-xl bg-slate-50 p-4 md:grid-cols-3">
            <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700"><input name="serial_tracking" type="checkbox" checked={serialTracking} onChange={(e) => setSerialTracking(e.target.checked)} className="h-4 w-4" /> Track Serial / IMEI</label>
            {!serialTracking && <Field label="Opening location"><select name="opening_location_id" className="input" defaultValue=""><option value="">Choose location</option>{locations.filter((item) => item.code !== 'TRANSIT').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>}
            {!serialTracking && <Field label="Opening quantity"><input name="opening_quantity" type="number" min="0" defaultValue="0" className="input" /></Field>}
            {serialTracking && <div className="md:col-span-2 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-slate-600">Create the item first, then open it and add each physical device with its Serial/IMEI, location and supplier.</div>}
          </div>

          {state.message && <p className={`mt-4 text-sm font-bold ${state.success ? 'text-blue-700' : 'text-rose-700'}`}>{state.message}</p>}
          <button disabled={pending} className="mt-5 rounded-lg bg-[#032489] px-5 py-2.5 text-sm font-black text-white disabled:opacity-50">{pending ? 'Creating...' : 'Create item'}</button>
        </form>
      )}

      <div className="mb-3 flex flex-col gap-3 sm:flex-row">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm"><Search className="h-4 w-4 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="Search SKU, item, brand, model or category..." /></div>
        <select value={location} onChange={(e) => setLocation(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm outline-none"><option value="all">All locations</option>{locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {filtered.length === 0 ? <div className="py-14 text-center"><Boxes className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-700">No inventory items here</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">SKU</th><th className="px-5 py-3">Item</th><th className="px-5 py-3">Type</th><th className="px-5 py-3">Location</th><th className="px-5 py-3">On hand</th><th className="px-5 py-3">Reserved</th><th className="px-5 py-3">Available</th><th className="px-5 py-3">Tracking</th><th className="px-5 py-3">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{filtered.map((item) => {
          const rows = location === 'all' ? item.location_balances || [] : (item.location_balances || []).filter((row) => row.location_id === location);
          const onHand = rows.reduce((sum, row) => sum + row.on_hand, 0); const reserved = rows.reduce((sum, row) => sum + row.reserved, 0); const available = rows.reduce((sum, row) => sum + row.available, 0);
          return <tr key={item.id} className="hover:bg-slate-50/70"><td className="px-5 py-4 font-black"><Link href={`/modules/operations/inventory/${item.id}`} className="text-[#032489] hover:underline">{item.sku}</Link></td><td className="px-5 py-4"><div className="font-bold text-slate-800">{item.name}</div><div className="mt-1 text-xs text-slate-400">{[item.brand,item.model].filter(Boolean).join(' · ') || '—'}</div></td><td className="px-5 py-4 capitalize text-slate-600">{item.item_type || 'other'}</td><td className="px-5 py-4 text-slate-600">{selectedLocation?.name || (rows.filter((row) => row.on_hand > 0 || row.reserved > 0).map((row) => row.location_name).join(', ') || 'No stock')}</td><td className="px-5 py-4 font-black">{onHand}</td><td className="px-5 py-4 font-bold text-amber-700">{reserved}</td><td className="px-5 py-4 font-black text-[#032489]">{available}</td><td className="px-5 py-4">{item.serial_tracking ? 'Serial / IMEI' : 'Quantity'}</td><td className="px-5 py-4"><Link href={`/modules/operations/inventory/${item.id}`} className="text-xs font-black text-[#032489] hover:underline">Open details</Link></td></tr>;
        })}</tbody></table></div>}
      </div>
      <style jsx>{`.input{width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;font-size:14px;outline:none;background:#fff}.input:focus{border-color:#032489;box-shadow:0 0 0 3px rgba(3,36,137,.08)}`}</style>
    </div>
  );
}

function TechnicalFields({ itemType }: { itemType: OrderItemType }) {
  if (itemType === 'phone') return <div className="mt-5 grid gap-4 rounded-xl border border-slate-200 p-4 md:grid-cols-3"><Field label="RAM"><input name="ram" className="input" placeholder="8GB" /></Field><Field label="Storage"><input name="storage_capacity" className="input" placeholder="256GB" /></Field><Field label="Colour"><input name="colour" className="input" placeholder="Black" /></Field><Field label="Network"><input name="network_type" className="input" placeholder="4G / 5G" /></Field><Field label="SIM type"><input name="sim_type" className="input" placeholder="Dual SIM / eSIM" /></Field><Field label="Accessories included"><input name="accessories_included" className="input" placeholder="Charger, cable" /></Field></div>;
  if (itemType === 'laptop') return <div className="mt-5 grid gap-4 rounded-xl border border-slate-200 p-4 md:grid-cols-4"><Field label="Generation"><input name="generation" className="input" placeholder="11th Gen" /></Field><Field label="Processor"><input name="processor_type" className="input" placeholder="Core i5" /></Field><Field label="RAM"><input name="ram" className="input" placeholder="8GB" /></Field><Field label="Storage"><input name="storage_size" className="input" placeholder="256GB" /></Field><Field label="Storage type"><input name="storage_type" className="input" placeholder="SSD" /></Field><Field label="Screen size"><input name="screen_size" className="input" placeholder="14 inch" /></Field><Field label="Colour"><input name="colour" className="input" /></Field><Field label="OS"><input name="os_installed" className="input" placeholder="Windows 11" /></Field><CheckField name="touchscreen" label="Touchscreen" /><CheckField name="charger_included" label="Charger included" /><CheckField name="bag_included" label="Bag included" /></div>;
  if (itemType === 'accessory') return <div className="mt-5 grid gap-4 rounded-xl border border-slate-200 p-4 md:grid-cols-3"><Field label="Subcategory"><input name="subcategory" className="input" placeholder="Charger / Mouse / Bag" /></Field><Field label="Compatible with"><input name="compatible_with" className="input" placeholder="Dell / HP / Universal" /></Field><Field label="Colour"><input name="colour" className="input" /></Field></div>;
  if (itemType === 'solar') return <div className="mt-5 grid gap-4 rounded-xl border border-slate-200 p-4 md:grid-cols-2"><Field label="System capacity"><input name="system_capacity" className="input" placeholder="5kVA / 10kWh" /></Field></div>;
  return null;
}

function CheckField({ name, label }: { name: string; label: string }) { return <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"><input type="checkbox" name={name} /> {label}</label>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span>{children}</label>; }
function MiniStat({ label, value, help }: { label: string; value: number; help: string }) { return <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"><div className="flex items-center gap-1.5"><span className="text-xs font-bold text-slate-500">{label}</span><HelpTip text={help} label={`About ${label}`} /></div><div className="mt-1 text-2xl font-black text-slate-950">{value}</div></div>; }
