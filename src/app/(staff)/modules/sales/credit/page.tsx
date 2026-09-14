import { getSalesCredit } from '@/lib/sales/read-server';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

const money = (value: number) => `₦${Number(value || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

export default async function SalesCreditPage() {
  const credit = await getSalesCredit();
  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Admin-controlled exceptions</p><h1 className="mt-2 text-3xl font-black text-emmy-primary">Credit & Outstanding</h1><p className="mt-2 text-sm text-slate-500">Full payment remains the normal release rule. These are explicit approvals allowing stock handover with an outstanding balance.</p></div>
      <div className="space-y-3">
        {credit.map((row) => {
          const order = row.order as { order_code?: string; customer_name?: string; customer_phone?: string; total_amount?: number; balance_due?: number } | null;
          return (
            <Card key={row.id} className={row.overdue ? 'border-rose-300 p-5' : 'p-5'}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-black text-slate-900">{order?.order_code || 'Order'} · {order?.customer_name || 'Customer'}</div>
                  <div className="mt-1 text-xs text-slate-400">{order?.customer_phone || 'No phone'} · due {new Date(row.due_at).toLocaleString('en-NG')}</div>
                </div>
                <Badge variant={row.overdue ? 'danger' : row.status === 'active' ? 'warning' : 'outline'}>{row.overdue ? 'OVERDUE' : row.status.toUpperCase()}</Badge>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-slate-50 p-3"><div className="text-[10px] font-black uppercase text-slate-400">Approved balance</div><div className="mt-1 font-black">{money(row.approved_outstanding_amount)}</div></div>
                <div className="rounded-xl bg-slate-50 p-3"><div className="text-[10px] font-black uppercase text-slate-400">Order total</div><div className="mt-1 font-black">{money(Number(order?.total_amount || 0))}</div></div>
                <div className="rounded-xl bg-slate-50 p-3"><div className="text-[10px] font-black uppercase text-slate-400">Reason</div><div className="mt-1 text-sm font-semibold">{row.reason}</div></div>
              </div>
            </Card>
          );
        })}
        {!credit.length ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">No credit releases have been approved.</div> : null}
      </div>
    </div>
  );
}
