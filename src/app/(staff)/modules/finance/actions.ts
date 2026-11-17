'use server';
// [MERGE] Every Finance form posts to one of these. Each calls a guarded
// finance_* database function (which re-checks the person's role), then sends
// the person back to the page they were on with a short message.
import { redirect } from 'next/navigation';
import { financeRpc, FinanceDataError } from '@/lib/finance/rpc';
import { ReceiptError, saveReceipt } from '@/lib/finance/receipts';
import { BILL_LINE_ROWS } from '@/lib/finance/format';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function backTo(fd: FormData): string {
  const back = String(fd.get('_back') ?? '');
  const allowed = back.startsWith('/modules/finance') || back.startsWith('/modules/operations/inventory/');
  return allowed && !back.includes('//') ? back : '/modules/finance';
}

function withMessage(path: string, kind: 'ok' | 'error', text: string): string {
  const url = new URL(path, 'http://local');
  url.searchParams.delete('ok');
  url.searchParams.delete('error');
  url.searchParams.set(kind, text.slice(0, 200));
  return url.pathname + url.search;
}

const text = (fd: FormData, key: string) => { const v = String(fd.get(key) ?? '').trim(); return v || null; };
const uuid = (fd: FormData, key: string) => { const v = text(fd, key); return v && UUID.test(v) ? v : null; };
const day = (fd: FormData, key: string) => { const v = text(fd, key); return v && DAY.test(v) ? v : null; };
const money = (fd: FormData, key: string) => {
  const v = text(fd, key);
  if (v === null) return null;
  const n = Number(v.replace(/[,₦\s]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};
const month = (fd: FormData, key: string) => { const v = text(fd, key); return v && /^\d{4}-\d{2}(-\d{2})?$/.test(v) ? `${v.slice(0, 7)}-01` : null; };

async function run(fd: FormData, ok: string, work: () => Promise<unknown>) {
  let target: string;
  try {
    await work();
    target = withMessage(backTo(fd), 'ok', ok);
  } catch (error) {
    const known = error instanceof FinanceDataError || error instanceof ReceiptError;
    target = withMessage(backTo(fd), 'error', known ? (error as Error).message : 'Something went wrong. Try again.');
  }
  redirect(target);
}

// ── Accounts ────────────────────────────────────────────────────────
export async function addAccountAction(fd: FormData) {
  await run(fd, `${text(fd, 'name') ?? 'Account'} added`, () => financeRpc('finance_add_account', {
    p_name: text(fd, 'name'), p_type: text(fd, 'type'), p_provider: text(fd, 'provider'), p_last4: text(fd, 'last4'),
    p_branch_id: uuid(fd, 'branch'), p_opening: money(fd, 'opening') ?? 0,
  }));
}

export async function setAccountActiveAction(fd: FormData) {
  const active = text(fd, 'active') === '1';
  await run(fd, active ? 'Account is back in use' : 'Account archived: history kept, hidden from pick lists', () =>
    financeRpc('finance_set_account_active', { p_account_id: uuid(fd, 'account'), p_active: active }));
}

export async function setAccountRuleAction(fd: FormData) {
  await run(fd, 'Default account saved', () => financeRpc('finance_set_account_rule', {
    p_branch_id: uuid(fd, 'branch'), p_method: text(fd, 'method'), p_account_id: uuid(fd, 'account'),
  }));
}

export async function assignPaymentAccountAction(fd: FormData) {
  await run(fd, 'Placed in the account', () => financeRpc('finance_assign_payment_account', {
    p_source_type: text(fd, 'source_type'), p_source_id: uuid(fd, 'source_id'), p_account_id: uuid(fd, 'account'),
  }));
}

export async function toggleStatementMatchAction(fd: FormData) {
  await run(fd, 'Statement tick updated', () => financeRpc('finance_toggle_statement_match', {
    p_source_type: text(fd, 'source_type'), p_source_id: uuid(fd, 'source_id'), p_account_id: uuid(fd, 'account'),
  }));
}

export async function addTransferAction(fd: FormData) {
  await run(fd, 'Transfer saved', () => financeRpc('finance_add_transfer', {
    p_from: uuid(fd, 'from'), p_to: uuid(fd, 'to'), p_amount: money(fd, 'amount'), p_date: day(fd, 'date'), p_note: text(fd, 'note'),
  }));
}

export async function saveCashCountAction(fd: FormData) {
  await run(fd, 'Cash count saved', () => financeRpc('finance_save_cash_count', {
    p_account_id: uuid(fd, 'account'), p_date: day(fd, 'date'), p_counted: money(fd, 'counted'), p_reason: text(fd, 'reason'),
  }));
}

export async function setStartDateAction(fd: FormData) {
  await run(fd, 'Finance start date saved', () => financeRpc('finance_set_start_date', { p_start: month(fd, 'start') }));
}

// ── Expenses and petty cash ─────────────────────────────────────────
export async function addExpenseAction(fd: FormData) {
  await run(fd, 'Expense saved', async () => {
    const receipt = await saveReceipt(fd.get('receipt'));
    return financeRpc('finance_add_expense', {
      p_date: day(fd, 'date'), p_category_id: uuid(fd, 'category'), p_branch_id: uuid(fd, 'branch'), p_account_id: uuid(fd, 'account'),
      p_payee: text(fd, 'payee'), p_amount: money(fd, 'amount'), p_note: text(fd, 'note'), p_receipt_path: receipt,
    });
  });
}

export async function logPettyCashAction(fd: FormData) {
  await run(fd, 'Sent for approval', async () => {
    const receipt = await saveReceipt(fd.get('receipt'));
    return financeRpc('finance_log_petty_cash', {
      p_date: day(fd, 'date'), p_category_id: uuid(fd, 'category'), p_payee: text(fd, 'payee'), p_amount: money(fd, 'amount'),
      p_note: text(fd, 'note'), p_receipt_path: receipt,
    });
  });
}

export async function decideExpenseAction(fd: FormData) {
  const approve = text(fd, 'decision') === 'approve';
  await run(fd, approve ? 'Approved: it now counts' : 'Rejected', () => financeRpc('finance_decide_expense', {
    p_expense_id: uuid(fd, 'expense'), p_approve: approve, p_note: text(fd, 'note'),
  }));
}

export async function addCategoryAction(fd: FormData) {
  await run(fd, 'Category added', () => financeRpc('finance_add_expense_category', { p_name: text(fd, 'name') }));
}

// ── Payables ────────────────────────────────────────────────────────
function billLines(fd: FormData) {
  const lines: Array<{ product_id: string | null; name: string | null; quantity: number | null; unit_cost: number | null }> = [];
  for (let i = 1; i <= BILL_LINE_ROWS; i += 1) {
    const line = { product_id: uuid(fd, `line_product_${i}`), name: text(fd, `line_name_${i}`), quantity: money(fd, `line_qty_${i}`), unit_cost: money(fd, `line_cost_${i}`) };
    if (line.product_id || line.name || line.quantity !== null || line.unit_cost !== null) lines.push(line);
  }
  return lines;
}

export async function addSupplierBillAction(fd: FormData) {
  await run(fd, 'Supplier bill saved. Its item costs are now on the cost list.', () => financeRpc('finance_add_supplier_bill', {
    p_supplier_id: uuid(fd, 'supplier'), p_new_supplier_name: text(fd, 'new_supplier'), p_ref: text(fd, 'ref'),
    p_bill_date: day(fd, 'bill_date'), p_due_date: day(fd, 'due_date'), p_lines: JSON.stringify(billLines(fd)), p_note: text(fd, 'note'),
  }));
}

export async function paySupplierBillAction(fd: FormData) {
  await run(fd, 'Supplier payment saved', () => financeRpc('finance_pay_supplier_bill', {
    p_bill_id: uuid(fd, 'bill'), p_amount: money(fd, 'amount'), p_date: day(fd, 'date'), p_account_id: uuid(fd, 'account'), p_note: text(fd, 'note'),
  }));
}

// ── Payroll (Supreme Administrator only; enforced in the database) ──
export async function setPayProfileAction(fd: FormData) {
  await run(fd, 'Pay saved', () => financeRpc('finance_set_pay_profile', {
    p_user_id: uuid(fd, 'user'), p_salary: money(fd, 'salary') ?? 0, p_allowance: money(fd, 'allowance') ?? 0,
    p_commission_percent: money(fd, 'commission') ?? 0,
  }));
}

export async function addAdvanceAction(fd: FormData) {
  await run(fd, 'Salary advance saved', () => financeRpc('finance_add_salary_advance', {
    p_user_id: uuid(fd, 'user'), p_amount: money(fd, 'amount'), p_per_month: money(fd, 'per_month'), p_date: day(fd, 'date'),
    p_account_id: uuid(fd, 'account'), p_note: text(fd, 'note'),
  }));
}

export async function createPayRunAction(fd: FormData) {
  await run(fd, 'Salary run created', () => financeRpc('finance_create_pay_run', { p_month: month(fd, 'month') }));
}

export async function approvePayRunAction(fd: FormData) {
  await run(fd, 'Salaries approved and locked', () => financeRpc('finance_approve_pay_run', { p_run_id: uuid(fd, 'run') }));
}

export async function markPayRunPaidAction(fd: FormData) {
  await run(fd, 'Salaries marked as paid', () => financeRpc('finance_mark_pay_run_paid', {
    p_run_id: uuid(fd, 'run'), p_account_id: uuid(fd, 'account'), p_paid_date: day(fd, 'date'),
  }));
}

// ── Budgets ─────────────────────────────────────────────────────────
export async function setBudgetAction(fd: FormData) {
  await run(fd, 'Budget saved', () => financeRpc('finance_set_budget', {
    p_month: month(fd, 'month'), p_category_id: uuid(fd, 'category'), p_branch_id: uuid(fd, 'branch'), p_amount: money(fd, 'amount'),
  }));
}

export async function deleteBudgetAction(fd: FormData) {
  await run(fd, 'Budget removed', () => financeRpc('finance_delete_budget', { p_budget_id: uuid(fd, 'budget') }));
}

export async function copyBudgetsAction(fd: FormData) {
  await run(fd, 'Budgets copied to next month', () => financeRpc('finance_copy_budgets', { p_month: month(fd, 'month') }));
}

// ── Real product cost (Supreme Administrator only; enforced in the database) ──
export async function setProductCostAction(fd: FormData) {
  await run(fd, 'Real cost saved. Sales of this product now use it.', () => financeRpc('finance_set_product_cost', {
    p_product_id: uuid(fd, 'product'), p_name: text(fd, 'name'), p_unit_cost: money(fd, 'cost'), p_from: day(fd, 'from'), p_note: text(fd, 'note'),
  }));
}

export async function setSaleCostAction(fd: FormData) {
  const clear = text(fd, 'clear') === '1';
  await run(fd, clear ? 'This sale uses the cost list again' : 'Exact cost saved for this sale', () => financeRpc('finance_set_sale_cost', {
    p_order_item_id: uuid(fd, 'item'), p_unit_cost: clear ? null : money(fd, 'cost'), p_note: text(fd, 'note'),
  }));
}

export async function joinCostProductAction(fd: FormData) {
  await run(fd, 'Joined: they now count as one product', () => financeRpc('finance_join_cost_product', {
    p_into: uuid(fd, 'into'), p_from_product: uuid(fd, 'from_product'), p_name: text(fd, 'name'),
  }));
}

export async function setInventoryRealCostAction(fd: FormData) {
  await run(fd, 'Real cost saved', () => financeRpc('finance_set_inventory_real_cost', {
    p_inventory_item_id: uuid(fd, 'inventory_item'), p_unit_cost: money(fd, 'cost'), p_from: day(fd, 'from'),
  }));
}
