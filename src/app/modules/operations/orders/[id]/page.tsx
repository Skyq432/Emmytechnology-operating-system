import Link from 'next/link';
import { ArrowLeft, ArrowRight, CheckCircle2, Clock3 } from 'lucide-react';
import { HelpTip } from '@/components/ui/help-tip';
import {
  acknowledgeHandoverAction,
  changeOrderStatusAction,
  confirmOrderAction,
  createHandoverAction,
  updateDraftAttributionAction,
} from '@/app/modules/operations/actions';
import {
  canTransitionOrderStatus,
  getOrderStatusLabel,
  type OrderStatus,
} from '@/lib/operations/domain';
import { getOperationsAmbassadors } from '@/lib/operations/attribution-server';
import { getCrmStageName, getOperationsOrderDetail } from '@/lib/operations/tracking-server';

const allStatuses: OrderStatus[] = [
  'new','confirmed','stock_check','assigned','picking','packing','ready_dispatch',
  'dispatched','delivered','completed','on_hold','cancelled',
];
const money = (value: number | null | undefined) => `₦${Number(value || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

export default async function OperationsOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ order, events, handoffs, reservations, users, locations, identity, ambassador }, ambassadors] = await Promise.all([
    getOperationsOrderDetail(id),
    getOperationsAmbassadors(),
  ]);
  const allowedStatuses = allStatuses.filter((status) => canTransitionOrderStatus(order.status, status));
  const activeReservations = reservations.filter((reservation) => reservation.status === 'active');
  const locationMap = new Map(locations.map((location) => [location.id, location.name]));
  const next = getNextAction(order.commercial_state, order.status, activeReservations.length);
  const estimatedCommission = order.ambassador_id ? Number(order.total_amount || 0) * Number(order.commission_rate || 0) / 100 : 0;

  return (
    <div className="mx-auto max-w-[1350px]">
      <Link href="/modules/operations/orders" className="mb-4 inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-[#032489]"><ArrowLeft className="h-4 w-4" /> Back to orders</Link>

      <div className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-4 lg:flex-row">
          <div>
            <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-black text-[#032489] md:text-3xl">{order.order_code}</h1><Badge text={order.commercial_state} blue={order.commercial_state === 'confirmed'} /><Badge text={getOrderStatusLabel(order.status)} blue /></div>
            <p className="mt-2 text-sm font-black text-slate-900">{order.customer_name || order.reference_label || 'Internal order'}</p>
            <p className="mt-1 text-xs text-slate-500">{order.customer_phone || 'No phone'}{order.customer_email ? ` · ${order.customer_email}` : ''}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[420px]"><Info label="Team" value={order.current_team || 'Unassigned'} /><Info label="Due" value={order.due_at ? formatDate(order.due_at) : 'No deadline'} /><Info label="Priority" value={order.priority} /><Info label="Updated" value={formatDate(order.updated_at)} /></div>
        </div>
      </div>

      {order.commercial_state === 'draft' && (
        <section className="mb-5 rounded-xl border border-blue-200 bg-blue-50/60 p-5">
          <div className="flex items-start gap-2"><div><h2 className="font-black text-[#032489]">Review before confirmation</h2><p className="mt-1 text-sm text-slate-600">Check the customer, price, Ambassador, commission and fulfilment source. Confirmation is what triggers CRM/stock/commission actions.</p></div><HelpTip text="Draft is preparation only. Confirm when the sale is real." label="About confirming" /></div>

          <form action={updateDraftAttributionAction} className="mt-4 grid gap-3 rounded-lg bg-white p-4 md:grid-cols-[1fr_180px_auto] md:items-end">
            <input type="hidden" name="order_id" value={order.id} />
            <input type="hidden" name="attribution_source" value="manual_admin" />
            <Field label="Ambassador"><select name="ambassador_id" defaultValue={order.ambassador_id || ''} className="input"><option value="">No Ambassador</option>{ambassadors.map((item) => <option key={item.id} value={item.id}>{item.name}{item.tag ? ` · ${item.tag}` : ''}</option>)}</select></Field>
            <Field label="Commission %"><input name="commission_rate" type="number" min="0" step="0.01" defaultValue={Number(order.commission_rate || 0)} className="input" /></Field>
            <button className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-black text-[#032489]">Save attribution</button>
          </form>

          <div className="mt-4 flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <p className="text-sm text-slate-600">Total <strong>{money(order.total_amount)}</strong>{order.ambassador_id ? ` · Estimated commission ${money(estimatedCommission)}` : ' · No Ambassador commission'}</p>
            <form action={confirmOrderAction}><input type="hidden" name="order_id" value={order.id} /><button className="rounded-lg bg-[#032489] px-5 py-2.5 text-sm font-black text-white">Confirm order</button></form>
          </div>
        </section>
      )}

      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <Card title="Customer" help="The full customer history stays in CRM. This card only shows what Operations needs."><p className="mt-3 font-black text-slate-900">{identity?.primary_name || order.customer_name || 'Unknown customer'}</p><p className="mt-1 text-xs text-slate-500">{identity?.identity_code || 'No linked CRM Identity'}</p>{identity && <p className="mt-3 text-xs font-bold text-[#032489]">CRM Stage {identity.crm_stage}: {getCrmStageName(identity.crm_stage)}</p>}</Card>
        <Card title="Price & payment" help="The commercial snapshot stays fixed on the Order."><MoneyRow label="Items" value={order.subtotal} />{order.discount_amount > 0 && <MoneyRow label="Discount" value={-order.discount_amount} />}{order.cash_off_amount > 0 && <MoneyRow label="Cash-Off" value={-order.cash_off_amount} />}{order.delivery_charge > 0 && <MoneyRow label="Delivery" value={order.delivery_charge} />}<div className="mt-2 border-t pt-2"><MoneyRow label="Total" value={order.total_amount} strong /></div><p className="mt-2 text-xs text-slate-500">Payment: <strong className="capitalize">{order.payment_status}</strong> · {money(order.amount_paid)}</p></Card>
        <Card title="Source & commission" help="Original Ambassador credit survives later handovers."><p className="mt-3 text-xs text-slate-500">Source</p><p className="font-black capitalize text-slate-900">{order.acquisition_source || order.source_type}</p><p className="mt-3 text-xs text-slate-500">Ambassador</p><p className="font-bold text-slate-800">{ambassador?.name || 'No Ambassador attribution'}</p>{order.ambassador_id && <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm"><div className="flex justify-between"><span>{order.commission_rate}%</span><strong>{money(order.commission_amount || estimatedCommission)}</strong></div><p className="mt-1 text-xs capitalize text-slate-500">{order.commission_status}</p></div>}</Card>
      </div>

      <section className="mb-5 rounded-xl border border-blue-100 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><h2 className="text-sm font-black">Next action</h2><HelpTip text="This is the clearest next thing staff should do on this Order." label="About next action" /></div><p className="mt-3 text-lg font-black text-[#032489]">{next.title}</p><p className="mt-1 text-sm text-slate-500">{next.detail}</p></section>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
        <div className="space-y-5">
          <section className="rounded-xl border border-slate-200 bg-white shadow-sm"><div className="border-b px-5 py-4"><h2 className="text-sm font-black">Order items & fulfilment</h2></div><div className="divide-y">{(order.items || []).map((item) => <div key={item.id} className="flex justify-between gap-4 px-5 py-4"><div><p className="text-sm font-black">{item.item_name} × {item.quantity}</p><p className="mt-1 text-xs text-slate-500">{item.fulfilment_source === 'internal' ? `EmmyTech stock${item.source_location_id ? ` · ${locationMap.get(item.source_location_id) || 'Location'}` : ''}` : item.fulfilment_source}</p></div><div className="text-right"><p className="font-black">{money(item.line_total || Number(item.unit_price || 0) * item.quantity)}</p><p className="mt-1 text-xs text-slate-400">Reserved {item.quantity_reserved}/{item.quantity}</p></div></div>)}</div></section>
          <section className="rounded-xl border border-slate-200 bg-white shadow-sm"><div className="border-b px-5 py-4"><h2 className="text-sm font-black">Order timeline</h2></div>{events.length === 0 ? <div className="p-8 text-center text-sm text-slate-400">No activity yet.</div> : <div className="divide-y">{events.map((event) => <div key={event.id} className="flex gap-3 px-5 py-4"><div className="grid h-8 w-8 place-items-center rounded-full bg-blue-50 text-[#032489]"><Clock3 className="h-4 w-4" /></div><div><p className="text-sm font-black">{event.title}</p>{event.note && <p className="mt-1 text-xs text-slate-500">{event.note}</p>}<p className="mt-1 text-[11px] text-slate-400">{formatDate(event.created_at)}</p></div></div>)}</div>}</section>
        </div>

        <div className="space-y-5">
          {order.commercial_state === 'confirmed' && <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-sm font-black">Move fulfilment forward</h2>{allowedStatuses.length === 0 ? <p className="mt-3 text-sm text-slate-500">No further status move.</p> : <form action={changeOrderStatusAction} className="mt-4 space-y-3"><input type="hidden" name="order_id" value={order.id} /><select name="status" defaultValue={allowedStatuses[0]} className="input">{allowedStatuses.map((s) => <option key={s} value={s}>{getOrderStatusLabel(s)}</option>)}</select><textarea name="note" className="input min-h-20" placeholder="Optional note" /><button className="w-full rounded-lg bg-[#032489] px-4 py-2.5 text-sm font-black text-white">Update fulfilment</button></form>}</section>}

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-sm font-black">Hand over responsibility</h2><form action={createHandoverAction} className="mt-4 space-y-3"><input type="hidden" name="order_id" value={order.id} /><input name="to_team" required className="input" placeholder="Destination team" /><select name="to_user_id" className="input" defaultValue=""><option value="">No specific owner</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name || user.email}</option>)}</select><textarea name="note" className="input min-h-20" placeholder="What should happen next?" /><button className="w-full rounded-lg bg-[#032489] px-4 py-2.5 text-sm font-black text-white">Create handover</button></form></section>

          {handoffs.length > 0 && <section className="rounded-xl border border-slate-200 bg-white shadow-sm"><div className="border-b px-5 py-4"><h2 className="text-sm font-black">Handovers</h2></div><div className="divide-y">{handoffs.map((handoff) => <div key={handoff.id} className="p-4"><p className="text-sm font-black">{handoff.from_team || 'Unassigned'} <ArrowRight className="inline h-3 w-3" /> {handoff.to_team}</p><p className="mt-1 text-xs capitalize text-slate-500">{handoff.status}</p>{handoff.status === 'pending' && <form action={acknowledgeHandoverAction} className="mt-2"><input type="hidden" name="handover_id" value={handoff.id} /><input type="hidden" name="order_id" value={order.id} /><button className="inline-flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-xs font-black text-[#032489]"><CheckCircle2 className="h-3.5 w-3.5" /> Acknowledge</button></form>}</div>)}</div></section>}
        </div>
      </div>
      <style>{`.input{width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;font-size:14px;outline:none;background:#fff}.input:focus{border-color:#032489;box-shadow:0 0 0 3px rgba(3,36,137,.08)}`}</style>
    </div>
  );
}

