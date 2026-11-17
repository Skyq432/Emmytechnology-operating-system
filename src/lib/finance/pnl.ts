// [MERGE] Turns the raw profit-and-loss lines from finance_profit_and_loss()
// into the report rows. Pure; used by the Reports page, the CSV and the tests.
import type { ProfitAndLoss } from './types.ts';

export type PnlRowStyle = 'sub' | 'strong' | 'total';

export interface PnlRow {
  label: string;
  style: PnlRowStyle;
  /** Signed amounts: costs are negative. Keyed by column key. */
  values: Record<string, number>;
  total: number;
}

export interface PnlTable {
  columns: Array<{ key: string; name: string }>;
  rows: PnlRow[];
  revenue: number;
  grossProfit: number;
  expenses: number;
  salaries: number;
  netProfit: number;
  byColumn: { net: Record<string, number> };
  /** Sold items with no real cost yet; the month is not final while count > 0. */
  costMissing: { count: number; value: number };
}

export function buildPnl(raw: ProfitAndLoss): PnlTable {
  const keys = raw.columns.map((c) => c.key);
  const zero = () => Object.fromEntries(keys.map((k) => [k, 0])) as Record<string, number>;
  const lineValues = (line: string, label?: string) => {
    const out = zero();
    raw.lines.filter((l) => l.line === line && (label === undefined || l.label === label)).forEach((l) => {
      for (const [k, v] of Object.entries(l.values)) out[k in out ? k : 'company'] = (out[k in out ? k : 'company'] ?? 0) + Number(v);
    });
    return out;
  };
  const combine = (fn: (k: string) => number) => Object.fromEntries(keys.map((k) => [k, fn(k)])) as Record<string, number>;
  const sum = (values: Record<string, number>) => Object.values(values).reduce((a, b) => a + b, 0);
  const negate = (values: Record<string, number>) => combine((k) => -values[k]);
  const row = (label: string, style: PnlRowStyle, values: Record<string, number>): PnlRow => ({ label, style, values, total: sum(values) });

  const sales = lineValues('sales');
  const repairs = lineValues('repairs');
  const refunds = lineValues('refunds');
  const cogs = lineValues('cogs');
  const salaries = lineValues('salaries');
  const expenseLabels = [...new Set(raw.lines.filter((l) => l.line === 'expense').map((l) => l.label))].sort();
  const expenseLines = expenseLabels.map((label) => ({ label, values: lineValues('expense', label) }));

  const revenue = combine((k) => sales[k] + repairs[k] - refunds[k]);
  const gross = combine((k) => revenue[k] - cogs[k]);
  const expenses = combine((k) => expenseLines.reduce((t, e) => t + e.values[k], 0));
  const net = combine((k) => gross[k] - expenses[k] - salaries[k]);

  const rows: PnlRow[] = [
    row('Sales confirmed', 'sub', sales),
    row('Repairs finished', 'sub', repairs),
    row('Refunds', 'sub', negate(refunds)),
    row('Revenue', 'strong', revenue),
    row('Cost of goods and repair parts', 'sub', negate(cogs)),
    row('Gross profit', 'total', gross),
    ...expenseLines.map((e) => row(e.label, 'sub', negate(e.values))),
    row('Expenses', 'strong', negate(expenses)),
    row('Salaries', 'strong', negate(salaries)),
    row('Net profit', 'total', net),
  ];

  return {
    columns: raw.columns,
    rows,
    revenue: sum(revenue),
    grossProfit: sum(gross),
    expenses: sum(expenses),
    salaries: sum(salaries),
    netProfit: sum(net),
    byColumn: { net },
    costMissing: { count: Number(raw.cost_missing?.count ?? 0), value: Number(raw.cost_missing?.value ?? 0) },
  };
}
