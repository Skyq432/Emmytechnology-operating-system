'use client';

import Link from 'next/link';
import { useActionState, useEffect, useMemo, useState } from 'react';
import { ClipboardList, Plus, Search, UserCheck } from 'lucide-react';
import { HelpTip } from '@/components/ui/help-tip';
import { OPERATIONS_HELP } from '@/lib/operations/help';
import { createOrderAction, type OperationsActionState } from '@/app/modules/operations/actions';
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
  const [status, setStatus] = useState('all');
  const [identityQuery, setIdentityQuery] = useState('');
  const [identityResults, setIdentityResults] = useState<OperationsIdentitySummary[]>([]);
  const [identityLoading, setIdentityLoading] = useState(false);
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

  useEffect(() => {
    if (identityQuery.trim().length < 3 || selectedIdentity) {
      setIdentityResults([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      setIdentityLoading(true);
      try {
        const response = await fetch(`/api/operations/identities?q=${encodeURIComponent(identityQuery.trim())}`);
        const body = await response.json();
        setIdentityResults(response.ok ? body.results || [] : []);
      } finally {
        setIdentityLoading(false);
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [identityQuery, selectedIdentity]);

  const totals = useMemo(() => calculateOrderTotals({
    subtotal: unitPrice * quantity,
    discountAmount,
    cashOffAmount,
    deliveryCharge,
  }), [unitPrice, quantity, discountAmount, cashOffAmount, deliveryCharge]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((order) => {
      const matchesStatus = status === 'all' || order.status === status || order.commercial_state === status;
      const haystack = [order.order_code, order.customer_name, order.customer_phone, order.reference_label, order.source_reference, order.current_team].filter(Boolean).join(' ').toLowerCase();
      return matchesStatus && (!q || haystack.includes(q));
    });
  }, [orders, search, status]);

  function chooseIdentity(identity: OperationsIdentitySummary) {
    setSelectedIdentity(identity);
    setIdentityQuery(identity.primary_phone || identity.primary_name || identity.identity_code);
    setCustomerName(identity.primary_name || '');
    setCustomerPhone(identity.primary_phone || '');
    setCustomerEmail(identity.primary_email || '');
    setAmbassadorId(identity.ambassador_id || '');
    setCommissionRate(identity.ambassador_id ? 5 : 0);
    setIdentityResults([]);
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
          <div className="flex items-center gap-2"><p className="text-xs font-black uppercase tracking-[0.16em] text-[#032489]">Internal execution</p><HelpTip text="Orders show the sale, the money, who brought it, and what Operations needs to do next." label="About Orders" /></div>
          <h1 className="mt-1.5 text-3xl font-black tracking-[-0.035em]">Orders</h1>
          <p className="mt-2 text-sm text-slate-500">Create a Draft first. Nothing affects stock, CRM or commission until the Order is confirmed.</p>
        </div>
        <button onClick={() => setShowCreate((value) => !value)} className="inline-flex items-center gap-2 self-start rounded-lg bg-[#032489] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#021d70]"><Plus className="h-4 w-4" /> {showCreate ? 'Close form' : 'New order'}</button>
      </div>

      {showCreate && (
        <form action={formAction} className="mb-5 space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2"><h2 className="text-sm font-black text-slate-900">Create draft order</h2><HelpTip text={OPERATIONS_HELP.createOrder} label="About creating an order" /></div>

          <section className="rounded-xl bg-slate-50 p-4">
            <div className="mb-3 flex items-center gap-2"><p className="text-xs font-black uppercase tracking-wide text-slate-500">1. Customer</p><HelpTip text="Type a phone number or name. If EmmyTech already knows the person, choose the match so this Order uses the same CRM Identity." label="About customer matching" /></div>
            <div className="relative max-w-2xl">
              <input value={identityQuery} onChange={(e) => { setSelectedIdentity(null); setIdentityQuery(e.target.value); setCustomerPhone(e.target.value); }} className="input" placeholder="Start with phone number, email or name..." />
              {identityLoading && <p className="mt-2 text-xs text-slate-400">Checking EmmyTech identities...</p>}
              {identityResults.length > 0 && <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">{identityResults.map((identity) => <button type="button" key={identity.id} onClick={() => chooseIdentity(identity)} className="flex w-full items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 text-left last:border-0 hover:bg-blue-50"><div><p className="text-sm font-bold text-slate-800">{identity.primary_name || identity.primary_phone || identity.identity_code}</p><p className="mt-1 text-xs text-slate-500">{identity.primary_phone || 'No phone'} · {identity.primary_email || 'No email'}</p></div><span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black text-[#032489]">Stage {identity.crm_stage || '—'} {identity.crm_stage_name}</span></button>)}</div>}
            </div>
            {selectedIdentity && <div className="mt-3 flex flex-col justify-between gap-3 rounded-lg border border-blue-100 bg-white p-3 sm:flex-row sm:items-center"><div className="flex items-start gap-3"><UserCheck className="mt-0.5 h-4 w-4 text-[#032489]" /><div><p className="text-sm font-black text-slate-800">Using existing Identity: {selectedIdentity.identity_code}</p><p className="mt-1 text-xs text-slate-500">CRM: Stage {selectedIdentity.crm_stage} {selectedIdentity.crm_stage_name}{selectedIdentity.ambassador_name ? ` · Ambassador detected: ${selectedIdentity.ambassador_name}` : ''} · Cash-Off: {money(selectedIdentity.cash_off_balance)}</p></div></div><button type="button" onClick={clearIdentity} className="text-xs font-bold text-slate-500 hover:text-[#032489]">Use someone else</button></div>}
            <input type="hidden" name="identity_id" value={selectedIdentity?.id || ''} />
            <input type="hidden" name="lead_id" value={selectedIdentity?.lead_id || ''} />
            <input type="hidden" name="acquisition_source" value={selectedIdentity?.acquisition_source || ''} />
            <div className="mt-4 grid gap-4 md:grid-cols-3"><Field label="Customer name"><input name="customer_name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="input" /></Field><Field label="Phone"><input name="customer_phone" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="input" /></Field><Field label="Email"><input name="customer_email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} className="input" /></Field></div>
          </section>

          <section>
            <p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-500">2. Order item</p>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Website product (optional)"><select name="website_product_id" className="input" defaultValue="" onChange={(e) => chooseWebsiteProduct(e.target.value)}><option value="">Manual / no website product</option>{websiteProducts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
              <Field label="Item name"><input name="item_name" required value={itemName} onChange={(e) => setItemName(e.target.value)} className="input" placeholder="What is being sold?" /></Field>
              <Field label="Quantity"><input name="quantity" type="number" min="1" value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value || 1)))} className="input" /></Field>
              <Field label="Normal price"><input name="list_price" type="number" min="0" value={listPrice || ''} onChange={(e) => setListPrice(Number(e.target.value || 0))} className="input" /></Field>
              <Field label="Agreed unit price"><input name="unit_price" type="number" min="0" value={unitPrice || ''} onChange={(e) => setUnitPrice(Number(e.target.value || 0))} className="input" /></Field>
              <Field label="Fulfil from"><select name="fulfilment_source" className="input" defaultValue="manual"><option value="manual">Decide later</option><option value="internal">EmmyTech stock</option><option value="supplier">Supplier / third party</option><option value="dropship">Direct / drop-ship</option></select></Field>
              <Field label="Inventory item (optional)"><select name="inventory_item_id" className="input" defaultValue=""><option value="">No internal stock selected</option>{inventory.map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.name} · {item.available ?? 0} available</option>)}</select></Field>
              <Field label="Stock location"><select name="source_location_id" className="input" defaultValue=""><option value="">Choose later</option>{locations.filter((location) => location.code !== 'TRANSIT').map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></Field>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 p-4">
            <div className="mb-3 flex items-center gap-2"><p className="text-xs font-black uppercase tracking-wide text-slate-500">3. Money & attribution</p><HelpTip text="Admin can choose the Ambassador while this is Draft. Confirmation freezes the commission snapshot." label="About attribution" /></div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Discount type"><select name="discount_type" className="input" defaultValue=""><option value="">No discount</option><option value="website_sale">Website sale</option><option value="ambassador_discount">Ambassador discount</option><option value="negotiated_discount">Negotiated</option><option value="promotion">Promotion</option><option value="manager_discount">Manager</option><option value="bundle_discount">Bundle</option><option value="loyalty_discount">Loyalty</option><option value="manual_adjustment">Manual adjustment</option></select></Field>
              <Field label="Discount amount"><input name="discount_amount" type="number" min="0" value={discountAmount || ''} onChange={(e) => setDiscountAmount(Number(e.target.value || 0))} className="input" /></Field>
              <Field label="Cash-Off"><input name="cash_off_amount" type="number" min="0" max={selectedIdentity?.cash_off_balance || undefined} value={cashOffAmount || ''} onChange={(e) => setCashOffAmount(Number(e.target.value || 0))} className="input" /></Field>
              <Field label="Delivery charge"><input name="delivery_charge" type="number" min="0" value={deliveryCharge || ''} onChange={(e) => setDeliveryCharge(Number(e.target.value || 0))} className="input" /></Field>
              <Field label="Ambassador"><select name="ambassador_id" value={ambassadorId} onChange={(e) => { setAmbassadorId(e.target.value); if (e.target.value && commissionRate === 0) setCommissionRate(5); if (!e.target.value) setCommissionRate(0); }} className="input"><option value="">No Ambassador</option>{ambassadors.map((item) => <option key={item.id} value={item.id}>{item.name}{item.tag ? ` · ${item.tag}` : ''}</option>)}</select></Field>
              <Field label="Commission %"><input name="commission_rate" type="number" min="0" step="0.01" value={commissionRate || ''} onChange={(e) => setCommissionRate(Number(e.target.value || 0))} className="input" disabled={!ambassadorId} /></Field>
              <Field label="Discount %"><input name="discount_percentage" type="number" min="0" step="0.01" className="input" placeholder="Optional" /></Field>
              <Field label="Discount reason"><input name="discount_reason" className="input" placeholder="Optional reason" /></Field>
            </div>
            <div className="mt-4 grid gap-3 rounded-lg bg-slate-50 p-4 sm:grid-cols-4"><Money label="Items" value={unitPrice * quantity} /><Money label="Discount + Cash-Off" value={discountAmount + cashOffAmount} /><Money label="Delivery" value={deliveryCharge} /><Money label="Draft total" value={totals.totalAmount} strong /></div>
            {ambassadorId && <p className="mt-3 text-xs text-slate-500">Estimated pending commission after confirmation: <strong>{money(totals.totalAmount * commissionRate / 100)}</strong> at {commissionRate}%.</p>}
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><Field label="Reference"><input name="reference_label" className="input" placeholder="e.g. WhatsApp order" /></Field><Field label="Source"><select name="source_type" className="input" defaultValue={selectedIdentity ? 'crm' : 'manual'}><option value="manual">Manual</option><option value="crm">CRM</option><option value="website">Website</option><option value="whatsapp">WhatsApp</option><option value="internal">Internal</option><option value="other">Other</option></select></Field><Field label="Source reference"><input name="source_reference" className="input" /></Field><Field label="Due at"><input name="due_at" type="datetime-local" className="input" /></Field><input type="hidden" name="priority" value="normal" /><input type="hidden" name="current_team" value="Operations" /></section>
          {state.message && <p className={`text-sm font-bold ${state.success ? 'text-blue-700' : 'text-rose-700'}`}>{state.message}</p>}
          <button disabled={pending} className="rounded-lg bg-[#032489] px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">{pending ? 'Creating draft...' : 'Create draft order'}</button>
        </form>
      )}

      <div className="mb-3 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row"><div className="flex flex-1 items-center gap-2 rounded-lg border border-slate-200 px-3"><Search className="h-4 w-4 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} className="w-full bg-transparent py-2.5 text-sm outline-none" placeholder="Search order, customer, team or reference..." /></div><select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold"><option value="all">All statuses</option><option value="draft">Draft</option><option value="confirmed">Commercially confirmed</option>{['new','stock_check','assigned','picking','packing','ready_dispatch','dispatched','delivered','completed','on_hold','cancelled'].map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {filtered.length === 0 ? <div className="py-14 text-center"><ClipboardList className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-700">No matching orders</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[1080px] text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Order</th><th className="px-5 py-3">Customer</th><th className="px-5 py-3">Commercial</th><th className="px-5 py-3">Total</th><th className="px-5 py-3">Fulfilment</th><th className="px-5 py-3">Commission</th><th className="px-5 py-3">Action</th><th className="px-5 py-3">Updated</th></tr></thead><tbody className="divide-y divide-slate-100">{filtered.map((order) => <tr key={order.id} className="hover:bg-slate-50/70"><td className="px-5 py-4 font-black"><Link href={`/modules/operations/orders/${order.id}`} className="text-[#032489] hover:underline">{order.order_code}</Link></td><td className="px-5 py-4"><div className="font-bold text-slate-800">{order.customer_name || order.reference_label || 'Internal order'}</div><div className="mt-1 text-xs text-slate-400">{order.customer_phone || order.source_type}</div></td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-black capitalize ${order.commercial_state === 'confirmed' ? 'bg-blue-50 text-[#032489]' : 'bg-slate-100 text-slate-600'}`}>{order.commercial_state}</span></td><td className="px-5 py-4 font-black text-slate-800">{money(order.total_amount)}</td><td className="px-5 py-4 text-slate-600">{getOrderStatusLabel(order.status)}</td><td className="px-5 py-4 text-slate-600">{order.commission_status === 'none' ? '—' : `${money(order.commission_amount)} · ${order.commission_status}`}</td><td className="px-5 py-4"><Link href={`/modules/operations/orders/${order.id}`} className={`inline-flex rounded-lg px-3 py-2 text-xs font-black ${order.commercial_state === 'draft' ? 'bg-[#032489] text-white' : 'bg-blue-50 text-[#032489]'}`}>{order.commercial_state === 'draft' ? 'Review & Confirm' : 'Continue Order'}</Link></td><td className="px-5 py-4 text-xs font-semibold text-slate-400">{new Date(order.updated_at).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })}</td></tr>)}</tbody></table></div>}
      </div>
      <style jsx>{`.input{width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;font-size:14px;outline:none;background:#fff}.input:focus{border-color:#032489;box-shadow:0 0 0 3px rgba(3,36,137,.08)}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span>{children}</label>; }
function Money({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) { return <div><p className="text-[10px] font-black uppercase text-slate-400">{label}</p><p className={`mt-1 ${strong ? 'text-lg font-black text-[#032489]' : 'text-sm font-bold text-slate-800'}`}>{money(value)}</p></div>; }
