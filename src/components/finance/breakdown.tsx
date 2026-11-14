// [MERGE] Simple ranked breakdown (label · bar · amount) and a daily bar chart.
import { Card } from '@/components/ui/card';
import { formatDay } from '@/lib/finance/dates';
import { naira, share } from '@/lib/finance/format';

export interface BreakdownRow {
  key: string;
  label: string;
  amount: number;
  count: number;
  href?: string;
  muted?: boolean;
}

export function BreakdownCard({ title, rows, total, empty = 'Nothing in this period.' }: { title: string; rows: BreakdownRow[]; total: number; empty?: string }) {
  return (
    <Card className="p-5">
      <h2 className="text-sm font-extrabold text-slate-950">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">{empty}</p>
      ) : (
        <ul className="mt-4 space-y-3.5">
          {rows.map((row) => {
            const percent = share(row.amount, total);
            const label = row.href ? (
              <a href={row.href} className="font-bold text-slate-700 no-underline hover:text-emmy-primary">{row.label}</a>
            ) : (
              <span className={row.muted ? 'font-bold text-amber-700' : 'font-bold text-slate-700'}>{row.label}</span>
            );
            return (
              <li key={row.key}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">
                    {label}
                    <span className="ml-2 text-xs font-medium text-slate-400">{row.count} {row.count === 1 ? 'payment' : 'payments'}</span>
                  </span>
                  <span className="shrink-0 font-[family-name:var(--font-mono)] font-extrabold tabular-nums text-slate-900">{naira(row.amount)}</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                  <div className={row.muted ? 'h-full rounded-full bg-amber-400' : 'h-full rounded-full bg-emmy-primary'} style={{ width: `${Math.max(percent, row.amount > 0 ? 2 : 0)}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function DailyBars({ days, values }: { days: string[]; values: Map<string, number> }) {
  const max = Math.max(1, ...days.map((day) => values.get(day) ?? 0));
  const showEvery = days.length > 31 ? 7 : days.length > 14 ? 3 : 1;
  return (
    <div>
      <div className="flex h-40 items-end gap-[3px]" role="img" aria-label="Money in per day">
        {days.map((day) => {
          const value = values.get(day) ?? 0;
          return (
            <div key={day} className="group relative flex h-full flex-1 items-end">
              <div
                className={value > 0 ? 'w-full rounded-t-md bg-emmy-primary/85 group-hover:bg-emmy-primary' : 'w-full rounded-t-md bg-slate-100'}
                style={{ height: value > 0 ? `${Math.max((value / max) * 100, 3)}%` : '3px' }}
              />
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-bold text-white group-hover:block">
                {formatDay(day)} · {naira(value)}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-[3px] text-[10px] font-semibold text-slate-400">
        {days.map((day, index) => (
          <div key={day} className="flex-1 text-center">
            {index % showEvery === 0 ? Number(day.slice(8)) : ''}
          </div>
        ))}
      </div>
    </div>
  );
}
