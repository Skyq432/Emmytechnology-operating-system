'use client';

import { useActionState, useMemo, useState } from 'react';
import {
  addRepairPartAction,
  approveRepairQuoteAction,
  confirmRepairCollectionAction,
  publishRepairQuoteAction,
  recordRepairPaymentAction,
  regenerateRepairPinAction,
  releaseRepairWithoutPaymentAction,
  removeRepairPartAction,
  saveRepairWorkAction,
  startDiagnosisAction,
  updateRepairStatusAction,
  type SalesActionState,
} from '@/app/(staff)/modules/operations/sales-actions';
import { getRepairWorkflowActions } from '@/lib/operations/repair-domain';
import type {
  OperationsInventoryItem,
  OperationsLocation,
  OperationsRepair,
  OperationsRepairCardAssignment,
  OperationsRepairEvent,
  OperationsRepairPayment,
  OperationsRepairQuote,
  RepairPartUsed,
} from '@/lib/operations/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ActionResult } from '@/components/ui/alert';
import { SendReceiptButton } from '@/components/sales/send-receipt-button';

const initialState: SalesActionState = { success: false, message: '' };
const money = (value: number) => `₦${Number(value || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
const dateTime = (value: string | null | undefined) => value ? new Date(value).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

type DialogKey = 'diagnosis' | 'edit_details' | 'quote' | 'approve_quote' | 'record_payment' | 'confirm_collection' | 'release_override' | 'cancel' | null;

// Closes `matchKey`'s dialog the instant its action state transitions to success —
// compares against the previous render's state, stored in state (not a ref — this
// lint config forbids ref mutation during render), and calls setState conditionally
// during render (React's documented "adjusting state" pattern), rather than in a
// useEffect, so there's no extra render round-trip and no setState-in-effect violation.
function useCloseDialogOnSuccess(state: SalesActionState, matchKey: DialogKey, dialogOpen: DialogKey, setDialogOpen: (key: DialogKey) => void) {
  const [prevState, setPrevState] = useState(state);
  if (prevState !== state) {
    setPrevState(state);
    if (state.success && dialogOpen === matchKey) setDialogOpen(null);
  }
}

export function RepairAdminWorkspace({
  repair,
  activeAssignment,
  currentQuote,
  quoteHistory,
  payments,
  events,
  inventory,
  locations,
  partsUsed,
}: {
  repair: OperationsRepair;
  activeAssignment: OperationsRepairCardAssignment | null;
  currentQuote: OperationsRepairQuote | null;
  quoteHistory: OperationsRepairQuote[];
  payments: OperationsRepairPayment[];
  events: OperationsRepairEvent[];
  inventory: OperationsInventoryItem[];
  locations: OperationsLocation[];
  partsUsed: RepairPartUsed[];
}) {
  const [dialogOpen, setDialogOpen] = useState<DialogKey>(null);
  const [diagnosisState, diagnosisAction, diagnosisPending] = useActionState(startDiagnosisAction, initialState);
  const [workState, workAction, workPending] = useActionState(saveRepairWorkAction, initialState);
  const [quoteState, quoteAction, quotePending] = useActionState(publishRepairQuoteAction, initialState);
  const [approveState, approveAction, approvePending] = useActionState(approveRepairQuoteAction, initialState);
  const [paymentState, paymentAction, paymentPending] = useActionState(recordRepairPaymentAction, initialState);
  const [collectionState, collectionAction, collectionPending] = useActionState(confirmRepairCollectionAction, initialState);
  const [releaseState, releaseAction, releasePending] = useActionState(releaseRepairWithoutPaymentAction, initialState);
  const [pinState, pinAction, pinPending] = useActionState(regenerateRepairPinAction, initialState);
  const [workflowState, workflowAction, workflowPending] = useActionState(updateRepairStatusAction, initialState);
  const [partState, partAction, partPending] = useActionState(addRepairPartAction, initialState);
  const quantityTrackedInventory = useMemo(() => inventory.filter((item) => !item.serial_tracking), [inventory]);

  // Each popup closes itself the moment its own action succeeds — the underlying
  // data (repair/currentQuote/workflowActions) is already fresh by then via
  // revalidatePath, so there's nothing left for the popup to do. Adjusted during
  // render (comparing against the previous render's state), not in an effect —
  // React's own sanctioned pattern for reacting to a value changing between
  // renders without an extra render round-trip.
  useCloseDialogOnSuccess(diagnosisState, 'diagnosis', dialogOpen, setDialogOpen);
  useCloseDialogOnSuccess(workState, 'edit_details', dialogOpen, setDialogOpen);
  useCloseDialogOnSuccess(quoteState, 'quote', dialogOpen, setDialogOpen);
  useCloseDialogOnSuccess(approveState, 'approve_quote', dialogOpen, setDialogOpen);
  useCloseDialogOnSuccess(paymentState, 'record_payment', dialogOpen, setDialogOpen);
  useCloseDialogOnSuccess(collectionState, 'confirm_collection', dialogOpen, setDialogOpen);
  useCloseDialogOnSuccess(releaseState, 'release_override', dialogOpen, setDialogOpen);
  useCloseDialogOnSuccess(workflowState, 'cancel', dialogOpen, setDialogOpen);

  const cashOffAmount = Number((repair as OperationsRepair & { cash_off_amount?: number }).cash_off_amount || 0);
  const effectivePaid = repair.amount_paid + cashOffAmount;
  const workflowActions = useMemo(() => getRepairWorkflowActions({
    status: repair.status,
    quoteStatus: currentQuote?.status || null,
    amountPaid: effectivePaid,
    requiredBeforeStart: currentQuote?.required_before_start || 0,
    balanceDue: repair.balance_due,
  }), [repair.status, effectivePaid, currentQuote, repair.balance_due]);

  const startRequired = currentQuote?.required_before_start || 0;
  const remainingBeforeStart = Math.max(0, startRequired - effectivePaid);

  return <div className="mt-5 space-y-5">
    <div className="grid gap-5 xl:grid-cols-3">
      <Panel title="Repair Card access" subtitle="The physical card and temporary customer PIN for this repair.">
        {activeAssignment ? <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Card" value={activeAssignment.card?.card_code || 'Assigned'} />
            <Metric label="Assignment" value={activeAssignment.status === 'active' ? 'Active' : 'Closed'} />
          </div>
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-emmy-primary">Access PIN</p>
            <p className="mt-1 text-3xl font-black tracking-[0.18em] text-emmy-primary">{activeAssignment.access_pin}</p>
            <p className="mt-2 text-xs text-slate-500">Temporary PIN for this card assignment only.</p>
          </div>
          <form action={pinAction}><input type="hidden" name="repair_id" value={repair.id} /><Button type="submit" variant="outline" size="sm" disabled={pinPending}>{pinPending ? 'Regenerating...' : 'Regenerate PIN'}</Button></form>
          <ActionResult state={pinState} />
        </div> : <p className="text-sm text-slate-500">No Repair Card was issued for this job — collection doesn&apos;t need a card or PIN.</p>}
      </Panel>

      <Panel title="Payment gate" subtitle="The database will not allow repair work to start until approval and the required payment are satisfied.">
        <div className="grid grid-cols-2 gap-3">
          <Metric label="Current quote" value={currentQuote ? money(currentQuote.quote_amount) : 'Not published'} />
          <Metric label="Quote status" value={currentQuote?.status.replaceAll('_', ' ') || 'None'} />
          <Metric label="Cash paid" value={money(repair.amount_paid)} />
          <Metric label="Cash-Off" value={money(cashOffAmount)} />
          <Metric label="Balance" value={money(repair.balance_due)} />
        </div>
        {currentQuote && <div className={`mt-4 rounded-lg px-3 py-2.5 text-sm font-bold ${remainingBeforeStart > 0 ? 'bg-amber-50 text-amber-800' : currentQuote.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-emmy-primary'}`}>
          {currentQuote.status !== 'approved' ? 'Customer approval is still required for the current quote.' : remainingBeforeStart > 0 ? `${money(remainingBeforeStart)} more must be recorded before repair work can start.` : 'Approval and start-payment gate are satisfied.'}
        </div>}
      </Panel>

      <Panel title="Next action" subtitle="Only valid workflow actions are shown here.">
        {workflowActions.length === 0 ? <p className="text-sm font-bold text-slate-500">No normal workflow action is available from this state.</p> : <div className="space-y-2">
          {workflowActions.map((item) => {
            if (item.key === 'start_diagnosis') return <Button key={item.key} type="button" onClick={() => setDialogOpen('diagnosis')} className="w-full">Start Diagnosis</Button>;
            if (item.key === 'publish_quote') return <Button key={item.key} type="button" onClick={() => setDialogOpen('quote')} className="w-full">Publish Repair Quote</Button>;
            if (item.key === 'approve_quote') return <Button key={item.key} type="button" variant="success" onClick={() => setDialogOpen('approve_quote')} className="w-full">Approve Quote (customer confirmed)</Button>;
            if (item.key === 'record_payment') return <Button key={item.key} type="button" onClick={() => setDialogOpen('record_payment')} className="w-full">Record Payment</Button>;
            if (item.key === 'confirm_collection') return <Button key={item.key} type="button" variant="success" onClick={() => setDialogOpen('confirm_collection')} className="w-full">Confirm Collected (customer picked up)</Button>;
            if (item.key === 'release_override') return <Button key={item.key} type="button" variant="outline" onClick={() => setDialogOpen('release_override')} className="w-full border-amber-300 text-amber-800">Release Without Full Payment (admin approval)</Button>;
            if (item.key === 'cancel') return <Button key={item.key} type="button" variant="outline" onClick={() => setDialogOpen('cancel')} className="w-full border-rose-200 text-rose-700">Cancel Repair</Button>;
            return <form key={item.key} action={workflowAction}><input type="hidden" name="repair_id" value={repair.id} /><input type="hidden" name="status" value={item.status || ''} /><Button type="submit" disabled={workflowPending} className="w-full">{item.label}</Button></form>;
          })}
          <ActionResult state={workflowState} />
        </div>}
      </Panel>
    </div>

    <div className="grid gap-5 xl:grid-cols-2">
      <Panel title="Technician & repair details" subtitle="Internal work details, set when diagnosis starts and editable anytime after.">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Metric label="Technician" value={repair.technician_name || '—'} />
          <Metric label="Repair type" value={repair.repair_type || '—'} />
          <Metric label="Parts replaced" value={repair.parts_replaced || '—'} />
          <Metric label="Warranty" value={repair.warranty_period || '—'} />
          <Metric label="Parts cost" value={money(repair.parts_cost)} />
          <Metric label="Labour cost" value={money(repair.labour_cost)} />
        </div>
        {repair.diagnosis && <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{repair.diagnosis}</p>}
        <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => setDialogOpen('edit_details')}>Edit details</Button>
      </Panel>

      <Panel title="Parts from inventory" subtitle="Consumes real stock the moment a part is used — separate from the free-text 'Parts replaced' field above, which still covers anything not tracked in Inventory.">
        <form action={partAction} className="grid gap-3 md:grid-cols-4">
          <input type="hidden" name="repair_id" value={repair.id} />
          <div className="md:col-span-2"><Field label="Part"><Select name="inventory_item_id" defaultValue="" required>
            <option value="" disabled>Choose a part...</option>
            {quantityTrackedInventory.map((item) => <option key={item.id} value={item.id}>{item.sku} — {item.name}</option>)}
          </Select></Field></div>
          <Field label="Location"><Select name="location_id" defaultValue="" required>
            <option value="" disabled>Choose location...</option>
            {locations.filter((location) => location.code !== 'TRANSIT').map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
          </Select></Field>
          <Field label="Quantity"><Input name="quantity" type="number" min="1" defaultValue={1} required /></Field>
          <div className="md:col-span-4 flex items-center gap-3"><Button type="submit" size="sm" disabled={partPending}>{partPending ? 'Adding...' : 'Add part'}</Button><ActionMessage state={partState} inline /></div>
        </form>

        {partsUsed.length > 0 && <div className="mt-4 space-y-2">
          {partsUsed.map((part) => <div key={part.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-800">{part.quantity}× {part.inventory_item?.name || 'Unknown item'}</p>
              <p className="text-xs text-slate-500">{part.inventory_item?.sku}{part.location ? ` · ${part.location.name}` : ''}{part.unit_cost ? ` · ${money(part.unit_cost * part.quantity)}` : ''}</p>
            </div>
            <form action={removeRepairPartAction}><input type="hidden" name="repair_id" value={repair.id} /><input type="hidden" name="part_id" value={part.id} /><Button type="submit" variant="outline" size="sm" className="border-rose-200 text-rose-700">Return</Button></form>
          </div>)}
        </div>}
        {quantityTrackedInventory.length === 0 && <p className="mt-3 text-xs text-slate-500">No quantity-tracked inventory items exist yet — serialized parts aren&apos;t supported here yet, use &quot;Parts replaced&quot; above for those.</p>}
      </Panel>

      <Panel title="Repair quote" subtitle="This is the customer-facing price. Publishing a revision creates a new version instead of overwriting an approved quote.">
        <div className="grid grid-cols-2 gap-3">
          <Metric label="Current quote" value={currentQuote ? money(currentQuote.quote_amount) : 'Not published'} />
          <Metric label="Status" value={currentQuote?.status.replaceAll('_', ' ') || 'None'} />
        </div>
        <Button type="button" size="sm" className="mt-4" onClick={() => setDialogOpen('quote')}>{currentQuote ? 'Publish revised quote' : 'Publish quote'}</Button>
        {quoteHistory.length > 0 && <div className="mt-5 border-t border-slate-100 pt-4"><p className="text-xs font-black uppercase tracking-wide text-slate-400">Quote history</p><div className="mt-3 space-y-2">{quoteHistory.map((quote) => <div key={quote.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"><div><p className="text-sm font-black text-slate-800">Version {quote.version} · {money(quote.quote_amount)}</p><p className="mt-0.5 text-xs text-slate-500">{quote.payment_requirement.replaceAll('_',' ')} · {dateTime(quote.published_at || quote.created_at)}</p></div><Badge variant="outline" className="uppercase">{quote.status}</Badge></div>)}</div></div>}
      </Panel>
    </div>

    <div className="grid gap-5 xl:grid-cols-2">
      <Panel title="Repair payments" subtitle="Record every customer payment separately. Do not overwrite the total manually.">
        <div className="grid grid-cols-2 gap-3">
          <Metric label="Cash paid" value={money(repair.amount_paid)} />
          <Metric label="Balance" value={money(repair.balance_due)} />
        </div>
        <Button type="button" size="sm" className="mt-4" onClick={() => setDialogOpen('record_payment')} disabled={!currentQuote}>Record payment</Button>
        {!currentQuote && <span className="ml-3 text-xs font-bold text-amber-700">Publish a quote first.</span>}
        {payments.length > 0 && <div className="mt-5 space-y-2">{payments.map((payment) => <div key={payment.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2"><div><p className="text-sm font-black text-slate-800">{money(payment.amount)} · {payment.payment_method.replaceAll('_',' ')}</p><p className="mt-0.5 text-xs text-slate-500">{dateTime(payment.paid_at)}{payment.reference ? ` · ${payment.reference}` : ''}</p></div>{payment.is_void ? <Badge variant="danger" className="uppercase">Void</Badge> : <SendReceiptButton sourceType="repair" sourcePaymentId={payment.id} defaultEmail={repair.customer_email} />}</div>)}</div>}
      </Panel>

      <Panel title="Repair timeline" subtitle="Important internal and customer-visible milestones for this job.">
        {events.length === 0 ? <p className="text-sm text-slate-500">No workflow events recorded yet.</p> : <div className="space-y-3">{events.slice(0, 12).map((event) => <div key={event.id} className="relative border-l-2 border-slate-100 pl-4"><span className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-emmy-primary" /><p className="text-sm font-black text-slate-800">{event.title}</p><p className="mt-0.5 text-xs text-slate-400">{dateTime(event.created_at)}{event.customer_visible ? ' · Customer visible' : ''}</p>{event.note && <p className="mt-1 text-xs text-slate-600">{event.note}</p>}</div>)}</div>}
      </Panel>
    </div>

    <Dialog open={dialogOpen === 'diagnosis'} onClose={() => setDialogOpen(null)} title="Start Diagnosis" description="Just what's needed to begin — the rest (cost, warranty, condition returned) can be filled in later from the details panel.">
      <form action={diagnosisAction} className="grid gap-4 md:grid-cols-2">
        <input type="hidden" name="repair_id" value={repair.id} />
        <Field label="Technician"><Input name="technician_name" defaultValue={repair.technician_name || ''} /></Field>
        <Field label="Repair type"><Input name="repair_type" defaultValue={repair.repair_type || ''} placeholder="Screen Replacement" /></Field>
        <div className="md:col-span-2"><Field label="Diagnosis"><Textarea name="diagnosis" defaultValue={repair.diagnosis || ''} className="min-h-24" /></Field></div>
        <div className="md:col-span-2 flex items-center gap-3"><Button type="submit" disabled={diagnosisPending}>{diagnosisPending ? 'Starting...' : 'Start Diagnosis'}</Button><ActionMessage state={diagnosisState} inline /></div>
      </form>
    </Dialog>

    <Dialog open={dialogOpen === 'edit_details'} onClose={() => setDialogOpen(null)} title="Edit repair details">
      <form action={workAction} className="grid gap-4 md:grid-cols-2">
        <input type="hidden" name="repair_id" value={repair.id} />
        <Field label="Technician"><Input name="technician_name" defaultValue={repair.technician_name || ''} /></Field>
        <Field label="Repair type"><Input name="repair_type" defaultValue={repair.repair_type || ''} /></Field>
        <div className="md:col-span-2"><Field label="Internal diagnosis"><Textarea name="diagnosis" defaultValue={repair.diagnosis || ''} className="min-h-24" /></Field></div>
        <Field label="Parts replaced"><Input name="parts_replaced" defaultValue={repair.parts_replaced || ''} /></Field>
        <Field label="Condition returned"><Input name="condition_returned" defaultValue={repair.condition_returned || ''} /></Field>
        <Field label="Parts cost"><Input name="parts_cost" type="number" min="0" defaultValue={repair.parts_cost} /></Field>
        <Field label="Labour cost"><Input name="labour_cost" type="number" min="0" defaultValue={repair.labour_cost} /></Field>
        <Field label="Repair warranty"><Input name="warranty_period" defaultValue={repair.warranty_period || ''} /></Field>
        <Field label="Warranty expiry"><Input name="warranty_expires_at" type="date" defaultValue={repair.warranty_expires_at || ''} /></Field>
        <div className="md:col-span-2"><Field label="Internal notes"><Textarea name="notes" defaultValue={repair.notes || ''} className="min-h-20" /></Field></div>
        <div className="md:col-span-2 flex items-center gap-3"><Button type="submit" disabled={workPending}>{workPending ? 'Saving...' : 'Save repair details'}</Button><ActionMessage state={workState} inline /></div>
      </form>
    </Dialog>

    <Dialog open={dialogOpen === 'quote'} onClose={() => setDialogOpen(null)} title={currentQuote ? 'Publish revised quote' : 'Publish repair quote'}>
      <form action={quoteAction} className="grid gap-4 md:grid-cols-2">
        <input type="hidden" name="repair_id" value={repair.id} />
        <div className="md:col-span-2"><Field label="Customer-safe diagnosis"><Textarea name="diagnosis_public" defaultValue={currentQuote?.diagnosis_public || repair.diagnosis || ''} required className="min-h-20" /></Field></div>
        <div className="md:col-span-2"><Field label="Proposed repair / work"><Textarea name="work_description" defaultValue={currentQuote?.work_description || repair.repair_type || ''} required className="min-h-20" /></Field></div>
        <Field label="Quoted amount"><Input name="quote_amount" type="number" min="0" defaultValue={currentQuote?.quote_amount || repair.amount_charged || 0} required /></Field>
        <Field label="Estimated completion"><Input name="estimated_completion" defaultValue={currentQuote?.estimated_completion || ''} placeholder="e.g. 2 working days" /></Field>
        <Field label="Payment before work"><Select name="payment_requirement" defaultValue={currentQuote?.payment_requirement || 'none'}><option value="none">No payment required</option><option value="partial">Partial deposit</option><option value="full">Full payment</option></Select></Field>
        <Field label="Deposit amount (partial only)"><Input name="required_before_start" type="number" min="0" defaultValue={currentQuote?.required_before_start || 0} /></Field>
        <div className="md:col-span-2 flex items-center gap-3"><Button type="submit" disabled={quotePending}>{quotePending ? 'Publishing...' : currentQuote ? 'Publish revised quote' : 'Publish quote'}</Button><ActionMessage state={quoteState} inline /></div>
      </form>
    </Dialog>

    <Dialog open={dialogOpen === 'approve_quote'} onClose={() => setDialogOpen(null)} title="Approve Quote" description="For when the customer confirms by phone or in person rather than through a self-service link. Record how and when they confirmed — this becomes part of the repair's record.">
      <form action={approveAction} className="space-y-4">
        <input type="hidden" name="repair_id" value={repair.id} />
        {currentQuote && <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700"><span className="font-bold">{money(currentQuote.quote_amount)}</span> — {currentQuote.work_description || 'Proposed repair work'}</div>}
        <Field label="Confirmation note"><Textarea name="confirmation_note" required placeholder="e.g. Called customer on 0803... at 2:15pm, they confirmed proceeding at this price." className="min-h-20" /></Field>
        <div className="flex items-center gap-3">
          <Button type="submit" variant="success" disabled={approvePending}>{approvePending ? 'Approving...' : 'Approve Quote'}</Button>
          <ActionMessage state={approveState} inline />
        </div>
      </form>
    </Dialog>

    <Dialog open={dialogOpen === 'record_payment'} onClose={() => setDialogOpen(null)} title="Record Payment" description="Log this payment against the repair's balance. Record each payment separately — never edit the total by hand.">
      <form action={paymentAction} className="grid gap-4 md:grid-cols-2">
        <input type="hidden" name="repair_id" value={repair.id} />
        {currentQuote && <div className="md:col-span-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">Balance due: <span className="font-bold">{money(repair.balance_due)}</span></div>}
        <Field label="Amount"><Input name="amount" type="number" min="1" required /></Field>
        <Field label="Method"><Select name="payment_method" defaultValue="bank_transfer"><option value="bank_transfer">Bank transfer</option><option value="pos">POS</option><option value="cash">Cash</option><option value="split">Split</option><option value="other">Other</option></Select></Field>
        <Field label="Reference"><Input name="reference" /></Field>
        <Field label="Paid at"><Input name="paid_at" type="datetime-local" /></Field>
        <div className="md:col-span-2"><Field label="Payment note"><Input name="note" /></Field></div>
        <div className="md:col-span-2 flex items-center gap-3"><Button type="submit" disabled={paymentPending}>{paymentPending ? 'Recording...' : 'Record payment'}</Button><ActionMessage state={paymentState} inline /></div>
      </form>
    </Dialog>

    <Dialog open={dialogOpen === 'confirm_collection'} onClose={() => setDialogOpen(null)} title="Confirm Collected" description="For when the customer picks up in person or you've confirmed by phone that a rider/agent handed the device over. Record how it was confirmed — this becomes part of the repair's record.">
      <form action={collectionAction} className="space-y-4">
        <input type="hidden" name="repair_id" value={repair.id} />
        <input type="hidden" name="has_card" value={activeAssignment ? 'true' : 'false'} />
        <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">Balance due: <span className="font-bold">{money(repair.balance_due)}</span>{repair.balance_due > 0 && <span className="ml-2 text-rose-600">Balance must be cleared before this can be confirmed.</span>}</div>
        {activeAssignment && <>
          <label className="flex items-center gap-2 text-sm font-bold text-slate-700"><input type="checkbox" name="card_returned" defaultChecked className="h-4 w-4" /> Physical Repair Card returned</label>
          <Field label="If not returned, reason"><Input name="missing_card_reason" placeholder="Only needed if the card above is unchecked" /></Field>
        </>}
        <Field label="Confirmation note"><Textarea name="confirmation_note" required placeholder="e.g. Customer collected in person on 15 Sep, ID verified at front desk." className="min-h-20" /></Field>
        <div className="flex items-center gap-3">
          <Button type="submit" variant="success" disabled={collectionPending}>{collectionPending ? 'Confirming...' : 'Confirm Collected'}</Button>
          <ActionMessage state={collectionState} inline />
        </div>
      </form>
    </Dialog>

    <Dialog open={dialogOpen === 'release_override'} onClose={() => setDialogOpen(null)} title="Release Without Full Payment" description="Only an authorised administrator can do this. Use it when release was approved despite an outstanding balance — e.g. confirmed by phone that the customer will settle later.">
      <form action={releaseAction} className="space-y-4">
        <input type="hidden" name="repair_id" value={repair.id} />
        <input type="hidden" name="has_card" value={activeAssignment ? 'true' : 'false'} />
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Outstanding balance at release: <span className="font-bold">{money(repair.balance_due)}</span></div>
        {activeAssignment && <>
          <label className="flex items-center gap-2 text-sm font-bold text-slate-700"><input type="checkbox" name="card_returned" defaultChecked className="h-4 w-4" /> Physical Repair Card returned</label>
          <Field label="If not returned, reason"><Input name="missing_card_reason" placeholder="Only needed if the card above is unchecked" /></Field>
        </>}
        <Field label="Approval note"><Textarea name="confirmation_note" required placeholder="e.g. Approved by [administrator name] via phone at 3pm — customer will settle the balance on their next visit." className="min-h-20" /></Field>
        <div className="flex items-center gap-3">
          <Button type="submit" variant="outline" className="border-amber-300 text-amber-800" disabled={releasePending}>{releasePending ? 'Releasing...' : 'Release Without Full Payment'}</Button>
          <ActionMessage state={releaseState} inline />
        </div>
      </form>
    </Dialog>

    <Dialog open={dialogOpen === 'cancel'} onClose={() => setDialogOpen(null)} title="Cancel this repair" description="This closes the job permanently. A reason is required for the record.">
      <form action={workflowAction} className="space-y-4">
        <input type="hidden" name="repair_id" value={repair.id} />
        <input type="hidden" name="status" value="cancelled" />
        <Field label="Cancellation reason"><Textarea name="note" required className="min-h-20" /></Field>
        <div className="flex items-center gap-3">
          <Button type="submit" variant="outline" disabled={workflowPending} className="border-rose-200 text-rose-700">{workflowPending ? 'Cancelling...' : 'Cancel Repair'}</Button>
          <ActionMessage state={workflowState} inline />
        </div>
      </form>
    </Dialog>
  </div>;
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <CardHeader className="p-0">
        <CardTitle className="text-sm">{title}</CardTitle>
        <CardDescription>{subtitle}</CardDescription>
      </CardHeader>
      <CardContent className="p-0 pt-4">{children}</CardContent>
    </Card>
  );
}
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-sm font-black capitalize text-slate-800">{value}</p></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span>{children}</label>; }
function ActionMessage({ state, inline = false }: { state: SalesActionState; inline?: boolean }) { if (!state.message) return null; return <p className={`${inline ? 'text-xs' : 'mt-3 text-xs'} font-bold ${state.success ? 'text-emerald-700' : 'text-rose-700'}`}>{state.message}</p>; }
