// [MERGE] Reporting periods in Lagos time (WAT = UTC+1, no daylight saving).
// Pure functions: no server or framework imports, so they run in node:test too.

export type PeriodKey = 'today' | 'yesterday' | 'week' | 'month' | 'last_month' | 'custom';

export const PERIOD_OPTIONS: Array<{ key: PeriodKey; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'custom', label: 'Custom' },
];

export interface Period {
  key: PeriodKey;
  /** First day, YYYY-MM-DD (Lagos). */
  from: string;
  /** Last day, inclusive, YYYY-MM-DD (Lagos). */
  to: string;
  label: string;
}

/** Same limit as the database functions. */
export const MAX_PERIOD_DAYS = 1100;

const LAGOS_OFFSET_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function toIsoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Parses YYYY-MM-DD as a calendar day (held at UTC midnight). Null if not a real date. */
export function parseIsoDay(value: string | null | undefined): Date | null {
  if (!value || !ISO_DAY.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || toIsoDay(date) !== value) return null;
  return date;
}

/** Today's date in Lagos as YYYY-MM-DD. */
export function lagosToday(now: Date = new Date()): string {
  return toIsoDay(new Date(now.getTime() + LAGOS_OFFSET_MS));
}

export function addDays(day: string, days: number): string {
  const date = parseIsoDay(day);
  if (!date) throw new Error(`Invalid day: ${day}`);
  return toIsoDay(new Date(date.getTime() + days * DAY_MS));
}

export function daysBetween(from: string, to: string): number {
  const a = parseIsoDay(from);
  const b = parseIsoDay(to);
  if (!a || !b) throw new Error('Invalid day');
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

const dayFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const dayMonthFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** "13 Nov 2026" */
export function formatDay(day: string): string {
  const date = parseIsoDay(day);
  return date ? dayFormat.format(date) : day;
}

/** "1 – 13 Nov 2026", "28 Oct – 3 Nov 2026" or "13 Nov 2026" */
export function formatRange(from: string, to: string): string {
  if (from === to) return formatDay(from);
  const a = parseIsoDay(from);
  const b = parseIsoDay(to);
  if (!a || !b) return `${from} – ${to}`;
  if (a.getUTCFullYear() !== b.getUTCFullYear()) return `${formatDay(from)} – ${formatDay(to)}`;
  if (a.getUTCMonth() === b.getUTCMonth()) return `${a.getUTCDate()} – ${formatDay(to)}`;
  return `${dayMonthFormat.format(a)} – ${formatDay(to)}`;
}

function makePeriod(key: PeriodKey, from: string, to: string): Period {
  const name = PERIOD_OPTIONS.find((option) => option.key === key)?.label ?? 'Period';
  return { key, from, to, label: key === 'custom' ? formatRange(from, to) : `${name} · ${formatRange(from, to)}` };
}

/**
 * Turns ?period=&from=&to= into a concrete Lagos date range.
 * Anything invalid falls back to "This month", so a bad link never breaks the page.
 */
export function resolvePeriod(
  params: { period?: string | null; from?: string | null; to?: string | null },
  now: Date = new Date(),
): Period {
  const today = lagosToday(now);
  const todayDate = parseIsoDay(today)!;
  const monthStart = `${today.slice(0, 8)}01`;

  switch (params.period) {
    case 'today':
      return makePeriod('today', today, today);
    case 'yesterday': {
      const yesterday = addDays(today, -1);
      return makePeriod('yesterday', yesterday, yesterday);
    }
    case 'week': {
      // Weeks start on Monday.
      const weekday = (todayDate.getUTCDay() + 6) % 7;
      return makePeriod('week', addDays(today, -weekday), today);
    }
    case 'last_month': {
      const lastMonthEnd = addDays(monthStart, -1);
      return makePeriod('last_month', `${lastMonthEnd.slice(0, 8)}01`, lastMonthEnd);
    }
    case 'custom': {
      const from = parseIsoDay(params.from ?? null) ? params.from! : null;
      const to = parseIsoDay(params.to ?? null) ? params.to! : null;
      if (from && to && from <= to && daysBetween(from, to) <= MAX_PERIOD_DAYS) {
        return makePeriod('custom', from, to);
      }
      return makePeriod('month', monthStart, today);
    }
    case 'month':
    default:
      return makePeriod('month', monthStart, today);
  }
}

/** Every day in the range, for charts that should show empty days too. */
export function eachDay(from: string, to: string): string[] {
  const days: string[] = [];
  const total = daysBetween(from, to);
  for (let i = 0; i <= total && i <= MAX_PERIOD_DAYS; i += 1) days.push(addDays(from, i));
  return days;
}
