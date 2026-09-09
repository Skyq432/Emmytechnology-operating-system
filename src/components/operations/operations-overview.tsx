import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  ClipboardList,
  Link2,
  PackageCheck,
  Truck,
} from 'lucide-react';
import { HelpTip } from '@/components/ui/help-tip';
import { OPERATIONS_HELP } from '@/lib/operations/help';
import { getOrderStatusLabel } from '@/lib/operations/domain';
import type { OperationsOverview as OperationsOverviewData } from '@/lib/operations/types';

function MetricCard({
  label,
  value,
  helper,
  help,
  icon: Icon,
}: {
  label: string;
  value: number;
  helper: string;
  help: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-bold text-slate-500">{label}</p>
            <HelpTip text={help} label={`About ${label}`} />
          </div>
          <p className="mt-2 text-2xl font-black tracking-tight text-slate-950">{value}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{helper}</p>
        </div>
        <div className="rounded-lg bg-blue-50 p-2.5 text-[#032489]">
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

export function OperationsOverview({ data }: { data: OperationsOverviewData }) {
  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#032489]">Operations overview</p>
          <h1 className="mt-1.5 text-3xl font-black tracking-[-0.035em] text-slate-950">What needs attention?</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            See active orders, internal stock and recent team activity in one simple view.
          </p>
        </div>
        <Link
          href="/modules/operations/orders"
          className="inline-flex items-center gap-2 self-start rounded-lg bg-[#032489] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#021d70]"
        >
          Open orders <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <MetricCard label="Open orders" value={data.openOrders} helper="Still being worked on" help={OPERATIONS_HELP.openOrders} icon={ClipboardList} />
        <MetricCard label="Urgent" value={data.urgentOrders} helper="Need faster attention" help={OPERATIONS_HELP.urgent} icon={AlertTriangle} />
        <MetricCard label="Dispatch" value={data.awaitingDispatch} helper="Ready or on the way" help={OPERATIONS_HELP.dispatch} icon={Truck} />
        <MetricCard label="Inventory items" value={data.inventoryItems} helper="Internal items being tracked" help={OPERATIONS_HELP.inventoryItems} icon={Boxes} />
        <MetricCard label="Low stock" value={data.lowStockItems} helper="May need restocking" help={OPERATIONS_HELP.lowStock} icon={PackageCheck} />
        <MetricCard label="Website links" value={data.websiteLinks} helper="Optional product links" help={OPERATIONS_HELP.websiteLinks} icon={Link2} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.35fr_1fr]">
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-black text-slate-900">Recent orders</h2>
                <HelpTip text={OPERATIONS_HELP.recentOrders} label="About Recent orders" />
              </div>
              <p className="mt-0.5 text-xs text-slate-500">Latest work moving through Operations</p>
            </div>
            <Link href="/modules/operations/orders" className="text-xs font-black text-[#032489]">View all</Link>
          </div>

          {data.recentOrders.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <ClipboardList className="mx-auto h-7 w-7 text-slate-300" />
              <p className="mt-3 text-sm font-bold text-slate-700">No Operations orders yet</p>
              <p className="mt-1 text-xs text-slate-500">Your first internal order will appear here.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.recentOrders.map((order) => (
                <div key={order.id} className="grid gap-3 px-5 py-3.5 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-black text-slate-900">{order.order_code}</span>
                      <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-[#032489]">
                        {getOrderStatusLabel(order.status)}
                      </span>
                      {order.priority === 'urgent' && <span className="rounded-full bg-rose-50 px-2 py-1 text-[10px] font-black uppercase text-rose-700">Urgent</span>}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{order.customer_name || order.reference_label || 'Internal order'}{order.current_team ? ` · ${order.current_team}` : ''}</p>
                  </div>
                  <p className="text-xs font-semibold text-slate-400">{new Date(order.updated_at).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-1.5">
              <h2 className="text-sm font-black text-slate-900">Activity timeline</h2>
              <HelpTip text={OPERATIONS_HELP.activityTimeline} label="About Activity timeline" />
            </div>
            <p className="mt-0.5 text-xs text-slate-500">Order changes and team handovers</p>
          </div>

          {data.recentEvents.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <PackageCheck className="mx-auto h-7 w-7 text-slate-300" />
              <p className="mt-3 text-sm font-bold text-slate-700">No activity recorded yet</p>
              <p className="mt-1 text-xs text-slate-500">Changes will appear here automatically.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.recentEvents.map((event) => (
                <div key={event.id} className="px-5 py-3.5">
                  <p className="text-sm font-bold text-slate-800">{event.title}</p>
                  {event.note && <p className="mt-1 text-xs leading-5 text-slate-500">{event.note}</p>}
                  <p className="mt-1.5 text-[11px] font-semibold text-slate-400">{new Date(event.created_at).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
