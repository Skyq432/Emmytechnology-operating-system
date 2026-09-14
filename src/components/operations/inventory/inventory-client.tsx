'use client';

import Link from 'next/link';
import { useActionState, useMemo, useState } from 'react';
import { Boxes, Plus, Search } from 'lucide-react';
import { HelpTip } from '@/components/ui/help-tip';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ActionResult } from '@/components/ui/alert';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { OPERATIONS_HELP } from '@/lib/operations/help';
import { createInventoryItemEnhancedAction, type InventoryActionState } from '@/app/(staff)/modules/operations/inventory-actions';
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
          <div className="flex items-center gap-2"><p className="text-xs font-black uppercase tracking-[0.16em] text-emmy-primary">Internal stock</p><HelpTip text="Inventory shows what EmmyTech physically has. Products on the website are separate unless they are linked." label="About Inventory" /></div>
          <h1 className="mt-1.5 text-3xl font-black tracking-[-0.035em]">Inventory</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Quantity items can be received in bulk. Serialized items keep one Serial/IMEI record per device.</p>
        </div>
        <Button onClick={() => setShowCreate((value) => !value)} className="self-start"><Plus className="h-4 w-4" /> {showCreate ? 'Close form' : 'Add item'}</Button>
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
            <Field label="Item type"><Select name="item_type" value={itemType} onChange={(e) => setItemType(e.target.value as OrderItemType)}><option value="laptop">Laptop</option><option value="phone">Phone</option><option value="accessory">Accessory</option><option value="solar">Solar</option><option value="other">Other</option></Select></Field>
            <Field label="Item name"><Input name="name" required placeholder="HP EliteBook 840 G8" /></Field>
            <Field label="Brand"><Input name="brand" placeholder="HP / Samsung / Logitech" /></Field>
            <Field label="Model / variant"><Input name="model" placeholder="840 G8 / Galaxy A15" /></Field>
            <Field label="Category"><Input name="category" placeholder="Laptop / Phone / Charger" /></Field>
            <Field label="Condition"><Input name="condition" placeholder="Brand New / Grade A" /></Field>
            <Field label="Default cost"><Input name="default_unit_cost" type="number" min="0" placeholder="0" /></Field>
            <Field label="Selling price"><Input name="default_selling_price" type="number" min="0" placeholder="0" /></Field>
            <Field label="Preferred supplier"><Select name="preferred_supplier_id" defaultValue=""><option value="">None</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</Select></Field>
            <Field label="Unit"><Input name="unit" defaultValue="item" /></Field>
            <Field label="Reorder level"><Input name="reorder_level" type="number" min="0" defaultValue="0" /></Field>
            <Field label="Description"><Input name="description" placeholder="Simple internal note" /></Field>
          </div>

          <TechnicalFields itemType={itemType} />

          <div className="mt-5 grid gap-4 rounded-xl bg-slate-50 p-4 md:grid-cols-3">
            <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700"><input name="serial_tracking" type="checkbox" checked={serialTracking} onChange={(e) => setSerialTracking(e.target.checked)} className="h-4 w-4" /> Track Serial / IMEI</label>
            {!serialTracking && <Field label="Opening location"><Select name="opening_location_id" defaultValue=""><option value="">Choose location</option>{locations.filter((item) => item.code !== 'TRANSIT').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>}
            {!serialTracking && <Field label="Opening quantity"><Input name="opening_quantity" type="number" min="0" defaultValue="0" /></Field>}
            {serialTracking && <div className="md:col-span-2 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-slate-600">Create the item first, then open it and add each physical device with its Serial/IMEI, location and supplier.</div>}
          </div>

          <ActionResult state={state} className="mt-4" />
          <Button type="submit" disabled={pending} className="mt-5">{pending ? 'Creating...' : 'Create item'}</Button>
        </form>
      )}

      <div className="mb-3 flex flex-col gap-3 sm:flex-row">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm"><Search className="h-4 w-4 shrink-0 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} className="w-full min-w-0 bg-transparent text-sm outline-none" placeholder="Search SKU, item, brand, model or category..." /></div>
        <Select value={location} onChange={(e) => setLocation(e.target.value)} className="w-full font-bold text-slate-700 sm:w-auto sm:min-w-[180px] sm:shrink-0"><option value="all">All locations</option>{locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white py-14 text-center shadow-sm">
          <Boxes className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm font-bold text-slate-700">No inventory items here</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow><TableHead>SKU</TableHead><TableHead>Item</TableHead><TableHead>Type</TableHead><TableHead>Location</TableHead><TableHead>On hand</TableHead><TableHead>Reserved</TableHead><TableHead>Available</TableHead><TableHead>Tracking</TableHead><TableHead>Action</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((item) => {
              const rows = location === 'all' ? item.location_balances || [] : (item.location_balances || []).filter((row) => row.location_id === location);
              const onHand = rows.reduce((sum, row) => sum + row.on_hand, 0); const reserved = rows.reduce((sum, row) => sum + row.reserved, 0); const available = rows.reduce((sum, row) => sum + row.available, 0);
              return (
                <TableRow key={item.id}>
                  <TableCell className="font-black"><Link href={`/modules/operations/inventory/${item.id}`} className="text-emmy-primary hover:underline">{item.sku}</Link></TableCell>
                  <TableCell><div className="font-bold text-slate-800">{item.name}</div><div className="mt-1 text-xs text-slate-400">{[item.brand,item.model].filter(Boolean).join(' · ') || '—'}</div></TableCell>
                  <TableCell className="capitalize text-slate-600">{item.item_type || 'other'}</TableCell>
                  <TableCell className="text-slate-600">{selectedLocation?.name || (rows.filter((row) => row.on_hand > 0 || row.reserved > 0).map((row) => row.location_name).join(', ') || 'No stock')}</TableCell>
                  <TableCell className="font-black">{onHand}</TableCell>
                  <TableCell className="font-bold text-amber-700">{reserved}</TableCell>
                  <TableCell className="font-black text-emmy-primary">{available}</TableCell>
                  <TableCell>{item.serial_tracking ? 'Serial / IMEI' : 'Quantity'}</TableCell>
                  <TableCell><Link href={`/modules/operations/inventory/${item.id}`} className="text-xs font-black text-emmy-primary hover:underline">Open details</Link></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function TechnicalFields({ itemType }: { itemType: OrderItemType }) {
  if (itemType === 'phone') return <div className="mt-5 grid gap-4 rounded-xl border border-slate-200 p-4 md:grid-cols-3"><Field label="RAM"><Input name="ram" placeholder="8GB" /></Field><Field label="Storage"><Input name="storage_capacity" placeholder="256GB" /></Field><Field label="Colour"><Input name="colour" placeholder="Black" /></Field><Field label="Network"><Input name="network_type" placeholder="4G / 5G" /></Field><Field label="SIM type"><Input name="sim_type" placeholder="Dual SIM / eSIM" /></Field><Field label="Accessories included"><Input name="accessories_included" placeholder="Charger, cable" /></Field></div>;
  if (itemType === 'laptop') return <div className="mt-5 grid gap-4 rounded-xl border border-slate-200 p-4 md:grid-cols-4"><Field label="Generation"><Input name="generation" placeholder="11th Gen" /></Field><Field label="Processor"><Input name="processor_type" placeholder="Core i5" /></Field><Field label="RAM"><Input name="ram" placeholder="8GB" /></Field><Field label="Storage"><Input name="storage_size" placeholder="256GB" /></Field><Field label="Storage type"><Input name="storage_type" placeholder="SSD" /></Field><Field label="Screen size"><Input name="screen_size" placeholder="14 inch" /></Field><Field label="Colour"><Input name="colour" /></Field><Field label="OS"><Input name="os_installed" placeholder="Windows 11" /></Field><CheckField name="touchscreen" label="Touchscreen" /><CheckField name="charger_included" label="Charger included" /><CheckField name="bag_included" label="Bag included" /></div>;
  if (itemType === 'accessory') return <div className="mt-5 grid gap-4 rounded-xl border border-slate-200 p-4 md:grid-cols-3"><Field label="Subcategory"><Input name="subcategory" placeholder="Charger / Mouse / Bag" /></Field><Field label="Compatible with"><Input name="compatible_with" placeholder="Dell / HP / Universal" /></Field><Field label="Colour"><Input name="colour" /></Field></div>;
  if (itemType === 'solar') return <div className="mt-5 grid gap-4 rounded-xl border border-slate-200 p-4 md:grid-cols-2"><Field label="System capacity"><Input name="system_capacity" placeholder="5kVA / 10kWh" /></Field></div>;
  return null;
}

function CheckField({ name, label }: { name: string; label: string }) { return <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"><input type="checkbox" name={name} /> {label}</label>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span>{children}</label>; }
function MiniStat({ label, value, help }: { label: string; value: number; help: string }) { return <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"><div className="flex items-center gap-1.5"><span className="text-xs font-bold text-slate-500">{label}</span><HelpTip text={help} label={`About ${label}`} /></div><div className="mt-1 text-2xl font-black text-slate-950">{value}</div></div>; }
