import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export interface NavItemProps extends React.ComponentPropsWithoutRef<typeof Link> {
  icon?: React.ReactNode;
  active?: boolean;
  /** Sidebar (vertical, on the dark shell) vs. sub-nav (horizontal pill, on a light surface). */
  tone?: 'sidebar' | 'pill';
  collapsed?: boolean;
}

const NavItem = React.forwardRef<HTMLAnchorElement, NavItemProps>(
  ({ className, icon, active, tone = 'sidebar', collapsed, children, ...props }, ref) => {
    if (tone === 'pill') {
      return (
        <Link
          ref={ref}
          className={cn(
            'inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold transition-colors',
            active ? 'bg-emmy-primary text-white' : 'border border-slate-200 bg-white text-slate-600 hover:border-emmy-primary/25',
            className
          )}
          {...props}
        >
          {icon}
          {children}
        </Link>
      );
    }

    return (
      <Link
        ref={ref}
        title={collapsed ? undefined : undefined}
        className={cn(
          'flex min-h-[42px] items-center gap-3 rounded-[13px] px-4 text-[13.5px] font-semibold transition-colors',
          collapsed ? 'justify-center px-0' : '',
          active
            ? 'bg-white text-emmy-primary shadow-[var(--shadow-nav-active)]'
            : 'text-[#adc0ea] hover:bg-white/[0.08] hover:text-white',
          className
        )}
        {...props}
      >
        {icon}
        {!collapsed && <span className="truncate">{children}</span>}
      </Link>
    );
  }
);
NavItem.displayName = 'NavItem';

export { NavItem };
