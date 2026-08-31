const money = (value: number) => `₦${Number(value || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

export interface SalesOverviewProps {
  salesValue?: number;
  cashCollected?: number;
  outstanding?: number;
  grossProfit?: number;
  grossMargin?: number;
}

export function SalesOverview({
  salesValue = 0,
  cashCollected = 0,
  outstanding = 0,
  grossProfit = 0,
  grossMargin = 0,
}: SalesOverviewProps) {
  const cards = [
    { label: 'Sales Value', value: money(salesValue), note: 'Confirmed commercial value' },
    { label: 'Cash Collected', value: money(cashCollected), note: 'Money actually received' },
    { label: 'Outstanding', value: money(outstanding), note: 'Customer balances still due' },
    { label: 'Gross Profit', value: money(grossProfit), note: 'Frozen selling value minus cost basis' },
    { label: 'Gross Margin', value: `${Number(grossMargin || 0).toFixed(1)}%`, note: 'Gross profit ÷ sales value' },
  ];

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="mb-6">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Commercial performance</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-[#032489]">Sales Overview</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Sales Value, actual cash collected and outstanding balances are kept separate so commercial performance is not confused with cash flow.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => (
          <section key={card.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">{card.label}</div>
            <div className="mt-3 text-2xl font-black tracking-tight text-slate-900">{card.value}</div>
            <div className="mt-2 text-xs leading-5 text-slate-500">{card.note}</div>
          </section>
        ))}
      </div>

      <section className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-white p-6">
        <h2 className="text-sm font-black text-slate-900">Sales foundation</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">The commercial data model is being connected next. These cards intentionally show zero until the real Sales reporting read model is wired; no sample revenue is displayed.</p>
      </section>
    </div>
  );
}
