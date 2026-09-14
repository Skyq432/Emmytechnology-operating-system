import * as React from 'react';
import { cn } from '@/lib/utils';

/** Reusable eyebrow + title (+ optional right-aligned action slot). */
export function PageHeader({
  eyebrow,
  title,
  action,
  className,
}: {
  eyebrow: React.ReactNode;
  title: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-between gap-4', className)}>
      <div className="min-w-0">
        <div className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-slate-500">{eyebrow}</div>
        <div className="mt-0.5 truncate text-[17px] font-extrabold tracking-tight text-slate-950">{title}</div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
