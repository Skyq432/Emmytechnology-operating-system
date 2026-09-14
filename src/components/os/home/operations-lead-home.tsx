import { AlertTriangle, Boxes, ClipboardList, Link2, PackageCheck, Truck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { StatGrid, StatTile } from '@/components/ui/stat-tile';
import CommandCentreWorkSummary from '@/components/work/command-centre-work-summary';
import { getOperationsOverview } from '@/lib/operations/server';
import type { InternalRole } from '@/lib/auth/roles';
import { getMyWorkDashboard, getTeamWorkSummary } from '@/lib/work/server';

export async function OperationsLeadHome({ name }: { role: InternalRole; name: string }) {
  const [overview, workSummary, teamSummary] = await Promise.all([
    getOperationsOverview(),
    getMyWorkDashboard(),
    getTeamWorkSummary(),
  ]);
  const firstName = name.split(' ')[0] || name;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Operations" title={`Good to see you, ${firstName}`} />

      <StatGrid>
        <StatTile label="Open Orders" value={overview.openOrders} icon={<ClipboardList className="h-[15px] w-[15px]" />} tone="primary" />
        <StatTile label="Urgent" value={overview.urgentOrders} icon={<AlertTriangle className="h-[15px] w-[15px]" />} tone="danger" />
        <StatTile label="Awaiting Dispatch" value={overview.awaitingDispatch} icon={<Truck className="h-[15px] w-[15px]" />} tone="secondary" />
        <StatTile label="Low Stock" value={overview.lowStockItems} icon={<PackageCheck className="h-[15px] w-[15px]" />} tone="danger" />
        <StatTile label="Inventory Items" value={overview.inventoryItems} icon={<Boxes className="h-[15px] w-[15px]" />} tone="primary" />
        <StatTile label="Website Links" value={overview.websiteLinks} icon={<Link2 className="h-[15px] w-[15px]" />} tone="neutral" />
      </StatGrid>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Team at a glance</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 pt-0 sm:grid-cols-4">
          <div>
            <div className="text-[11px] font-bold text-slate-500">Active tasks</div>
            <div className="mt-1 text-xl font-extrabold text-slate-950">{teamSummary.active}</div>
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-500">Due today</div>
            <div className="mt-1 text-xl font-extrabold text-slate-950">{teamSummary.dueToday}</div>
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-500">Overdue</div>
            <div className="mt-1 text-xl font-extrabold text-red-600">{teamSummary.overdue}</div>
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-500">Awaiting acceptance</div>
            <div className="mt-1 text-xl font-extrabold text-slate-950">{teamSummary.pendingAcceptance}</div>
          </div>
        </CardContent>
      </Card>

      <CommandCentreWorkSummary summary={workSummary} />
    </div>
  );
}
