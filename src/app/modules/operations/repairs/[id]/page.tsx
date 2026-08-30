import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { updateRepairStatusAction } from '@/app/modules/operations/sales-actions';
import { getRepairDetail } from '@/lib/operations/sales-server';

const money = (value:number) => `₦${Number(value||0).toLocaleString('en-NG',{maximumFractionDigits:0})}`;
const statuses = ['received','diagnosing','awaiting_parts','in_progress','ready_collection','collected','cancelled'];

export default async function RepairDetailPage({ params }:{ params:Promise<{id:string}> }) {
  const { id } = await params;
  const r = await getRepairDetail(id);
  return <div className="mx-auto max-w-[1250px]">
    <Link href="/modules/operations/repairs" className="mb-4 inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-[#032489]"><ArrowLeft className="h-4 w-4"/> Back to repairs</Link>
    <div className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col justify-between gap-4 md:flex-row"><div><h1 className="text-2xl font-black text-[#032489]">{r.repair_code}</h1><p className="mt-2 text-sm font-black text-slate-900">{r.customer_name || 'Unknown customer'}</p><p className="mt-1 text-xs text-slate-500">{r.customer_phone || 'No phone'} · {[r.brand,r.model].filter(Boolean).join(' ') || r.device_type || 'Device'}</p></div><span className="self-start rounded-full bg-blue-50 px-3 py-1.5 text-xs font-black capitalize text-[#032489]">{r.status.replaceAll('_',' ')}</span></div></div>
    <div className="grid gap-5 lg:grid-cols-3"><Card title="Problem"><Row label="Fault reported" value={r.fault_reported}/><Row label="Diagnosis" value={r.diagnosis || 'Not recorded'}/><Row label="Repair type" value={r.repair_type || '—'}/><Row label="Parts replaced" value={r.parts_replaced || '—'}/></Card><Card title="Device"><Row label="Device" value={[r.brand,r.model].filter(Boolean).join(' ') || r.device_type || '—'}/><Row label="Serial / IMEI" value={r.serial_or_imei || '—'}/><Row label="Bought from EmmyTech?" value={r.purchased_from_us.replaceAll('_',' ')}/><Row label="Condition received" value={r.condition_received || '—'}/><Row label="Condition returned" value={r.condition_returned || '—'}/></Card><Card title="Money & warranty"><Row label="Parts cost" value={money(r.parts_cost)}/><Row label="Labour cost" value={money(r.labour_cost)}/><Row label="Amount charged" value={money(r.amount_charged)}/><Row label="Repair profit" value={money(r.repair_profit)} strong/><Row label="Repair warranty" value={r.warranty_period || '—'}/><Row label="Technician" value={r.technician_name || '—'}/></Card></div>
    <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-sm font-black text-slate-900">Move repair forward</h2><form action={updateRepairStatusAction} className="mt-4 flex flex-col gap-3 sm:flex-row"><input type="hidden" name="repair_id" value={r.id}/><select name="status" defaultValue={r.status} className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-bold outline-none">{statuses.map(s=><option key={s} value={s}>{s.replaceAll('_',' ')}</option>)}</select><button className="rounded-lg bg-[#032489] px-4 py-2.5 text-sm font-black text-white">Update status</button></form></section>
  </div>;
}
function Card({title,children}:{title:string;children:React.ReactNode}){return <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-sm font-black text-slate-900">{title}</h2><div className="mt-4 space-y-3">{children}</div></section>}
function Row({label,value,strong=false}:{label:string;value:string;strong?:boolean}){return <div><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div><div className={`mt-1 text-sm ${strong?'font-black text-[#032489]':'font-semibold text-slate-700'}`}>{value}</div></div>}
