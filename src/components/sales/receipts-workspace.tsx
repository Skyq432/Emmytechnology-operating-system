'use client';

import { useActionState } from 'react';
import { voidDocumentAction } from '@/app/modules/sales/actions';
import {
  processDocumentAction,
  processDocumentQueueAction,
  retryDocumentAction,
} from '@/app/modules/sales/document-actions';

const initial = { success: false, message: '' };

type Delivery = {
  id: string;
  recipient_type: string;
  recipient_email: string | null;
  delivery_state: string;
  attempt_count: number;
  last_error: string | null;
};

type DocumentRow = {
  id: string;
  document_number: string;
  document_type: string;
  render_status: string;
  render_error?: string | null;
  issued_at: string;
  storage_path: string | null;
  voided_at: string | null;
  void_reason: string | null;
  snapshot: Record<string, unknown>;
  deliveries?: Delivery[];
};

function Result({ state }: { state: { success: boolean; message: string } }) {
  if (!state.message) return null;
  return <div className={`mt-2 rounded-lg px-3 py-2 text-xs ${state.success ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{state.message}</div>;
}

function DeliveryChip({ delivery }: { delivery: Delivery }) {
  const statusClass = delivery.delivery_state === 'sent'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : delivery.delivery_state === 'failed'
      ? 'border-rose-200 bg-rose-50 text-rose-700'
      : delivery.delivery_state === 'customer_email_missing'
        ? 'border-slate-200 bg-slate-50 text-slate-500'
        : 'border-amber-200 bg-amber-50 text-amber-700';
  return <div className={`rounded-xl border px-3 py-2 text-xs ${statusClass}`}>
    <div><b>{delivery.recipient_type.replaceAll('_', ' ')}</b> · {delivery.recipient_email || 'no email'}</div>
    <div className="mt-1">{delivery.delivery_state} · attempts {delivery.attempt_count || 0}</div>
    {delivery.last_error ? <div className="mt-1 max-w-xl break-words text-[11px] opacity-80">{delivery.last_error}</div> : null}
  </div>;
}

function DocumentCard({ doc }: { doc: DocumentRow }) {
  const [voidState, voidAction, voidPending] = useActionState(voidDocumentAction, initial);
  const [processState, processAction, processPending] = useActionState(processDocumentAction, initial);
  const [retryState, retryAction, retryPending] = useActionState(retryDocumentAction, initial);
  const snapshot = doc.snapshot || {};
  const hasFailedDelivery = (doc.deliveries || []).some((delivery) => delivery.delivery_state === 'failed');
  const needsRetry = doc.render_status === 'failed' || hasFailedDelivery;

  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="font-black text-slate-900">{doc.document_number}</div>
        <div className="mt-1 text-xs text-slate-400">{doc.document_type.replaceAll('_',' ')} · {new Date(doc.issued_at).toLocaleString('en-NG')}</div>
      </div>
      <div className="flex gap-2">
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${doc.render_status === 'rendered' ? 'bg-emerald-100 text-emerald-700' : doc.render_status === 'failed' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>{doc.render_status}</span>
        {doc.voided_at ? <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-700">Void</span> : null}
      </div>
    </div>

    <div className="mt-4 grid gap-2 text-xs text-slate-600 sm:grid-cols-3">
      <div className="rounded-xl bg-slate-50 p-3"><b>Customer</b><div className="mt-1">{String(snapshot.customer_name || '—')}</div></div>
      <div className="rounded-xl bg-slate-50 p-3"><b>Source</b><div className="mt-1">{String(snapshot.source_code || snapshot.order_code || snapshot.quotation_code || '—')}</div></div>
      <div className="rounded-xl bg-slate-50 p-3"><b>Amount</b><div className="mt-1">₦{Number(snapshot.payment_amount || snapshot.transaction_total || snapshot.total_amount || snapshot.refund_amount || 0).toLocaleString('en-NG')}</div></div>
    </div>

    <div className="mt-4 flex flex-wrap gap-2">{(doc.deliveries || []).map((delivery) => <DeliveryChip key={delivery.id} delivery={delivery} />)}</div>

    {doc.render_error ? <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"><b>PDF generation error:</b> {doc.render_error}</div> : null}

    {doc.storage_path
      ? <div className="mt-3 text-xs font-semibold text-[#032489]">PDF stored privately · {doc.storage_path}</div>
      : <div className="mt-3 text-xs text-slate-400">PDF has not been rendered yet.</div>}

    {!doc.voided_at ? <div className="mt-4 flex flex-wrap items-center gap-2">
      {doc.render_status === 'rendered' && doc.storage_path ? <a href={`/api/sales/documents/${doc.id}`} target="_blank" rel="noreferrer" className="rounded-lg bg-[#032489] px-3 py-2 text-xs font-black text-white">Open PDF</a> : null}
      {!needsRetry ? <form action={processAction}><input type="hidden" name="document_id" value={doc.id} /><button disabled={processPending} className="rounded-lg border border-[#032489] px-3 py-2 text-xs font-black text-[#032489] disabled:opacity-50">{processPending ? 'Processing…' : doc.render_status === 'rendered' ? 'Process Deliveries' : 'Render & Process'}</button></form> : null}
      {needsRetry ? <form action={retryAction}><input type="hidden" name="document_id" value={doc.id} /><button disabled={retryPending} className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-black text-white disabled:opacity-50">{retryPending ? 'Retrying…' : 'Retry'}</button></form> : null}
    </div> : null}
    <Result state={processState} />
    <Result state={retryState} />

    {!doc.voided_at ? <form action={voidAction} className="mt-4 flex gap-2">
      <input type="hidden" name="document_id" value={doc.id} />
      <input name="reason" placeholder="Reason to void this issued document" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs" />
      <button disabled={voidPending} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50">Void</button>
    </form> : <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">Void reason: {doc.void_reason || 'Not recorded'}</div>}
    <Result state={voidState} />
  </section>;
}

function QueueControl() {
  const [state, action, pending] = useActionState(processDocumentQueueAction, initial);
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><div className="text-sm font-black text-slate-900">Document Queue</div><div className="mt-1 text-xs text-slate-500">Render pending PDFs and process pending customer/company deliveries.</div></div>
      <form action={action}><button disabled={pending} className="rounded-lg bg-[#032489] px-4 py-2 text-xs font-black text-white disabled:opacity-50">{pending ? 'Processing…' : 'Process Queue'}</button></form>
    </div>
    <Result state={state} />
  </div>;
}

export function ReceiptsWorkspace({ documents }: { documents: DocumentRow[] }) {
  return <div className="mx-auto max-w-[1400px] space-y-5">
    <div>
      <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Immutable commercial documents</p>
      <h1 className="mt-2 text-3xl font-black text-[#032489]">Receipts & Documents</h1>
      <p className="mt-2 text-sm text-slate-500">Payment receipts, final sales receipts, Repair receipts, quotation PDFs and refund documents share one auditable document centre.</p>
    </div>
    <QueueControl />
    <div className="space-y-4">{documents.map((doc) => <DocumentCard key={doc.id} doc={doc} />)}{!documents.length ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">No documents queued yet.</div> : null}</div>
  </div>;
}
