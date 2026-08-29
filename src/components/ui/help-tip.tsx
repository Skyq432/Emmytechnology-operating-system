import { CircleHelp } from 'lucide-react';

export function HelpTip({ text, label = 'What does this mean?' }: { text: string; label?: string }) {
  return (
    <span className="group relative inline-flex shrink-0">
      <button
        type="button"
        aria-label={label}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition hover:bg-blue-50 hover:text-[#032489] focus:bg-blue-50 focus:text-[#032489] focus:outline-none"
      >
        <CircleHelp className="h-4 w-4" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-7 z-50 w-64 -translate-x-1/2 rounded-xl border border-slate-200 bg-slate-950 px-3 py-2.5 text-left text-xs font-medium leading-5 text-white opacity-0 shadow-xl transition group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}
