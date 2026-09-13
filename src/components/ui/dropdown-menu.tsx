'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Small hand-built headless dropdown: trigger + positioned panel, closes on
 * outside click or Escape. No Radix — matches this codebase's convention of
 * hand-rolling chrome-level UI rather than adding a dependency.
 */
export function DropdownMenu({
  trigger,
  children,
  align = 'end',
  panelClassName,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => React.ReactNode;
  children: React.ReactNode;
  align?: 'start' | 'end';
  panelClassName?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      {trigger({ open, toggle: () => setOpen((value) => !value) })}
      {open && (
        <div
          role="menu"
          className={cn(
            'absolute top-full z-50 mt-2 min-w-[200px] rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_14px_32px_rgba(15,23,42,0.16)]',
            align === 'end' ? 'right-0' : 'left-0',
            panelClassName
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function DropdownMenuItem({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      role="menuitem"
      className={cn(
        'flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 text-left text-[13px] font-semibold text-slate-700 transition hover:bg-slate-100 disabled:pointer-events-none disabled:opacity-50',
        className
      )}
      {...props}
    />
  );
}
