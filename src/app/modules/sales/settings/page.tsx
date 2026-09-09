import { SettingsWorkspace } from '@/components/sales/settings-workspace';
import { getSalesInventoryCatalog, getSalesSettings } from '@/lib/sales/read-server';

export default async function SalesSettingsPage() {
  const [settings, catalog] = await Promise.all([getSalesSettings(), getSalesInventoryCatalog()]);
  return <SettingsWorkspace settings={settings.settings as never} marginPolicies={settings.marginPolicies as never[]} authorityProfiles={settings.authorityProfiles as never[]} users={settings.users as never[]} inventory={catalog.items as never[]} />;
}
