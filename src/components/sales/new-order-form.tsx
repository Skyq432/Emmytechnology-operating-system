'use client';

import { useActionState, useState } from 'react';
import { createSalesOrderAction } from '@/app/(staff)/modules/sales/actions';
import { IdentityPicker } from '@/components/shared/identity-picker';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { ActionResult } from '@/components/ui/alert';
import { SegmentedControl } from '@/components/ui/segmented-control';

const initial = { success: false, message: '' };
const money = (value: number) => `₦${Number(value || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

type InventoryItem = {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  item_type: string;
  default_selling_price: number | null;
};

type FulfilmentSource = 'internal' | 'supplier' | 'dropship' | 'manual';
type Line = {
  key: string;
  inventoryItemId?: string;
  itemName: string;
  itemType?: string;
  category?: string | null;
  fulfilmentSource: FulfilmentSource;
  quantity: number;
  listPrice: number;
  finalUnitPrice: number;
  costBasis?: number;
  costBasisSource?: 'supplier_on_demand';
  adminExceptionReason?: string;
  note?: string;
};

export function NewOrderForm({ inventory }: { inventory: InventoryItem[] }) {
  const [state, action, pending] = useActionState(createSalesOrderAction, initial);
  const [mode, setMode] = useState<'product' | 'custom'>('product');
  const [lines, setLines] = useState<Line[]>([]);
  const [itemId, setItemId] = useState('');
  const [source, setSource] = useState<FulfilmentSource>('internal');
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [lineNote, setLineNote] = useState('');
  const [exceptionReason, setExceptionReason] = useState('');
  const [customName, setCustomName] = useState('');
  const [customType, setCustomType] = useState('other');
  const [customCategory, setCustomCategory] = useState('');
  const [customList, setCustomList] = useState('');
  const selected = inventory.find((item) => item.id === itemId);
  const lineTotal = lines.reduce((sum, line) => sum + line.finalUnitPrice * line.quantity, 0);

  function addProduct() {
    if (!selected) return;
    const list = Number(selected.default_selling_price || 0);
    const finalPrice = Number(price || list);
    if (list <= 0 || finalPrice <= 0 || quantity <= 0) return;
    const externalCost = source === 'internal' ? undefined : Number(cost || 0);
    if (source !== 'internal' && (!Number.isFinite(externalCost) || Number(externalCost) < 0)) return;
    setLines((current) => [...current, {
      key: crypto.randomUUID(),
      inventoryItemId: selected.id,
      itemName: selected.name,
      itemType: selected.item_type,
      category: selected.category,
      fulfilmentSource: source,
      quantity: Math.max(1, quantity),
      listPrice: list,
      finalUnitPrice: finalPrice,
      costBasis: externalCost,
      costBasisSource: source === 'internal' ? undefined : 'supplier_on_demand',
      adminExceptionReason: exceptionReason.trim() || undefined,
      note: lineNote.trim() || undefined,
    }]);
    setItemId(''); setQuantity(1); setPrice(''); setCost(''); setLineNote(''); setExceptionReason(''); setSource('internal');
  }

  function addCustom() {
    const list = Number(customList || 0);
    const finalPrice = Number(price || customList || 0);
    const basis = Number(cost || 0);
    if (!customName.trim() || list <= 0 || finalPrice <= 0 || basis < 0 || quantity <= 0) return;
    setLines((current) => [...current, {
      key: crypto.randomUUID(),
      itemName: customName.trim(),
      itemType: customType.trim() || 'other',
      category: customCategory.trim() || null,
      fulfilmentSource: source === 'internal' ? 'manual' : source,
      quantity: Math.max(1, quantity),
      listPrice: list,
      finalUnitPrice: finalPrice,
      costBasis: basis,
      costBasisSource: 'supplier_on_demand',
      adminExceptionReason: exceptionReason.trim() || undefined,
      note: lineNote.trim() || undefined,
    }]);
    setCustomName(''); setCustomType('other'); setCustomCategory(''); setCustomList(''); setQuantity(1); setPrice(''); setCost(''); setLineNote(''); setExceptionReason(''); setSource('manual');
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">New commercial order</p>
          <h2 className="mt-1 text-xl font-black text-slate-900">Create Order</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">Creates a draft only. No stock is reserved until Operations fulfils the confirmed Order.</p>
        </div>
        <div className="rounded-xl bg-blue-50 px-3 py-2 text-sm font-black text-emmy-primary">Items {money(lineTotal)}</div>
      </div>

      <form action={action} className="mt-5 space-y-5">
        <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
          <IdentityPicker compact title="1. Find customer" />
          <div className="grid content-start gap-3">
            <Input name="sales_staff_name" placeholder="Salesperson" />
            <Input name="delivery_charge" type="number" min="0" placeholder="Delivery charge" />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 p-4">
          <SegmentedControl
            size="sm"
            value={mode}
            onChange={(value) => { setMode(value); setSource(value === 'product' ? 'internal' : 'manual'); }}
            options={[{ value: 'product', label: 'Catalog product' }, { value: 'custom', label: 'Service / on-demand' }]}
          />

          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {mode === 'product' ? <Select value={itemId} onChange={(event) => { setItemId(event.target.value); setPrice(''); }}><option value="">Choose product</option>{inventory.map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.name}</option>)}</Select> : <>
              <Input value={customName} onChange={(event) => setCustomName(event.target.value)} placeholder="Item / service name" />
              <Input value={customCategory} onChange={(event) => setCustomCategory(event.target.value)} placeholder="Category" />
            </>}
            <Select value={source} onChange={(event) => setSource(event.target.value as FulfilmentSource)}>
              {mode === 'product' ? <option value="internal">Internal stock</option> : null}
              <option value="supplier">Supplier sourced</option>
              <option value="dropship">Dropship</option>
              <option value="manual">Service / manual</option>
            </Select>
            <Input type="number" min="1" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} placeholder="Qty" />
            {mode === 'custom' ? <Input value={customList} onChange={(event) => setCustomList(event.target.value)} placeholder="Normal price" /> : null}
            <Input value={price} onChange={(event) => setPrice(event.target.value)} placeholder={selected ? `Final price · ${money(Number(selected.default_selling_price || 0))}` : 'Final price'} />
            {(mode === 'custom' || source !== 'internal') ? <Input value={cost} onChange={(event) => setCost(event.target.value)} placeholder="Supplier / service cost basis" /> : null}
            {mode === 'custom' ? <Input value={customType} onChange={(event) => setCustomType(event.target.value)} placeholder="Item type" /> : null}
            <Input value={lineNote} onChange={(event) => setLineNote(event.target.value)} placeholder="Line note" />
            <Input value={exceptionReason} onChange={(event) => setExceptionReason(event.target.value)} placeholder="Admin pricing exception reason, if needed" className="xl:col-span-2" />
            <Button type="button" onClick={mode === 'product' ? addProduct : addCustom}>Add order line</Button>
          </div>
        </div>

        <div className="space-y-2">
          {lines.map((line) => <div key={line.key} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3"><div className="min-w-0 flex-1"><div className="font-bold text-slate-900">{line.itemName}</div><div className="text-xs text-slate-400">{line.fulfilmentSource} · {line.quantity} × {money(line.finalUnitPrice)}</div></div><div className="font-black">{money(line.finalUnitPrice * line.quantity)}</div><button type="button" onClick={() => setLines((current) => current.filter((row) => row.key !== line.key))} className="text-xs font-bold text-rose-600">Remove</button></div>)}
          {!lines.length ? <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-400">No Order lines added yet.</div> : null}
        </div>

        <Textarea name="note" placeholder="Internal Sales note" className="min-h-20" />
        <input type="hidden" name="items_json" value={JSON.stringify(lines.map(({ key: _key, ...line }) => line))} />
        <ActionResult state={state} />
        <Button type="submit" size="lg" disabled={pending || !lines.length}>{pending ? 'Creating…' : 'Create Order Draft'}</Button>
      </form>
    </section>
  );
}
