'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { ArrowLeft, Smartphone } from 'lucide-react';
import { createInventoryUnitAction, type SalesActionState } from '@/app/(staff)/modules/operations/sales-actions';
import { addInventoryStockAction, updateInventoryCommercialPricingAction, type InventoryActionState } from '@/app/(staff)/modules/operations/inventory-actions';
import { HelpTip } from '@/components/ui/help-tip';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, ActionResult } from '@/components/ui/alert';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import type { OperationsInventoryItem, OperationsInventoryUnit, OperationsLocation, OperationsSupplier } from '@/lib/operations/types';

const initialSales: SalesActionState = { success: false, message: '' };
const initialInventory: InventoryActionState = { success: false, message: '' };
const money = (value: number | null | undefined) => value == null ? '—' : `₦${Number(value).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

export function InventoryDetail({ item, units, locations, suppliers, minimumGrossMarginPercent, websiteProduct }: {
  item: OperationsInventoryItem;
  units: OperationsInventoryUnit[];
  locations: OperationsLocation[];
  suppliers: OperationsSupplier[];
  minimumGrossMarginPercent: number;
  websiteProduct: { id: string; name: string; price: number | null; sale_price: number | null; status: string | null } | null;
}) {
  const [unitState, unitAction, unitPending] = useActionState(createInventoryUnitAction, initialSales);
  const [stockState, stockAction, stockPending] = useActionState(addInventoryStockAction, initialInventory);
  const [pricingState, pricingAction, pricingPending] = useActionState(updateInventoryCommercialPricingAction, initialInventory);
  const [standardPrice, setStandardPrice] = useState(Number(item.default_selling_price || 0));
  const [discountPercent, setDiscountPercent] = useState(Number(item.salesperson_discount_limit_percent || 0));
  const [minimumMarginPercent, setMinimumMarginPercent] = useState(Number(minimumGrossMarginPercent || 0));
  const cost = Number(item.default_unit_cost || 0);
  const discountAmount = standardPrice > 0 ? standardPrice * (discountPercent / 100) : 0;
  const discountFloor = standardPrice > 0 ? standardPrice - discountAmount : 0;
  const marginFloor = cost > 0 && minimumMarginPercent < 100 ? cost / (1 - minimumMarginPercent / 100) : 0;
  const marginAmount = marginFloor > cost ? marginFloor - cost : 0;
  const lowestPrice = Math.max(discountFloor, marginFloor);
  const websitePrice = websiteProduct ? Number(websiteProduct.sale_price ?? websiteProduct.price ?? 0) : 0;
  const websiteMismatch = websitePrice > 0 && standardPrice > 0 && Math.abs(websitePrice - standardPrice) >= 0.01;
  const specEntries = Object.entries(item.specs || {}).filter(([, value]) => value !== '' && value !== null && value !== false);

  return <div className="mx-auto max-w-[1400px]">
    <Link href="/modules/operations/inventory" className="mb-4 inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-emmy-primary"><ArrowLeft className="h-4 w-4" /> Back to inventory</Link>
    <div className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div><div className="flex items-center gap-2"><h1 className="text-2xl font-black text-emmy-primary">{item.name}</h1><HelpTip text="SKU identifies the item type. Serial/IMEI is only for items you choose to track one physical unit at a time." label="About inventory identity" /></div><p className="mt-1 text-sm font-bold text-slate-500">{item.sku}{item.brand ? ` · ${item.brand}` : ''}{item.model ? ` · ${item.model}` : ''}</p><p className="mt-2 text-sm capitalize text-slate-500">{item.item_type || 'other'} · {item.serial_tracking ? 'Serial / IMEI tracking' : 'Quantity tracking'}</p></div>
        <div className="grid gap-2 sm:grid-cols-3"><Info label="Condition" value={item.default_condition || '—'} /><Info label="Default cost" value={money(item.default_unit_cost)} /><Info label="Selling price" value={money(item.default_selling_price)} /></div>
      </div>
      {specEntries.length > 0 && <div className="mt-5 border-t border-slate-100 pt-4"><p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-400">Technical details</p><div className="flex flex-wrap gap-2">{specEntries.map(([key,value]) => <span key={key} className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600"><strong className="capitalize text-slate-800">{key.replaceAll('_',' ')}:</strong> {String(value)}</span>)}</div></div>}
    </div>

    <form action={pricingAction} className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <input type="hidden" name="inventory_item_id" value={item.id} />
      <div className="flex flex-col justify-between gap-2 md:flex-row md:items-start"><div><h2 className="text-sm font-black text-slate-900">Commercial pricing</h2><p className="mt-1 text-xs text-slate-500">Set the normal selling price and the two controls that determine the lowest price Sales may use.</p></div><HelpTip text="The lowest allowed price is whichever is higher: the salesperson discount floor or the minimum gross-margin floor." label="About commercial pricing" /></div>
      {websiteMismatch ? <Alert variant="warning" className="mt-4"><strong>Website price differs.</strong> Website: {money(websitePrice)} · Inventory standard: {money(standardPrice)} · Difference: {money(Math.abs(websitePrice-standardPrice))}. Prices are not changed automatically.</Alert> : websiteProduct && websitePrice > 0 ? <Alert variant="success" className="mt-4">Website price {money(websitePrice)} matches the inventory standard price.</Alert> : null}
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <Field label="Standard selling price"><Input name="standard_selling_price" type="number" min="0.01" step="0.01" required value={standardPrice || ''} onChange={(e) => setStandardPrice(Number(e.target.value || 0))} /></Field>
        <Field label="Salesperson max discount (%)"><Input name="salesperson_discount_limit_percent" type="number" min="0" max="100" step="0.01" required value={discountPercent} onChange={(e) => setDiscountPercent(Number(e.target.value || 0))} /><p className="mt-1 text-[11px] font-bold text-slate-500">{discountPercent}% = {money(discountAmount)} off · floor {money(discountFloor)}</p></Field>
        <Field label="Minimum gross margin (%)"><Input name="minimum_gross_margin_percent" type="number" min="0" max="99.99" step="0.01" required value={minimumMarginPercent} onChange={(e) => setMinimumMarginPercent(Number(e.target.value || 0))} /><p className="mt-1 text-[11px] font-bold text-slate-500">{minimumMarginPercent}% gross margin requires {money(marginFloor)} selling price · {money(marginAmount)} gross profit</p></Field>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3"><Info label="Discount floor" value={standardPrice > 0 ? money(discountFloor) : '—'} /><Info label="Margin floor" value={cost > 0 ? money(marginFloor) : 'Set cost price'} /><Info label="Lowest allowed price" value={standardPrice > 0 ? money(lowestPrice) : '—'} /></div>
      <ActionResult state={pricingState} className="mt-3" />
      <Button type="submit" disabled={pricingPending} className="mt-4">{pricingPending ? 'Saving...' : 'Save commercial pricing'}</Button>
    </form>

    {item.serial_tracking ? <>
      <form action={unitAction} className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2"><h2 className="text-sm font-black text-slate-900">Add individual device</h2><HelpTip text="Use this when each device must be individually traceable. Enter a Serial number or IMEI." label="About serialized units" /></div>
        <input type="hidden" name="inventory_item_id" value={item.id} />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Serial number"><Input name="serial_number" /></Field><Field label="IMEI 1"><Input name="imei_1" /></Field><Field label="IMEI 2"><Input name="imei_2" /></Field><Field label="Condition"><Input name="condition" defaultValue={item.default_condition || ''} /></Field>
          <Field label="Acquisition date"><Input name="acquisition_date" type="date" /></Field><Field label="Unit cost"><Input name="unit_cost" type="number" min="0" defaultValue={item.default_unit_cost ?? ''} /></Field>
          <Field label="Supplier"><Select name="supplier_id" defaultValue={item.preferred_supplier_id || ''}><option value="">No supplier selected</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          <Field label="Location"><Select name="location_id" defaultValue=""><option value="">Choose location</option>{locations.filter((l) => l.code !== 'TRANSIT').map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select></Field>
          <div className="md:col-span-2 xl:col-span-4"><Field label="Note"><Input name="note" /></Field></div>
        </div>
        <ActionResult state={unitState} className="mt-3" />
        <Button type="submit" disabled={unitPending} className="mt-4">{unitPending ? 'Adding...' : 'Add device'}</Button>
      </form>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-black text-slate-900">Individual devices</h2><p className="mt-1 text-xs text-slate-500">{units.length} device{units.length === 1 ? '' : 's'} recorded</p></div>
        {units.length === 0 ? <div className="py-14 text-center"><Smartphone className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-700">No serial or IMEI recorded yet</p></div> : (
          <Table>
            <TableHeader>
              <TableRow><TableHead>Serial / IMEI</TableHead><TableHead>Condition</TableHead><TableHead>Location</TableHead><TableHead>Status</TableHead><TableHead>Supplier</TableHead><TableHead>Cost</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {units.map((u) => (
                <TableRow key={u.id}>
                  <TableCell><div className="font-black text-emmy-primary">{u.serial_number || u.imei_1 || u.imei_2}</div></TableCell>
                  <TableCell className="text-slate-600">{u.condition || '—'}</TableCell>
                  <TableCell className="text-slate-600">{u.location?.name || '—'}</TableCell>
                  <TableCell><Badge className="capitalize">{u.status.replaceAll('_',' ')}</Badge></TableCell>
                  <TableCell className="text-slate-600">{u.supplier?.name || '—'}</TableCell>
                  <TableCell className="font-bold text-slate-800">{money(u.unit_cost)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </> : <form action={stockAction} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2"><h2 className="text-sm font-black text-slate-900">Add stock</h2><HelpTip text="Use this whenever more identical units arrive. Quantity stock increases at the selected location." label="About adding stock" /></div>
      <input type="hidden" name="inventory_item_id" value={item.id} />
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Location"><Select name="location_id" required defaultValue=""><option value="">Choose location</option>{locations.filter((l) => l.code !== 'TRANSIT').map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select></Field>
        <Field label="Quantity"><Input name="quantity" type="number" min="1" required /></Field>
        <Field label="Unit cost"><Input name="unit_cost" type="number" min="0" defaultValue={item.default_unit_cost ?? ''} /></Field>
        <Field label="Supplier"><Select name="supplier_id" defaultValue={item.preferred_supplier_id || ''}><option value="">No supplier selected</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <div className="md:col-span-2 xl:col-span-4"><Field label="Reason / note"><Input name="note" placeholder="New stock received" /></Field></div>
      </div>
      <ActionResult state={stockState} className="mt-3" />
      <Button type="submit" disabled={stockPending} className="mt-4">{stockPending ? 'Adding stock...' : 'Add stock'}</Button>
    </form>}
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span>{children}</label>; }
function Info({ label, value }: { label: string; value: string }) { return <div className="min-w-[130px] rounded-lg bg-slate-50 px-3 py-2"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div><div className="mt-1 text-sm font-black text-slate-800">{value}</div></div>; }
