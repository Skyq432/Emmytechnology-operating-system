import { getSalesPayments } from '@/lib/sales/read-server';

const money = (value: number) => `₦${Number(value || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

export default async function SalesPaymentsPage() {
  const payments = await getSalesPayments();
  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Canonical payment projection</p><h1 className="mt-2 text-3xl font-black text-[#032489]">Payments</h1><p className="mt-2 text-sm text-slate-500">Order and Repair payments are shown together without copying them into a second mutable ledger.</p></div>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase tracking-[0.1em] text-slate-400"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">Reference</th><th className="px-4 py-3">Method</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">State</th></tr></thead><tbody className="divide-y divide-slate-100">{payments.map((payment) => <tr key={`${payment.source_type}-${payment.source_payment_id}`}><td className="px-4 py-3 text-slate-500">{new Date(payment.paid_at).toLocaleString('en-NG')}</td><td className="px-4 py-3 font-bold text-slate-800">{payment.source_type === 'repair' ? 'Repair' : 'Order / Sale'}</td><td className="px-4 py-3">{payment.source_code}</td><td className="px-4 py-3 capitalize">{String(payment.payment_method).replaceAll('_',' ')}</td><td className="px-4 py-3 text-right font-black">{money(payment.amount)}</td><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${payment.is_void ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>{payment.is_void ? 'Void' : 'Received'}</span></td></tr>)}</tbody></table></div>
        {!payments.length ? <div className="p-10 text-center text-sm text-slate-400">No payments recorded yet.</div> : null}
      </section>
    </div>
  );
}
