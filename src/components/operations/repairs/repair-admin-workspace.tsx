'use client';

import { useActionState, useMemo } from 'react';
import {
  publishRepairQuoteAction,
  recordRepairPaymentAction,
  regenerateRepairPinAction,
  saveRepairWorkAction,
  updateRepairStatusAction,
  type SalesActionState,
} from '@/app/modules/operations/sales-actions';
import { getRepairWorkflowActions } from '@/lib/operations/repair-domain';
import type {
  OperationsRepair,
  OperationsRepairCardAssignment,
  OperationsRepairEvent,
  OperationsRepairPayment,
  OperationsRepairQuote,
} from '@/lib/operations/types';

const initialState: SalesActionState = { success: false, message: '' };
const money = (value: number) => `₦${Number(value || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
const dateTime = (value: string | null | undefined) => value ? new Date(value).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export function RepairAdminWorkspace({
  repair,
  activeAssignment,
  currentQuote,
  quoteHistory,
  payments,
  events,
}: {
  repair: OperationsRepair;
  activeAssignment: OperationsRepairCardAssignment | null;
  currentQuote: OperationsRepairQuote | null;
  quoteHistory: OperationsRepairQuote[];
  payments: OperationsRepairPayment[];
  events: OperationsRepairEvent[];
}) {
  const [workState, workAction, workPending] = useActionState(saveRepairWorkAction, initialState);
  const [quoteState, quoteAction, quotePending] = useActionState(publishRepairQuoteAction, initialState);
  const [paymentState, paymentAction, paymentPending] = useActionState(recordRepairPaymentAction, initialState);
  const [pinState, pinAction, pinPending] = useActionState(regenerateRepairPinAction, initialState);
  const [workflowState, workflowAction, workflowPending] = useActionState(updateRepairStatusAction, initialState);

  const workflowActions = useMemo(() => getRepairWorkflowActions({
    status: repair.status,
    quoteStatus: currentQuote?.status || null,
    amountPaid: repair.amount_paid,
    requiredBeforeStart: currentQuote?.required_before_start || 0,
  }), [repair.status, repair.amount_paid, currentQuote]);

  const startRequired = currentQuote?.required_before_start || 0;
  const remainingBeforeStart = Math.max(0, startRequired - repair.amount_paid);

  return <div className="mt-5 space-y-5">
    <div className="grid gap-5 xl:grid-cols-3">
      <Panel title="Repair Card access" subtitle="The physical card and temporary customer PIN for this repair.">
        {activeAssignment ? <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Card" value={activeAssignment.card?.card_code || 'Assigned'} />
            <Metric label="Assignment" value={activeAssignment.status === 'active' ? 'Active' : 'Closed'} />
          </div>
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#032489]">Access PIN</p>
            <p className="mt-1 text-3xl font-black tracking-[0.18em] text-[#032489]">{activeAssignment.access_pin}</p>
            <p className="mt-2 text-xs text-slate-500">Temporary PIN for this card assignment only.</p>
          </div>
          <form action={pinAction}><input type="hidden" name="repair_id" value={repair.id} /><button disabled={pinPending} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:border-blue-200 hover:text-[#032489] disabled:opacity-50">{pinPending ? 'Regenerating...' : 'Regenerate PIN'}</button></form>
          <ActionMessage state={pinState} />
        </div> : <p className="text-sm text-slate-500">No active Repair Card assignment.</p>}
      </Panel>

      <Panel title="Payment gate" subtitle="The database will not allow repair work to start until approval and the required payment are satisfied.">
        <div className="grid grid-cols-2 gap-3">
          <Metric label="Current quote" value={currentQuote ? money(currentQuote.quote_amount) : 'Not published'} />
          <Metric label="Quote status" value={currentQuote?.status.replaceAll('_', ' ') || 'None'} />
          <Metric label="Paid" value={money(repair.amount_paid)} />
          <Metric label="Balance" value={money(repair.balance_due)} />
        </div>
        {currentQuote && <div className={`mt-4 rounded-lg px-3 py-2.5 text-sm font-bold ${remainingBeforeStart > 0 ? 'bg-amber-50 text-amber-800' : currentQuote.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-[#032489]'}`}>
          {currentQuote.status !== 'approved' ? 'Customer approval is still required for the current quote.' : remainingBeforeStart > 0 ? `${money(remainingBeforeStart)} more must be recorded before repair work can start.` : 'Approval and start-payment gate are satisfied.'}
        </div>}
      </Panel>

      <Panel title="Next action" subtitle="Only valid workflow actions are shown here.">
        {workflowActions.length === 0 ? <p className="text-sm font-bold text-slate-500">No normal workflow action is available from this state.</p> : <div className="space-y-2">
          {workflowActions.map((item) => item.key === 'publish_quote' ? <div key={item.key} className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-bold text-[#032489]">Use the Quote panel below to {item.label.toLowerCase()}.</div> : <form key={item.key} action={workflowAction} className="flex gap-2"><input type="hidden" name="repair_id" value={repair.id} /><input type="hidden" name="status" value={item.status || ''} />{item.key === 'cancel' && <input name="note" required placeholder="Cancellation reason" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#032489]" />}<button disabled={workflowPending} className={`rounded-lg px-3 py-2 text-sm font-black disabled:opacity-50 ${item.key === 'cancel' ? 'border border-rose-200 bg-white text-rose-700' : 'bg-[#032489] text-white'}`}>{item.label}</button></form>)}
          <ActionMessage state={workflowState} />
        </div>}
      </Panel>
    </div>

    <div className="grid gap-5 xl:grid-cols-2">
      <Panel title="Technician & repair details" subtitle="Internal work details. Save these as diagnosis and repair work progresses.">
        <form action={workAction} className="grid gap-4 md:grid-cols-2">
          <input type="hidden" name="repair_id" value={repair.id} />
          <Field label="Technician"><input name="technician_name" defaultValue={repair.technician_name || ''} className="input" /></Field>
          <Field label="Repair type"><input name="repair_type" defaultValue={repair.repair_type || ''} className="input" /></Field>
          <div className="md:col-span-2"><Field label="Internal diagnosis"><textarea name="diagnosis" defaultValue={repair.diagnosis || ''} className="input min-h-24" /></Field></div>
          <Field label="Parts replaced"><input name="parts_replaced" defaultValue={repair.parts_replaced || ''} className="input" /></Field>
          <Field label="Condition returned"><input name="condition_returned" defaultValue={repair.condition_returned || ''} className="input" /></Field>
          <Field label="Parts cost"><input name="parts_cost" type="number" min="0" defaultValue={repair.parts_cost} className="input" /></Field>
          <Field label="Labour cost"><input name="labour_cost" type="number" min="0" defaultValue={repair.labour_cost} className="input" /></Field>
          <Field label="Repair warranty"><input name="warranty_period" defaultValue={repair.warranty_period || ''} className="input" /></Field>
          <Field label="Warranty expiry"><input name="warranty_expires_at" type="date" defaultValue={repair.warranty_expires_at || ''} className="input" /></Field>
          <div className="md:col-span-2"><Field label="Internal notes"><textarea name="notes" defaultValue={repair.notes || ''} className="input min-h-20" /></Field></div>
          <div className="md:col-span-2 flex items-center gap-3"><button disabled={workPending} className="rounded-lg bg-[#032489] px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">{workPending ? 'Saving...' : 'Save repair details'}</button><ActionMessage state={workState} inline /></div>
        </form>
      </Panel>

      <Panel title={currentQuote ? 'Publish revised quote' : 'Publish repair quote'} subtitle="This is the customer-facing price. Publishing a revision creates a new version instead of overwriting an approved quote.">
        <form action={quoteAction} className="grid gap-4 md:grid-cols-2">
          <input type="hidden" name="repair_id" value={repair.id} />
          <div className="md:col-span-2"><Field label="Customer-safe diagnosis"><textarea name="diagnosis_public" defaultValue={currentQuote?.diagnosis_public || repair.diagnosis || ''} required className="input min-h-20" /></Field></div>
          <div className="md:col-span-2"><Field label="Proposed repair / work"><textarea name="work_description" defaultValue={currentQuote?.work_description || repair.repair_type || ''} required className="input min-h-20" /></Field></div>
          <Field label="Quoted amount"><input name="quote_amount" type="number" min="0" defaultValue={currentQuote?.quote_amount || repair.amount_charged || 0} required className="input" /></Field>
          <Field label="Estimated completion"><input name="estimated_completion" defaultValue={currentQuote?.estimated_completion || ''} placeholder="e.g. 2 working days" className="input" /></Field>
          <Field label="Payment before work"><select name="payment_requirement" defaultValue={currentQuote?.payment_requirement || 'none'} className="input"><option value="none">No payment required</option><option value="partial">Partial deposit</option><option value="full">Full payment</option></select></Field>
          <Field label="Deposit amount (partial only)"><input name="required_before_start" type="number" min="0" defaultValue={currentQuote?.required_before_start || 0} className="input" /></Field>
          <div className="md:col-span-2 flex items-center gap-3"><button disabled={quotePending} className="rounded-lg bg-[#032489] px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">{quotePending ? 'Publishing...' : currentQuote ? 'Publish revised quote' : 'Publish quote'}</button><ActionMessage state={quoteState} inline /></div>
        </form>
        {quoteHistory.length > 0 && <div className="mt-5 border-t border-slate-100 pt-4"><p className="text-xs font-black uppercase tracking-wide text-slate-400">Quote history</p><div className="mt-3 space-y-2">{quoteHistory.map((quote) => <div key={quote.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"><div><p className="text-sm font-black text-slate-800">Version {quote.version} · {money(quote.quote_amount)}</p><p className="mt-0.5 text-xs text-slate-500">{quote.payment_requirement.replaceAll('_',' ')} · {dateTime(quote.published_at || quote.created_at)}</p></div><span className="rounded-full bg-white px-2 py-1 text-[10px] font-black uppercase text-slate-600">{quote.status}</span></div>)}</div></div>}
      </Panel>
    </div>

    <div className="grid gap-5 xl:grid-cols-2">
      <Panel title="Repair payments" subtitle="Record every customer payment separately. Do not overwrite the total manually.">
        <form action={paymentAction} className="grid gap-3 md:grid-cols-2">
          <input type="hidden" name="repair_id" value={repair.id} />
          <Field label="Amount"><input name="amount" type="number" min="1" required className="input" /></Field>
          <Field label="Method"><select name="payment_method" defaultValue="bank_transfer" className="input"><option value="bank_transfer">Bank transfer</option><option value="pos">POS</option><option value="cash">Cash</option><option value="split">Split</option><option value="other">Other</option></select></Field>
          <Field label="Reference"><input name="reference" className="input" /></Field>
          <Field label="Paid at"><input name="paid_at" type="datetime-local" className="input" /></Field>
          <div className="md:col-span-2"><Field label="Payment note"><input name="note" className="input" /></Field></div>
          <div className="md:col-span-2 flex items-center gap-3"><button disabled={paymentPending || !currentQuote} className="rounded-lg bg-[#032489] px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">{paymentPending ? 'Recording...' : 'Record payment'}</button>{!currentQuote && <span className="text-xs font-bold text-amber-700">Publish a quote first.</span>}<ActionMessage state={paymentState} inline /></div>
        </form>
        {payments.length > 0 && <div className="mt-5 space-y-2">{payments.map((payment) => <div key={payment.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2"><div><p className="text-sm font-black text-slate-800">{money(payment.amount)} · {payment.payment_method.replaceAll('_',' ')}</p><p className="mt-0.5 text-xs text-slate-500">{dateTime(payment.paid_at)}{payment.reference ? ` · ${payment.reference}` : ''}</p></div>{payment.is_void && <span className="text-[10px] font-black uppercase text-rose-600">Void</span>}</div>)}</div>}
      </Panel>

      <Panel title="Repair timeline" subtitle="Important internal and customer-visible milestones for this job.">
        {events.length === 0 ? <p className="text-sm text-slate-500">No workflow events recorded yet.</p> : <div className="space-y-3">{events.slice(0, 12).map((event) => <div key={event.id} className="relative border-l-2 border-slate-100 pl-4"><span className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-[#032489]" /><p className="text-sm font-black text-slate-800">{event.title}</p><p className="mt-0.5 text-xs text-slate-400">{dateTime(event.created_at)}{event.customer_visible ? ' · Customer visible' : ''}</p>{event.note && <p className="mt-1 text-xs text-slate-600">{event.note}</p>}</div>)}</div>}
      </Panel>
    </div>
    <style jsx>{`.input{width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;font-size:14px;outline:none;background:#fff}.input:focus{border-color:#032489;box-shadow:0 0 0 3px rgba(3,36,137,.08)}`}</style>
  </div>;
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-sm font-black text-slate-900">{title}</h2><p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p><div className="mt-4">{children}</div></section>;
}
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-sm font-black capitalize text-slate-800">{value}</p></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span>{children}</label>; }
function ActionMessage({ state, inline = false }: { state: SalesActionState; inline?: boolean }) { if (!state.message) return null; return <p className={`${inline ? 'text-xs' : 'mt-3 text-xs'} font-bold ${state.success ? 'text-emerald-700' : 'text-rose-700'}`}>{state.message}</p>; }
