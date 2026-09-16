import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  ClipboardList,
  Clock,
  Link2,
  PackageCheck,
  Truck,
  Wrench,
} from 'lucide-react';
import { HelpTip } from '@/components/ui/help-tip';
import { buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { OPERATIONS_HELP } from '@/lib/operations/help';
import { getOrderStatusLabel } from '@/lib/operations/domain';
import type { OperationsOverview as OperationsOverviewData } from '@/lib/operations/types';

function MetricCard({
  label,
  value,
  helper,
  help,
  icon: Icon,
  href,
}: {
  label: string;
  value: number;
  helper: string;
  help: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
}) {
  const body = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-bold text-slate-500">{label}</p>
          <HelpTip text={help} label={`About ${label}`} />
        </div>
        <p className="mt-2 text-2xl font-black tracking-tight text-slate-950">{value}</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">{helper}</p>
      </div>
      <div className="rounded-lg bg-blue-50 p-2.5 text-emmy-primary">
        <Icon className="h-4 w-4" />
      </div>
    </div>
  );
  if (href) {
    return (
      <Link href={href} className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-emmy-primary hover:bg-blue-50/40">
        {body}
      </Link>
    );
  }
  return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">{body}</div>;
}

export function OperationsOverview({ data }: { data: OperationsOverviewData }) {
  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-emmy-primary">Operations overview</p>
          <h1 className="mt-1.5 text-3xl font-black tracking-[-0.035em] text-slate-950">What needs attention?</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            See active orders, internal stock and recent team activity in one simple view.
          </p>
        </div>
        <Link href="/modules/operations/orders" className={buttonVariants({ className: 'gap-2 self-start' })}>
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

      <p className="mb-2 mt-5 text-xs font-black uppercase tracking-[0.14em] text-slate-400">Repairs</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Total repairs" value={data.totalRepairs} helper="Received in this period" help={OPERATIONS_HELP.totalRepairs} icon={Wrench} href="/modules/operations/repairs" />
        <MetricCard label="Collected" value={data.collectedRepairs} helper="Already picked up" help={OPERATIONS_HELP.collectedRepairs} icon={CheckCircle2} href="/modules/operations/repairs?status=collected" />
        <MetricCard label="Not collected yet" value={data.uncollectedRepairs} helper="Still in the pipeline" help={OPERATIONS_HELP.uncollectedRepairs} icon={Clock} href="/modules/operations/repairs?status=uncollected" />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.35fr_1fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-1.5">
                <CardTitle className="text-sm">Recent orders</CardTitle>
                <HelpTip text={OPERATIONS_HELP.recentOrders} label="About Recent orders" />
              </div>
              <CardDescription>Latest work moving through Operations</CardDescription>
            </div>
            <Link href="/modules/operations/orders" className="text-xs font-black text-emmy-primary">View all</Link>
          </CardHeader>

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
                      <Badge>{getOrderStatusLabel(order.status)}</Badge>
                      {order.priority === 'urgent' && <Badge variant="danger">Urgent</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{order.customer_name || order.reference_label || 'Internal order'}{order.current_team ? ` · ${order.current_team}` : ''}</p>
                  </div>
                  <p className="text-xs font-semibold text-slate-400">{new Date(order.updated_at).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader className="border-b border-slate-100">
            <div className="flex items-center gap-1.5">
              <CardTitle className="text-sm">Activity timeline</CardTitle>
              <HelpTip text={OPERATIONS_HELP.activityTimeline} label="About Activity timeline" />
            </div>
            <CardDescription>Order changes and team handovers</CardDescription>
          </CardHeader>

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
        </Card>
      </div>
    </div>
  );
}