function getNextAction(commercial: string, status: OrderStatus, reservations: number) {
  if (commercial === 'draft') return { title: 'Review & confirm this Order', detail: 'Check Ambassador commission, price and fulfilment source, then confirm the Order.' };
  if (status === 'new') return { title: reservations > 0 ? 'Move to Stock Check' : 'Check how the Order will be fulfilled', detail: reservations > 0 ? 'Stock is reserved. Continue the fulfilment workflow.' : 'No stock reservation exists yet. Confirm the fulfilment source before moving forward.' };
  const next: Record<string, string> = { confirmed: 'Complete stock check', stock_check: 'Assign the Order', assigned: 'Start picking', picking: 'Pack the Order', packing: 'Prepare for dispatch', ready_dispatch: 'Dispatch the Order', dispatched: 'Confirm delivery', delivered: 'Complete the Order', on_hold: 'Resolve the hold or cancel' };
  return { title: next[status] || 'Order complete', detail: status === 'completed' || status === 'cancelled' ? 'No further action is required.' : 'Use the fulfilment control to record the next valid step.' };
}

function Card({ title, help, children }: { title: string; help: string; children: React.ReactNode }) { return <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><h2 className="text-sm font-black">{title}</h2><HelpTip text={help} label={`About ${title}`} /></div>{children}</section>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label><span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span>{children}</label>; }
function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-slate-50 px-3 py-2"><p className="text-[10px] font-black uppercase text-slate-400">{label}</p><p className="mt-1 text-xs font-bold capitalize text-slate-700">{value}</p></div>; }
function Badge({ text, blue = false }: { text: string; blue?: boolean }) { return <span className={`rounded-full px-3 py-1 text-xs font-black capitalize ${blue ? 'bg-blue-50 text-[#032489]' : 'bg-slate-100 text-slate-600'}`}>{text}</span>; }
function MoneyRow({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) { return <div className={`mt-2 flex justify-between text-sm ${strong ? 'font-black' : ''}`}><span className="text-slate-500">{label}</span><span className="text-slate-900">{money(value)}</span></div>; }
function formatDate(value: string) { return new Date(value).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }); }
