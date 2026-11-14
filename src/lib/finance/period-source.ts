// [SWAP → EmmyTech OS] Replaces the test-build src/lib/finance/period-source.ts at merge.
// Finance follows the shared report period bar (the same one Sales, Operations,
// Marketing and CRM use), so the page shows no period picker of its own.
import { getServerReportingRange } from '@/lib/reporting-period-server';
import { addDays, daysBetween, formatRange, MAX_PERIOD_DAYS, type Period } from './dates.ts';
import type { SearchParams } from './filters.ts';

export const PERIOD_FROM_PAGE = false;

// The pages pass their URL params for the test build's sake; here the bar decides.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function getFinancePeriod(_params: SearchParams): Promise<Period> {
  const range = await getServerReportingRange();
  let from = range.startDate;
  const to = range.endDate;
  // "All time" can reach back years; the Finance functions accept about 3 years.
  if (daysBetween(from, to) > MAX_PERIOD_DAYS) from = addDays(to, -MAX_PERIOD_DAYS);
  return { key: 'custom', from, to, label: `${range.label} · ${formatRange(from, to)}` };
}
