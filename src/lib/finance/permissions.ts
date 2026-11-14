// [MERGE] Who can see Finance, and which Finance pages.
// Mirrors the database checks (finance_can_view / finance_can_manage /
// finance_is_owner / finance_can_log_petty). The database is the real gate;
// this file only decides what the menu and buttons show.

export const FINANCE_VIEW_ROLES = ['super_admin', 'admin', 'growth_lead', 'sales_analyst'] as const;
export const FINANCE_MANAGE_ROLES = ['super_admin', 'admin'] as const;
export const FINANCE_PETTY_ROLES = ['front_desk', 'technician', 'operations_lead'] as const;

export const FINANCE_NAV_KEYS = [
  'overview', 'moneyIn', 'accounts', 'expenses', 'receivables', 'payables', 'payroll', 'budgets', 'reports', 'pettyCash',
] as const;
export type FinanceNavKey = (typeof FINANCE_NAV_KEYS)[number];

export const FINANCE_NAV: Record<FinanceNavKey, { label: string; href: string; description: string }> = {
  overview: { label: 'Overview', href: '/modules/finance', description: 'Money in and out, position and things that need a look.' },
  moneyIn: { label: 'Money In', href: '/modules/finance/money-in', description: 'Every customer payment from sales and repairs.' },
  accounts: { label: 'Accounts', href: '/modules/finance/accounts', description: 'Banks, mobile money, POS terminals, cash drawers and cash counts.' },
  expenses: { label: 'Expenses', href: '/modules/finance/expenses', description: 'What EmmyTech spends, and petty cash to approve.' },
  receivables: { label: 'Receivables', href: '/modules/finance/receivables', description: 'Who owes EmmyTech, and how late.' },
  payables: { label: 'Payables', href: '/modules/finance/payables', description: 'Supplier bills and other money EmmyTech owes.' },
  payroll: { label: 'Payroll', href: '/modules/finance/payroll', description: 'Salaries, advances and monthly salary runs.' },
  budgets: { label: 'Budgets', href: '/modules/finance/budgets', description: 'Monthly spending limits against actual spend.' },
  reports: { label: 'Reports', href: '/modules/finance/reports', description: 'Profit and loss by branch.' },
  pettyCash: { label: 'Petty cash', href: '/modules/finance/petty-cash', description: 'Log money spent from your branch cash drawer.' },
};

const VIEW_KEYS: readonly FinanceNavKey[] = FINANCE_NAV_KEYS.filter((key) => key !== 'pettyCash');

const FINANCE_ACCESS: Record<string, readonly FinanceNavKey[]> = {
  super_admin: VIEW_KEYS,
  admin: VIEW_KEYS,
  growth_lead: VIEW_KEYS,
  sales_analyst: VIEW_KEYS,
  front_desk: ['pettyCash'],
  technician: ['pettyCash'],
  operations_lead: ['pettyCash'],
};

const has = (list: readonly string[], role: string | null | undefined) => !!role && list.includes(role);

export function canViewFinance(role: string | null | undefined): boolean {
  return has(FINANCE_VIEW_ROLES, role);
}

export function canManageFinance(role: string | null | undefined): boolean {
  return has(FINANCE_MANAGE_ROLES, role);
}

/** Individual pay is visible to the Supreme Administrator only. */
export function isFinanceOwner(role: string | null | undefined): boolean {
  return role === 'super_admin';
}

export function canLogPettyCash(role: string | null | undefined): boolean {
  return has(FINANCE_PETTY_ROLES, role) || canManageFinance(role);
}

export function financeNavKeys(role: string | null | undefined): FinanceNavKey[] {
  if (!role) return [];
  return [...(FINANCE_ACCESS[role] ?? [])];
}

export function canOpenFinancePage(role: string | null | undefined, key: FinanceNavKey): boolean {
  if (key === 'pettyCash') return canLogPettyCash(role);
  return financeNavKeys(role).includes(key);
}
