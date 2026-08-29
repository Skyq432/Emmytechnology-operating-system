'use client';

import Link from 'next/link';
import { useActionState, useMemo, useState } from 'react';
import { ClipboardList, Plus, Search } from 'lucide-react';
import { HelpTip } from '@/components/ui/help-tip';
import { OPERATIONS_HELP } from '@/lib/operations/help';
import { createOrderAction, type OperationsActionState } from '@/app/modules/operations/actions';
import { getOrderStatusLabel } from '@/lib/operations/domain';
import type { OperationsInventoryItem, OperationsOrder } from '@/lib/operations/types';

const initialState: OperationsActionState = { success: false, message: '' };

export function OrdersClient({ orders, inventory, websiteProducts }: { orders: OperationsOrder[]; inventory: OperationsInventoryItem[]; websiteProducts: Array<{ id: string; name: string; slug: string; status: string | null }> }) {
  const [state, formAction, pending] = useActionState(createOrderAction, initialState);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((order) => {
      const matchesStatus = status === 'all' || order.status === status;
      const haystack = [order.order_code, order.customer_name, order.customer_phone, order.reference_label, order.source_reference, order.current_team].filter(Boolean).join(' ').toLowerCase();
      return matchesStatus && (!q || haystack.includes(q));
    });
  }, [orders, search, status]);

  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="mb-5 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="flex items-center gap-2"><p className="text-xs font-black uppercase tracking-[0.16em] text-[#032489]">Internal execution</p><HelpTip text="Orders show what needs to be done and which team is responsible for it now." label="About Orders" /></div>
          <h1 className="mt-1.5 text-3xl font-black tracking-[-0.035em]">Orders</h1>
          <p className="mt-2 text-sm text-slate-500">Follow each order from creation to completion.</p>
        </div>
        <button onClick={() => setShowCreate((value) => !value)} className="inline-flex items-center gap-2 self-start rounded-lg bg-[#032489] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#021d70]">
          <Plus className="h-4 w-4" /> {showCreate ? 'Close form' : 'New order'}
        </button>
      </div>

      {showCreate && (
        <form action={formAction} className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2"><h2 className="text-sm font-black text-slate-900">Create internal order</h2><HelpTip text={OPERATIONS_HELP.createOrder} label="About creating an order" /></div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Customer / request name"><input name="customer_name" className="input" placeholder="e.g. John Obi" /></Field>
            <Field label="Phone"><input name="customer_phone" className="input" placeholder="080..." /></Field>
            <Field label="Reference"><input name="reference_label" className="input" placeholder="e.g. WhatsApp order" /></Field>
            <Field label="Source"><select name="source_type" className="input" defaultValue="manual"><option value="manual">Manual</option><option value="crm">CRM</option><option value="website">Website</option><option value="whatsapp">WhatsApp</option><option value="internal">Internal</option><option value="other">Other</option></select></Field>
            <Field label="Priority"><select name="priority" className="input" defaultValue="normal"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></Field>
            <Field label="Current team"><input name="current_team" className="input" defaultValue="Operations" /></Field>
            <Field label="Due at"><input name="due_at" type="datetime-local" className="input" /></Field>
            <Field label="Source reference"><input name="source_reference" className="input" placeholder="Order ID / chat ref" /></Field>
          </div>
          <div className="mt-5 border-t border-slate-100 pt-5">
            <p className="mb-3 text-xs font-bold text-slate-500">First item</p>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Item name"><input name="item_name" required className="input" placeholder="What is being fulfilled?" /></Field>
              <Field label="Quantity"><input name="quantity" type="number" min="1" defaultValue="1" className="input" /></Field>
              <Field label="Internal inventory (optional)"><select name="inventory_item_id" className="input" defaultValue=""><option value="">No inventory link</option>{inventory.map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.name}</option>)}</select></Field>
              <Field label="Website product (optional)"><select name="website_product_id" className="input" defaultValue=""><option value="">No website link</option>{websiteProducts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
            </div>
          </div>
          {state.message && <p className={`mt-4 text-sm font-bold ${state.success ? 'text-blue-700' : 'text-rose-700'}`}>{state.message}</p>}
          <button disabled={pending} className="mt-5 rounded-lg bg-[#032489] px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">{pending ? 'Creating...' : 'Create order'}</button>
        </form>
      )}

      <div className="mb-3 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-slate-200 px-3"><Search className="h-4 w-4 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} className="w-full bg-transparent py-2.5 text-sm outline-none" placeholder="Search order, customer, team or reference..." /></div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold outline-none"><option value="all">All statuses</option>{['new','confirmed','stock_check','assigned','picking','packing','ready_dispatch','dispatched','delivered','completed','on_hold','cancelled'].map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {filtered.length === 0 ? <div className="py-14 text-center"><ClipboardList className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-700">No matching orders</p></div> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Order</th><th className="px-5 py-3">Customer / reference</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Team</th><th className="px-5 py-3">Priority</th><th className="px-5 py-3">Items</th><th className="px-5 py-3">Updated</th></tr></thead><tbody className="divide-y divide-slate-100">{filtered.map((order) => <tr key={order.id} className="hover:bg-slate-50/70"><td className="px-5 py-4 font-black"><Link href={`/modules/operations/orders/${order.id}`} className="text-[#032489] hover:underline">{order.order_code}</Link></td><td className="px-5 py-4"><div className="font-bold text-slate-800">{order.customer_name || order.reference_label || 'Internal order'}</div><div className="mt-1 text-xs text-slate-400">{order.source_type}{order.source_reference ? ` · ${order.source_reference}` : ''}</div></td><td className="px-5 py-4"><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-[#032489]">{getOrderStatusLabel(order.status)}</span></td><td className="px-5 py-4 font-semibold text-slate-600">{order.current_team || 'Unassigned'}</td><td className="px-5 py-4"><span className={`font-black capitalize ${order.priority === 'urgent' ? 'text-rose-600' : 'text-slate-600'}`}>{order.priority}</span></td><td className="px-5 py-4 text-slate-600">{order.items?.reduce((sum, item) => sum + item.quantity, 0) || 0}</td><td className="px-5 py-4 text-xs font-semibold text-slate-400">{new Date(order.updated_at).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })}</td></tr>)}</tbody></table></div>
        )}
      </div>
      <style jsx>{`.input{width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;font-size:14px;outline:none;background:#fff}.input:focus{border-color:#032489;box-shadow:0 0 0 3px rgba(3,36,137,.08)}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span>{children}</label>; }
