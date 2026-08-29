import Link from 'next/link';
import { ArrowLeft, ArrowRight, CheckCircle2, Clock3, UserRound } from 'lucide-react';
import {
  acknowledgeHandoverAction,
  changeOrderStatusAction,
  createHandoverAction,
} from '@/app/modules/operations/actions';
import {
  canTransitionOrderStatus,
  getOrderStatusLabel,
  type OrderStatus,
} from '@/lib/operations/domain';
import { getOperationsOrderDetail } from '@/lib/operations/tracking-server';

const allStatuses: OrderStatus[] = [
  'new','confirmed','stock_check','assigned','picking','packing','ready_dispatch',
  'dispatched','delivered','completed','on_hold','cancelled',
];

export default async function OperationsOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { order, events, handoffs, users } = await getOperationsOrderDetail(id);
  const allowedStatuses = allStatuses.filter((status) => canTransitionOrderStatus(order.status, status));

  return (
    <div className="mx-auto max-w-[1350px]">
      <Link href="/modules/operations/orders" className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-[#032489]">
        <ArrowLeft className="h-4 w-4" /> Back to orders
      </Link>

      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight text-[#032489] md:text-3xl">{order.order_code}</h1>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-800">{getOrderStatusLabel(order.status)}</span>
              <span className={`rounded-full px-3 py-1 text-xs font-black capitalize ${order.priority === 'urgent' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>{order.priority}</span>
            </div>
            <p className="mt-2 text-sm font-bold text-slate-800">{order.customer_name || order.reference_label || 'Internal order'}</p>
            <p className="mt-1 text-xs text-slate-500">Source: {order.source_type}{order.source_reference ? ` · ${order.source_reference}` : ''}</p>
          </div>

          <div className="grid gap-2 text-sm sm:grid-cols-2 lg:min-w-[430px]">
            <Info label="Current team" value={order.current_team || 'Unassigned'} />
            <Info label="Current owner" value={userName(users, order.current_owner_id) || 'Unassigned'} />
            <Info label="Due" value={order.due_at ? formatDate(order.due_at) : 'No deadline'} />
            <Info label="Last updated" value={formatDate(order.updated_at)} />
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="font-black text-slate-900">Order items</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {(order.items || []).map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-4 px-5 py-4">
                  <div>
                    <p className="text-sm font-bold text-slate-800">{item.item_name}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {item.inventory_item_id ? 'Internal inventory linked' : item.website_product_id ? 'Website product linked' : 'Manual item'}
                    </p>
                  </div>
                  <div className="text-right"><p className="font-black text-slate-900">× {item.quantity}</p><p className="mt-1 text-xs text-slate-400">Reserved {item.quantity_reserved}</p></div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="font-black text-slate-900">Activity timeline</h2>
              <p className="mt-1 text-xs text-slate-500">The permanent internal record of what happened to this order.</p>
            </div>
            {events.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-slate-400">No activity yet.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {events.map((event) => (
                  <div key={event.id} className="flex gap-4 px-5 py-4">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-[#0d7a4b]"><Clock3 className="h-4 w-4" /></div>
                    <div className="min-w-0">
                      <p className="text-sm font-black text-slate-800">{event.title}</p>
                      {(event.from_status || event.to_status) && <p className="mt-1 text-xs font-semibold text-slate-500">{event.from_status ? getOrderStatusLabel(event.from_status as OrderStatus) : '—'} <ArrowRight className="mx-1 inline h-3 w-3" /> {event.to_status ? getOrderStatusLabel(event.to_status as OrderStatus) : '—'}</p>}
                      {event.note && <p className="mt-1 text-xs leading-5 text-slate-500">{event.note}</p>}
                      <p className="mt-1.5 text-[11px] font-semibold text-slate-400">{formatDate(event.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-black text-slate-900">Move order forward</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">Only valid workflow moves are shown. Completed and cancelled orders are locked.</p>
            {allowedStatuses.length === 0 ? (
              <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm font-bold text-slate-500">This order has no further status moves.</div>
            ) : (
              <form action={changeOrderStatusAction} className="mt-4 space-y-3">
                <input type="hidden" name="order_id" value={order.id} />
                <select name="status" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold outline-none" defaultValue={allowedStatuses[0]}>
                  {allowedStatuses.map((status) => <option key={status} value={status}>{getOrderStatusLabel(status)}</option>)}
                </select>
                <textarea name="note" className="min-h-20 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none" placeholder="Optional note about this change" />
                <button className="w-full rounded-xl bg-[#032489] px-4 py-3 text-sm font-black text-white">Update status</button>
              </form>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-black text-slate-900">Hand over responsibility</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">The new team only becomes current after the handover is acknowledged.</p>
            <form action={createHandoverAction} className="mt-4 space-y-3">
              <input type="hidden" name="order_id" value={order.id} />
              <input name="to_team" required className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none" placeholder="Destination team, e.g. Dispatch" />
              <select name="to_user_id" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none" defaultValue="">
                <option value="">No specific owner</option>
                {users.map((user) => <option key={user.id} value={user.id}>{user.name || user.email || user.id}</option>)}
              </select>
              <textarea name="note" className="min-h-20 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none" placeholder="What is being handed over / what should happen next?" />
              <button className="w-full rounded-xl bg-[#0d7a4b] px-4 py-3 text-sm font-black text-white">Create handover</button>
            </form>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-black text-slate-900">Handovers</h2></div>
            {handoffs.length === 0 ? <div className="px-5 py-10 text-center text-sm text-slate-400">No handovers yet.</div> : (
              <div className="divide-y divide-slate-100">
                {handoffs.map((handoff) => (
                  <div key={handoff.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div><p className="text-sm font-black text-slate-800">{handoff.from_team || 'Unassigned'} <ArrowRight className="mx-1 inline h-3.5 w-3.5" /> {handoff.to_team}</p><p className="mt-1 text-xs text-slate-500">Owner: {userName(users, handoff.to_user_id) || 'Team queue'}</p></div>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${handoff.status === 'acknowledged' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{handoff.status}</span>
                    </div>
                    {handoff.note && <p className="mt-2 text-xs leading-5 text-slate-500">{handoff.note}</p>}
                    {handoff.status === 'pending' && (
                      <form action={acknowledgeHandoverAction} className="mt-3">
                        <input type="hidden" name="handover_id" value={handoff.id} />
                        <input type="hidden" name="order_id" value={order.id} />
                        <button className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800"><CheckCircle2 className="h-3.5 w-3.5" /> Acknowledge receipt</button>
                      </form>
                    )}
                    {handoff.acknowledged_at && <p className="mt-2 text-[11px] font-semibold text-slate-400">Acknowledged {formatDate(handoff.acknowledged_at)}</p>}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 px-3 py-2.5"><p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-xs font-bold text-slate-700">{value}</p></div>;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
}

function userName(users: Array<{ id: string; name: string | null; email: string | null }>, id: string | null) {
  if (!id) return null;
  const user = users.find((item) => item.id === id);
  return user?.name || user?.email || id;
}
