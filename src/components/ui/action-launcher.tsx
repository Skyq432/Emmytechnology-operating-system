import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export interface ActionLauncherProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  href?: string;
  onClick?: () => void;
  tone?: 'primary' | 'secondary' | 'success' | 'purple' | 'danger';
  className?: string;
}

const TONE_CLASSES: Record<NonNullable<ActionLauncherProps['tone']>, string> = {
  primary: 'bg-blue-50 text-emmy-primary',
  secondary: 'bg-amber-50 text-emmy-secondary-dark',
  success: 'bg-emerald-50 text-emerald-600',
  purple: 'bg-violet-50 text-violet-600',
  danger: 'bg-red-50 text-red-600',
};

/**
 * Big icon + label + description tile — the "action launcher" pattern for
 * front-desk/technician homes: a handful of obvious, tappable daily tasks,
 * no menu-hunting required.
 */
export function ActionLauncher({ icon, title, description, href, onClick, tone = 'primary', className }: ActionLauncherProps) {
  const content = (
    <>
      <div className={cn('grid h-12 w-12 shrink-0 place-items-center rounded-2xl', TONE_CLASSES[tone])}>{icon}</div>
      <div>
        <div className="text-[14.5px] font-extrabold text-slate-950">{title}</div>
        {description && <div className="mt-0.5 text-xs leading-snug text-slate-500">{description}</div>}
      </div>
    </>
  );

  const classes = cn(
    'flex flex-col items-start gap-3 rounded-[20px] border border-slate-200 bg-white p-[22px] text-left shadow-[0_8px_26px_rgba(15,23,42,0.045)] transition hover:-translate-y-0.5 hover:border-emmy-primary/25 hover:shadow-lg',
    className
  );

  if (href) {
    return (
      <Link href={href} className={classes}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={classes}>
      {content}
    </button>
  );
}

export function ActionGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4', className)}>{children}</div>;
}
