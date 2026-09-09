export function HelpTip({ text, label = 'What does this mean?' }: { text: string; label?: string }) {
  return (
    <span className="group relative inline-flex shrink-0">
      <button
        type="button"
        aria-label={label}
        className="inline-flex h-4 w-4 items-center justify-center text-[12px] font-black leading-none text-slate-400 transition hover:text-[#032489] focus:text-[#032489] focus:outline-none"
      >
        ?
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-6 z-50 w-64 -translate-x-1/2 rounded-xl border border-slate-200 bg-slate-950 px-3 py-2.5 text-left text-xs font-medium leading-5 text-white opacity-0 shadow-xl transition group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}
