import Link from 'next/link';
import { getUnifiedSalesCustomers } from '@/lib/sales/unified-report-server';

const money = (value: number) => `₦${Number(value || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

export default async function SalesCustomersPage() {
  const customers = await getUnifiedSalesCustomers();
  return <div className="mx-auto max-w-[1400px] space-y-5">
    <div><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">CRM Identity commercial view</p><h1 className="mt-2 text-3xl font-black text-[#032489]">Customers</h1><p className="mt-2 text-sm text-slate-500">One Identity connects quotations, Orders, Direct Sales, payments, receipts and Repair revenue. Detailed relationship history stays in CRM.</p></div>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase tracking-[0.1em] text-slate-400"><tr><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Contact</th><th className="px-4 py-3 text-right">Sales Value</th><th className="px-4 py-3 text-right">Cash</th><th className="px-4 py-3 text-right">Outstanding</th><th className="px-4 py-3 text-right">Repairs</th><th className="px-4 py-3">Quotes</th></tr></thead><tbody className="divide-y divide-slate-100">{customers.map((customer) => <tr key={customer.id}><td className="px-4 py-3"><div className="font-bold text-slate-900">{customer.primary_name || 'Unnamed customer'}</div><div className="text-xs text-slate-400">{customer.identity_code}</div></td><td className="px-4 py-3 text-slate-500">{customer.primary_phone || customer.primary_email || '—'}</td><td className="px-4 py-3 text-right font-black">{money(customer.salesValue)}</td><td className="px-4 py-3 text-right">{money(customer.cashCollected)}</td><td className="px-4 py-3 text-right">{money(customer.outstanding)}</td><td className="px-4 py-3 text-right">{customer.repairTransactions}</td><td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold">{customer.acceptedQuotations}/{customer.quotations} accepted</span></td></tr>)}</tbody></table></div>{!customers.length ? <div className="p-10 text-center text-sm text-slate-400">No customer commercial activity yet.</div> : null}</section>
    <div className="text-xs text-slate-400">Open full customer relationship details from CRM when needed. <Link href="/modules/crm" className="font-bold text-[#032489]">Go to CRM</Link></div>
  </div>;
}
