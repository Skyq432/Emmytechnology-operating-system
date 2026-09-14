import { AlertTriangle, ShieldCheck, Users, Wrench } from 'lucide-react';
import { ActionLauncher } from '@/components/ui/action-launcher';
import { PageHeader } from '@/components/ui/page-header';
import { StatGrid, StatTile } from '@/components/ui/stat-tile';
import CommandCentreWorkSummary from '@/components/work/command-centre-work-summary';
import { canAssignSuperAdmin, hasCapability, type InternalRole } from '@/lib/auth/roles';
import { getAdminOverview } from '@/lib/os/home-server';
import { getMyWorkDashboard } from '@/lib/work/server';

const money = (value: number) => `₦${Number(value || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

export async function AdminHome({ role, name }: { role: InternalRole; name: string }) {
  const [overview, workSummary] = await Promise.all([getAdminOverview(), getMyWorkDashboard()]);
  const firstName = name.split(' ')[0] || name;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Command Centre" title={`Good to see you, ${firstName}`} />

      <CommandCentreWorkSummary summary={workSummary} />

      <StatGrid>
        <StatTile label="Today's Sales" value={money(overview.todaysSales)} icon={<ShieldCheck className="h-[15px] w-[15px]" />} tone="primary" />
        <StatTile label="Open Repairs" value={overview.openRepairs} icon={<Wrench className="h-[15px] w-[15px]" />} tone="secondary" />
        <StatTile label="Active Staff" value={overview.staffCount} icon={<Users className="h-[15px] w-[15px]" />} tone="success" />
        <StatTile label="Needs Your Review" value={overview.pendingReviews} icon={<AlertTriangle className="h-[15px] w-[15px]" />} tone="danger" />
      </StatGrid>

      <div>
        <div className="text-sm font-extrabold text-slate-950">Administration</div>
        <div className="mt-0.5 text-xs text-slate-500">Things only your role can do</div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {hasCapability(role, 'sales.settings.manage') && (
            <ActionLauncher href="/modules/administration" icon={<Users className="h-6 w-6" />} title="Staff & Access" tone="primary" />
          )}
          {hasCapability(role, 'sales.pricing.admin') && (
            <ActionLauncher href="/modules/operations/products" icon={<ShieldCheck className="h-6 w-6" />} title="Pricing" tone="secondary" />
          )}
          {hasCapability(role, 'sales.refund.manage') && (
            <ActionLauncher href="/modules/sales/returns" icon={<AlertTriangle className="h-6 w-6" />} title="Refunds & Voids" tone="purple" />
          )}
          {hasCapability(role, 'sales.settings.manage') && (
            <ActionLauncher href="/modules/sales/settings" icon={<Wrench className="h-6 w-6" />} title="Settings" tone="success" />
          )}
          {canAssignSuperAdmin(role) && (
            <ActionLauncher href="/modules/administration" icon={<ShieldCheck className="h-6 w-6" />} title="Assign Super Admin" description="Grant Supreme Administrator access" tone="danger" />
          )}
        </div>
      </div>
    </div>
  );
}
