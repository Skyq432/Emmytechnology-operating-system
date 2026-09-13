'use client';

import { useActionState, useMemo } from 'react';
import {
  addRepairPartAction,
  publishRepairQuoteAction,
  recordRepairPaymentAction,
  regenerateRepairPinAction,
  removeRepairPartAction,
  saveRepairWorkAction,
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
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ActionResult } from '@/components/ui/alert';

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
  const [workState, workAction, workPending] = useActionState(saveRepairWorkAction, initialState);
  const [quoteState, quoteAction, quotePending] = useActionState(publishRepairQuoteAction, initialState);
  const [paymentState, paymentAction, paymentPending] = useActionState(recordRepairPaymentAction, initialState);
  const [pinState, pinAction, pinPending] = useActionState(regenerateRepairPinAction, initialState);
  const [workflowState, workflowAction, workflowPending] = useActionState(updateRepairStatusAction, initialState);
  const [partState, partAction, partPending] = useActionState(addRepairPartAction, initialState);
  const quantityTrackedInventory = useMemo(() => inventory.filter((item) => !item.serial_tracking), [inventory]);

  const cashOffAmount = Number((repair as OperationsRepair & { cash_off_amount?: number }).cash_off_amount || 0);
  const effectivePaid = repair.amount_paid + cashOffAmount;
  const workflowActions = useMemo(() => getRepairWorkflowActions({
    status: repair.status,
    quoteStatus: currentQuote?.status || null,
    amountPaid: effectivePaid,
    requiredBeforeStart: currentQuote?.required_before_start || 0,
  }), [repair.status, effectivePaid, currentQuote]);

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
        </div> : <p className="text-sm text-slate-500">No active Repair Card assignment.</p>}
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
          {workflowActions.map((item) => item.key === 'publish_quote' ? <div key={item.key} className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-bold text-emmy-primary">Use the Quote panel below to {item.label.toLowerCase()}.</div> : <form key={item.key} action={workflowAction} className="flex gap-2"><input type="hidden" name="repair_id" value={repair.id} /><input type="hidden" name="status" value={item.status || ''} />{item.key === 'cancel' && <Input name="note" required placeholder="Cancellation reason" className="min-w-0 flex-1" />}<Button type="submit" variant={item.key === 'cancel' ? 'outline' : 'default'} disabled={workflowPending} className={item.key === 'cancel' ? 'border-rose-200 text-rose-700' : ''}>{item.label}</Button></form>)}
          <ActionResult state={workflowState} />
        </div>}
      </Panel>
    </div>

    <div className="grid gap-5 xl:grid-cols-2">
      <Panel title="Technician & repair details" subtitle="Internal work details. Save these as diagnosis and repair work progresses.">
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

      <Panel title={currentQuote ? 'Publish revised quote' : 'Publish repair quote'} subtitle="This is the customer-facing price. Publishing a revision creates a new version instead of overwriting an approved quote.">
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
        {quoteHistory.length > 0 && <div className="mt-5 border-t border-slate-100 pt-4"><p className="text-xs font-black uppercase tracking-wide text-slate-400">Quote history</p><div className="mt-3 space-y-2">{quoteHistory.map((quote) => <div key={quote.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"><div><p className="text-sm font-black text-slate-800">Version {quote.version} · {money(quote.quote_amount)}</p><p className="mt-0.5 text-xs text-slate-500">{quote.payment_requirement.replaceAll('_',' ')} · {dateTime(quote.published_at || quote.created_at)}</p></div><Badge variant="outline" className="uppercase">{quote.status}</Badge></div>)}</div></div>}
      </Panel>
    </div>

    <div className="grid gap-5 xl:grid-cols-2">
      <Panel title="Repair payments" subtitle="Record every customer payment separately. Do not overwrite the total manually.">
        <form action={paymentAction} className="grid gap-3 md:grid-cols-2">
          <input type="hidden" name="repair_id" value={repair.id} />
          <Field label="Amount"><Input name="amount" type="number" min="1" required /></Field>
          <Field label="Method"><Select name="payment_method" defaultValue="bank_transfer"><option value="bank_transfer">Bank transfer</option><option value="pos">POS</option><option value="cash">Cash</option><option value="split">Split</option><option value="other">Other</option></Select></Field>
          <Field label="Reference"><Input name="reference" /></Field>
          <Field label="Paid at"><Input name="paid_at" type="datetime-local" /></Field>
          <div className="md:col-span-2"><Field label="Payment note"><Input name="note" /></Field></div>
          <div className="md:col-span-2 flex items-center gap-3"><Button type="submit" disabled={paymentPending || !currentQuote}>{paymentPending ? 'Recording...' : 'Record payment'}</Button>{!currentQuote && <span className="text-xs font-bold text-amber-700">Publish a quote first.</span>}<ActionMessage state={paymentState} inline /></div>
        </form>
        {payments.length > 0 && <div className="mt-5 space-y-2">{payments.map((payment) => <div key={payment.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2"><div><p className="text-sm font-black text-slate-800">{money(payment.amount)} · {payment.payment_method.replaceAll('_',' ')}</p><p className="mt-0.5 text-xs text-slate-500">{dateTime(payment.paid_at)}{payment.reference ? ` · ${payment.reference}` : ''}</p></div>{payment.is_void && <Badge variant="danger" className="uppercase">Void</Badge>}</div>)}</div>}
      </Panel>

      <Panel title="Repair timeline" subtitle="Important internal and customer-visible milestones for this job.">
        {events.length === 0 ? <p className="text-sm text-slate-500">No workflow events recorded yet.</p> : <div className="space-y-3">{events.slice(0, 12).map((event) => <div key={event.id} className="relative border-l-2 border-slate-100 pl-4"><span className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-emmy-primary" /><p className="text-sm font-black text-slate-800">{event.title}</p><p className="mt-0.5 text-xs text-slate-400">{dateTime(event.created_at)}{event.customer_visible ? ' · Customer visible' : ''}</p>{event.note && <p className="mt-1 text-xs text-slate-600">{event.note}</p>}</div>)}</div>}
      </Panel>
    </div>
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
