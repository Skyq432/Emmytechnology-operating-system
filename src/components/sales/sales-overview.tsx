import Link from 'next/link';
import type { SalesOverviewData } from '@/lib/sales/types';

const money = (value: number) => `₦${Number(value || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

export function SalesOverview({ data }: { data: SalesOverviewData }) {
  const cards = [
    { label: 'Sales Value', value: money(data.salesValue), note: 'Confirmed commercial value' },
    { label: 'Cash Collected', value: money(data.cashCollected), note: 'Money actually received' },
    { label: 'Outstanding', value: money(data.outstanding), note: 'Customer balances still due' },
    { label: 'Gross Profit', value: money(data.grossProfit), note: 'Frozen selling value minus cost basis' },
    { label: 'Gross Margin', value: `${Number(data.grossMargin || 0).toFixed(1)}%`, note: 'Gross profit ÷ sales value' },
  ];

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Commercial performance</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-[#032489]">Sales Overview</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Sales Value, actual cash collected and outstanding balances remain separate so commercial performance is never confused with cash flow.</p>
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

      <div className="grid gap-4 md:grid-cols-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">Direct Sales</div><div className="mt-2 text-2xl font-black">{data.directSales}</div></section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">Orders</div><div className="mt-2 text-2xl font-black">{data.orders}</div></section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">Published Quotes</div><div className="mt-2 text-2xl font-black">{data.quotationsPublished}</div></section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">Accepted Quotes</div><div className="mt-2 text-2xl font-black">{data.quotationsAccepted}</div></section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5"><h2 className="font-black text-slate-900">Needs attention</h2><p className="mt-1 text-xs text-slate-400">Commercial items that need a staff decision.</p></div>
        <div className="divide-y divide-slate-100">
          {data.attention.map((item) => (
            <Link href={item.href} key={item.key} className="flex items-center justify-between gap-4 p-4 transition hover:bg-slate-50">
              <span className="text-sm font-semibold text-slate-700">{item.label}</span>
              <span className={`rounded-full px-3 py-1 text-xs font-black ${item.count > 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'}`}>{item.count}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
