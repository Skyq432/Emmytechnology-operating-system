import { CrmDataProvider } from '@/components/crm/crm-data-context';
import { CrmChrome } from '@/components/crm/crm-chrome';
import { OperationsPeriodBar } from '@/components/operations/operations-period-bar';
import { ReportingPeriodProvider } from '@/components/reporting/reporting-period-context';
import { requireModuleAccess } from '@/lib/auth/server';

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess('crm');

  return (
    <ReportingPeriodProvider>
      <OperationsPeriodBar moduleLabel="CRM" helpText="This controls which people count toward CRM totals — anyone with activity (a spin, click, note, stage move) in the selected period. It does not remove their history, only what's counted right now." />
      <CrmDataProvider>
        <CrmChrome>{children}</CrmChrome>
      </CrmDataProvider>
    </ReportingPeriodProvider>
  );
}
