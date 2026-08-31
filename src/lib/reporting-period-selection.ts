import type { ReportingPreset } from './reporting-period';

export interface PersistedReportingSelection {
  preset: ReportingPreset;
  startDate?: string;
  endDate?: string;
}

const presets = new Set<ReportingPreset>([
  'today','this_week','this_month','last_month','last_30_days','selected_month','this_year','all_time','custom',
]);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export function parseReportingPeriodSelection(raw: string | null | undefined): PersistedReportingSelection {
  if (!raw) return { preset: 'this_month' };
  try {
    const parsed = JSON.parse(raw) as { preset?: string; startDate?: string; endDate?: string };
    if (!parsed.preset || !presets.has(parsed.preset as ReportingPreset)) return { preset: 'this_month' };
    const preset = parsed.preset as ReportingPreset;
    if (preset === 'custom') {
      if (!parsed.startDate || !parsed.endDate || !datePattern.test(parsed.startDate) || !datePattern.test(parsed.endDate)) return { preset: 'this_month' };
      return { preset, startDate: parsed.startDate, endDate: parsed.endDate };
    }
    if (preset === 'selected_month') {
      if (!parsed.startDate || !datePattern.test(parsed.startDate)) return { preset: 'this_month' };
      return { preset, startDate: parsed.startDate };
    }
    return { preset };
  } catch {
    return { preset: 'this_month' };
  }
}
