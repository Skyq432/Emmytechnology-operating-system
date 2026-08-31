import { cookies } from 'next/headers';
import { getReportingRange } from './reporting-period';
import { parseReportingPeriodSelection } from './reporting-period-selection';

const COOKIE_KEY = 'emmytech-reporting-period-v1';

export async function getServerReportingRange() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(COOKIE_KEY)?.value;
  let decoded = raw || null;
  if (raw) {
    try { decoded = decodeURIComponent(raw); } catch { decoded = raw; }
  }
  const selection = parseReportingPeriodSelection(decoded);
  return getReportingRange(selection.preset, selection.startDate, selection.endDate);
}
