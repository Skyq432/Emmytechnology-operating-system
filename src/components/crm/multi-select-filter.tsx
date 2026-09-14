'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A dropdown checklist filter button — highlights and shows a count badge once anything
 * inside it is checked. Used for Stage/Owner/Source on the Leads page; generic enough to
 * reuse for any other multi-value filter later.
 */
export function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function toggle(value: string) {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors',
          selected.size > 0 ? 'border-emmy-primary bg-blue-50 text-emmy-primary' : 'border-slate-200 bg-white text-slate-600 hover:border-emmy-primary/30'
        )}
      >
        {label}
        {selected.size > 0 && <span className="rounded-full bg-emmy-primary px-1.5 py-0.5 text-[10px] font-extrabold text-white">{selected.size}</span>}
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-20 max-h-60 w-56 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          {options.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-slate-400">No values yet</div>
          ) : (
            options.map((option) => (
              <label key={option} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-surface-muted">
                <input type="checkbox" checked={selected.has(option)} onChange={() => toggle(option)} className="accent-emmy-primary" />
                {option}
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}
