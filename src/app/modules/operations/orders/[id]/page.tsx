import Link from 'next/link';
import { ArrowLeft, ArrowRight, CheckCircle2, Clock3 } from 'lucide-react';
import { HelpTip } from '@/components/ui/help-tip';
import {
  acknowledgeHandoverAction,
  changeOrderStatusAction,
  confirmOrderAction,
  createHandoverAction,
} from '@/app/modules/operations/actions';
import {
  canTransitionOrderStatus,
  getOrderStatusLabel,
  type OrderStatus,
} from '@/lib/operations/domain';
import { getCrmStageName, getOperationsOrderDetail } from '@/lib/operations/tracking-server';

const allStatuses: OrderStatus[] = [
  'new','confirmed','stock_check','assigned','picking','packing','ready_dispatch',
  'dispatched','delivered','completed','on_hold','cancelled',
];

const money = (value: number | null | undefined) => `₦${Number(value || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

export default async function OperationsOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { order, events, handoffs, reservations, users, locations, identity, ambassador } = await getOperationsOrderDetail(id);
  const allowedStatuses = allStatuses.filter((status) => canTransitionOrderStatus(order.status, status));
  const locationMap = new Map(locations.map((location) => [location.id, location.name]));
  const activeReservations = reservations.filter((reservation) => reservation.status === 'active');
  const nextAction = getNextAction(order.commercial_state, order.status, activeReservations.length);

  return (
    <div className="mx-auto max-w-[1350px]">
      <Link href="/modules/operations/orders" className="mb-4 inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-[#032489]">
        <ArrowLeft className="h-4 w-4" /> Back to orders
      </Link>

      <div className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight text-[#032489] md:text-3xl">{order.order_code}</h1>
              <span className={`rounded-full px-3 py-1 text-xs font-black capitalize ${order.commercial_state === 'confirmed' ? 'bg-blue-50 text-[#032489]' : 'bg-slate-100 text-slate-600'}`}>{order.commercial_state}</span>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-[#032489]">{getOrderStatusLabel(order.status)}</span>
              <span className={`rounded-full px-3 py-1 text-xs font-black capitalize ${order.priority === 'urgent' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>{order.priority}</span>
            </div>
            <p className="mt-2 text-sm font-black text-slate-900">{order.customer_name || order.reference_label || 'Internal order'}</p>
            <p className="mt-1 text-xs text-slate-500">{order.customer_phone || 'No phone'}{order.customer_email ? ` · ${order.customer_email}` : ''}</p>
          </div>

          <div className="grid gap-2 text-sm sm:grid-cols-2 lg:min-w-[430px]">
            <Info label="Current team" value={order.current_team || 'Unassigned'} />
            <Info label="Current owner" value={userName(users, order.current_owner_id) || 'Unassigned'} />
            <Info label="Due" value={order.due_at ? formatDate(order.due_at) : 'No deadline'} />
            <Info label="Last updated" value={formatDate(order.updated_at)} />
          </div>
        </div>
      </div>

      {order.commercial_state === 'draft' && (
        <section className="mb-5 rounded-xl border border-blue-200 bg-blue-50/60 p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <div className="flex items-center gap-2"><h2 className="font-black text-[#032489]">Ready to confirm?</h2><HelpTip text="A draft is only preparation. Confirming the order can reserve stock, move the CRM customer to Purchase if needed, and create pending Ambassador commission." label="About confirming an order" /></div>
              <p className="mt-1 text-sm text-slate-600">Confirm only when the customer/order is real. Total: <strong>{money(order.total_amount)}</strong>{ambassador ? ` · Ambassador: ${ambassador.name}` : ''}</p>
            </div>
            <form action={confirmOrderAction}>
              <input type="hidden" name="order_id" value={order.id} />
              <button className="rounded-lg bg-[#032489] px-5 py-2.5 text-sm font-black text-white hover:bg-[#021d70]">Confirm order</button>
            </form>
          </div>
        </section>
      )}

      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2"><h2 className="text-sm font-black text-slate-900">Customer</h2><HelpTip text="This is the customer linked to the order. Full history stays inside CRM so this page stays simple." label="About Customer" /></div>
          <p className="mt-3 text-base font-black text-slate-900">{identity?.primary_name || order.customer_name || 'Unknown customer'}</p>
          <p className="mt-1 text-xs text-slate-500">{identity?.identity_code || 'No linked CRM Identity'}</p>
          {identity && <p className="mt-3 text-xs font-bold text-[#032489]">CRM Stage {identity.crm_stage}: {getCrmStageName(identity.crm_stage)}</p>}
          {order.lead_id && <p className="mt-2 text-xs text-slate-500">Lead linked</p>}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2"><h2 className="text-sm font-black text-slate-900">Price & payment</h2><HelpTip text="This is the frozen money summary for this order. It does not change just because the website price changes later." label="About Price and payment" /></div>
          <MoneyRow label="Items" value={order.subtotal} />
          {order.discount_amount > 0 && <MoneyRow label={`Discount${order.discount_type ? ` · ${order.discount_type.replaceAll('_', ' ')}` : ''}`} value={-order.discount_amount} />}
          {order.cash_off_amount > 0 && <MoneyRow label="Cash-Off" value={-order.cash_off_amount} />}
          {order.delivery_charge > 0 && <MoneyRow label="Delivery" value={order.delivery_charge} />}
          <div className="mt-3 border-t border-slate-100 pt-3"><MoneyRow label="Order total" value={order.total_amount} strong /></div>
          <div className="mt-2 flex items-center justify-between text-xs"><span className="text-slate-500">Payment</span><span className="font-black capitalize text-slate-700">{order.payment_status} · {money(order.amount_paid)}</span></div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2"><h2 className="text-sm font-black text-slate-900">Source & commission</h2><HelpTip text="This keeps who originally brought the sale. Moving the order to another team does not remove their credit." label="About Source and commission" /></div>
          <p className="mt-3 text-xs text-slate-500">Source</p><p className="mt-1 text-sm font-black capitalize text-slate-900">{order.acquisition_source || order.source_type}</p>
          <p className="mt-3 text-xs text-slate-500">Ambassador</p><p className="mt-1 text-sm font-bold text-slate-800">{ambassador?.name || 'No Ambassador attribution'}</p>
          {ambassador && <div className="mt-3 rounded-lg bg-slate-50 p-3"><div className="flex justify-between text-xs"><span className="text-slate-500">Commission</span><strong>{order.commission_rate}%</strong></div><div className="mt-1 flex justify-between text-sm"><span className="capitalize text-slate-600">{order.commission_status}</span><strong className="text-[#032489]">{money(order.commission_amount)}</strong></div></div>}
        </section>
      </div>

      <section className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2"><h2 className="text-sm font-black text-slate-900">Next action</h2><HelpTip text="This tells the team the clearest thing that should happen next on this order." label="About Next action" /></div>
        <p className="mt-3 text-lg font-black text-[#032489]">{nextAction.title}</p>
        <p className="mt-1 text-sm text-slate-500">{nextAction.detail}</p>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
        <div className="space-y-5">
          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-black text-slate-900">Order items & fulfilment</h2><HelpTip text="This shows what is being sold and where Operations plans to get it from. Reserved stock is kept aside for this confirmed order." label="About fulfilment" /></div>
            <div className="divide-y divide-slate-100">
              {(order.items || []).map((item) => (
                <div key={item.id} className="px-5 py-4">
                  <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                    <div><p className="text-sm font-black text-slate-800">{item.item_name} × {item.quantity}</p><p className="mt-1 text-xs text-slate-500">{item.fulfilment_source === 'internal' ? `EmmyTech stock${item.source_location_id ? ` · ${locationMap.get(item.source_location_id) || 'Selected location'}` : ''}` : item.fulfilment_source.replaceAll('_', ' ')}</p></div>
                    <div className="text-right"><p className="text-sm font-black text-slate-900">{money(item.line_total || (Number(item.unit_price || 0) * item.quantity))}</p><p className="mt-1 text-xs text-slate-400">Reserved {item.quantity_reserved} / {item.quantity}</p></div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4"><div className="flex items-center gap-2"><h2 className="text-sm font-black text-slate-900">Order timeline</h2><HelpTip text="Only important Operations events are shown here. Full CRM and Spin Wheel history stays in those modules." label="About Order timeline" /></div></div>
            {events.length === 0 ? <div className="px-5 py-12 text-center text-sm text-slate-400">No activity yet.</div> : <div className="divide-y divide-slate-100">{events.map((event) => <div key={event.id} className="flex gap-4 px-5 py-4"><div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[#032489]"><Clock3 className="h-4 w-4" /></div><div className="min-w-0"><p className="text-sm font-black text-slate-800">{event.title}</p>{(event.from_status || event.to_status) && <p className="mt-1 text-xs font-semibold text-slate-500">{event.from_status ? getOrderStatusLabel(event.from_status as OrderStatus) : '—'} <ArrowRight className="mx-1 inline h-3 w-3" /> {event.to_status ? getOrderStatusLabel(event.to_status as OrderStatus) : '—'}</p>}{event.note && <p className="mt-1 text-xs leading-5 text-slate-500">{event.note}</p>}<p className="mt-1.5 text-[11px] font-semibold text-slate-400">{formatDate(event.created_at)}</p></div></div>)}</div>}
          </section>
        </div>

        <div className="space-y-5">
          {order.commercial_state === 'confirmed' && (
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2"><h2 className="text-sm font-black text-slate-900">Move fulfilment forward</h2><HelpTip text="Use this after the order is confirmed. It moves the physical Operations work to the next valid step." label="About fulfilment status" /></div>
              {allowedStatuses.length === 0 ? <div className="mt-4 rounded-lg bg-slate-50 p-4 text-sm font-bold text-slate-500">This order has no further status moves.</div> : <form action={changeOrderStatusAction} className="mt-4 space-y-3"><input type="hidden" name="order_id" value={order.id} /><select name="status" className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-bold outline-none focus:border-[#032489]" defaultValue={allowedStatuses[0]}>{allowedStatuses.map((status) => <option key={status} value={status}>{getOrderStatusLabel(status)}</option>)}</select><textarea name="note" className="min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#032489]" placeholder="Optional note" /><button className="w-full rounded-lg bg-[#032489] px-4 py-2.5 text-sm font-black text-white">Update fulfilment</button></form>}
            </section>
          )}

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2"><h2 className="text-sm font-black text-slate-900">Hand over responsibility</h2><HelpTip text="Pass responsibility to another team or staff member. The new owner becomes current after they acknowledge it." label="About handover" /></div>
            <form action={createHandoverAction} className="mt-4 space-y-3"><input type="hidden" name="order_id" value={order.id} /><input name="to_team" required className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#032489]" placeholder="Destination team, e.g. Dispatch" /><select name="to_user_id" className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#032489]" defaultValue=""><option value="">No specific owner</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name || user.email || user.id}</option>)}</select><textarea name="note" className="min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#032489]" placeholder="What should happen next?" /><button className="w-full rounded-lg bg-[#032489] px-4 py-2.5 text-sm font-black text-white">Create handover</button></form>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-black text-slate-900">Handovers</h2></div>
            {handoffs.length === 0 ? <div className="px-5 py-10 text-center text-sm text-slate-400">No handovers yet.</div> : <div className="divide-y divide-slate-100">{handoffs.map((handoff) => <div key={handoff.id} className="px-5 py-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-black text-slate-800">{handoff.from_team || 'Unassigned'} <ArrowRight className="mx-1 inline h-3.5 w-3.5" /> {handoff.to_team}</p><p className="mt-1 text-xs text-slate-500">Owner: {userName(users, handoff.to_user_id) || 'Team queue'}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${handoff.status === 'acknowledged' ? 'bg-blue-50 text-[#032489]' : 'bg-amber-50 text-amber-700'}`}>{handoff.status}</span></div>{handoff.note && <p className="mt-2 text-xs leading-5 text-slate-500">{handoff.note}</p>}{handoff.status === 'pending' && <form action={acknowledgeHandoverAction} className="mt-3"><input type="hidden" name="handover_id" value={handoff.id} /><input type="hidden" name="order_id" value={order.id} /><button className="inline-flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-xs font-black text-[#032489]"><CheckCircle2 className="h-3.5 w-3.5" /> Acknowledge receipt</button></form>}</div>)}</div>}
          </section>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-slate-50 px-3 py-2.5"><p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-xs font-bold text-slate-700">{value}</p></div>; }
function MoneyRow({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) { return <div className="mt-2 flex items-center justify-between gap-3"><span className={`${strong ? 'font-black text-slate-800' : 'text-slate-500'} text-xs capitalize`}>{label}</span><span className={`${strong ? 'text-base text-[#032489]' : 'text-sm text-slate-800'} font-black`}>{value < 0 ? `-${money(Math.abs(value))}` : money(value)}</span></div>; }
function formatDate(value: string) { return new Date(value).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }); }
function userName(users: Array<{ id: string; name: string | null; email: string | null }>, id: string | null) { if (!id) return null; const user = users.find((item) => item.id === id); return user?.name || user?.email || id; }
function getNextAction(commercialState: string, status: string, activeReservations: number) {
  if (commercialState === 'draft') return { title: 'Review and confirm the order', detail: 'Check the customer, price, discount, source and stock plan. Confirm only when the order is real.' };
  if (status === 'new' && activeReservations > 0) return { title: 'Start fulfilment', detail: 'Stock is reserved. Move the order into the next Operations step when the team starts work.' };
  if (status === 'new') return { title: 'Check fulfilment source', detail: 'No internal stock is reserved. Confirm where the item will come from before moving forward.' };
  if (status === 'ready_dispatch') return { title: 'Arrange dispatch', detail: 'The order is ready to leave EmmyTech. Assign who will carry it and record the handover.' };
  if (status === 'dispatched') return { title: 'Confirm delivery', detail: 'The order has left. Confirm it reaches the customer or destination.' };
  if (status === 'delivered') return { title: 'Complete the order', detail: 'Delivery is recorded. Complete the order after final checks.' };
  if (status === 'completed') return { title: 'No action needed', detail: 'This order is complete.' };
  if (status === 'cancelled') return { title: 'Order cancelled', detail: 'No further fulfilment should continue.' };
  return { title: `Continue ${getOrderStatusLabel(status as OrderStatus)}`, detail: 'Finish the current Operations step, then move the order forward.' };
}
