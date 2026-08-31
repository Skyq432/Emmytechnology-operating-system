'use client';

import { useActionState } from 'react';
import { voidDocumentAction } from '@/app/modules/sales/actions';

const initial = { success: false, message: '' };

type Delivery = { id: string; recipient_type: string; recipient_email: string | null; delivery_state: string; attempt_count: number; last_error: string | null };
type DocumentRow = { id: string; document_number: string; document_type: string; render_status: string; issued_at: string; storage_path: string | null; voided_at: string | null; void_reason: string | null; snapshot: Record<string, unknown>; deliveries?: Delivery[] };

function DocumentCard({ doc }: { doc: DocumentRow }) {
  const [state, action, pending] = useActionState(voidDocumentAction, initial);
  const snapshot = doc.snapshot || {};
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-black text-slate-900">{doc.document_number}</div><div className="mt-1 text-xs text-slate-400">{doc.document_type.replaceAll('_',' ')} · {new Date(doc.issued_at).toLocaleString('en-NG')}</div></div><div className="flex gap-2"><span className={`rounded-full px-3 py-1 text-xs font-bold ${doc.render_status === 'rendered' ? 'bg-emerald-100 text-emerald-700' : doc.render_status === 'failed' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>{doc.render_status}</span>{doc.voided_at ? <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-700">Void</span> : null}</div></div>
    <div className="mt-4 grid gap-2 text-xs text-slate-600 sm:grid-cols-3"><div className="rounded-xl bg-slate-50 p-3"><b>Customer</b><div className="mt-1">{String(snapshot.customer_name || '—')}</div></div><div className="rounded-xl bg-slate-50 p-3"><b>Source</b><div className="mt-1">{String(snapshot.source_code || snapshot.quotation_code || '—')}</div></div><div className="rounded-xl bg-slate-50 p-3"><b>Amount</b><div className="mt-1">₦{Number(snapshot.payment_amount || snapshot.transaction_total || snapshot.total_amount || snapshot.refund_amount || 0).toLocaleString('en-NG')}</div></div></div>
    <div className="mt-4 flex flex-wrap gap-2">{(doc.deliveries || []).map((delivery) => <span key={delivery.id} className="rounded-lg border border-slate-200 px-3 py-2 text-xs">{delivery.recipient_type}: {delivery.recipient_email || 'no email'} · <b>{delivery.delivery_state}</b></span>)}</div>
    {doc.storage_path ? <div className="mt-3 text-xs font-semibold text-[#032489]">PDF stored privately · {doc.storage_path}</div> : <div className="mt-3 text-xs text-slate-400">PDF has not been rendered yet.</div>}
    {!doc.voided_at ? <form action={action} className="mt-4 flex gap-2"><input type="hidden" name="document_id" value={doc.id} /><input name="reason" placeholder="Reason to void this issued document" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs" /><button disabled={pending} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-black text-white">Void</button></form> : <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">Void reason: {doc.void_reason || 'Not recorded'}</div>}
    {state.message ? <div className={`mt-2 rounded-lg px-3 py-2 text-xs ${state.success ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{state.message}</div> : null}
  </section>;
}

export function ReceiptsWorkspace({ documents }: { documents: DocumentRow[] }) {
  return <div className="mx-auto max-w-[1400px] space-y-5"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Immutable commercial documents</p><h1 className="mt-2 text-3xl font-black text-[#032489]">Receipts & Documents</h1><p className="mt-2 text-sm text-slate-500">Payment receipts, final sales receipts, Repair receipts, quotation PDFs and refund documents share one auditable document centre.</p></div><div className="space-y-4">{documents.map((doc) => <DocumentCard key={doc.id} doc={doc} />)}{!documents.length ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">No documents queued yet.</div> : null}</div></div>;
}
