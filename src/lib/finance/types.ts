// [MERGE] Shapes returned by the finance_* database functions.

export type PaymentMethod = 'bank_transfer' | 'pos' | 'cash' | 'split' | 'other';
export type MoneySource = 'order' | 'direct_sale' | 'repair';

export const PAYMENT_METHODS: readonly PaymentMethod[] = ['bank_transfer', 'pos', 'cash', 'split', 'other'];
export const MONEY_SOURCES: readonly MoneySource[] = ['order', 'direct_sale', 'repair'];

export interface AmountCount {
  amount: number;
  count: number;
}

export interface FinanceOverview {
  period: { from: string; to: string; branch_id: string | null };
  money_in: AmountCount;
  refunds: AmountCount;
  net_cash_in: number;
  voided: AmountCount;
  by_method: Array<{ method: PaymentMethod; amount: number; count: number }>;
  by_source: Array<{ source: MoneySource; amount: number; count: number }>;
  by_branch: Array<{ branch_id: string | null; branch_name: string | null; amount: number; count: number }>;
  by_day: Array<{ day: string; amount: number; count: number }>;
  sales_confirmed: AmountCount;
  cash_off_used: number;
  owed_now: AmountCount;
  free_pos: {
    withdrawals_amount: number;
    withdrawals_count: number;
    deposits_amount: number;
    deposits_count: number;
  };
  data_checks: {
    no_branch_amount: number;
    no_branch_count: number;
    split_amount: number;
    split_count: number;
    other_method_amount: number;
    other_method_count: number;
  };
}

export interface FinanceBranch {
  id: string;
  code: string;
  name: string;
}

export interface MoneyInRow {
  payment_id: string;
  source_type: 'order' | 'repair';
  sales_channel: MoneySource;
  source_id: string;
  source_code: string;
  customer_name: string | null;
  branch_id: string | null;
  branch_name: string | null;
  payment_method: PaymentMethod;
  reference: string | null;
  amount: number;
  paid_at: string;
  is_void: boolean;
  recorded_by_name: string | null;
  account_id?: string | null;
  account_name?: string | null;
}

export interface MoneyInResult {
  total_count: number;
  total_amount: number;
  void_count: number;
  rows: MoneyInRow[];
}

// ── Phases 2–6 ──────────────────────────────────────────────────────

export type AccountType = 'bank' | 'mobile' | 'pos' | 'cash';

export interface MoneyInRowAccount {
  account_id: string | null;
  account_name: string | null;
}

export interface FinanceReference {
  today: string;
  start_date: string;
  can_view: boolean;
  can_manage: boolean;
  is_owner: boolean;
  categories: Array<{ id: string; name: string }>;
  accounts: Array<{ id: string; name: string; type: AccountType; branch_id: string | null; active: boolean }>;
  branches: Array<{ id: string; name: string }>;
  staff: Array<{ id: string; name: string; role: string; branch_id: string | null }>;
}

export interface FinanceAccount {
  id: string;
  name: string;
  type: AccountType;
  provider: string | null;
  last4: string | null;
  branch_id: string | null;
  branch_name: string | null;
  opening: number;
  balance: number;
  active: boolean;
}

export interface AccountsOverview {
  start_date: string;
  total: number;
  accounts: FinanceAccount[];
  unassigned_total: number;
  unassigned: Array<{ source_type: string; source_id: string; day: string; moved_at: string; label: string; amount: number }>;
  rules: Array<{ branch_id: string | null; branch_name: string | null; method: PaymentMethod; account_id: string; account_name: string }>;
}

export interface AccountStatement {
  account_id: string;
  opening: number;
  start_date: string;
  rows: Array<{ day: string; moved_at: string; amount: number; label: string; kind: string; source_type: string; source_id: string; balance: number; matched: boolean }>;
}

export interface CashCounts {
  expected: number | null;
  drawers: Array<{ id: string; name: string }>;
  counts: Array<{ id: string; date: string; account_name: string; counted: number; expected: number; difference: number; expected_now: number; reason: string | null; counted_by: string | null }>;
}

