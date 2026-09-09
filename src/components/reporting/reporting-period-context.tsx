'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  getReportingRange,
  nigeriaToday,
  type ReportingPreset,
  type ReportingRange,
} from '@/lib/reporting-period';

interface StoredPeriod {
  preset: ReportingPreset;
  startDate?: string;
  endDate?: string;
}

interface ReportingPeriodContextValue {
  range: ReportingRange;
  setPreset: (preset: ReportingPreset) => void;
  setCustomRange: (startDate: string, endDate: string) => void;
  setSelectedMonth: (month: string) => void;
}

export const REPORTING_PERIOD_STORAGE_KEY = 'emmytech-reporting-period-v1';
export const REPORTING_PERIOD_COOKIE_KEY = 'emmytech-reporting-period-v1';

const ReportingPeriodContext = createContext<ReportingPeriodContextValue | null>(null);

export function ReportingPeriodProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<StoredPeriod>({ preset: 'this_month' });

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(REPORTING_PERIOD_STORAGE_KEY);
      if (!saved) return;
      setSelection(JSON.parse(saved) as StoredPeriod);
    } catch {
      window.localStorage.removeItem(REPORTING_PERIOD_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    const serialized = JSON.stringify(selection);
    window.localStorage.setItem(REPORTING_PERIOD_STORAGE_KEY, serialized);
    document.cookie = `${REPORTING_PERIOD_COOKIE_KEY}=${encodeURIComponent(serialized)}; path=/; max-age=31536000; samesite=lax`;
  }, [selection]);

  const range = useMemo(
    () => getReportingRange(selection.preset, selection.startDate, selection.endDate),
    [selection]
  );

  const value = useMemo<ReportingPeriodContextValue>(
    () => ({
      range,
      setPreset(preset) {
        if (preset === 'selected_month') {
          setSelection({ preset, startDate: `${nigeriaToday().slice(0, 7)}-01` });
          return;
        }
        if (preset === 'custom') {
          setSelection({ preset, startDate: range.startDate, endDate: range.endDate });
          return;
        }
        setSelection({ preset });
      },
      setCustomRange(startDate, endDate) {
        setSelection({ preset: 'custom', startDate, endDate });
      },
      setSelectedMonth(month) {
        setSelection({ preset: 'selected_month', startDate: `${month}-01` });
      },
    }),
    [range]
  );

  return <ReportingPeriodContext.Provider value={value}>{children}</ReportingPeriodContext.Provider>;
}

export function useReportingPeriod() {
  const value = useContext(ReportingPeriodContext);
  if (!value) throw new Error('useReportingPeriod must be used inside ReportingPeriodProvider.');
  return value;
}
