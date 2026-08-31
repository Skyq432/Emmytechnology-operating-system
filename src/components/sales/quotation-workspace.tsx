'use client';

import { useActionState, useMemo, useState } from 'react';
import {
  convertQuotationAction,
  createQuotationAction,
  createQuotationPublicLinkAction,
  offlineQuotationDecisionAction,
  publishQuotationAction,
  queueQuotationEmailAction,
} from '@/app/modules/sales/actions';

const initial = { success: false, message: '' };
const money = (value: number) => `₦${Number(value || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

type InventoryItem = { id: string; sku: string; name: string; category: string | null; item_type: string; default_unit_cost: number | null; default_selling_price: number | null };
type Quote = { id: string; quotation_code: string; status: string; customer_name: string | null; customer_email: string | null; current_version_id: string | null; current_version?: { id: string; version: number; total_amount: number; subtotal: number; discount_amount: number; status: string; items?: unknown[] } | null };
type Line = { key: string; inventoryItemId?: string; itemName: string; itemType?: string; category?: string | null; fulfilmentSource: 'internal' | 'supplier' | 'dropship' | 'manual'; quantity: number; listPrice: number; finalUnitPrice: number; costBasis?: number; costBasisSource?: 'inventory_average' | 'product_default' | 'supplier_on_demand'; adminExceptionReason?: string };

export function QuotationWorkspace({ quotations, inventory }: { quotations: Quote[]; inventory: InventoryItem[] }) {
  const [createState, createAction, creating] = useActionState(createQuotationAction, initial);
  const [publishState, publishAction, publishing] = useActionState(publishQuotationAction, initial);
  const [decisionState, decisionAction] = useActionState(offlineQuotationDecisionAction, initial);
  const [convertState, convertAction] = useActionState(convertQuotationAction, initial);
  const [linkState, linkAction] = useActionState(createQuotationPublicLinkAction, initial);
  const [sendState, sendAction] = useActionState(queueQuotationEmailAction, initial);
  const [quoteId, setQuoteId] = useState(quotations.find((q) => q.status === 'draft' || q.status === 'published')?.id || '');
  const [lines, setLines] = useState<Line[]>([]);
  const [itemId, setItemId] = useState('');
  const [qty, setQty] = useState(1);
  const [finalPrice, setFinalPrice] = useState('');
  const [exceptionReason, setExceptionReason] = useState('');
  const selected = inventory.find((item) => item.id === itemId);
  const selectedQuote = quotations.find((q) => q.id === quoteId);
  const total = lines.reduce((sum, line) => sum + line.finalUnitPrice * line.quantity, 0);
  const publishable = useMemo(() => quotations.filter((q) => !['converted', 'cancelled'].includes(q.status)), [quotations]);

  function addInventoryLine() {
    if (!selected) return;
    const list = Number(selected.default_selling_price || 0);
    const finalValue = Number(finalPrice || list);
    if (list <= 0 || finalValue <= 0) return;
    setLines((current) => [...current, {
      key: crypto.randomUUID(), inventoryItemId: selected.id, itemName: selected.name, itemType: selected.item_type,
      category: selected.category, fulfilmentSource: 'internal', quantity: Math.max(1, qty), listPrice: list,
      finalUnitPrice: finalValue, adminExceptionReason: exceptionReason || undefined,
    }]);
    setItemId(''); setQty(1); setFinalPrice(''); setExceptionReason('');
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Potential revenue</p><h1 className="mt-2 text-3xl font-black text-[#032489]">Quotations</h1><p className="mt-2 text-sm text-slate-500">Published versions never reserve stock. Accepted versions can convert once to Direct Sale or Order.</p></div>

      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <form action={createAction} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-black">Create quotation</h2>
          <div className="mt-4 space-y-3">
            <input name="customer_name" placeholder="Customer name" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
            <input name="customer_phone" placeholder="Phone" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
            <input name="customer_email" type="email" placeholder="Email" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
            <input name="sales_staff_name" placeholder="Salesperson" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
          </div>
          {createState.message ? <div className={`mt-3 rounded-xl px-3 py-2 text-sm ${createState.success ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{createState.message}</div> : null}
          <button disabled={creating} className="mt-4 w-full rounded-xl bg-[#032489] px-4 py-3 text-sm font-black text-white">{creating ? 'Creating…' : 'Create draft quotation'}</button>
        </form>

        <form action={publishAction} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-black">Publish / revise quotation</h2><div className="rounded-xl bg-blue-50 px-3 py-2 text-sm font-black text-[#032489]">{money(total)}</div></div>
          <select name="quotation_id" value={quoteId} onChange={(e) => setQuoteId(e.target.value)} className="mt-4 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="">Choose quotation</option>{publishable.map((q) => <option key={q.id} value={q.id}>{q.quotation_code} · {q.customer_name || 'Customer'} · {q.status}</option>)}</select>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <select value={itemId} onChange={(e) => { setItemId(e.target.value); setFinalPrice(''); }} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="">Inventory product</option>{inventory.map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.name}</option>)}</select>
            <input type="number" min="1" value={qty} onChange={(e) => setQty(Number(e.target.value))} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
            <input value={finalPrice} onChange={(e) => setFinalPrice(e.target.value)} placeholder={selected ? `Final price · ${money(Number(selected.default_selling_price || 0))}` : 'Final price'} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
            <button type="button" onClick={addInventoryLine} className="rounded-xl bg-[#032489] px-4 py-2.5 text-sm font-black text-white">Add line</button>
            <input value={exceptionReason} onChange={(e) => setExceptionReason(e.target.value)} placeholder="Admin exception reason if below margin" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm md:col-span-4" />
          </div>
          <div className="mt-4 space-y-2">{lines.map((line) => <div key={line.key} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3"><div className="flex-1"><div className="text-sm font-bold">{line.itemName}</div><div className="text-xs text-slate-400">{line.quantity} × {money(line.finalUnitPrice)}</div></div><div className="font-black">{money(line.finalUnitPrice * line.quantity)}</div><button type="button" onClick={() => setLines((current) => current.filter((row) => row.key !== line.key))} className="text-xs font-bold text-rose-600">Remove</button></div>)}</div>
          <textarea name="customer_note" placeholder="Customer note" className="mt-4 min-h-20 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
          <textarea name="terms" placeholder="Quotation terms" className="mt-3 min-h-20 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
          <input name="validity_expires_at" type="datetime-local" className="mt-3 rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
          <input type="hidden" name="items_json" value={JSON.stringify(lines.map(({ key: _key, ...line }) => line))} />
          {publishState.message ? <div className={`mt-3 rounded-xl px-3 py-2 text-sm ${publishState.success ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{publishState.message}</div> : null}
          <button disabled={publishing || !quoteId || !lines.length} className="mt-4 rounded-xl bg-[#032489] px-5 py-3 text-sm font-black text-white disabled:opacity-50">{publishing ? 'Publishing…' : selectedQuote?.current_version ? 'Publish revised version' : 'Publish quotation'}</button>
        </form>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5"><h2 className="font-black">Quotation register</h2></div>
        <div className="divide-y divide-slate-100">{quotations.length === 0 ? <div className="p-8 text-center text-sm text-slate-400">No quotations yet.</div> : quotations.map((quote) => <div key={quote.id} className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-black text-slate-900">{quote.quotation_code} · {quote.customer_name || 'Customer'}</div><div className="mt-1 text-xs text-slate-400">{quote.current_version ? `Version ${quote.current_version.version} · ${money(quote.current_version.total_amount)}` : 'Draft · no published version'} · {quote.status}</div></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{quote.status}</span></div>
          {quote.current_version ? <div className="mt-4 grid gap-3 lg:grid-cols-4">
            {quote.status === 'published' ? <>
              <form action={decisionAction} className="rounded-xl border border-slate-200 p-3"><input type="hidden" name="quotation_id" value={quote.id} /><input type="hidden" name="decision" value="accepted" /><select name="channel" className="w-full rounded-lg border border-slate-200 px-2 py-2 text-xs"><option value="whatsapp">WhatsApp</option><option value="phone">Phone</option><option value="email">Email</option><option value="in_person">In person</option><option value="other">Other</option></select><input name="note" placeholder="Acceptance note" className="mt-2 w-full rounded-lg border border-slate-200 px-2 py-2 text-xs" /><button className="mt-2 w-full rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white">Record offline acceptance</button></form>
              <form action={linkAction} className="rounded-xl border border-slate-200 p-3"><input type="hidden" name="quotation_version_id" value={quote.current_version.id} /><div className="text-xs font-bold text-slate-600">Secure customer link</div><button className="mt-3 w-full rounded-lg bg-[#032489] px-3 py-2 text-xs font-black text-white">Generate link token</button></form>
              <form action={sendAction} className="rounded-xl border border-slate-200 p-3"><input type="hidden" name="quotation_version_id" value={quote.current_version.id} /><input name="recipient_email" type="email" defaultValue={quote.customer_email || ''} placeholder="Customer email" className="w-full rounded-lg border border-slate-200 px-2 py-2 text-xs" /><button className="mt-2 w-full rounded-lg bg-slate-900 px-3 py-2 text-xs font-black text-white">Queue email after PDF review</button></form>
            </> : null}
            {quote.status === 'accepted' ? <form action={convertAction} className="rounded-xl border border-emerald-200 bg-emerald-50 p-3"><input type="hidden" name="quotation_id" value={quote.id} /><select name="conversion_type" className="w-full rounded-lg border border-emerald-200 px-2 py-2 text-xs"><option value="order">Convert to Order</option><option value="direct_sale">Convert to Direct Sale</option></select><button className="mt-2 w-full rounded-lg bg-emerald-700 px-3 py-2 text-xs font-black text-white">Convert accepted quote</button></form> : null}
          </div> : null}
        </div>)}</div>
      </section>
      {[decisionState, convertState, linkState, sendState].map((s, i) => s.message ? <div key={i} className={`rounded-xl px-3 py-2 text-sm ${s.success ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{s.message}{typeof s.data === 'string' ? ` · ${s.data}` : ''}</div> : null)}
    </div>
  );
}
