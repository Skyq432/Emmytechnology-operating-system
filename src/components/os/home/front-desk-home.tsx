import { ArrowLeftRight, CreditCard, PlusCircle, Wrench } from 'lucide-react';
import { ActionGrid, ActionLauncher } from '@/components/ui/action-launcher';
import { PageHeader } from '@/components/ui/page-header';
import CommandCentreWorkSummary from '@/components/work/command-centre-work-summary';
import { hasCapability, type InternalRole } from '@/lib/auth/roles';
import { getMyWorkDashboard } from '@/lib/work/server';

export async function FrontDeskHome({ role, name }: { role: InternalRole; name: string }) {
  const workSummary = await getMyWorkDashboard();
  const firstName = name.split(' ')[0] || name;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Front Desk" title={`Good to see you, ${firstName}`} />

      <CommandCentreWorkSummary summary={workSummary} />

      <div>
        <div className="text-sm font-extrabold text-slate-950">What do you need to do?</div>
        <div className="mt-0.5 text-xs text-slate-500">Pick a task to get started</div>
        <ActionGrid className="mt-4">
          {hasCapability(role, 'sales.direct.manage') && (
            <ActionLauncher
              href="/modules/sales/direct"
              icon={<PlusCircle className="h-6 w-6" />}
              title="New Sale"
              description="Start a walk-in or direct sale"
              tone="primary"
            />
          )}
          {hasCapability(role, 'sales.payment.record') && (
            <ActionLauncher
              href="/modules/sales/payments"
              icon={<CreditCard className="h-6 w-6" />}
              title="Take Payment"
              description="Record a payment against an order"
              tone="secondary"
            />
          )}
          {hasCapability(role, 'operations.repair.intake') && (
            <ActionLauncher
              href="/modules/operations/repairs"
              icon={<Wrench className="h-6 w-6" />}
              title="Repair Intake"
              description="Check in a device for repair"
              tone="success"
            />
          )}
          {hasCapability(role, 'operations.repair.handover') && (
            <ActionLauncher
              href="/modules/operations/repairs"
              icon={<ArrowLeftRight className="h-6 w-6" />}
              title="Hand Over Repair"
              description="Complete collection with the customer"
              tone="purple"
            />
          )}
        </ActionGrid>
      </div>
    </div>
  );
}
