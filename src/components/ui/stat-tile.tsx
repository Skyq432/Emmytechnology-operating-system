import * as React from 'react';
import { Card } from '@/components/ui/card';
import { Sparkline } from '@/components/ui/sparkline';
import { cn } from '@/lib/utils';

export interface StatTileProps {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  /** Tint for the icon chip — matches the app's category-color convention (blue/orange/green/purple/red). */
  tone?: 'primary' | 'secondary' | 'success' | 'danger' | 'purple' | 'neutral';
  trend?: { direction: 'up' | 'down'; label: string };
  sparklineData?: number[];
  description?: React.ReactNode;
  className?: string;
}

const TONE_CLASSES: Record<NonNullable<StatTileProps['tone']>, string> = {
  primary: 'bg-blue-50 text-emmy-primary',
  secondary: 'bg-amber-50 text-emmy-secondary-dark',
  success: 'bg-emerald-50 text-emerald-600',
  danger: 'bg-red-50 text-red-600',
  purple: 'bg-violet-50 text-violet-600',
  neutral: 'bg-slate-100 text-slate-600',
};

export function StatTile({ label, value, icon, tone = 'primary', trend, sparklineData, description, className }: StatTileProps) {
  return (
    <Card className={cn('p-5', className)}>
      <div className="flex items-center justify-between">
        <div className="text-[11.5px] font-bold text-slate-500">{label}</div>
        {icon && <div className={cn('grid h-[30px] w-[30px] shrink-0 place-items-center rounded-xl', TONE_CLASSES[tone])}>{icon}</div>}
      </div>
      <div className="mt-2.5 font-[family-name:var(--font-mono)] text-[26px] font-extrabold tabular-nums text-slate-950">{value}</div>
      {trend && (
        <div className={cn('mt-1 text-[11.5px] font-bold', trend.direction === 'up' ? 'text-emerald-600' : 'text-red-600')}>
          {trend.direction === 'up' ? '↑' : '↓'} {trend.label}
        </div>
      )}
      {sparklineData && <Sparkline data={sparklineData} className="mt-2 w-full text-emmy-primary" />}
      {description && <div className="mt-2 text-xs leading-5 text-slate-500">{description}</div>}
    </Card>
  );
}

export function StatGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4', className)}>{children}</div>;
}
