import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Generic hover/focus tooltip, CSS-only (no portal, no dependency — matches this
 * codebase's convention). Wrap any trigger element; the tooltip positions below it.
 */
export function Tooltip({
  content,
  children,
  className,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute left-1/2 top-full z-50 mt-2 w-max max-w-64 -translate-x-1/2 rounded-xl border border-slate-200 bg-slate-950 px-3 py-2.5 text-left text-xs font-medium leading-5 text-white opacity-0 shadow-xl transition group-hover:opacity-100 group-focus-within:opacity-100',
          className
        )}
      >
        {content}
      </span>
    </span>
  );
}

/** Preset: a small "?" affordance that explains something on hover/focus. */
export function HelpTip({ text, label = 'What does this mean?' }: { text: string; label?: string }) {
  return (
    <Tooltip content={text}>
      <button
        type="button"
        aria-label={label}
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-[12px] font-black leading-none text-slate-400 transition hover:text-emmy-primary focus:text-emmy-primary focus:outline-none"
      >
        ?
      </button>
    </Tooltip>
  );
}
