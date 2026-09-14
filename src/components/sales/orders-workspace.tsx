'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import {
  approveCreditAction,
  completeHandoverAction,
  confirmDirectSaleAction,
  recordSalesPaymentAction,
} from '@/app/(staff)/modules/sales/actions';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { StatGrid, StatTile } from '@/components/ui/stat-tile';

const initial = { success: false, message: '' };
const money = (value: number) => `₦${Number(value || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

type Order = {
  id: string; order_code: string; customer_name: string | null; customer_phone: string | null; customer_email: string | null;
  sales_channel: 'order' | 'direct_sale'; fulfilment_mode: string; commercial_state: string; status: string;
  sales_staff_name: string | null; total_amount: number; amount_paid: number; balance_due: number; payment_status: string;
  handover_completed_at: string | null; created_at: string; items?: Array<{ id: string; item_name: string; quantity: number; unit_price: number | null; line_total: number }>;
  payments?: Array<{ id: string; amount: number; is_void: boolean }>;
};

function OrderActions({ order }: { order: Order }) {
  const [confirmState, confirmAction, confirming] = useActionState(confirmDirectSaleAction, initial);
  const [paymentState, paymentAction, paying] = useActionState(recordSalesPaymentAction, initial);
  const [creditState, creditAction, crediting] = useActionState(approveCreditAction, initial);
  const [handoverState, handoverAction, handing] = useActionState(completeHandoverAction, initial);
  const paid = (order.payments || []).filter((p) => !p.is_void).reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const outstanding = Math.max(Number(order.total_amount || 0) - paid, 0);
  const states = [confirmState, paymentState, creditState, handoverState].filter((s) => s.message);

  return (
    <div className="mt-4 grid gap-3 lg:grid-cols-3">
      {order.sales_channel === 'direct_sale' && order.commercial_state === 'draft' ? (
        <form action={confirmAction} className="rounded-xl border border-blue-200 bg-blue-50 p-3">
          <input type="hidden" name="order_id" value={order.id} />
          <div className="text-xs font-bold text-blue-900">Reserve exact stock and confirm commercial sale.</div>
          <Button type="submit" size="sm" disabled={confirming} className="mt-2 w-full">{confirming ? 'Confirming…' : 'Confirm Direct Sale'}</Button>
        </form>
      ) : null}

      {order.commercial_state === 'confirmed' && outstanding > 0 ? (
        <form action={paymentAction} className="rounded-xl border border-slate-200 p-3">
          <input type="hidden" name="order_id" value={order.id} />
          <div className="mb-2 text-xs font-bold">Record payment · {money(outstanding)} outstanding</div>
          <div className="grid grid-cols-2 gap-2">
            <Input name="amount" type="number" min="1" max={outstanding} placeholder="Amount" className="h-9 text-xs" />
            <Select name="payment_method" className="h-9 text-xs">
              <option value="bank_transfer">Bank transfer</option>
              <option value="pos">POS</option>
              <option value="cash">Cash</option>
              <option value="split">Split</option>
              <option value="other">Other</option>
            </Select>
          </div>
          <Input name="reference" placeholder="Reference" className="mt-2 h-9 text-xs" />
          <Button type="submit" disabled={paying} className="mt-2 w-full bg-slate-900 hover:bg-slate-800">{paying ? 'Recording…' : 'Record payment'}</Button>
        </form>
      ) : null}

      {order.sales_channel === 'direct_sale' && order.commercial_state === 'confirmed' && !order.handover_completed_at ? (
        <>
          {outstanding > 0 ? (
            <form action={creditAction} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <input type="hidden" name="order_id" value={order.id} />
              <div className="text-xs font-bold text-amber-900">Admin credit exception</div>
              <Input name="approved_outstanding_amount" type="number" min="1" max={outstanding} defaultValue={outstanding} className="mt-2 h-9 border-amber-200 text-xs" />
              <Input name="due_at" type="datetime-local" className="mt-2 h-9 border-amber-200 text-xs" />
              <Input name="reason" placeholder="Reason" className="mt-2 h-9 border-amber-200 text-xs" />
              <Button type="submit" disabled={crediting} className="mt-2 w-full bg-amber-700 hover:bg-amber-800">{crediting ? 'Approving…' : 'Approve credit release'}</Button>
            </form>
          ) : null}
          <form action={handoverAction} className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <input type="hidden" name="order_id" value={order.id} />
            <div className="text-xs font-bold text-emerald-900">Physical handover</div>
            <p className="mt-1 text-[11px] leading-5 text-emerald-700">Allowed only when fully paid or covered by active Admin credit.</p>
            <Button type="submit" variant="success" disabled={handing} className="mt-2 w-full">{handing ? 'Completing…' : 'Complete handover'}</Button>
          </form>
        </>
      ) : null}

      {states.length ? <div className="lg:col-span-3">{states.map((state, i) => <Alert key={i} variant={state.success ? 'success' : 'error'} className="mt-2">{state.message}</Alert>)}</div> : null}
    </div>
  );
}

export function OrdersWorkspace({ orders }: { orders: Order[] }) {
  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Shared commercial record</p>
        <h1 className="mt-2 text-3xl font-black text-emmy-primary">Orders & Sales</h1>
        <p className="mt-2 text-sm text-slate-500">Sales controls commercial terms and money. Operations controls reservation, picking, dispatch and fulfilment on the same Order ID.</p>
      </div>
      <div className="space-y-4">
        {orders.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">No Orders or Direct Sales yet.</div> : orders.map((order) => {
          const paid = (order.payments || []).filter((p) => !p.is_void).reduce((sum, p) => sum + Number(p.amount || 0), 0);
          const outstanding = Math.max(Number(order.total_amount || 0) - paid, 0);
          return (
            <section key={order.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-black text-slate-900">{order.order_code} · {order.customer_name || 'Customer'}</div>
                  <div className="mt-1 text-xs text-slate-400">{order.sales_channel === 'direct_sale' ? 'Direct Sale' : 'Order'} · {order.commercial_state} · fulfilment {order.status} · {order.sales_staff_name || 'Unassigned salesperson'}</div>
                </div>
                <Link href={`/modules/operations/orders/${order.id}`} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-emmy-primary">Open fulfilment in Operations</Link>
              </div>
              <StatGrid className="mt-4 sm:grid-cols-3">
                <StatTile label="Sales Value" value={money(order.total_amount)} tone="neutral" />
                <StatTile label="Cash Collected" value={money(paid)} tone="neutral" />
                <StatTile label="Outstanding" value={money(outstanding)} tone="neutral" />
              </StatGrid>
              <div className="mt-4 flex flex-wrap gap-2">
                {(order.items || []).map((item) => <span key={item.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"><b>{item.quantity}×</b> {item.item_name} · {money(Number(item.line_total || item.unit_price || 0))}</span>)}
              </div>
              <OrderActions order={order} />
            </section>
          );
        })}
      </div>
    </div>
  );
}
