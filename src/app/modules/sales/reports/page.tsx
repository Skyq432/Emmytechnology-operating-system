import { getSalesReportSummary } from '@/lib/sales/read-server';

const money = (value: number) => `₦${Number(value || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

export default async function SalesReportsPage() {
  const report = await getSalesReportSummary();
  const rows = [
    ['Gross Sales', money(report.grossSales), 'Confirmed commercial value before returns/refunds'],
    ['Cash Collected', money(report.cashCollected), 'Actual customer payments received'],
    ['Outstanding', money(report.outstanding), 'Current unpaid balances'],
    ['Gross Profit', money(report.grossProfit), 'Frozen selling value minus approved cost basis'],
    ['Gross Margin', `${report.grossMargin.toFixed(1)}%`, 'Gross profit ÷ gross sales'],
    ['Cash Refunded', money(report.cashRefunded), 'Refund money recorded'],
    ['Net Cash', money(report.netCash), 'Cash collected minus cash refunded'],
    ['Quoted Value', money(report.quotedValue), 'Potential revenue, reported separately from Sales Value'],
    ['Approved / Completed Returns', String(report.returns), 'Formal return records'],
  ] as const;
  return <div className="mx-auto max-w-[1400px] space-y-5"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Commercial reporting</p><h1 className="mt-2 text-3xl font-black text-[#032489]">Sales Reports</h1><p className="mt-2 text-sm text-slate-500">Quoted value, Sales Value, cash, outstanding, margin and refunds remain distinct so reports can be reconciled instead of mixed together.</p></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{rows.map(([label,value,note]) => <section key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">{label}</div><div className="mt-3 text-2xl font-black text-slate-900">{value}</div><div className="mt-2 text-xs leading-5 text-slate-500">{note}</div></section>)}</div><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-black">Reporting definition</h2><p className="mt-2 text-sm leading-6 text-slate-500">A payment received today against an older Order contributes to today's Cash Collected without becoming today's Sales Value. Quotations never become Sales Value until converted into a confirmed commercial transaction.</p></section></div>;
}