export interface FinanceExpense {
  id: string;
  date: string;
  category_id: string;
  category: string;
  branch_id: string | null;
  branch_name: string | null;
  account_id: string;
  account_name: string;
  payee: string;
  amount: number;
  note: string | null;
  receipt_path: string | null;
  status: 'pending' | 'approved' | 'rejected';
  is_petty: boolean;
  created_by_name: string | null;
  decided_by_name: string | null;
  decision_note: string | null;
}

export interface ExpensesResult {
  rows: FinanceExpense[];
  approved: AmountCount;
  missing_receipts: number;
  by_category: Array<{ category: string; amount: number; count: number }>;
  pending: FinanceExpense[];
}

export interface MyPettyCash {
  branch_name: string | null;
  rows: FinanceExpense[];
}

export type AgeBucket = 'not_due' | 'd1_30' | 'd31_60' | 'd60';

export interface Receivables {
  today: string;
  total: number;
  buckets: Record<AgeBucket, AmountCount>;
  rows: Array<{ kind: 'order' | 'repair'; id: string; code: string; customer: string | null; phone: string | null; branch_id: string | null; branch_name: string | null; total: number; paid: number; owed: number; due_date: string | null; days_late: number; bucket: AgeBucket; note: string }>;
}

export interface Payables {
  today: string;
  owed: number;
  overdue: number;
  open_count: number;
  other_total: number;
  bills: Array<{ id: string; supplier_id: string; supplier_name: string; ref: string; bill_date: string; due_date: string; amount: number; paid: number; left: number; status: 'paid' | 'overdue' | 'part_paid' | 'unpaid'; days_late: number; note: string | null }>;
  by_supplier: Array<{ supplier_name: string; owed: number; open: number; overdue: boolean }>;
  payments: Array<{ id: string; date: string; amount: number; supplier_name: string; ref: string; account_name: string }>;
  suppliers: Array<{ id: string; name: string }>;
  other: Record<'ambassador_payouts' | 'commissions_earned' | 'spin_cashouts', AmountCount>;
}

export interface PayRunTotals {
  people: number;
  gross: number;
  commission: number;
  deductions: number;
  net: number;
}

export interface Payroll {
  is_owner: boolean;
  runs: Array<{ id: string; month: string; status: 'draft' | 'approved' | 'paid'; paid_date: string | null; account_name: string | null; totals: PayRunTotals }>;
  run?: null | {
    id: string; month: string; status: 'draft' | 'approved' | 'paid'; paid_date: string | null; account_name: string | null; totals: PayRunTotals;
    lines: Array<{ user_id: string; name: string; role: string; salary: number; allowance: number; sales: number; commission: number; deduction: number; gross: number; net: number }>;
  };
  profiles?: Array<{ user_id: string; name: string; role: string; salary: number; allowance: number; commission_percent: number; advance_left: number }>;
  advances?: Array<{ id: string; name: string; amount: number; per_month: number; date: string; account_name: string }>;
}

export interface Budgets {
  month: string;
  budgeted: number;
  spent: number;
  over: string[];
  rows: Array<{ id: string; category_id: string; category: string; branch_id: string | null; branch_name: string | null; amount: number; actual: number; used: number; left: number; level: 'ok' | 'warn' | 'over' }>;
}

export interface ProfitAndLoss {
  month: string;
  columns: Array<{ key: string; name: string }>;
  lines: Array<{ line: 'sales' | 'repairs' | 'refunds' | 'cogs' | 'expense' | 'salaries'; label: string; values: Record<string, number> }>;
  payroll_status: 'draft' | 'approved' | 'paid' | null;
}

export interface FinancePosition {
  money_out: { expenses: number; suppliers: number; salaries: number };
  money_out_total: number;
  accounts_total: number;
  account_count: number;
  unassigned: AmountCount;
  payables: { owed: number; overdue: number; other: number };
  budget: { month: string; budgeted: number; spent: number; over: string[] };
  pending_petty: AmountCount;
}
