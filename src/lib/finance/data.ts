// [MERGE] Finance data loaders. Each one calls a guarded finance_* database
// function; the database re-checks access on every call.
import { financeRpc } from './rpc.ts';
import { moneyInArgs, type MoneyInFilters } from './filters.ts';
import type { Period } from './dates.ts';
import type {
  AccountStatement, AccountsOverview, Budgets, CashCounts, CostStatus, ExpensesResult, InventoryRealCost, ProductCosts, FinanceBranch, FinanceOverview, FinancePosition,
  FinanceReference, MoneyInResult, MyPettyCash, Payables, Payroll, ProfitAndLoss, Receivables,
} from './types.ts';

export const getFinanceBranches = () => financeRpc<FinanceBranch[]>('finance_branches');
export const getFinanceReference = () => financeRpc<FinanceReference>('finance_reference_data');

export const getFinanceOverview = (period: Period, branchId: string | null) =>
  financeRpc<FinanceOverview>('finance_overview', { p_from: period.from, p_to: period.to, p_branch_id: branchId });

export const getFinancePosition = (period: Period) =>
  financeRpc<FinancePosition>('finance_position', { p_from: period.from, p_to: period.to });

export const listMoneyIn = (filters: MoneyInFilters, limit: number, offset: number) =>
  financeRpc<MoneyInResult>('finance_money_in', moneyInArgs(filters, limit, offset));

export const getAccountsOverview = () => financeRpc<AccountsOverview>('finance_accounts_overview');
export const getAccountStatement = (accountId: string) => financeRpc<AccountStatement>('finance_account_statement', { p_account_id: accountId });
export const getCashCounts = (accountId: string | null, day: string | null) =>
  financeRpc<CashCounts>('finance_cash_counts', { p_account_id: accountId, p_day: day });

export const getExpenses = (period: Period, branchId: string | null, categoryId: string | null, status: string | null) =>
  financeRpc<ExpensesResult>('finance_expenses', { p_from: period.from, p_to: period.to, p_branch_id: branchId, p_category_id: categoryId, p_status: status });
export const getMyPettyCash = () => financeRpc<MyPettyCash>('finance_my_petty_cash');

export const getReceivables = (branchId: string | null) => financeRpc<Receivables>('finance_receivables', { p_branch_id: branchId });
export const getPayables = () => financeRpc<Payables>('finance_payables');
export const getPayroll = (month: string | null) => financeRpc<Payroll>('finance_payroll', { p_month: month });
export const getBudgets = (month: string) => financeRpc<Budgets>('finance_budgets', { p_month: month });
export const getProfitAndLoss = (month: string) => financeRpc<ProfitAndLoss>('finance_profit_and_loss', { p_month: month });

// ── Real product cost (private: see canSeeCost) ─────────────────────
export const getCostStatus = () => financeRpc<CostStatus>('finance_cost_status');
export const getProductCosts = (period: Period) => financeRpc<ProductCosts>('finance_product_costs', { p_from: period.from, p_to: period.to });
export const getInventoryRealCost = (inventoryItemId: string) =>
  financeRpc<InventoryRealCost>('finance_inventory_real_cost', { p_inventory_item_id: inventoryItemId });
