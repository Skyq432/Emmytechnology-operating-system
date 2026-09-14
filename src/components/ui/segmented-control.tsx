import { cn } from '@/lib/utils';

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedControlOption<T>[];
  size?: 'sm' | 'default';
  className?: string;
}

/** A two-or-more-way toggle rendered as a pill group — replaces the hand-rolled two-button ternary toggles used for mode switches (stock/service, product/custom, standalone/for-an-order). */
export function SegmentedControl<T extends string>({ value, onChange, options, size = 'default', className }: SegmentedControlProps<T>) {
  return (
    <div className={cn('inline-flex rounded-lg bg-slate-100 p-1', className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-md font-bold transition-colors',
            size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm',
            value === option.value ? 'bg-emmy-primary text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
