'use client';

import Link from 'next/link';
import { useActionState, useMemo, useState } from 'react';
import { ClipboardList, Plus, Search, UserCheck } from 'lucide-react';
import { HelpTip } from '@/components/ui/help-tip';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ActionResult } from '@/components/ui/alert';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { IdentityPicker } from '@/components/shared/identity-picker';
import { OPERATIONS_HELP } from '@/lib/operations/help';
import { createOrderAction, type OperationsActionState } from '@/app/(staff)/modules/operations/actions';
import { getOrderStatusLabel } from '@/lib/operations/domain';
import { calculateOrderTotals } from '@/lib/operations/commercial';
import type { OperationsIdentitySummary, OperationsInventoryItem, OperationsLocation, OperationsOrder } from '@/lib/operations/types';

const initialState: OperationsActionState = { success: false, message: '' };
const money = (value: number) => `₦${Number(value || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

type AmbassadorOption = { id: string; name: string; tag: string | null };

export function OrdersClient({ orders, inventory, locations, websiteProducts, ambassadors }: {
  orders: OperationsOrder[];
  inventory: OperationsInventoryItem[];
  locations: OperationsLocation[];
  websiteProducts: Array<{ id: string; name: string; slug: string; status: string | null; price: number | null; sale_price: number | null }>;
  ambassadors: AmbassadorOption[];
}) {
  const [state, formAction, pending] = useActionState(createOrderAction, initialState);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  // Commercial (draft/confirmed/cancelled) and fulfilment (new...completed) are two
  // separate fields on the same order — 'confirmed' is a valid value in both, so they
  // must be filtered independently rather than OR-matched against one dropdown.
  const [commercialFilter, setCommercialFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [identityQuery, setIdentityQuery] = useState('');
  const [selectedIdentity, setSelectedIdentity] = useState<OperationsIdentitySummary | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [itemName, setItemName] = useState('');
  const [listPrice, setListPrice] = useState(0);
  const [unitPrice, setUnitPrice] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [cashOffAmount, setCashOffAmount] = useState(0);
  const [deliveryCharge, setDeliveryCharge] = useState(0);
  const [ambassadorId, setAmbassadorId] = useState('');
  const [commissionRate, setCommissionRate] = useState(0);

  const totals = useMemo(() => calculateOrderTotals({
    subtotal: unitPrice * quantity,
    discountAmount,
    cashOffAmount,
    deliveryCharge,
  }), [unitPrice, quantity, discountAmount, cashOffAmount, deliveryCharge]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((order) => {
      const matchesCommercial = commercialFilter === 'all' || order.commercial_state === commercialFilter;
      const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
      const haystack = [order.order_code, order.customer_name, order.customer_phone, order.reference_label, order.source_reference, order.current_team].filter(Boolean).join(' ').toLowerCase();
      return matchesCommercial && matchesStatus && (!q || haystack.includes(q));
    });
  }, [orders, search, commercialFilter, statusFilter]);

  function chooseIdentity(identity: OperationsIdentitySummary | null) {
    if (!identity) {
      clearIdentity();
      return;
    }
    setSelectedIdentity(identity);
    setIdentityQuery(identity.primary_phone || identity.primary_name || identity.identity_code);
    setCustomerName(identity.primary_name || '');
    setCustomerPhone(identity.primary_phone || '');
    setCustomerEmail(identity.primary_email || '');
    setAmbassadorId(identity.ambassador_id || '');
    setCommissionRate(identity.ambassador_id ? 5 : 0);
  }

  function clearIdentity() {
    setSelectedIdentity(null);
    setIdentityQuery('');
    setCustomerName('');
    setCustomerPhone('');
    setCustomerEmail('');
    setAmbassadorId('');
    setCommissionRate(0);
  }

  function chooseWebsiteProduct(productId: string) {
    const product = websiteProducts.find((item) => item.id === productId);
    if (!product) return;
    const price = Number(product.sale_price || product.price || 0);
    setItemName(product.name);
    setListPrice(Number(product.price || price));
    setUnitPrice(price);
  }

  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="mb-5 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="flex items-center gap-2"><p className="text-xs font-black uppercase tracking-[0.16em] text-emmy-primary">Internal execution</p><HelpTip text="Orders show the sale, the money, who brought it, and what Operations needs to do next." label="About Orders" /></div>
          <h1 className="mt-1.5 text-3xl font-black tracking-[-0.035em]">Orders</h1>
          <p className="mt-2 text-sm text-slate-500">Create a Draft first. Nothing affects stock, CRM or commission until the Order is confirmed.</p>
        </div>
        <Button onClick={() => setShowCreate((value) => !value)} className="self-start"><Plus className="h-4 w-4" /> {showCreate ? 'Close form' : 'New order'}</Button>
      </div>

      {showCreate && (
        <form action={formAction} className="mb-5 space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2"><h2 className="text-sm font-black text-slate-900">Create draft order</h2><HelpTip text={OPERATIONS_HELP.createOrder} label="About creating an order" /></div>

          <section className="rounded-xl bg-slate-50 p-4">
            <div className="mb-3 flex items-center gap-2"><p className="text-xs font-black uppercase tracking-wide text-slate-500">1. Customer</p><HelpTip text="Type a phone number or name. If EmmyTech already knows the person, choose the match so this Order uses the same CRM Identity." label="About customer matching" /></div>
            <div className="max-w-2xl">
              <IdentityPicker
                renderHiddenFields={false}
                query={identityQuery}
                onQueryChange={(value) => { setSelectedIdentity(null); setIdentityQuery(value); setCustomerPhone(value); }}
                selected={selectedIdentity}
                onSelect={chooseIdentity}
                placeholder="Start with phone number, email or name..."
              />
            </div>
            {selectedIdentity && <div className="mt-3 flex flex-col justify-between gap-3 rounded-lg border border-blue-100 bg-white p-3 sm:flex-row sm:items-center"><div className="flex items-start gap-3"><UserCheck className="mt-0.5 h-4 w-4 text-emmy-primary" /><div><p className="text-sm font-black text-slate-800">Using existing Identity: {selectedIdentity.identity_code}</p><p className="mt-1 text-xs text-slate-500">CRM: Stage {selectedIdentity.crm_stage} {selectedIdentity.crm_stage_name}{selectedIdentity.ambassador_name ? ` · Ambassador detected: ${selectedIdentity.ambassador_name}` : ''} · Cash-Off: {money(selectedIdentity.cash_off_balance)}</p></div></div><button type="button" onClick={clearIdentity} className="text-xs font-bold text-slate-500 hover:text-emmy-primary">Use someone else</button></div>}
            <input type="hidden" name="identity_id" value={selectedIdentity?.id || ''} />
            <input type="hidden" name="lead_id" value={selectedIdentity?.lead_id || ''} />
            <input type="hidden" name="acquisition_source" value={selectedIdentity?.acquisition_source || ''} />
            <div className="mt-4 grid gap-4 md:grid-cols-3"><Field label="Customer name"><Input name="customer_name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} /></Field><Field label="Phone"><Input name="customer_phone" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} /></Field><Field label="Email"><Input name="customer_email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} /></Field></div>
          </section>

          <section>
            <p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-500">2. Order item</p>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Website product (optional)"><Select name="website_product_id" defaultValue="" onChange={(e) => chooseWebsiteProduct(e.target.value)}><option value="">Manual / no website product</option>{websiteProducts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
              <Field label="Item name"><Input name="item_name" required value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="What is being sold?" /></Field>
              <Field label="Quantity"><Input name="quantity" type="number" min="1" value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value || 1)))} /></Field>
              <Field label="Normal price"><Input name="list_price" type="number" min="0" value={listPrice || ''} onChange={(e) => setListPrice(Number(e.target.value || 0))} /></Field>
              <Field label="Agreed unit price"><Input name="unit_price" type="number" min="0" value={unitPrice || ''} onChange={(e) => setUnitPrice(Number(e.target.value || 0))} /></Field>
              <Field label="Fulfil from"><Select name="fulfilment_source" defaultValue="manual"><option value="manual">Decide later</option><option value="internal">EmmyTech stock</option><option value="supplier">Supplier / third party</option><option value="dropship">Direct / drop-ship</option></Select></Field>
              <Field label="Inventory item (optional)"><Select name="inventory_item_id" defaultValue=""><option value="">No internal stock selected</option>{inventory.map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.name} · {item.available ?? 0} available</option>)}</Select></Field>
              <Field label="Stock location"><Select name="source_location_id" defaultValue=""><option value="">Choose later</option>{locations.filter((location) => location.code !== 'TRANSIT').map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</Select></Field>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 p-4">
            <div className="mb-3 flex items-center gap-2"><p className="text-xs font-black uppercase tracking-wide text-slate-500">3. Money & attribution</p><HelpTip text="Admin can choose the Ambassador while this is Draft. Confirmation freezes the commission snapshot." label="About attribution" /></div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Discount type"><Select name="discount_type" defaultValue=""><option value="">No discount</option><option value="website_sale">Website sale</option><option value="ambassador_discount">Ambassador discount</option><option value="negotiated_discount">Negotiated</option><option value="promotion">Promotion</option><option value="manager_discount">Manager</option><option value="bundle_discount">Bundle</option><option value="loyalty_discount">Loyalty</option><option value="manual_adjustment">Manual adjustment</option></Select></Field>
              <Field label="Discount amount"><Input name="discount_amount" type="number" min="0" value={discountAmount || ''} onChange={(e) => setDiscountAmount(Number(e.target.value || 0))} /></Field>
              <Field label="Cash-Off"><Input name="cash_off_amount" type="number" min="0" max={selectedIdentity?.cash_off_balance || undefined} value={cashOffAmount || ''} onChange={(e) => setCashOffAmount(Number(e.target.value || 0))} /></Field>
              <Field label="Delivery charge"><Input name="delivery_charge" type="number" min="0" value={deliveryCharge || ''} onChange={(e) => setDeliveryCharge(Number(e.target.value || 0))} /></Field>
              <Field label="Ambassador"><Select name="ambassador_id" value={ambassadorId} onChange={(e) => { setAmbassadorId(e.target.value); if (e.target.value && commissionRate === 0) setCommissionRate(5); if (!e.target.value) setCommissionRate(0); }}><option value="">No Ambassador</option>{ambassadors.map((item) => <option key={item.id} value={item.id}>{item.name}{item.tag ? ` · ${item.tag}` : ''}</option>)}</Select></Field>
              <Field label="Commission %"><Input name="commission_rate" type="number" min="0" step="0.01" value={commissionRate || ''} onChange={(e) => setCommissionRate(Number(e.target.value || 0))} disabled={!ambassadorId} /></Field>
              <Field label="Discount %"><Input name="discount_percentage" type="number" min="0" step="0.01" placeholder="Optional" /></Field>
              <Field label="Discount reason"><Input name="discount_reason" placeholder="Optional reason" /></Field>
            </div>
            <div className="mt-4 grid gap-3 rounded-lg bg-slate-50 p-4 sm:grid-cols-4"><Money label="Items" value={unitPrice * quantity} /><Money label="Discount + Cash-Off" value={discountAmount + cashOffAmount} /><Money label="Delivery" value={deliveryCharge} /><Money label="Draft total" value={totals.totalAmount} strong /></div>
            {ambassadorId && <p className="mt-3 text-xs text-slate-500">Estimated pending commission after confirmation: <strong>{money(totals.totalAmount * commissionRate / 100)}</strong> at {commissionRate}%.</p>}
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><Field label="Reference"><Input name="reference_label" placeholder="e.g. WhatsApp order" /></Field><Field label="Source"><Select name="source_type" defaultValue={selectedIdentity ? 'crm' : 'manual'}><option value="manual">Manual</option><option value="crm">CRM</option><option value="website">Website</option><option value="whatsapp">WhatsApp</option><option value="internal">Internal</option><option value="other">Other</option></Select></Field><Field label="Source reference"><Input name="source_reference" /></Field><Field label="Due at"><Input name="due_at" type="datetime-local" /></Field><input type="hidden" name="priority" value="normal" /><input type="hidden" name="current_team" value="Operations" /></section>
          <ActionResult state={state} />
          <Button type="submit" size="lg" disabled={pending}>{pending ? 'Creating draft...' : 'Create draft order'}</Button>
        </form>
      )}

      <div className="mb-3 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 px-3"><Search className="h-4 w-4 shrink-0 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} className="w-full min-w-0 bg-transparent py-2.5 text-sm outline-none" placeholder="Search order, customer, team or reference..." /></div>
        <label className="flex w-full items-center gap-2 sm:w-auto">
          <span className="shrink-0 text-xs font-bold text-slate-500">Commercial</span>
          <Select value={commercialFilter} onChange={(e) => setCommercialFilter(e.target.value)} className="w-full font-semibold sm:w-auto sm:min-w-[160px] sm:shrink-0">
            <option value="all">All</option>
            <option value="draft">Draft</option>
            <option value="confirmed">Confirmed</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </label>
        <label className="flex w-full items-center gap-2 sm:w-auto">
          <span className="shrink-0 text-xs font-bold text-slate-500">Fulfilment</span>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full font-semibold sm:w-auto sm:min-w-[180px] sm:shrink-0">
            <option value="all">All</option>
            {['new', 'confirmed', 'stock_check', 'assigned', 'picking', 'packing', 'ready_dispatch', 'dispatched', 'delivered', 'completed', 'on_hold', 'cancelled'].map((value) => (
              <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>
            ))}
          </Select>
        </label>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white py-14 text-center shadow-sm">
          <ClipboardList className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm font-bold text-slate-700">No matching orders</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow><TableHead>Order</TableHead><TableHead>Customer</TableHead><TableHead>Commercial</TableHead><TableHead>Total</TableHead><TableHead>Fulfilment</TableHead><TableHead>Commission</TableHead><TableHead>Action</TableHead><TableHead>Updated</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((order) => (
              <TableRow key={order.id}>
                <TableCell className="font-black"><Link href={`/modules/operations/orders/${order.id}`} className="text-emmy-primary hover:underline">{order.order_code}</Link></TableCell>
                <TableCell><div className="font-bold text-slate-800">{order.customer_name || order.reference_label || 'Internal order'}</div><div className="mt-1 text-xs text-slate-400">{order.customer_phone || order.source_type}</div></TableCell>
                <TableCell><Badge variant={order.commercial_state === 'confirmed' ? 'default' : 'outline'} className="capitalize">{order.commercial_state}</Badge></TableCell>
                <TableCell className="font-black text-slate-800">{money(order.total_amount)}</TableCell>
                <TableCell className="text-slate-600">{getOrderStatusLabel(order.status)}</TableCell>
                <TableCell className="text-slate-600">{order.commission_status === 'none' ? '—' : `${money(order.commission_amount)} · ${order.commission_status}`}</TableCell>
                <TableCell><Link href={`/modules/operations/orders/${order.id}`} className={`inline-flex rounded-lg px-3 py-2 text-xs font-black ${order.commercial_state === 'draft' ? 'bg-emmy-primary text-white' : 'bg-blue-50 text-emmy-primary'}`}>{order.commercial_state === 'draft' ? 'Review & Confirm' : 'Continue Order'}</Link></TableCell>
                <TableCell className="text-xs font-semibold text-slate-400">{new Date(order.updated_at).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span>{children}</label>; }
function Money({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) { return <div><p className="text-[10px] font-black uppercase text-slate-400">{label}</p><p className={`mt-1 ${strong ? 'text-lg font-black text-emmy-primary' : 'text-sm font-bold text-slate-800'}`}>{money(value)}</p></div>; }
