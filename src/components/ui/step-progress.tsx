import { cn } from '@/lib/utils';

export function StepProgress({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs font-bold text-slate-500">
      {steps.map((label, index) => (
        <div key={label} className="flex items-center gap-2">
          {index > 0 && <span className="text-slate-300">→</span>}
          <span
            className={cn(
              'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px]',
              index === current ? 'bg-emmy-primary text-white' : index < current ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'
            )}
          >
            {index + 1}
          </span>
          <span className={index === current ? 'text-slate-900' : ''}>{label}</span>
        </div>
      ))}
    </div>
  );
}
