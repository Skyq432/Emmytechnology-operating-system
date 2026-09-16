'use client';

import { useActionState, useMemo, useState } from 'react';
import {
  convertQuotationAction,
  createQuotationAction,
  createQuotationPublicLinkAction,
  offlineQuotationDecisionAction,
  publishQuotationAction,
  type SalesActionState,
} from '@/app/(staff)/modules/sales/actions';
import { sendQuotationPdfAction } from '@/app/(staff)/modules/sales/document-actions';
import { IdentityPicker } from '@/components/shared/identity-picker';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, ActionResult } from '@/components/ui/alert';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { StepProgress } from '@/components/ui/step-progress';
import { Plus } from 'lucide-react';
import {
  getRelevantSpecFields, getOrderItemTypeLabel, ORDER_ITEM_TYPES, type OrderItemType,
  ORDER_ITEM_SPEC_LABELS as SPEC_LABELS, ORDER_ITEM_BOOLEAN_SPEC_KEYS as BOOLEAN_SPEC_KEYS,
  orderedSpecEntries,
} from '@/lib/operations/sales-model';

const initial: SalesActionState = { success: false, message: '' };
const money = (value: number) => `₦${Number(value || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
const STEPS = ['Customer', 'Items', 'Review & publish'];

function computeMargin(price: number, cost: number) {
  if (!(price > 0)) return null;
  return ((price - cost) / price) * 100;
}

function MarginPreview({ price, cost, minMargin }: { price: number; cost: number; minMargin: number }) {
  const margin = computeMargin(price, cost);
  if (margin === null) return null;
  const clears = margin >= minMargin;
  return (
    <Badge variant={clears ? 'success' : 'warning'} className="w-fit">
      Margin {margin.toFixed(1)}% · min {minMargin.toFixed(1)}%
    </Badge>
  );
}

type InventoryItem = { id: string; sku: string; name: string; category: string | null; item_type: string; default_unit_cost: number | null; default_selling_price: number | null; minimum_margin_percent?: number };
type MarginContext = { companyDefaultMarginPercent: number; categoryMinimums: Record<string, number> };
type Quote = {
  id: string;
  quotation_code: string;
  status: string;
  customer_name: string | null;
  customer_email: string | null;
  current_version_id: string | null;
  current_version?: { id: string; version: number; total_amount: number; subtotal: number; discount_amount: number; status: string; items?: unknown[] } | null;
};
type Line = {
  key: string;
  inventoryItemId?: string;
  itemName: string;
  itemType?: string;
  category?: string | null;
  specs?: Record<string, unknown> | null;
  fulfilmentSource: 'internal' | 'supplier' | 'dropship' | 'manual';
  quantity: number;
  listPrice: number;
  finalUnitPrice: number;
  costBasis?: number;
  costBasisSource?: 'inventory_average' | 'product_default' | 'supplier_on_demand';
  adminExceptionReason?: string;
  note?: string;
};

export function QuotationWorkspace({ quotations, inventory, marginContext }: { quotations: Quote[]; inventory: InventoryItem[]; marginContext: MarginContext }) {
  const [createState, createAction, creating] = useActionState(createQuotationAction, initial);
  const [publishState, publishAction, publishing] = useActionState(publishQuotationAction, initial);
  const [decisionState, decisionAction] = useActionState(offlineQuotationDecisionAction, initial);
  const [convertState, convertAction] = useActionState(convertQuotationAction, initial);
  const [linkState, linkAction] = useActionState(createQuotationPublicLinkAction, initial);
  const [sendState, sendAction] = useActionState(sendQuotationPdfAction, initial);

  const [showCreate, setShowCreate] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [manualStep, setManualStep] = useState<'items' | 'review' | null>(null);
  const [resume, setResume] = useState<{ id: string; label: string } | null>(null);
  const [lines, setLines] = useState<Line[]>([]);

  const [mode, setMode] = useState<'product' | 'custom'>('product');
  const [itemId, setItemId] = useState('');
  const [qty, setQty] = useState(1);
  const [finalPrice, setFinalPrice] = useState('');
  const [cost, setCost] = useState('');
  const [note, setNote] = useState('');
  const [exceptionReason, setExceptionReason] = useState('');
  const [customName, setCustomName] = useState('');
  const [customType, setCustomType] = useState<OrderItemType>('other');
  const [customSpecs, setCustomSpecs] = useState<Record<string, unknown>>({});
  const [customList, setCustomList] = useState('');
  const customSpecFields = useMemo(() => getRelevantSpecFields(customType), [customType]);

  const selected = inventory.find((item) => item.id === itemId);
  const total = lines.reduce((sum, line) => sum + line.finalUnitPrice * line.quantity, 0);

  const productMinMargin = selected
    ? selected.minimum_margin_percent || marginContext.categoryMinimums[(selected.category || '').toLowerCase().trim()] || marginContext.companyDefaultMarginPercent
    : marginContext.companyDefaultMarginPercent;
  const productPrice = Number(finalPrice || selected?.default_selling_price || 0);
  const productCost = Number(selected?.default_unit_cost || 0);
  const customMinMargin = marginContext.categoryMinimums[customType] ?? marginContext.companyDefaultMarginPercent;
  const customPrice = Number(finalPrice || customList || 0);
  const customCost = Number(cost || 0);

  const needsAction = useMemo(() => quotations.filter((q) => ['draft', 'published', 'accepted'].includes(q.status)), [quotations]);
  const history = useMemo(() => quotations.filter((q) => ['converted', 'cancelled'].includes(q.status)), [quotations]);

  // Derived from the action's own state rather than copied into local state via an
  // effect — `dismissed` (set only from plain click/submit handlers, never an effect)
  // lets a stale, already-closed creation be ignored until the next create submit.
  // `resume` lets a "Continue draft" click on an already-created-but-unpublished
  // quotation jump straight to the items step for that existing id.
  const created = !dismissed && createState.success ? (createState.data as { id: string; quotation_code?: string; customer_name?: string | null } | null) : null;
  const quotationId = resume?.id ?? created?.id ?? '';
  const quotationLabel = resume?.label ?? (created ? [created.quotation_code, created.customer_name].filter(Boolean).join(' · ') : '');
  const step: 'customer' | 'items' | 'review' = !quotationId ? 'customer' : manualStep ?? 'items';

  function resetIntake() {
    setShowCreate(false);
    setDismissed(true);
    setManualStep(null);
    setResume(null);
    setLines([]);
    setMode('product');
    setItemId(''); setQty(1); setFinalPrice(''); setCost(''); setNote(''); setExceptionReason('');
    setCustomName(''); setCustomType('other'); setCustomSpecs({}); setCustomList('');
  }

  function continueDraft(quote: Quote) {
    setResume({ id: quote.id, label: [quote.quotation_code, quote.customer_name].filter(Boolean).join(' · ') });
    setManualStep('items');
    setShowCreate(true);
  }

  function addProduct() {
    if (!selected) return;
    const list = Number(selected.default_selling_price || 0);
    const finalValue = Number(finalPrice || list);
    if (list <= 0 || finalValue <= 0 || qty <= 0) return;
    setLines((current) => [...current, {
      key: crypto.randomUUID(), inventoryItemId: selected.id, itemName: selected.name, itemType: selected.item_type,
      category: selected.category, fulfilmentSource: 'internal', quantity: Math.max(1, qty), listPrice: list,
      finalUnitPrice: finalValue, adminExceptionReason: exceptionReason.trim() || undefined, note: note.trim() || undefined,
    }]);
    setItemId(''); setQty(1); setFinalPrice(''); setNote(''); setExceptionReason('');
  }

  function addCustom() {
    const list = Number(customList || 0);
    const finalValue = Number(finalPrice || customList || 0);
    const basis = Number(cost || 0);
    if (!customName.trim() || list <= 0 || finalValue <= 0 || basis < 0 || qty <= 0) return;
    setLines((current) => [...current, {
      key: crypto.randomUUID(), itemName: customName.trim(), itemType: customType, category: customType,
      specs: Object.keys(customSpecs).length ? customSpecs : null, fulfilmentSource: 'manual', quantity: Math.max(1, qty),
      listPrice: list, finalUnitPrice: finalValue, costBasis: basis, costBasisSource: 'supplier_on_demand',
      adminExceptionReason: exceptionReason.trim() || undefined, note: note.trim() || undefined,
    }]);
    setCustomName(''); setCustomType('other'); setCustomSpecs({}); setCustomList(''); setQty(1); setFinalPrice(''); setCost(''); setNote(''); setExceptionReason('');
  }

  const stepIndex = ['customer', 'items', 'review'].indexOf(step);

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Potential revenue</p>
          <h1 className="mt-2 text-3xl font-black text-emmy-primary">Quotations</h1>
          <p className="mt-2 text-sm text-slate-500">Published versions never reserve stock. Accepted versions can convert once to Direct Sale or Order.</p>
        </div>
        <Button onClick={() => (showCreate ? resetIntake() : setShowCreate(true))} className="self-start"><Plus className="h-4 w-4" /> {showCreate ? 'Close form' : 'New quotation'}</Button>
      </div>

      {showCreate && (
        <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <StepProgress steps={STEPS} current={stepIndex} />
            <div className="rounded-xl bg-blue-50 px-3 py-2 text-sm font-black text-emmy-primary">{money(total)}</div>
          </div>

          <section hidden={step !== 'customer'}>
            <form action={createAction} onSubmit={() => setDismissed(false)} className="space-y-3">
              <IdentityPicker compact title="1. Find customer" />
              <Input name="sales_staff_name" placeholder="Salesperson" />
              <ActionResult state={createState} />
              <div className="flex gap-2">
                <Button type="button" onClick={resetIntake} variant="ghost">Cancel</Button>
                <Button type="submit" disabled={creating}>{creating ? 'Creating…' : 'Continue'}</Button>
              </div>
            </form>
          </section>

          <section hidden={step !== 'items'}>
            <p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-500">2. Items — {quotationLabel}</p>
            <div className="rounded-xl border border-slate-200 p-4">
              <SegmentedControl
                size="sm"
                value={mode}
                onChange={(value) => setMode(value)}
                options={[{ value: 'product', label: 'In stock' }, { value: 'custom', label: 'Not in stock' }]}
              />

              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {mode === 'product' ? (
                  <Select value={itemId} onChange={(e) => { setItemId(e.target.value); setFinalPrice(''); }}>
                    <option value="">Choose product</option>
                    {inventory.map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.name}</option>)}
                  </Select>
                ) : (
                  <>
                    <Select value={customType} onChange={(e) => { setCustomType(e.target.value as OrderItemType); setCustomSpecs({}); }}>
                      {ORDER_ITEM_TYPES.map((type) => <option key={type} value={type}>{getOrderItemTypeLabel(type)}</option>)}
                    </Select>
                    <Input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Item / service name" />
                  </>
                )}
                <Input type="number" min="1" value={qty} onChange={(e) => setQty(Number(e.target.value))} placeholder="Qty" />
                {mode === 'custom' ? <Input value={customList} onChange={(e) => setCustomList(e.target.value)} placeholder="Normal price" /> : null}
                <div className="flex flex-col gap-1.5">
                  <Input value={finalPrice} onChange={(e) => setFinalPrice(e.target.value)} placeholder={selected ? `Final price · ${money(Number(selected.default_selling_price || 0))}` : 'Final price'} />
                  {mode === 'product'
                    ? <MarginPreview price={productPrice} cost={productCost} minMargin={productMinMargin} />
                    : <MarginPreview price={customPrice} cost={customCost} minMargin={customMinMargin} />}
                </div>
                {mode === 'custom' ? <Input value={cost} onChange={(e) => setCost(e.target.value)} placeholder="Supplier / service cost basis" /> : null}
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Line note" />
                <Input value={exceptionReason} onChange={(e) => setExceptionReason(e.target.value)} placeholder="Admin pricing exception reason, if needed" className="xl:col-span-2" />
              </div>

              {mode === 'custom' && customSpecFields.length > 0 && (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-500">{getOrderItemTypeLabel(customType)} details</p>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {customSpecFields.map((key) => (
                      <label key={key}>
                        <span className="mb-1.5 block text-xs font-bold capitalize text-slate-600">{SPEC_LABELS[key] || key.replaceAll('_', ' ')}</span>
                        {BOOLEAN_SPEC_KEYS.has(key) ? (
                          <Select value={String(customSpecs[key] ?? '')} onChange={(e) => setCustomSpecs((current) => ({ ...current, [key]: e.target.value === '' ? null : e.target.value === 'true' }))}>
                            <option value="">Not set</option>
                            <option value="true">Yes</option>
                            <option value="false">No</option>
                          </Select>
                        ) : (
                          <Input value={String(customSpecs[key] ?? '')} onChange={(e) => setCustomSpecs((current) => ({ ...current, [key]: e.target.value }))} />
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <Button type="button" className="mt-4" onClick={mode === 'product' ? addProduct : addCustom}>Add item</Button>
            </div>

            <div className="mt-4 space-y-2">
              {lines.map((line) => (
                <div key={line.key} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
                  <div className="flex-1">
                    <div className="text-sm font-bold">{line.itemName}</div>
                    <div className="text-xs text-slate-400">{line.quantity} × {money(line.finalUnitPrice)}{!line.inventoryItemId ? ' · not in stock' : ''}</div>
                  </div>
                  <div className="font-black">{money(line.finalUnitPrice * line.quantity)}</div>
                  <button type="button" onClick={() => setLines((current) => current.filter((row) => row.key !== line.key))} className="text-xs font-bold text-rose-600">Remove</button>
                </div>
              ))}
              {!lines.length ? <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-400">No items added yet.</div> : null}
            </div>

            <div className="mt-4 flex gap-2">
              <Button type="button" onClick={resetIntake} variant="ghost">Cancel</Button>
              <Button type="button" disabled={!lines.length} onClick={() => setManualStep('review')}>Continue</Button>
            </div>
          </section>

          <section hidden={step !== 'review'}>
            <p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-500">3. Review & publish — {quotationLabel}</p>
            {publishState.success ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center">
                <p className="font-black text-emerald-800">Quotation published.</p>
                <p className="mt-1 text-sm text-emerald-700">{publishState.message}</p>
                <Button className="mt-4" onClick={resetIntake}>Done</Button>
              </div>
            ) : (
              <form action={publishAction} className="space-y-3">
                <input type="hidden" name="quotation_id" value={quotationId} />
                <input type="hidden" name="items_json" value={JSON.stringify(lines.map(({ key: _key, ...line }) => line))} />
                <div className="space-y-2">
                  {lines.map((line) => (
                    <div key={line.key} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 text-sm font-bold">{line.itemName}</div>
                        <div className="font-black">{money(line.finalUnitPrice * line.quantity)}</div>
                      </div>
                      <div className="mt-1 text-xs text-slate-400">{line.quantity} × {money(line.finalUnitPrice)}</div>
                      {line.specs && orderedSpecEntries(line.itemType as OrderItemType, line.specs).length > 0 && (
                        <div className="mt-1 text-xs text-slate-400">
                          {orderedSpecEntries(line.itemType as OrderItemType, line.specs).map(([k, v]) => `${SPEC_LABELS[k] || k}: ${v === true ? 'Yes' : v === false ? 'No' : String(v)}`).join(' · ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="rounded-xl bg-blue-50 px-3 py-2 text-right text-sm font-black text-emmy-primary">Total {money(total)}</div>
                <Textarea name="customer_note" placeholder="Customer note" className="min-h-20" />
                <Textarea name="terms" placeholder="Quotation terms" className="min-h-20" />
                <Input name="validity_expires_at" type="datetime-local" />
                <ActionResult state={publishState} />
                <div className="flex gap-2">
                  <Button type="button" onClick={resetIntake} variant="ghost">Cancel</Button>
                  <Button type="button" variant="outline" onClick={() => setManualStep('items')}>Back</Button>
                  <Button type="submit" size="lg" disabled={publishing || !lines.length}>{publishing ? 'Publishing…' : 'Publish quotation'}</Button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5"><h2 className="font-black">Needs action</h2></div>
        <div className="divide-y divide-slate-100">
          {needsAction.length === 0 ? <div className="p-8 text-center text-sm text-slate-400">Nothing waiting on a decision.</div> : needsAction.map((quote) => (
            <div key={quote.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-black text-slate-900">{quote.quotation_code} · {quote.customer_name || 'Customer'}</div>
                  <div className="mt-1 text-xs text-slate-400">{quote.current_version ? `Version ${quote.current_version.version} · ${money(quote.current_version.total_amount)}` : 'Draft · no published version'} · {quote.status}</div>
                </div>
                <Badge variant="outline">{quote.status}</Badge>
              </div>
              {!quote.current_version ? (
                <div className="mt-4"><Button type="button" size="sm" onClick={() => continueDraft(quote)}>Continue draft — add items &amp; publish</Button></div>
              ) : null}
              {quote.current_version ? (
                <div className="mt-4 grid gap-3 lg:grid-cols-4">
                  {quote.status === 'published' ? <>
                    <form action={decisionAction} className="rounded-xl border border-slate-200 p-3"><input type="hidden" name="quotation_id" value={quote.id} /><input type="hidden" name="decision" value="accepted" /><Select name="channel" className="h-8 text-xs"><option value="whatsapp">WhatsApp</option><option value="phone">Phone</option><option value="email">Email</option><option value="in_person">In person</option><option value="other">Other</option></Select><Input name="note" placeholder="Acceptance note" className="mt-2 h-8 text-xs" /><Button size="sm" variant="success" className="mt-2 w-full">Record offline acceptance</Button></form>
                    <form action={linkAction} className="rounded-xl border border-slate-200 p-3"><input type="hidden" name="quotation_version_id" value={quote.current_version.id} /><div className="text-xs font-bold text-slate-600">Shareable customer link</div><p className="mt-1 text-[11px] leading-4 text-slate-400">Creates a link the customer can open to view this quotation and accept or decline it online — no login needed.</p><Button size="sm" className="mt-3 w-full">Get customer link</Button></form>
                    <form action={sendAction} className="rounded-xl border border-slate-200 p-3"><input type="hidden" name="quotation_version_id" value={quote.current_version.id} /><Input name="recipient_email" type="email" defaultValue={quote.customer_email || ''} placeholder="Customer email" className="h-8 text-xs" /><Button size="sm" variant="outline" className="mt-2 w-full">Send quotation PDF</Button></form>
                  </> : null}
                  {quote.status === 'accepted' ? <form action={convertAction} className="rounded-xl border border-emerald-200 bg-emerald-50 p-3"><input type="hidden" name="quotation_id" value={quote.id} /><Select name="conversion_type" className="h-8 border-emerald-200 text-xs"><option value="order">Convert to Order</option><option value="direct_sale">Convert to Direct Sale</option></Select><Button size="sm" variant="success" className="mt-2 w-full">Convert accepted quote</Button></form> : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5"><h2 className="font-black">History</h2></div>
        <div className="divide-y divide-slate-100">
          {history.length === 0 ? <div className="p-8 text-center text-sm text-slate-400">No converted or cancelled quotations yet.</div> : history.map((quote) => (
            <div key={quote.id} className="flex flex-wrap items-center justify-between gap-3 p-5">
              <div>
                <div className="font-black text-slate-900">{quote.quotation_code} · {quote.customer_name || 'Customer'}</div>
                <div className="mt-1 text-xs text-slate-400">{quote.current_version ? `Version ${quote.current_version.version} · ${money(quote.current_version.total_amount)}` : 'No published version'}</div>
              </div>
              <Badge variant="outline">{quote.status}</Badge>
            </div>
          ))}
        </div>
      </section>

      {linkState.message && (
        <Alert variant={linkState.success ? 'success' : 'error'}>
          {linkState.success && typeof linkState.data === 'string' ? (
            <>Customer link ready: <a href={`/quote/${linkState.data}`} target="_blank" rel="noreferrer" className="font-bold underline">{typeof window !== 'undefined' ? window.location.origin : ''}/quote/{linkState.data}</a> — copy this and send it to the customer.</>
          ) : linkState.message}
        </Alert>
      )}
      {[decisionState, convertState, sendState].map((s, i) => s.message ? <Alert key={i} variant={s.success ? 'success' : 'error'}>{s.message}{typeof s.data === 'string' ? ` · ${s.data}` : ''}</Alert> : null)}
    </div>
  );
}
