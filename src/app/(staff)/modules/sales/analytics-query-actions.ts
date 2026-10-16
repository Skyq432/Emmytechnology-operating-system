'use server';

import { runAnalyticsQuery } from '@/lib/sales/analytics-query-server';

export type AnalyticsQueryActionState = {
  success: boolean;
  message: string;
  rows?: Record<string, unknown>[];
  columns?: string[];
  rowCount?: number;
  truncated?: boolean;
};

const fail = (message: string): AnalyticsQueryActionState => ({ success: false, message });

export async function runAnalyticsQueryAction(
  _prev: AnalyticsQueryActionState,
  formData: FormData
): Promise<AnalyticsQueryActionState> {
  const sql = String(formData.get('sql') || '').trim();
  if (!sql) return fail('Enter a query first.');

  try {
    const result = await runAnalyticsQuery(sql);
    return {
      success: true,
      message: result.truncated
        ? `Showing the first ${result.rowCount.toLocaleString()} rows (truncated).`
        : `${result.rowCount.toLocaleString()} row${result.rowCount === 1 ? '' : 's'}.`,
      rows: result.rows,
      columns: result.columns,
      rowCount: result.rowCount,
      truncated: result.truncated,
    };
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Unable to run that query.');
  }
}
