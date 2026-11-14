// [SWAP → EmmyTech OS] Replaces the test-build src/lib/finance/access.ts at merge.
// Uses requireInternalUser (not requireModuleAccess) because Front Desk,
// Technicians and Operations Leads need the Petty cash page without having the
// Finance module; each page checks its own key below.
import { redirect } from 'next/navigation';
import { getCachedAuthContext, requireInternalUser } from '@/lib/auth/server';
import { canOpenFinancePage, canViewFinance, financeNavKeys, type FinanceNavKey } from './permissions.ts';

export interface FinanceViewer {
  userId: string;
  name: string;
  role: string;
}

export async function getFinanceViewer(): Promise<FinanceViewer | null> {
  const { user, profile } = await getCachedAuthContext();
  if (!user || !profile) return null;
  return { userId: user.id, name: profile.name || user.email || 'EmmyTech Staff', role: profile.role };
}

async function viewer(): Promise<FinanceViewer> {
  const context = await requireInternalUser();
  return { userId: context.user.id, name: context.profile.name || context.user.email || 'EmmyTech Staff', role: context.role };
}

export async function requireFinanceUser(): Promise<FinanceViewer> {
  const v = await viewer();
  if (financeNavKeys(v.role).length === 0) redirect('/');
  return v;
}

export async function requireFinancePage(key: FinanceNavKey): Promise<FinanceViewer> {
  const v = await viewer();
  if (!canOpenFinancePage(v.role, key)) redirect('/');
  return v;
}

export async function requireFinanceViewer(): Promise<FinanceViewer> {
  const v = await viewer();
  if (!canViewFinance(v.role)) redirect('/');
  return v;
}
