'use client';

import { useActionState, useMemo, useState } from 'react';
import {
  convertQuotationAction,
  createQuotationAction,
  createQuotationPublicLinkAction,
  offlineQuotationDecisionAction,
  publishQuotationAction,
  queueQuotationEmailAction,
  type SalesActionState,
} from '@/app/(staff)/modules/sales/actions';
import { IdentityPicker } from '@/components/shared/identity-picker';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, ActionResult } from '@/components/ui/alert';

const initial: SalesActionState = { success: false, message: '' };
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
      <div><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Potential revenue</p><h1 className="mt-2 text-3xl font-black text-emmy-primary">Quotations</h1><p className="mt-2 text-sm text-slate-500">Published versions never reserve stock. Accepted versions can convert once to Direct Sale or Order.</p></div>

      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <form action={createAction} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-black">Create quotation</h2>
          <div className="mt-4 space-y-3">
            <IdentityPicker compact title="1. Find customer" />
            <Input name="sales_staff_name" placeholder="Salesperson" />
          </div>
          <ActionResult state={createState} className="mt-3" />
          <Button type="submit" disabled={creating} className="mt-4 w-full">{creating ? 'Creating…' : 'Create draft quotation'}</Button>
        </form>

        <form action={publishAction} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-black">Publish / revise quotation</h2><div className="rounded-xl bg-blue-50 px-3 py-2 text-sm font-black text-emmy-primary">{money(total)}</div></div>
          <Select name="quotation_id" value={quoteId} onChange={(e) => setQuoteId(e.target.value)} className="mt-4 w-full"><option value="">Choose quotation</option>{publishable.map((q) => <option key={q.id} value={q.id}>{q.quotation_code} · {q.customer_name || 'Customer'} · {q.status}</option>)}</Select>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <Select value={itemId} onChange={(e) => { setItemId(e.target.value); setFinalPrice(''); }}><option value="">Inventory product</option>{inventory.map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.name}</option>)}</Select>
            <Input type="number" min="1" value={qty} onChange={(e) => setQty(Number(e.target.value))} />
            <Input value={finalPrice} onChange={(e) => setFinalPrice(e.target.value)} placeholder={selected ? `Final price · ${money(Number(selected.default_selling_price || 0))}` : 'Final price'} />
            <Button type="button" onClick={addInventoryLine}>Add line</Button>
            <Input value={exceptionReason} onChange={(e) => setExceptionReason(e.target.value)} placeholder="Admin exception reason if below margin" className="md:col-span-4" />
          </div>
          <div className="mt-4 space-y-2">{lines.map((line) => <div key={line.key} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3"><div className="flex-1"><div className="text-sm font-bold">{line.itemName}</div><div className="text-xs text-slate-400">{line.quantity} × {money(line.finalUnitPrice)}</div></div><div className="font-black">{money(line.finalUnitPrice * line.quantity)}</div><button type="button" onClick={() => setLines((current) => current.filter((row) => row.key !== line.key))} className="text-xs font-bold text-rose-600">Remove</button></div>)}</div>
          <Textarea name="customer_note" placeholder="Customer note" className="mt-4 min-h-20" />
          <Textarea name="terms" placeholder="Quotation terms" className="mt-3 min-h-20" />
          <Input name="validity_expires_at" type="datetime-local" className="mt-3" />
          <input type="hidden" name="items_json" value={JSON.stringify(lines.map(({ key: _key, ...line }) => line))} />
          <ActionResult state={publishState} className="mt-3" />
          <Button type="submit" size="lg" disabled={publishing || !quoteId || !lines.length} className="mt-4">{publishing ? 'Publishing…' : selectedQuote?.current_version ? 'Publish revised version' : 'Publish quotation'}</Button>
        </form>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5"><h2 className="font-black">Quotation register</h2></div>
        <div className="divide-y divide-slate-100">{quotations.length === 0 ? <div className="p-8 text-center text-sm text-slate-400">No quotations yet.</div> : quotations.map((quote) => <div key={quote.id} className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-black text-slate-900">{quote.quotation_code} · {quote.customer_name || 'Customer'}</div><div className="mt-1 text-xs text-slate-400">{quote.current_version ? `Version ${quote.current_version.version} · ${money(quote.current_version.total_amount)}` : 'Draft · no published version'} · {quote.status}</div></div><Badge variant="outline">{quote.status}</Badge></div>
          {quote.current_version ? <div className="mt-4 grid gap-3 lg:grid-cols-4">
            {quote.status === 'published' ? <>
              <form action={decisionAction} className="rounded-xl border border-slate-200 p-3"><input type="hidden" name="quotation_id" value={quote.id} /><input type="hidden" name="decision" value="accepted" /><Select name="channel" className="h-8 text-xs"><option value="whatsapp">WhatsApp</option><option value="phone">Phone</option><option value="email">Email</option><option value="in_person">In person</option><option value="other">Other</option></Select><Input name="note" placeholder="Acceptance note" className="mt-2 h-8 text-xs" /><Button size="sm" variant="success" className="mt-2 w-full">Record offline acceptance</Button></form>
              <form action={linkAction} className="rounded-xl border border-slate-200 p-3"><input type="hidden" name="quotation_version_id" value={quote.current_version.id} /><div className="text-xs font-bold text-slate-600">Secure customer link</div><Button size="sm" className="mt-3 w-full">Generate link token</Button></form>
              <form action={sendAction} className="rounded-xl border border-slate-200 p-3"><input type="hidden" name="quotation_version_id" value={quote.current_version.id} /><Input name="recipient_email" type="email" defaultValue={quote.customer_email || ''} placeholder="Customer email" className="h-8 text-xs" /><Button size="sm" variant="outline" className="mt-2 w-full">Queue email after PDF review</Button></form>
            </> : null}
            {quote.status === 'accepted' ? <form action={convertAction} className="rounded-xl border border-emerald-200 bg-emerald-50 p-3"><input type="hidden" name="quotation_id" value={quote.id} /><Select name="conversion_type" className="h-8 border-emerald-200 text-xs"><option value="order">Convert to Order</option><option value="direct_sale">Convert to Direct Sale</option></Select><Button size="sm" variant="success" className="mt-2 w-full">Convert accepted quote</Button></form> : null}
          </div> : null}
        </div>)}</div>
      </section>
      {[decisionState, convertState, linkState, sendState].map((s, i) => s.message ? <Alert key={i} variant={s.success ? 'success' : 'error'}>{s.message}{typeof s.data === 'string' ? ` · ${s.data}` : ''}</Alert> : null)}
    </div>
  );
}
