'use client';

import { useActionState, useMemo, useState } from 'react';
import { createDirectSaleAction } from '@/app/modules/sales/actions';

const initialState = { success: false, message: '' };
const money = (value: number) => `₦${Number(value || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

type InventoryItem = {
  id: string; sku: string; name: string; category: string | null; item_type: string; serial_tracking: boolean;
  default_unit_cost: number | null; default_selling_price: number | null;
};
type Availability = { inventory_item_id: string; location_id: string; location_name: string; available: number };
type Unit = { id: string; inventory_item_id: string; serial_number: string | null; imei_1: string | null; imei_2: string | null; unit_cost: number | null; current_location_id: string | null; status: string };
type Location = { id: string; code: string; name: string };
type CartLine = {
  key: string; inventoryItemId?: string; inventoryUnitId?: string; sourceLocationId?: string;
  itemName?: string; itemType?: string; category?: string; quantity: number; listPrice?: number;
  finalUnitPrice?: number; costBasis?: number; costBasisSource?: string; adminExceptionReason?: string;
};

export function DirectSaleWorkspace({ inventory, availability, units, locations }: { inventory: InventoryItem[]; availability: Availability[]; units: Unit[]; locations: Location[] }) {
  const [state, action, pending] = useActionState(createDirectSaleAction, initialState);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [mode, setMode] = useState<'stock' | 'service'>('stock');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState('');
  const [exceptionReason, setExceptionReason] = useState('');
  const [serviceName, setServiceName] = useState('');
  const [serviceCost, setServiceCost] = useState('');
  const [serviceList, setServiceList] = useState('');
  const [servicePrice, setServicePrice] = useState('');

  const selectedItem = inventory.find((item) => item.id === selectedItemId);
  const itemUnits = useMemo(() => units.filter((unit) => unit.inventory_item_id === selectedItemId), [units, selectedItemId]);
  const itemAvailability = useMemo(() => availability.filter((row) => row.inventory_item_id === selectedItemId && Number(row.available) > 0), [availability, selectedItemId]);
  const total = lines.reduce((sum, line) => sum + Number(line.finalUnitPrice || 0) * line.quantity, 0);

  function addStockLine() {
    if (!selectedItem) return;
    const defaultPrice = Number(selectedItem.default_selling_price || 0);
    const finalPrice = price ? Number(price) : defaultPrice;
    if (!finalPrice || finalPrice <= 0) return;
    if (selectedItem.serial_tracking && !selectedUnitId) return;
    if (!selectedItem.serial_tracking && !selectedLocationId) return;
    const unit = itemUnits.find((row) => row.id === selectedUnitId);
    setLines((current) => [...current, {
      key: crypto.randomUUID(), inventoryItemId: selectedItem.id,
      inventoryUnitId: selectedItem.serial_tracking ? selectedUnitId : undefined,
      sourceLocationId: selectedItem.serial_tracking ? unit?.current_location_id || undefined : selectedLocationId,
      itemName: selectedItem.name, itemType: selectedItem.item_type, category: selectedItem.category || undefined,
      quantity: selectedItem.serial_tracking ? 1 : Math.max(1, qty), listPrice: defaultPrice,
      finalUnitPrice: finalPrice, adminExceptionReason: exceptionReason || undefined,
    }]);
    setSelectedUnitId(''); setQty(1); setPrice(''); setExceptionReason('');
  }

  function addServiceLine() {
    const list = Number(serviceList || 0); const finalPrice = Number(servicePrice || serviceList || 0); const cost = Number(serviceCost || 0);
    if (!serviceName.trim() || list <= 0 || finalPrice <= 0 || cost < 0) return;
    setLines((current) => [...current, {
      key: crypto.randomUUID(), itemName: serviceName.trim(), itemType: 'other', category: 'Service', quantity: Math.max(1, qty),
      listPrice: list, finalUnitPrice: finalPrice, costBasis: cost, costBasisSource: 'supplier_on_demand', adminExceptionReason: exceptionReason || undefined,
    }]);
    setServiceName(''); setServiceCost(''); setServiceList(''); setServicePrice(''); setQty(1); setExceptionReason('');
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Immediate commercial sale</p><h1 className="mt-2 text-3xl font-black text-[#032489]">Direct Sale</h1><p className="mt-2 text-sm text-slate-500">Use real Operations stock for physical products. Drafts do not consume stock; physical handover happens only after confirmation and payment or approved credit.</p></div>

      <form action={action} className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-black text-slate-900">Customer</h2>
          <div className="mt-4 space-y-3">
            <input name="customer_name" placeholder="Customer name" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
            <input name="customer_phone" placeholder="Phone" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
            <input name="customer_email" type="email" placeholder="Email for receipt" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
            <input name="sales_staff_name" placeholder="Salesperson name" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-black text-slate-900">Sale cart</h2><div className="rounded-xl bg-blue-50 px-3 py-2 text-sm font-black text-[#032489]">Total {money(total)}</div></div>
          <div className="mt-4 flex gap-2"><button type="button" onClick={() => setMode('stock')} className={`rounded-lg px-3 py-2 text-xs font-bold ${mode === 'stock' ? 'bg-[#032489] text-white' : 'bg-slate-100 text-slate-600'}`}>Physical stock</button><button type="button" onClick={() => setMode('service')} className={`rounded-lg px-3 py-2 text-xs font-bold ${mode === 'service' ? 'bg-[#032489] text-white' : 'bg-slate-100 text-slate-600'}`}>Service / non-stock</button></div>

          {mode === 'stock' ? <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <select value={selectedItemId} onChange={(e) => { setSelectedItemId(e.target.value); setSelectedUnitId(''); setSelectedLocationId(''); setPrice(''); }} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="">Choose inventory item</option>{inventory.map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.name}</option>)}</select>
            {selectedItem?.serial_tracking ? <select value={selectedUnitId} onChange={(e) => setSelectedUnitId(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="">Choose Serial / IMEI</option>{itemUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.serial_number || unit.imei_1 || unit.imei_2 || unit.id}</option>)}</select> : <select value={selectedLocationId} onChange={(e) => setSelectedLocationId(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="">Stock location</option>{itemAvailability.map((row) => <option key={row.location_id} value={row.location_id}>{row.location_name} · {row.available} available</option>)}</select>}
            <input type="number" min="1" value={selectedItem?.serial_tracking ? 1 : qty} disabled={selectedItem?.serial_tracking} onChange={(e) => setQty(Number(e.target.value))} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder="Quantity" />
            <input value={price} onChange={(e) => setPrice(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder={selectedItem ? `Final price · default ${money(Number(selectedItem.default_selling_price || 0))}` : 'Final price'} />
            <input value={exceptionReason} onChange={(e) => setExceptionReason(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm md:col-span-2 xl:col-span-3" placeholder="Admin pricing exception reason (only if below margin floor)" />
            <button type="button" onClick={addStockLine} className="rounded-xl bg-[#032489] px-4 py-2.5 text-sm font-black text-white">Add item</button>
          </div> : <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <input value={serviceName} onChange={(e) => setServiceName(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder="Service / charge name" />
            <input value={serviceCost} onChange={(e) => setServiceCost(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder="Cost basis" />
            <input value={serviceList} onChange={(e) => setServiceList(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder="Normal price" />
            <input value={servicePrice} onChange={(e) => setServicePrice(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder="Final price" />
            <input type="number" min="1" value={qty} onChange={(e) => setQty(Number(e.target.value))} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
            <input value={exceptionReason} onChange={(e) => setExceptionReason(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm md:col-span-2" placeholder="Admin pricing exception reason (if needed)" />
            <button type="button" onClick={addServiceLine} className="rounded-xl bg-[#032489] px-4 py-2.5 text-sm font-black text-white">Add service</button>
          </div>}

          <div className="mt-5 space-y-2">{lines.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-400">No items added.</div> : lines.map((line) => <div key={line.key} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3"><div className="min-w-0 flex-1"><div className="truncate text-sm font-bold text-slate-800">{line.itemName}</div><div className="text-xs text-slate-400">{line.quantity} × {money(Number(line.finalUnitPrice || 0))}</div></div><div className="text-sm font-black">{money(Number(line.finalUnitPrice || 0) * line.quantity)}</div><button type="button" onClick={() => setLines((current) => current.filter((row) => row.key !== line.key))} className="text-xs font-bold text-rose-600">Remove</button></div>)}</div>

          <input type="hidden" name="items_json" value={JSON.stringify(lines.map(({ key: _key, ...line }) => line))} />
          {state.message ? <div className={`mt-4 rounded-xl px-3 py-2 text-sm font-semibold ${state.success ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{state.message}</div> : null}
          <button disabled={pending || !lines.length} className="mt-4 w-full rounded-xl bg-[#032489] px-4 py-3 text-sm font-black text-white disabled:opacity-50">{pending ? 'Creating…' : 'Create Direct Sale Draft'}</button>
        </section>
      </form>
    </div>
  );
}
