// [MERGE] Display helpers for Finance pages. Pure; safe in node:test.
import type { MoneySource, PaymentMethod } from './types.ts';

const nairaFormat = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 });

/** ₦1,460,000 (negative: −₦30,000) */
export function naira(value: number | string | null | undefined): string {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return '₦0';
  const rounded = Math.round(amount);
  const text = `₦${nairaFormat.format(Math.abs(rounded))}`;
  return rounded < 0 ? `−${text}` : text;
}

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  bank_transfer: 'Bank transfer',
  pos: 'POS',
  cash: 'Cash',
  split: 'Split',
  other: 'Other',
};

export const SOURCE_LABELS: Record<MoneySource, string> = {
  order: 'Sales orders',
  direct_sale: 'Direct sales',
  repair: 'Repairs',
};

export function methodLabel(method: string): string {
  return METHOD_LABELS[method as PaymentMethod] ?? method.replaceAll('_', ' ');
}

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source as MoneySource] ?? source.replaceAll('_', ' ');
}

export function branchLabel(name: string | null | undefined): string {
  return name || 'No branch';
}

const lagosDateTime = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Africa/Lagos',
});

/** "10 Nov 2026, 09:30" in Lagos time. */
export function lagosDateTimeLabel(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : lagosDateTime.format(date);
}

/** Share of a total as a whole percentage (0 when the total is 0). */
export function share(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

/** One CSV cell, quoted when needed, with formula injection blocked for Excel. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Item rows on the supplier bill form are numbered 1..BILL_LINE_ROWS; empty rows are skipped. */
export const BILL_LINE_ROWS = 8;
