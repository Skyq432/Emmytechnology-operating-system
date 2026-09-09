'use client';

import { useActionState } from 'react';
import { recordOrderPaymentAction, type SalesActionState } from '@/app/modules/operations/sales-actions';
import type { OperationsOrder, OperationsOrderPayment } from '@/lib/operations/types';
import { HelpTip } from '@/components/ui/help-tip';

const initialState: SalesActionState = { success:false, message:'' };
const money=(v:number)=>`₦${Number(v||0).toLocaleString('en-NG',{maximumFractionDigits:0})}`;

export function OrderPayments({order,payments}:{order:OperationsOrder;payments:OperationsOrderPayment[]}){
 const [state,action,pending]=useActionState(recordOrderPaymentAction,initialState);
 return <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
   <div className="flex items-center gap-2"><h2 className="text-sm font-black text-slate-900">Payments</h2><HelpTip text="Record each payment separately. The Order automatically updates Paid, Balance and payment status. Pending Ambassador commission becomes earned only when the Order is fully paid." label="About payments" /></div>
   <div className="mt-4 grid gap-3 sm:grid-cols-3"><Stat label="Paid" value={money(order.amount_paid)}/><Stat label="Balance" value={money(order.balance_due)}/><Stat label="Status" value={order.payment_status.replaceAll('_',' ')}/></div>
   {payments.length>0&&<div className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-100">{payments.map(p=><div key={p.id} className="flex flex-col justify-between gap-2 px-3 py-3 sm:flex-row sm:items-center"><div><p className="text-sm font-black text-slate-800">{money(p.amount)}</p><p className="mt-1 text-xs text-slate-500 capitalize">{p.payment_method.replaceAll('_',' ')}{p.reference?` · ${p.reference}`:''}</p></div><p className="text-xs font-semibold text-slate-400">{new Date(p.paid_at).toLocaleString('en-NG',{dateStyle:'medium',timeStyle:'short'})}</p></div>)}</div>}
   {order.commercial_state!=='cancelled'&&order.payment_status!=='paid'&&<form action={action} className="mt-4 grid gap-3 rounded-lg bg-slate-50 p-4 md:grid-cols-4"><input type="hidden" name="order_id" value={order.id}/><Field label="Amount"><input required name="amount" type="number" min="1" className="input" /></Field><Field label="Method"><select name="payment_method" className="input" defaultValue="bank_transfer"><option value="bank_transfer">Bank Transfer</option><option value="pos">POS</option><option value="cash">Cash</option><option value="split">Split</option><option value="other">Other</option></select></Field><Field label="Reference"><input name="reference" className="input" /></Field><Field label="Note"><input name="note" className="input" /></Field><div className="md:col-span-4">{state.message&&<p className={`mb-3 text-sm font-bold ${state.success?'text-blue-700':'text-rose-700'}`}>{state.message}</p>}<button disabled={pending} className="rounded-lg bg-[#032489] px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">{pending?'Recording...':'Record payment'}</button></div></form>}
   <style jsx>{`.input{width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;font-size:14px;outline:none;background:#fff}.input:focus{border-color:#032489;box-shadow:0 0 0 3px rgba(3,36,137,.08)}`}</style>
 </section>
}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label><span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span>{children}</label>}
function Stat({label,value}:{label:string;value:string}){return <div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-base font-black capitalize text-slate-900">{value}</p></div>}
