import { redirect } from 'next/navigation';
import { requireInternalUser } from '@/lib/auth/server';
import { canAccessSalesAnalyticsConsole } from '@/lib/auth/roles';
import { SqlConsoleClient } from '@/components/sales/sql-console-client';

// Deliberately not just requireModuleAccess('sales') — front_desk, operations_lead and
// technician all have sales module access too, but shouldn't see a raw query console.
// See canAccessSalesAnalyticsConsole in roles.ts.
export default async function SqlConsolePage() {
  const { role } = await requireInternalUser();
  if (!canAccessSalesAnalyticsConsole(role)) redirect('/');

  return <SqlConsoleClient />;
}
