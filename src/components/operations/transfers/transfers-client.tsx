'use client';

import { useActionState, useMemo, useState } from 'react';
import { ArrowRight, PackageCheck, Plus, Repeat2 } from 'lucide-react';
import {
  cancelTransferAction,
  receiveTransferAction,
  startTransferAction,
  type OperationsActionState,
} from '@/app/modules/operations/actions';
import { HelpTip } from '@/components/ui/help-tip';
import { OPERATIONS_HELP } from '@/lib/operations/help';

const initialState: OperationsActionState = { success: false, message: '' };

type Props = {
  transfers: any[];
  availability: any[];
  locations: any[];
  users: any[];
  reservations: any[];
};

export function TransfersClient({ transfers, availability, locations, users, reservations }: Props) {
  const [state, formAction, pending] = useActionState(startTransferAction, initialState);
  const [showCreate, setShowCreate] = useState(false);
  const [mode, setMode] = useState<'standalone' | 'order'>('standalone');
  const [stockChoice, setStockChoice] = useState('');
  const [reservationChoice, setReservationChoice] = useState('');
  const [destination, setDestination] = useState('');
  const [status, setStatus] = useState('all');

  const sourceRows = availability.filter((row) => row.location_code !== 'TRANSIT' && Number(row.available || 0) > 0);
  const selectedStock = sourceRows.find((_, index) => String(index) === stockChoice);
  const selectedReservation = reservations.find((row) => row.id === reservationChoice);
  const fromLocationId = mode === 'standalone' ? selectedStock?.location_id || '' : selectedReservation?.location_id || '';
  const toOptions = locations.filter((location) => location.code !== 'TRANSIT' && location.id !== fromLocationId);
  const filtered = useMemo(() => status === 'all' ? transfers : transfers.filter((item) => item.status === status), [transfers, status]);

  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="mb-5 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="flex items-center gap-2"><p className="text-xs font-black uppercase tracking-[0.16em] text-[#032489]">Stock movement</p><HelpTip text={OPERATIONS_HELP.createTransfer} label="About Transfers" /></div>
          <h1 className="mt-1.5 text-3xl font-black tracking-[-0.035em]">Transfers</h1>
          <p className="mt-2 text-sm text-slate-500">Move stock between EmmyTech locations without treating the movement as a sale.</p>
        </div>
        <button onClick={() => setShowCreate((value) => !value)} className="inline-flex items-center gap-2 self-start rounded-lg bg-[#032489] px-4 py-2.5 text-sm font-bold text-white"><Plus className="h-4 w-4" /> {showCreate ? 'Close form' : 'Move stock'}</button>
      </div>

      {showCreate && (
        <form action={formAction} className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-sm font-black text-slate-900">Start transfer</h2><p className="mt-1 text-xs text-slate-500">The item becomes In Transit until the destination confirms receipt.</p></div>
            <div className="flex rounded-lg bg-slate-100 p-1 text-xs font-bold"><button type="button" onClick={() => { setMode('standalone'); setReservationChoice(''); }} className={`rounded-md px-3 py-1.5 ${mode === 'standalone' ? 'bg-white text-[#032489] shadow-sm' : 'text-slate-500'}`}>Standalone</button><button type="button" onClick={() => { setMode('order'); setStockChoice(''); }} className={`rounded-md px-3 py-1.5 ${mode === 'order' ? 'bg-white text-[#032489] shadow-sm' : 'text-slate-500'}`}>For an Order</button></div>
          </div>

          {mode === 'standalone' ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Stock to move"><select value={stockChoice} onChange={(e) => setStockChoice(e.target.value)} className="input" required><option value="">Choose item and source</option>{sourceRows.map((row, index) => <option key={`${row.inventory_item_id}-${row.location_id}`} value={String(index)}>{row.sku} · {row.name} · {row.location_name} · {row.available} available</option>)}</select></Field>
              <input type="hidden" name="inventory_item_id" value={selectedStock?.inventory_item_id || ''} />
              <input type="hidden" name="from_location_id" value={selectedStock?.location_id || ''} />
              <Field label="Destination"><select name="to_location_id" value={destination} onChange={(e) => setDestination(e.target.value)} className="input" required><option value="">Choose destination</option>{toOptions.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></Field>
              <Field label="Quantity"><input name="quantity" type="number" min="1" max={selectedStock?.available || undefined} defaultValue="1" className="input" /></Field>
              <Field label="Reason"><input name="reason" className="input" placeholder="e.g. Restock Sango" /></Field>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Reserved Order item"><select value={reservationChoice} onChange={(e) => setReservationChoice(e.target.value)} className="input" required><option value="">Choose reserved Order stock</option>{reservations.filter((r) => r.location_id && r.status === 'active').map((r) => <option key={r.id} value={r.id}>{r.order?.order_code || 'Order'} · {r.order_item?.item_name || 'Item'} · qty {r.quantity}</option>)}</select></Field>
              <input type="hidden" name="inventory_item_id" value={selectedReservation?.inventory_item_id || ''} />
              <input type="hidden" name="from_location_id" value={selectedReservation?.location_id || ''} />
              <input type="hidden" name="order_id" value={selectedReservation?.order_id || ''} />
              <input type="hidden" name="order_item_id" value={selectedReservation?.order_item_id || ''} />
              <input type="hidden" name="quantity" value={selectedReservation?.quantity || 1} />
              <Field label="Destination"><select name="to_location_id" value={destination} onChange={(e) => setDestination(e.target.value)} className="input" required><option value="">Choose destination</option>{toOptions.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></Field>
              <div className="self-end rounded-lg bg-blue-50 px-3 py-2.5 text-xs font-bold text-[#032489]">Full reservation moves together: {selectedReservation?.quantity || 0}</div>
              <Field label="Reason"><input name="reason" className="input" defaultValue="Move stock for customer Order" /></Field>
            </div>
          )}

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Carried by"><select name="carrier_type" className="input" defaultValue="emmytech_staff"><option value="emmytech_staff">EmmyTech staff</option><option value="dispatch_rider">Dispatch rider</option><option value="supplier_delivery">Supplier delivery</option><option value="courier">Courier</option><option value="emmytech_vehicle">EmmyTech vehicle</option><option value="other">Other</option></select></Field>
            <Field label="Staff (optional)"><select name="carrier_user_id" className="input" defaultValue=""><option value="">No staff selected</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name || user.email}</option>)}</select></Field>
            <Field label="Person / rider name"><input name="carrier_name" className="input" /></Field>
            <Field label="Phone / reference"><input name="carrier_phone" className="input" placeholder="Phone" /></Field>
          </div>
          <input type="hidden" name="carrier_reference" value="" />
          <Field label="Note"><input name="note" className="input mt-4" placeholder="Optional transfer note" /></Field>
          {state.message && <p className={`mt-4 text-sm font-bold ${state.success ? 'text-blue-700' : 'text-rose-700'}`}>{state.message}</p>}
          <button disabled={pending} className="mt-4 rounded-lg bg-[#032489] px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">{pending ? 'Starting...' : 'Start transfer'}</button>
        </form>
      )}

      <div className="mb-3 flex justify-end"><select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold"><option value="all">All statuses</option><option value="in_transit">In Transit</option><option value="received">Received</option><option value="cancelled">Cancelled</option></select></div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {filtered.length === 0 ? <div className="py-14 text-center"><Repeat2 className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-700">No transfers in this period</p></div> : <div className="divide-y divide-slate-100">{filtered.map((transfer) => <div key={transfer.id} className="p-5"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center"><div><div className="flex flex-wrap items-center gap-2"><p className="font-black text-[#032489]">{transfer.transfer_code}</p><span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${transfer.status === 'received' ? 'bg-blue-50 text-[#032489]' : transfer.status === 'cancelled' ? 'bg-slate-100 text-slate-500' : 'bg-amber-50 text-amber-700'}`}>{transfer.status.replace('_', ' ')}</span>{transfer.order?.order_code && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">{transfer.order.order_code}</span>}</div><p className="mt-2 text-sm font-bold text-slate-800">{transfer.inventory_item?.sku} · {transfer.inventory_item?.name} × {transfer.quantity}</p><p className="mt-1 flex items-center gap-1 text-xs text-slate-500">{transfer.from_location?.name} <ArrowRight className="h-3 w-3" /> {transfer.to_location?.name}</p><p className="mt-1 text-xs text-slate-400">{transfer.reason || 'Stock movement'} · {new Date(transfer.created_at).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })}</p></div>{transfer.status === 'in_transit' && <div className="flex gap-2"><form action={receiveTransferAction}><input type="hidden" name="transfer_id" value={transfer.id} /><button className="inline-flex items-center gap-2 rounded-lg bg-[#032489] px-3 py-2 text-xs font-black text-white"><PackageCheck className="h-3.5 w-3.5" /> Receive</button></form><form action={cancelTransferAction}><input type="hidden" name="transfer_id" value={transfer.id} /><button className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-600">Cancel</button></form></div>}</div></div>)}</div>}
      </div>
      <style jsx>{`.input{width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;font-size:14px;outline:none;background:#fff}.input:focus{border-color:#032489;box-shadow:0 0 0 3px rgba(3,36,137,.08)}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span>{children}</label>; }
