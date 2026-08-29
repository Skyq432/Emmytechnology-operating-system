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
import { getOrderStatusLabel } from '@/lib/operations/domain';
import type { OperationsOverview as OperationsOverviewData } from '@/lib/operations/types';

function MetricCard({
  label,
  value,
  helper,
  icon: Icon,
}: {
  label: string;
  value: number;
  helper: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{label}</p>
          <p className="mt-2 text-3xl font-black tracking-tight text-slate-900">{value}</p>
          <p className="mt-2 text-xs leading-5 text-slate-500">{helper}</p>
        </div>
        <div className="rounded-xl bg-emerald-50 p-3 text-[#0d7a4b]">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

export function OperationsOverview({ data }: { data: OperationsOverviewData }) {
  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0d7a4b]">Operations command centre</p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] text-slate-950 md:text-4xl">
            What needs attention now?
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Track internal orders, handovers and physical stock without forcing every item onto the public website catalogue.
          </p>
        </div>

        <Link
          href="/modules/operations/orders"
          className="inline-flex items-center gap-2 self-start rounded-xl bg-[#032489] px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#021d70]"
        >
          Open orders <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <MetricCard label="Open orders" value={data.openOrders} helper="Anything not completed or cancelled" icon={ClipboardList} />
        <MetricCard label="Urgent" value={data.urgentOrders} helper="Urgent orders still active" icon={AlertTriangle} />
        <MetricCard label="Dispatch" value={data.awaitingDispatch} helper="Ready or already dispatched" icon={Truck} />
        <MetricCard label="Inventory items" value={data.inventoryItems} helper="Internal Operations catalogue" icon={Boxes} />
        <MetricCard label="Low stock" value={data.lowStockItems} helper="At or below reorder level" icon={PackageCheck} />
        <MetricCard label="Website links" value={data.websiteLinks} helper="Optional inventory-to-site relationships" icon={Link2} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-base font-black text-slate-900">Recent orders</h2>
              <p className="mt-0.5 text-xs text-slate-500">Latest internal execution records</p>
            </div>
            <Link href="/modules/operations/orders" className="text-xs font-black text-[#032489]">
              View all
            </Link>
          </div>

          {data.recentOrders.length === 0 ? (
            <div className="px-5 py-14 text-center">
              <ClipboardList className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm font-bold text-slate-700">No Operations orders yet</p>
              <p className="mt-1 text-xs text-slate-500">The first order you create will appear here.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.recentOrders.map((order) => (
                <div key={order.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-black text-slate-900">{order.order_code}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-slate-600">
                        {getOrderStatusLabel(order.status)}
                      </span>
                      {order.priority === 'urgent' && (
                        <span className="rounded-full bg-rose-50 px-2 py-1 text-[10px] font-black uppercase text-rose-700">Urgent</span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {order.customer_name || order.reference_label || 'Internal order'}
                      {order.current_team ? ` · ${order.current_team}` : ''}
                    </p>
                  </div>
                  <p className="text-xs font-semibold text-slate-400">
                    {new Date(order.updated_at).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-black text-slate-900">Activity timeline</h2>
            <p className="mt-0.5 text-xs text-slate-500">Order changes and handovers</p>
          </div>

          {data.recentEvents.length === 0 ? (
            <div className="px-5 py-14 text-center">
              <PackageCheck className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm font-bold text-slate-700">No activity recorded yet</p>
              <p className="mt-1 text-xs text-slate-500">Status changes and team handovers will create a trace here.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.recentEvents.map((event) => (
                <div key={event.id} className="px-5 py-4">
                  <p className="text-sm font-bold text-slate-800">{event.title}</p>
                  {event.note && <p className="mt-1 text-xs leading-5 text-slate-500">{event.note}</p>}
                  <p className="mt-1.5 text-[11px] font-semibold text-slate-400">
                    {new Date(event.created_at).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
