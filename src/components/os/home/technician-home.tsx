import { Boxes, ClipboardList, Stethoscope } from 'lucide-react';
import { ActionGrid, ActionLauncher } from '@/components/ui/action-launcher';
import { PageHeader } from '@/components/ui/page-header';
import CommandCentreWorkSummary from '@/components/work/command-centre-work-summary';
import { hasCapability, type InternalRole } from '@/lib/auth/roles';
import { getMyWorkDashboard } from '@/lib/work/server';

export async function TechnicianHome({ role, name }: { role: InternalRole; name: string }) {
  const workSummary = await getMyWorkDashboard();
  const firstName = name.split(' ')[0] || name;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Technician" title={`Good to see you, ${firstName}`} />

      <div>
        <div className="text-sm font-extrabold text-slate-950">What do you need to do?</div>
        <div className="mt-0.5 text-xs text-slate-500">Pick a task to get started</div>
        <ActionGrid className="mt-4">
          {hasCapability(role, 'operations.repair.read') && (
            <ActionLauncher
              href="/modules/operations/repairs"
              icon={<ClipboardList className="h-6 w-6" />}
              title="Repair Queue"
              description="See devices assigned to you"
              tone="primary"
            />
          )}
          {hasCapability(role, 'operations.repair.technical') && (
            <ActionLauncher
              href="/modules/operations/repairs"
              icon={<Stethoscope className="h-6 w-6" />}
              title="Update Repair Status"
              description="Log diagnosis, progress or completion"
              tone="success"
            />
          )}
          {hasCapability(role, 'operations.inventory.read') && (
            <ActionLauncher
              href="/modules/operations/inventory"
              icon={<Boxes className="h-6 w-6" />}
              title="Check Inventory"
              description="Look up parts and stock on hand"
              tone="secondary"
            />
          )}
        </ActionGrid>
      </div>

      <CommandCentreWorkSummary summary={workSummary} />
    </div>
  );
}
