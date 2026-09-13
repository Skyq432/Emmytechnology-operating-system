import * as React from 'react';
import { cn } from '@/lib/utils';

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'success' | 'error' | 'info' | 'warning';
}

const VARIANT_CLASSES: Record<NonNullable<AlertProps['variant']>, string> = {
  success: 'bg-emerald-50 text-emerald-700',
  error: 'bg-rose-50 text-rose-700',
  info: 'bg-blue-50 text-emmy-primary',
  warning: 'bg-amber-50 text-amber-800',
};

/** A small inline status banner — replaces the success/error message ternary hand-rolled in nearly every form across Sales and Operations. */
export function Alert({ variant = 'info', className, ...props }: AlertProps) {
  return <div className={cn('rounded-xl px-3 py-2 text-sm font-semibold', VARIANT_CLASSES[variant], className)} {...props} />;
}

export interface ActionResultProps {
  /** Matches the `{ success, message }` shape every module's `useActionState` result already has — structural typing, no import needed. */
  state: { success: boolean; message?: string | null };
  className?: string;
}

/** Renders nothing until the action state has a message, then shows it as a success/error Alert. */
export function ActionResult({ state, className }: ActionResultProps) {
  if (!state.message) return null;
  return (
    <Alert variant={state.success ? 'success' : 'error'} className={className}>
      {state.message}
    </Alert>
  );
}
