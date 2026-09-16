'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarRange } from 'lucide-react';
import { reportingPresetOptions } from '@/lib/reporting-period';
import { useReportingPeriod } from '@/components/reporting/reporting-period-context';
import { HelpTip } from '@/components/ui/help-tip';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';

export function OperationsPeriodBar({ moduleLabel = 'Operations', helpText }: { moduleLabel?: string; helpText?: string }) {
  const router = useRouter();
  const { range, setPreset, setCustomRange, setSelectedMonth } = useReportingPeriod();
  const first = useRef(true);
  const title = `${moduleLabel} time frame`;

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const timer = window.setTimeout(() => router.refresh(), 80);
    return () => window.clearTimeout(timer);
  }, [range.startIso, range.endExclusiveIso, router]);

  return (
    <div className="mb-5 flex flex-col gap-3 rounded-xl border border-blue-100 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-blue-50 text-emmy-primary"><CalendarRange className="h-4 w-4" /></div>
        <div>
          <div className="flex items-center gap-1.5"><p className="text-xs font-black text-slate-800">{title}</p><HelpTip text={helpText ?? `This controls the month or dates shown across ${moduleLabel}.`} label={`About ${title}`} /></div>
          <p className="mt-0.5 text-xs text-slate-500">Showing {range.shortLabel}</p>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Select value={range.preset} onChange={(e) => setPreset(e.target.value as typeof range.preset)} className="h-8 text-xs font-bold text-slate-700">
          {reportingPresetOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </Select>
        {range.preset === 'selected_month' && <Input type="month" value={range.startDate.slice(0, 7)} onChange={(e) => setSelectedMonth(e.target.value)} className="h-8 text-xs" />}
        {range.preset === 'custom' && <>
          <Input type="date" value={range.startDate} max={range.endDate} onChange={(e) => setCustomRange(e.target.value, range.endDate)} className="h-8 text-xs" />
          <Input type="date" value={range.endDate} min={range.startDate} onChange={(e) => setCustomRange(range.startDate, e.target.value)} className="h-8 text-xs" />
        </>}
      </div>
    </div>
  );
}
