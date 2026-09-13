'use client';

import { useActionState, useMemo, useState } from 'react';
import { approveReturnAction, completeReturnAction, createReturnAction, recordRefundAction } from '@/app/(staff)/modules/sales/actions';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, ActionResult } from '@/components/ui/alert';

const initial = { success: false, message: '' };
const money = (value: number) => `₦${Number(value || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

type OrderItem = { id: string; item_name: string; quantity: number; unit_price: number | null; inventory_unit_id?: string | null };
type Order = { id: string; order_code: string; customer_name: string | null; commercial_state: string; total_amount: number; items?: OrderItem[] };
type ReturnRow = { id: string; return_code: string; status: string; reason: string; created_at: string; order?: { order_code?: string; customer_name?: string; total_amount?: number } | null; items?: Array<{ id: string; quantity: number; disposition: string; returned_condition: string | null }>; refunds?: Array<{ id: string; amount: number; status: string }> };

type DraftReturnItem = { key: string; order_item_id: string; item_name: string; quantity: number; disposition: string; returned_condition?: string };

function ExistingReturn({ row }: { row: ReturnRow }) {
  const [approveState, approveAction] = useActionState(approveReturnAction, initial);
  const [completeState, completeAction] = useActionState(completeReturnAction, initial);
  const [refundState, refundAction] = useActionState(recordRefundAction, initial);
  const refunded = (row.refunds || []).filter((r) => r.status === 'recorded').reduce((sum, r) => sum + Number(r.amount || 0), 0);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-black">{row.return_code} · {row.order?.customer_name || 'Customer'}</div>
          <div className="mt-1 text-xs text-slate-400">{row.order?.order_code || 'Order'} · {new Date(row.created_at).toLocaleString('en-NG')}</div>
        </div>
        <Badge variant="outline">{row.status}</Badge>
      </div>
      <div className="mt-3 text-sm text-slate-600">{row.reason}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        {(row.items || []).map((item) => (
          <span key={item.id} className="rounded-lg border border-slate-200 px-3 py-2 text-xs">
            Qty {item.quantity} · {item.disposition}{item.returned_condition ? ` · ${item.returned_condition}` : ''}
          </span>
        ))}
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {row.status === 'requested' ? (
          <form action={approveAction} className="rounded-xl border border-blue-200 bg-blue-50 p-3">
            <input type="hidden" name="return_id" value={row.id} />
            <Button type="submit" className="w-full">Approve return</Button>
          </form>
        ) : null}
        {row.status === 'approved' ? (
          <form action={completeAction} className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <input type="hidden" name="return_id" value={row.id} />
            <Button type="submit" variant="success" className="w-full">Complete stock return</Button>
          </form>
        ) : null}
        {['approved', 'completed'].includes(row.status) ? (
          <form action={refundAction} className="rounded-xl border border-slate-200 p-3">
            <input type="hidden" name="return_id" value={row.id} />
            <div className="mb-2 text-xs font-bold">Refunded {money(refunded)}</div>
            <Input name="amount" type="number" min="1" placeholder="Refund amount" className="h-9 text-xs" />
            <Select name="payment_method" className="mt-2 h-9 text-xs">
              <option value="bank_transfer">Bank transfer</option>
              <option value="pos">POS</option>
              <option value="cash">Cash</option>
              <option value="other">Other</option>
            </Select>
            <Input name="reference" placeholder="Reference" className="mt-2 h-9 text-xs" />
            <Button type="submit" className="mt-2 w-full">Record refund</Button>
          </form>
        ) : null}
      </div>
      {[approveState, completeState, refundState].map((state, i) => state.message ? <Alert key={i} variant={state.success ? 'success' : 'error'} className="mt-2">{state.message}</Alert> : null)}
    </section>
  );
}

export function ReturnsWorkspace({ orders, returns }: { orders: Order[]; returns: ReturnRow[] }) {
  const [state, action, pending] = useActionState(createReturnAction, initial);
  const eligibleOrders = useMemo(() => orders.filter((o) => o.commercial_state === 'confirmed'), [orders]);
  const [orderId, setOrderId] = useState('');
  const [items, setItems] = useState<DraftReturnItem[]>([]);
  const selectedOrder = eligibleOrders.find((o) => o.id === orderId);

  function toggleItem(item: OrderItem) {
    setItems((current) => current.some((row) => row.order_item_id === item.id)
      ? current.filter((row) => row.order_item_id !== item.id)
      : [...current, { key: crypto.randomUUID(), order_item_id: item.id, item_name: item.item_name, quantity: 1, disposition: 'inspection' }]);
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Preserve original sale evidence</p>
        <h1 className="mt-2 text-3xl font-black text-emmy-primary">Returns & Refunds</h1>
        <p className="mt-2 text-sm text-slate-500">Returns never delete the original sale or receipt. Inventory disposition and cash refunds are recorded as separate auditable events.</p>
      </div>

      <form action={action} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-black">Create return</h2>
        <Select value={orderId} onChange={(e) => { setOrderId(e.target.value); setItems([]); }} name="order_id" className="mt-4 w-full">
          <option value="">Choose confirmed sale/order</option>
          {eligibleOrders.map((o) => <option key={o.id} value={o.id}>{o.order_code} · {o.customer_name || 'Customer'} · {money(o.total_amount)}</option>)}
        </Select>

        {selectedOrder ? (
          <div className="mt-4 space-y-2">
            {(selectedOrder.items || []).map((item) => {
              const selected = items.some((row) => row.order_item_id === item.id);
              return (
                <button
                  type="button"
                  onClick={() => toggleItem(item)}
                  key={item.id}
                  className={`flex w-full items-center justify-between rounded-xl border p-3 text-left text-sm ${selected ? 'border-emmy-primary bg-blue-50' : 'border-slate-200'}`}
                >
                  <span><b>{item.item_name}</b> · sold qty {item.quantity}</span>
                  <span className="text-xs font-bold">{selected ? 'Selected' : 'Select'}</span>
                </button>
              );
            })}
          </div>
        ) : null}

        {items.map((item) => (
          <div key={item.key} className="mt-2 grid gap-2 rounded-xl bg-slate-50 p-3 md:grid-cols-4">
            <div className="text-sm font-bold">{item.item_name}</div>
            <Input type="number" min="1" value={item.quantity} onChange={(e) => setItems((cur) => cur.map((r) => r.key === item.key ? { ...r, quantity: Number(e.target.value) } : r))} className="h-9 text-xs" />
            <Select value={item.disposition} onChange={(e) => setItems((cur) => cur.map((r) => r.key === item.key ? { ...r, disposition: e.target.value } : r))} className="h-9 text-xs">
              <option value="inspection">Inspection</option>
              <option value="available">Return to available</option>
              <option value="faulty">Faulty</option>
              <option value="retired">Retired</option>
              <option value="other">Other</option>
            </Select>
            <Input value={item.returned_condition || ''} onChange={(e) => setItems((cur) => cur.map((r) => r.key === item.key ? { ...r, returned_condition: e.target.value } : r))} placeholder="Condition" className="h-9 text-xs" />
          </div>
        ))}

        <Textarea name="reason" placeholder="Reason for return" className="mt-4 min-h-20" />
        <input type="hidden" name="items_json" value={JSON.stringify(items.map(({ key: _key, item_name: _name, ...row }) => row))} />
        <ActionResult state={state} className="mt-3" />
        <Button type="submit" size="lg" disabled={pending || !orderId || !items.length} className="mt-4">Create return</Button>
      </form>

      <div className="space-y-4">
        {returns.map((row) => <ExistingReturn key={row.id} row={row} />)}
        {!returns.length ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">No returns or refunds recorded.</div> : null}
      </div>
    </div>
  );
}
