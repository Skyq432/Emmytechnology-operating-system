'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import {
  approveCreditAction,
  completeHandoverAction,
  confirmDirectSaleAction,
  createDirectSaleAction,
  recordSalesPaymentAction,
  type SalesActionState,
} from '@/app/modules/sales/actions';
import type { DirectSaleCheckoutSnapshot } from '@/lib/sales/direct-sale-server';

const initialState: SalesActionState = { success: false, message: '' };
const money = (value: number) => `₦${Number(value || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

type InventoryItem = {
  id: string; sku: string; name: string; category: string | null; item_type: string; serial_tracking: boolean;
  default_unit_cost: number | null; default_selling_price: number | null; salesperson_discount_limit_percent?: number; minimum_margin_percent?: number; website_selling_price?: number | null; website_price_mismatch?: boolean;
};
type Availability = { inventory_item_id: string; location_id: string; location_name: string; available: number };
type Unit = { id: string; inventory_item_id: string; serial_number: string | null; imei_1: string | null; imei_2: string | null; unit_cost: number | null; current_location_id: string | null; status: string };
type Location = { id: string; code: string; name: string };
type CartLine = {
  key: string; inventoryItemId?: string; inventoryUnitId?: string; sourceLocationId?: string;
  itemName?: string; itemType?: string; category?: string; quantity: number; listPrice?: number;
  finalUnitPrice?: number; costBasis?: number; costBasisSource?: string; adminExceptionReason?: string;
};

type IdentityResult = {
  id: string; identity_code: string; primary_name: string | null; primary_phone: string | null; primary_email: string | null;
  crm_stage_name?: string; ambassador_name?: string | null; acquisition_source?: string | null; cash_off_balance?: number;
};

function DirectSaleCheckout({ initialCheckout, isAdmin }: { initialCheckout: DirectSaleCheckoutSnapshot; isAdmin: boolean }) {
  const [confirmState, confirmAction, confirming] = useActionState(confirmDirectSaleAction, initialState);
  const [paymentState, paymentAction, paying] = useActionState(recordSalesPaymentAction, initialState);
  const [creditState, creditAction, crediting] = useActionState(approveCreditAction, initialState);
  const [handoverState, handoverAction, handing] = useActionState(completeHandoverAction, initialState);

  const actionCheckout = [handoverState, paymentState, creditState, confirmState]
    .find((candidate) => candidate.success && candidate.data)?.data as DirectSaleCheckoutSnapshot | undefined;
  const checkout = actionCheckout ?? initialCheckout;
  const latestState = [handoverState, paymentState, creditState, confirmState].find((row) => row.message);
  const confirmed = checkout.commercialState === 'confirmed';
  const completed = Boolean(checkout.handoverCompletedAt) || checkout.fulfilmentStatus === 'completed';
  const creditCoversBalance = Boolean(checkout.credit && checkout.credit.status === 'active' && checkout.credit.approvedOutstandingAmount >= checkout.outstanding);
  const canHandover = confirmed && !completed && (checkout.outstanding <= 0 || creditCoversBalance);
  const finalReceipt = checkout.documents.find((doc) => doc.documentType === 'final_sales_receipt');
  const paymentReceipts = checkout.documents.filter((doc) => doc.documentType === 'payment_receipt');

  return (
    <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">Current checkout</div>
        <h2 className="mt-2 text-xl font-black text-[#032489]">{checkout.customerName || 'Customer'}</h2>
        <div className="mt-1 text-xs text-slate-500">{checkout.customerPhone || 'No phone'}{checkout.customerEmail ? ` · ${checkout.customerEmail}` : ''}</div>
        <div className="mt-4 rounded-xl bg-slate-50 p-3">
          <div className="text-[10px] font-black uppercase text-slate-400">Sale ID</div>
          <div className="mt-1 font-black text-slate-900">{checkout.orderCode}</div>
        </div>
        <div className="mt-4 space-y-2">{checkout.items.map((item) => (
          <div key={item.id} className="rounded-xl border border-slate-200 p-3">
            <div className="text-sm font-bold text-slate-900">{item.itemName}</div>
            <div className="mt-1 flex justify-between text-xs text-slate-500"><span>{item.quantity} × {money(item.unitPrice)}</span><b>{money(item.lineTotal)}</b></div>
          </div>
        ))}</div>
        <button type="button" onClick={() => window.location.reload()} className="mt-5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-black text-[#032489]">Start New Direct Sale</button>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">Checkout</div><h2 className="mt-1 text-xl font-black text-slate-900">{completed ? 'Sale completed' : confirmed ? 'Payment & handover' : '3. Confirm sale'}</h2></div>
          <div className="rounded-xl bg-blue-50 px-4 py-2 text-lg font-black text-[#032489]">{money(checkout.totalAmount)}</div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl bg-slate-50 p-3"><div className="text-[10px] font-black uppercase text-slate-400">Gross</div><div className="mt-1 font-black">{money(checkout.grossAmount)}</div></div>
          <div className="rounded-xl bg-emerald-50 p-3"><div className="text-[10px] font-black uppercase text-emerald-600">Cash-Off</div><div className="mt-1 font-black text-emerald-800">-{money(checkout.cashOffAmount)}</div></div>
          <div className="rounded-xl bg-slate-50 p-3"><div className="text-[10px] font-black uppercase text-slate-400">Payable</div><div className="mt-1 font-black">{money(checkout.totalAmount)}</div></div>
          <div className="rounded-xl bg-emerald-50 p-3"><div className="text-[10px] font-black uppercase text-emerald-600">Paid</div><div className="mt-1 font-black text-emerald-800">{money(checkout.paidAmount)}</div></div>
          <div className="rounded-xl bg-amber-50 p-3"><div className="text-[10px] font-black uppercase text-amber-600">Outstanding</div><div className="mt-1 font-black text-amber-800">{money(checkout.outstanding)}</div></div>
        </div>

        {!confirmed && !completed ? (
          <form action={confirmAction} className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-4">
            <input type="hidden" name="order_id" value={checkout.id} />
            <div className="font-black text-blue-950">Confirm this Direct Sale</div>
            <p className="mt-1 text-xs leading-5 text-blue-700">This reserves the selected stock and turns the draft into a real commercial sale. Check the customer, items and total before continuing.</p>
            <button disabled={confirming} className="mt-3 w-full rounded-xl bg-[#032489] px-4 py-3 text-sm font-black text-white disabled:opacity-50">{confirming ? 'Confirming & reserving stock…' : 'Confirm Sale & Reserve Stock'}</button>
          </form>
        ) : null}

        {confirmed && !completed ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {checkout.outstanding > 0 ? <form action={paymentAction} className="rounded-2xl border border-slate-200 p-4">
              <input type="hidden" name="order_id" value={checkout.id} />
              <div className="font-black text-slate-900">4. Record payment</div>
              <p className="mt-1 text-xs text-slate-500">Enter the amount actually received. Partial payments are allowed.</p>
              <input name="amount" type="number" min="1" max={checkout.outstanding} defaultValue={checkout.outstanding} required className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
              <div className="mt-2 grid grid-cols-2 gap-2">
                <select name="payment_method" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="bank_transfer">Bank transfer</option><option value="pos">POS</option><option value="cash">Cash</option><option value="split">Split</option><option value="other">Other</option></select>
                <input name="reference" placeholder="Reference (optional)" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
              </div>
              <button disabled={paying} className="mt-3 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-black text-white disabled:opacity-50">{paying ? 'Recording…' : 'Record Payment'}</button>
            </form> : <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><div className="font-black text-emerald-900">✓ Payment complete</div><p className="mt-1 text-xs text-emerald-700">The sale is fully paid and is ready for physical handover.</p></div>}

            {checkout.outstanding > 0 && isAdmin ? <form action={creditAction} className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <input type="hidden" name="order_id" value={checkout.id} />
              <div className="font-black text-amber-950">Admin credit release</div>
              <p className="mt-1 text-xs text-amber-700">Only use this when the customer may collect before paying the full balance.</p>
              <input name="approved_outstanding_amount" type="number" min="1" max={checkout.outstanding} defaultValue={checkout.outstanding} className="mt-3 w-full rounded-xl border border-amber-200 px-3 py-2.5 text-sm" />
              <input name="due_at" type="datetime-local" required className="mt-2 w-full rounded-xl border border-amber-200 px-3 py-2.5 text-sm" />
              <input name="reason" required placeholder="Reason for credit release" className="mt-2 w-full rounded-xl border border-amber-200 px-3 py-2.5 text-sm" />
              <button disabled={crediting} className="mt-3 w-full rounded-xl bg-amber-700 px-4 py-3 text-sm font-black text-white disabled:opacity-50">{crediting ? 'Approving…' : creditCoversBalance ? 'Credit Already Covers Balance' : 'Approve Credit Release'}</button>
            </form> : null}
          </div>
        ) : null}

        {confirmed && !completed ? (
          <form action={handoverAction} className={`mt-4 rounded-2xl border p-4 ${canHandover ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
            <input type="hidden" name="order_id" value={checkout.id} />
            <div className={`font-black ${canHandover ? 'text-emerald-900' : 'text-slate-700'}`}>5. Physical handover</div>
            <p className="mt-1 text-xs text-slate-500">{canHandover ? (checkout.outstanding <= 0 ? 'Payment is complete. Confirm that the product has physically been given to the customer.' : `Active Admin credit covers the ${money(checkout.outstanding)} balance. You may release the product.`) : `${money(checkout.outstanding)} remains unpaid. Full payment or sufficient Admin credit is required before handover.`}</p>
            <button disabled={handing || !canHandover} className="mt-3 w-full rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300">{handing ? 'Completing handover…' : 'Complete Handover'}</button>
          </form>
        ) : null}

        {completed ? <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="text-lg font-black text-emerald-900">✓ Sale completed successfully</div>
          <p className="mt-1 text-sm text-emerald-700">The handover is recorded and inventory has been updated. This transaction remains connected to the same CRM Identity and Order ID.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {finalReceipt ? <a href={`/api/sales/documents/${finalReceipt.id}`} target="_blank" rel="noreferrer" className="rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-black text-white">View Final Receipt</a> : null}
            {paymentReceipts.map((doc) => <a key={doc.id} href={`/api/sales/documents/${doc.id}`} target="_blank" rel="noreferrer" className="rounded-xl border border-emerald-300 bg-white px-4 py-2.5 text-xs font-black text-emerald-800">{doc.documentNumber}</a>)}
            <button type="button" onClick={() => window.location.reload()} className="rounded-xl border border-emerald-300 bg-white px-4 py-2.5 text-xs font-black text-emerald-800">New Direct Sale</button>
          </div>
          {!finalReceipt && checkout.outstanding <= 0 ? <div className="mt-3 text-xs font-semibold text-amber-700">Final receipt metadata is still being processed. Payment remains safely recorded.</div> : null}
        </div> : null}

        {latestState?.message ? <div className={`mt-4 rounded-xl px-3 py-2 text-sm font-semibold ${latestState.success ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{latestState.message}</div> : null}
      </section>
    </div>
  );
}

export function DirectSaleWorkspace({ inventory, availability, units, locations, actor }: {
  inventory: InventoryItem[]; availability: Availability[]; units: Unit[]; locations: Location[];
  actor: { authorityLevel: string; discountLimitPercent: number };
}) {
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
  const [identityQuery, setIdentityQuery] = useState('');
  const [identityResults, setIdentityResults] = useState<IdentityResult[]>([]);
  const [identityLoading, setIdentityLoading] = useState(false);
  const [selectedIdentity, setSelectedIdentity] = useState<IdentityResult | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [cashOffAmount, setCashOffAmount] = useState(0);

  useEffect(() => {
    const query = identityQuery.trim();
    if (query.length < 3 || selectedIdentity) return;
    const timer = window.setTimeout(async () => {
      setIdentityLoading(true);
      try {
        const response = await fetch(`/api/operations/identities?q=${encodeURIComponent(query)}`);
        const payload = await response.json();
        setIdentityResults(Array.isArray(payload.results) ? payload.results : []);
      } catch { setIdentityResults([]); }
      finally { setIdentityLoading(false); }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [identityQuery, selectedIdentity]);

  const selectedItem = inventory.find((item) => item.id === selectedItemId);
  const itemUnits = useMemo(() => units.filter((unit) => unit.inventory_item_id === selectedItemId), [units, selectedItemId]);
  const itemAvailability = useMemo(() => availability.filter((row) => row.inventory_item_id === selectedItemId && Number(row.available) > 0), [availability, selectedItemId]);
  const total = lines.reduce((sum, line) => sum + Number(line.finalUnitPrice || 0) * line.quantity, 0);
  const cashOffLimit = Math.max(0, Math.min(Number(selectedIdentity?.cash_off_balance || 0), total));
  const appliedCashOff = Math.min(cashOffAmount, cashOffLimit);
  const amountPayable = Math.max(total - appliedCashOff, 0);
  const standardPrice = Number(selectedItem?.default_selling_price || 0);
  const productDiscount = Math.min(100, Math.max(0, Number(selectedItem?.salesperson_discount_limit_percent ?? actor.discountLimitPercent ?? 0)));
  const discountFloor = standardPrice > 0 ? standardPrice * (1 - productDiscount / 100) : 0;
  const itemCost = Number(selectedItem?.default_unit_cost || 0);
  const minMargin = Math.min(99.99, Math.max(0, Number(selectedItem?.minimum_margin_percent || 0)));
  const marginFloor = itemCost > 0 ? itemCost / (1 - minMargin / 100) : 0;
  const authorityFloor = Math.max(discountFloor, marginFloor);
  const enteredPrice = Number(price || standardPrice || 0);
  const needsApproval = standardPrice > 0 && enteredPrice > 0 && enteredPrice < authorityFloor;

  function chooseIdentity(identity: IdentityResult) {
    setSelectedIdentity(identity);
    setIdentityQuery(identity.primary_name || identity.primary_phone || identity.primary_email || identity.identity_code);
    setCustomerName(identity.primary_name || '');
    setCustomerPhone(identity.primary_phone || '');
    setCustomerEmail(identity.primary_email || '');
    setIdentityResults([]);
  }

  function clearIdentity() {
    setSelectedIdentity(null); setIdentityQuery(''); setIdentityResults([]); setCustomerName(''); setCustomerPhone(''); setCustomerEmail(''); setCashOffAmount(0);
  }

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

  const createdCheckout = state.success && state.data ? state.data as DirectSaleCheckoutSnapshot : null;

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Immediate commercial sale</p><h1 className="mt-2 text-3xl font-black text-[#032489]">Direct Sale</h1><p className="mt-2 text-sm text-slate-500">Use real Operations stock for physical products. Drafts do not consume stock; physical handover happens only after confirmation and payment or approved credit.</p></div>

      {createdCheckout ? <DirectSaleCheckout initialCheckout={createdCheckout} isAdmin={actor.authorityLevel === 'admin'} /> : null}

      {!createdCheckout ? <>

      <form action={action} className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3"><div><h2 className="font-black text-slate-900">1. Find customer</h2><p className="mt-1 text-xs text-slate-500">Search existing CRM data before creating a new customer.</p></div>{selectedIdentity ? <button type="button" onClick={clearIdentity} className="text-xs font-bold text-[#032489]">Change</button> : null}</div>
          <div className="relative mt-4">
            <input value={identityQuery} onChange={(e) => { const next = e.target.value; setSelectedIdentity(null); setIdentityQuery(next); if (next.trim().length < 3) setIdentityResults([]); }} placeholder="Phone, email, name or CRM code" className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-[#032489]" />
            {identityLoading ? <span className="absolute right-3 top-3 text-xs text-slate-400">Searching…</span> : null}
            {!selectedIdentity && identityResults.length ? <div className="absolute z-20 mt-2 max-h-72 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">{identityResults.map((identity) => <button key={identity.id} type="button" onClick={() => chooseIdentity(identity)} className="block w-full rounded-lg px-3 py-2.5 text-left hover:bg-slate-50"><div className="text-sm font-bold text-slate-900">{identity.primary_name || 'Unnamed customer'}</div><div className="mt-0.5 text-xs text-slate-500">{[identity.primary_phone,identity.primary_email,identity.identity_code].filter(Boolean).join(' · ')}</div></button>)}</div> : null}
          </div>
          {selectedIdentity ? <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3"><div className="text-sm font-black text-[#032489]">{selectedIdentity.primary_name || 'Existing customer'}</div><div className="mt-1 text-xs text-slate-600">{selectedIdentity.crm_stage_name || 'CRM customer'}{selectedIdentity.acquisition_source ? ` · ${selectedIdentity.acquisition_source}` : ''}</div>{selectedIdentity.ambassador_name ? <div className="mt-1 text-xs text-slate-500">Ambassador: {selectedIdentity.ambassador_name}</div> : null}{Number(selectedIdentity.cash_off_balance || 0) > 0 ? <div className="mt-2 text-xs font-bold text-emerald-700">Cash-Off available: {money(Number(selectedIdentity.cash_off_balance))}</div> : null}</div> : <p className="mt-2 text-xs text-slate-400">No match? Enter the customer&apos;s details below and a CRM Identity will be resolved when the draft is created.</p>}
          <input type="hidden" name="identity_id" value={selectedIdentity?.id || ''} />
          <div className="mt-4 space-y-3">
            <input name="customer_name" value={customerName} onChange={(e)=>setCustomerName(e.target.value)} placeholder="Customer name" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
            <input name="customer_phone" value={customerPhone} onChange={(e)=>setCustomerPhone(e.target.value)} placeholder="Phone" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
            <input name="customer_email" value={customerEmail} onChange={(e)=>setCustomerEmail(e.target.value)} type="email" placeholder="Email for receipt" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
            <input name="customer_address" placeholder="Address (supporting CRM signal)" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
            <input name="sales_staff_name" placeholder="Salesperson name" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-black text-slate-900">2. Build the sale</h2><div className="rounded-xl bg-blue-50 px-3 py-2 text-sm font-black text-[#032489]">Payable {money(amountPayable)}</div></div>
          <div className="mt-4 flex gap-2"><button type="button" onClick={() => setMode('stock')} className={`rounded-lg px-3 py-2 text-xs font-bold ${mode === 'stock' ? 'bg-[#032489] text-white' : 'bg-slate-100 text-slate-600'}`}>Physical stock</button><button type="button" onClick={() => setMode('service')} className={`rounded-lg px-3 py-2 text-xs font-bold ${mode === 'service' ? 'bg-[#032489] text-white' : 'bg-slate-100 text-slate-600'}`}>Service / non-stock</button></div>

          {mode === 'stock' ? <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <select value={selectedItemId} onChange={(e) => { setSelectedItemId(e.target.value); setSelectedUnitId(''); setSelectedLocationId(''); setPrice(''); }} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="">Choose inventory item</option>{inventory.map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.name}</option>)}</select>
            {selectedItem?.serial_tracking ? <select value={selectedUnitId} onChange={(e) => setSelectedUnitId(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="">Choose Serial / IMEI</option>{itemUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.serial_number || unit.imei_1 || unit.imei_2 || unit.id}</option>)}</select> : <select value={selectedLocationId} onChange={(e) => setSelectedLocationId(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="">Stock location</option>{itemAvailability.map((row) => <option key={row.location_id} value={row.location_id}>{row.location_name} · {row.available} available</option>)}</select>}
            <input type="number" min="1" value={selectedItem?.serial_tracking ? 1 : qty} disabled={selectedItem?.serial_tracking} onChange={(e) => setQty(Number(e.target.value))} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder="Quantity" />
            <input value={price} onChange={(e) => setPrice(e.target.value)} className={`rounded-xl border px-3 py-2.5 text-sm ${needsApproval ? 'border-amber-400 bg-amber-50' : 'border-slate-200'}`} placeholder={selectedItem ? (standardPrice > 0 ? `Agreed price · standard ${money(standardPrice)}` : 'Standard price not configured') : 'Agreed selling price'} />
            {selectedItem ? <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs md:col-span-2 xl:col-span-3"><div className="flex flex-wrap gap-x-6 gap-y-1"><span>Standard price <strong className="text-slate-900">{standardPrice > 0 ? money(standardPrice) : 'Not configured'}</strong></span><span>Your lowest price <strong className="text-[#032489]">{standardPrice > 0 ? money(authorityFloor) : 'Pending price setup'}</strong></span><span>Salesperson discount <strong>{productDiscount.toFixed(0)}%</strong><span>Minimum gross margin <strong>{minMargin.toFixed(0)}%</strong></span></span></div>{selectedItem.website_price_mismatch ? <div className="mt-2 font-bold text-amber-700">Website price {money(Number(selectedItem.website_selling_price || 0))} differs from inventory standard {money(standardPrice)}.</div> : null}{needsApproval ? <div className="mt-2 font-bold text-amber-700">This price is below your normal authority. Admin approval is required.</div> : null}</div> : null}
            <input value={exceptionReason} onChange={(e) => setExceptionReason(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm md:col-span-2 xl:col-span-3" placeholder={needsApproval ? "Admin approval reason" : "Pricing note (optional)"} />
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

          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-sm font-black text-emerald-900">Customer Cash-Off</div><div className="mt-1 text-xs text-emerald-700">Available {money(Number(selectedIdentity?.cash_off_balance || 0))}. Nothing is debited until you confirm this sale.</div></div><div className="text-right text-xs text-slate-500">Gross {money(total)}<br/><b className="text-emerald-800">Payable {money(amountPayable)}</b></div></div>
            <input name="cash_off_amount" type="number" min="0" max={cashOffLimit} value={cashOffAmount || ''} disabled={!selectedIdentity || cashOffLimit <= 0} onChange={(event) => setCashOffAmount(Math.max(0, Math.min(Number(event.target.value || 0), cashOffLimit)))} placeholder="Cash-Off to use" className="mt-3 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm disabled:bg-slate-100" />
          </div>

          <input type="hidden" name="items_json" value={JSON.stringify(lines.map(({ key: _key, ...line }) => line))} />
          {state.message ? <div className={`mt-4 rounded-xl px-3 py-2 text-sm font-semibold ${state.success ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{state.message}</div> : null}
          <button disabled={pending || !lines.length} className="mt-4 w-full rounded-xl bg-[#032489] px-4 py-3 text-sm font-black text-white disabled:opacity-50">{pending ? 'Creating…' : 'Create Direct Sale Draft'}</button>
        </section>
      </form>
      </> : null}
    </div>
  );
}
