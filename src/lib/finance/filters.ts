// [MERGE] Reads Finance page filters from the URL. Pure; safe in node:test.
import { resolvePeriod, type Period } from './dates.ts';
import { MONEY_SOURCES, PAYMENT_METHODS, type MoneySource, type PaymentMethod } from './types.ts';

export type SearchParams = Record<string, string | string[] | undefined>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MONEY_IN_PAGE_SIZE = 50;
export const MONEY_IN_EXPORT_LIMIT = 5000;

export function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export interface BranchFilter {
  /** A branch id, or null for all branches. */
  branchId: string | null;
  /** True when the user picked "No branch" (payments with no branch recorded). */
  noBranch: boolean;
  /** Raw value for the <select>. */
  value: string;
}

export function parseBranch(value: string | undefined): BranchFilter {
  if (value === 'none') return { branchId: null, noBranch: true, value: 'none' };
  if (value && UUID.test(value)) return { branchId: value.toLowerCase(), noBranch: false, value: value.toLowerCase() };
  return { branchId: null, noBranch: false, value: '' };
}

export interface OverviewFilters {
  period: Period;
  branch: BranchFilter;
}

export function parseOverviewFilters(params: SearchParams, now: Date = new Date(), period?: Period): OverviewFilters {
  period ??= resolvePeriod({ period: first(params.period), from: first(params.from), to: first(params.to) }, now);
  // "No branch" is a Money In filter only; the overview shows it as its own row instead.
  const branch = parseBranch(first(params.branch));
  return { period, branch: branch.noBranch ? parseBranch(undefined) : branch };
}

export interface MoneyInFilters extends OverviewFilters {
  method: PaymentMethod | null;
  source: MoneySource | null;
  search: string;
  includeVoid: boolean;
  page: number;
}

export function parseMoneyInFilters(params: SearchParams, now: Date = new Date(), period?: Period): MoneyInFilters {
  period ??= resolvePeriod({ period: first(params.period), from: first(params.from), to: first(params.to) }, now);
  const method = first(params.method);
  const source = first(params.source);
  const page = Number.parseInt(first(params.page) ?? '1', 10);
  return {
    period,
    branch: parseBranch(first(params.branch)),
    method: (PAYMENT_METHODS as readonly string[]).includes(method ?? '') ? (method as PaymentMethod) : null,
    source: (MONEY_SOURCES as readonly string[]).includes(source ?? '') ? (source as MoneySource) : null,
    search: (first(params.q) ?? '').trim().slice(0, 80),
    includeVoid: first(params.void) === '1',
    page: Number.isFinite(page) && page > 0 ? Math.min(page, 10000) : 1,
  };
}

/** Builds a query string from filters, keeping only what is set. */
export function moneyInQuery(filters: MoneyInFilters, overrides: Partial<Record<string, string | null>> = {}): string {
  const values: Record<string, string | null> = {
    period: filters.period.key,
    from: filters.period.key === 'custom' ? filters.period.from : null,
    to: filters.period.key === 'custom' ? filters.period.to : null,
    branch: filters.branch.value || null,
    method: filters.method,
    source: filters.source,
    q: filters.search || null,
    void: filters.includeVoid ? '1' : null,
    page: filters.page > 1 ? String(filters.page) : null,
    ...overrides,
  };
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value) query.set(key, value);
  const text = query.toString();
  return text ? `?${text}` : '';
}

/** Arguments for public.finance_money_in(). */
export function moneyInArgs(filters: MoneyInFilters, limit: number, offset: number) {
  return {
    p_from: filters.period.from,
    p_to: filters.period.to,
    p_branch_id: filters.branch.branchId,
    p_no_branch: filters.branch.noBranch,
    p_method: filters.method,
    p_source: filters.source,
    p_search: filters.search || null,
    p_include_void: filters.includeVoid,
    p_limit: limit,
    p_offset: offset,
  };
}
