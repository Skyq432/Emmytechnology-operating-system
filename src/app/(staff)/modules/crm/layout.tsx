import { CrmDataProvider } from '@/components/crm/crm-data-context';
import { CrmChrome } from '@/components/crm/crm-chrome';
import { requireModuleAccess } from '@/lib/auth/server';

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess('crm');

  return (
    <CrmDataProvider>
      <CrmChrome>{children}</CrmChrome>
    </CrmDataProvider>
  );
}
