'use client';

import { useActionState } from 'react';
import { recordOrderPaymentAction, type SalesActionState } from '@/app/(staff)/modules/operations/sales-actions';
import type { OperationsOrder, OperationsOrderPayment } from '@/lib/operations/types';
import { HelpTip } from '@/components/ui/help-tip';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button, buttonVariants } from '@/components/ui/button';
import { ActionResult } from '@/components/ui/alert';

const initialState: SalesActionState = { success:false, message:'' };
const money=(v:number)=>`₦${Number(v||0).toLocaleString('en-NG',{maximumFractionDigits:0})}`;

export function OrderPayments({order,payments}:{order:OperationsOrder;payments:OperationsOrderPayment[]}){
 const [state,action,pending]=useActionState(recordOrderPaymentAction,initialState);
 return <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
   <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><h2 className="text-sm font-black text-slate-900">Payments</h2><HelpTip text="Record each payment separately. The Order automatically updates Paid, Balance and payment status. Pending Ambassador commission becomes earned only when the Order is fully paid." label="About payments" /></div>{order.final_receipt_id?<a href={`/api/sales/documents/${order.final_receipt_id}`} target="_blank" rel="noreferrer" className={buttonVariants({ variant: 'success', size: 'sm' })}>View Final Receipt</a>:null}</div>
   <div className="mt-4 grid gap-3 sm:grid-cols-3"><Stat label="Paid" value={money(order.amount_paid)}/><Stat label="Balance" value={money(order.balance_due)}/><Stat label="Status" value={order.payment_status.replaceAll('_',' ')}/></div>
   {order.final_receipt_id&&order.final_receipt_number?<p className="mt-3 text-xs font-semibold text-emerald-700">Final receipt {order.final_receipt_number} is available.</p>:null}
   {payments.length>0&&<div className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-100">{payments.map(p=><div key={p.id} className="flex flex-col justify-between gap-2 px-3 py-3 sm:flex-row sm:items-center"><div><p className="text-sm font-black text-slate-800">{money(p.amount)}</p><p className="mt-1 text-xs text-slate-500 capitalize">{p.payment_method.replaceAll('_',' ')}{p.reference?` · ${p.reference}`:''}</p></div><p className="text-xs font-semibold text-slate-400">{new Date(p.paid_at).toLocaleString('en-NG',{dateStyle:'medium',timeStyle:'short'})}</p></div>)}</div>}
   {order.commercial_state!=='cancelled'&&order.payment_status!=='paid'&&<form action={action} className="mt-4 grid gap-3 rounded-lg bg-slate-50 p-4 md:grid-cols-4"><input type="hidden" name="order_id" value={order.id}/><Field label="Amount"><Input required name="amount" type="number" min="1" /></Field><Field label="Method"><Select name="payment_method" defaultValue="bank_transfer"><option value="bank_transfer">Bank Transfer</option><option value="pos">POS</option><option value="cash">Cash</option><option value="split">Split</option><option value="other">Other</option></Select></Field><Field label="Reference"><Input name="reference" /></Field><Field label="Note"><Input name="note" /></Field><div className="md:col-span-4"><ActionResult state={state} className="mb-3" /><Button type="submit" disabled={pending}>{pending?'Recording...':'Record payment'}</Button></div></form>}
 </section>
}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label><span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span>{children}</label>}
function Stat({label,value}:{label:string;value:string}){return <div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-base font-black capitalize text-slate-900">{value}</p></div>}
