'use client';

import { useActionState, useMemo, useState } from 'react';
import { ArrowRight, PackageCheck, Plus, Repeat2 } from 'lucide-react';
import {
  cancelTransferAction,
  receiveTransferAction,
  startTransferAction,
  type OperationsActionState,
} from '@/app/(staff)/modules/operations/actions';
import { HelpTip } from '@/components/ui/help-tip';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ActionResult } from '@/components/ui/alert';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { OPERATIONS_HELP } from '@/lib/operations/help';
import type {
  OperationsLocation,
  OperationsTransfer,
  OperationsTransferAvailabilityRow,
  OperationsTransferReservation,
  OperationsTransferUser,
} from '@/lib/operations/types';

const initialState: OperationsActionState = { success: false, message: '' };

type Props = {
  transfers: OperationsTransfer[];
  availability: OperationsTransferAvailabilityRow[];
  locations: OperationsLocation[];
  users: OperationsTransferUser[];
  reservations: OperationsTransferReservation[];
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
          <div className="flex items-center gap-2"><p className="text-xs font-black uppercase tracking-[0.16em] text-emmy-primary">Stock movement</p><HelpTip text={OPERATIONS_HELP.createTransfer} label="About Transfers" /></div>
          <h1 className="mt-1.5 text-3xl font-black tracking-[-0.035em]">Transfers</h1>
          <p className="mt-2 text-sm text-slate-500">Move stock between EmmyTech locations without treating the movement as a sale.</p>
        </div>
        <Button onClick={() => setShowCreate((value) => !value)} className="self-start"><Plus className="h-4 w-4" /> {showCreate ? 'Close form' : 'Move stock'}</Button>
      </div>

      {showCreate && (
        <form action={formAction} className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-sm font-black text-slate-900">Start transfer</h2><p className="mt-1 text-xs text-slate-500">The item becomes In Transit until the destination confirms receipt.</p></div>
            <SegmentedControl
              size="sm"
              value={mode}
              onChange={(value) => { setMode(value); if (value === 'standalone') setReservationChoice(''); else setStockChoice(''); }}
              options={[{ value: 'standalone', label: 'Standalone' }, { value: 'order', label: 'For an Order' }]}
            />
          </div>

          {mode === 'standalone' ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Stock to move"><Select value={stockChoice} onChange={(e) => setStockChoice(e.target.value)} required><option value="">Choose item and source</option>{sourceRows.map((row, index) => <option key={`${row.inventory_item_id}-${row.location_id}`} value={String(index)}>{row.sku} · {row.name} · {row.location_name} · {row.available} available</option>)}</Select></Field>
              <input type="hidden" name="inventory_item_id" value={selectedStock?.inventory_item_id || ''} />
              <input type="hidden" name="from_location_id" value={selectedStock?.location_id || ''} />
              <Field label="Destination"><Select name="to_location_id" value={destination} onChange={(e) => setDestination(e.target.value)} required><option value="">Choose destination</option>{toOptions.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</Select></Field>
              <Field label="Quantity"><Input name="quantity" type="number" min="1" max={selectedStock?.available || undefined} defaultValue="1" /></Field>
              <Field label="Reason"><Input name="reason" placeholder="e.g. Restock Sango" /></Field>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Reserved Order item"><Select value={reservationChoice} onChange={(e) => setReservationChoice(e.target.value)} required><option value="">Choose reserved Order stock</option>{reservations.filter((r) => r.location_id && r.status === 'active').map((r) => <option key={r.id} value={r.id}>{r.order?.order_code || 'Order'} · {r.order_item?.item_name || 'Item'} · qty {r.quantity}</option>)}</Select></Field>
              <input type="hidden" name="inventory_item_id" value={selectedReservation?.inventory_item_id || ''} />
              <input type="hidden" name="from_location_id" value={selectedReservation?.location_id || ''} />
              <input type="hidden" name="order_id" value={selectedReservation?.order_id || ''} />
              <input type="hidden" name="order_item_id" value={selectedReservation?.order_item_id || ''} />
              <input type="hidden" name="quantity" value={selectedReservation?.quantity || 1} />
              <Field label="Destination"><Select name="to_location_id" value={destination} onChange={(e) => setDestination(e.target.value)} required><option value="">Choose destination</option>{toOptions.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</Select></Field>
              <div className="self-end rounded-lg bg-blue-50 px-3 py-2.5 text-xs font-bold text-emmy-primary">Full reservation moves together: {selectedReservation?.quantity || 0}</div>
              <Field label="Reason"><Input name="reason" defaultValue="Move stock for customer Order" /></Field>
            </div>
          )}

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Carried by"><Select name="carrier_type" defaultValue="emmytech_staff"><option value="emmytech_staff">EmmyTech staff</option><option value="dispatch_rider">Dispatch rider</option><option value="supplier_delivery">Supplier delivery</option><option value="courier">Courier</option><option value="emmytech_vehicle">EmmyTech vehicle</option><option value="other">Other</option></Select></Field>
            <Field label="Staff (optional)"><Select name="carrier_user_id" defaultValue=""><option value="">No staff selected</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name || user.email}</option>)}</Select></Field>
            <Field label="Person / rider name"><Input name="carrier_name" /></Field>
            <Field label="Phone / reference"><Input name="carrier_phone" placeholder="Phone" /></Field>
          </div>
          <input type="hidden" name="carrier_reference" value="" />
          <Field label="Note"><Input name="note" className="mt-4" placeholder="Optional transfer note" /></Field>
          <ActionResult state={state} className="mt-4" />
          <Button type="submit" disabled={pending} className="mt-4">{pending ? 'Starting...' : 'Start transfer'}</Button>
        </form>
      )}

      <div className="mb-3 flex justify-end"><Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto font-bold"><option value="all">All statuses</option><option value="in_transit">In Transit</option><option value="received">Received</option><option value="cancelled">Cancelled</option></Select></div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {filtered.length === 0 ? <div className="py-14 text-center"><Repeat2 className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-700">No transfers in this period</p></div> : <div className="divide-y divide-slate-100">{filtered.map((transfer) => <div key={transfer.id} className="p-5"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center"><div><div className="flex flex-wrap items-center gap-2"><p className="font-black text-emmy-primary">{transfer.transfer_code}</p><Badge variant={transfer.status === 'received' ? 'default' : transfer.status === 'cancelled' ? 'outline' : 'warning'} className="uppercase">{transfer.status.replace('_', ' ')}</Badge>{transfer.order?.order_code && <Badge variant="outline">{transfer.order.order_code}</Badge>}</div><p className="mt-2 text-sm font-bold text-slate-800">{transfer.inventory_item?.sku} · {transfer.inventory_item?.name} × {transfer.quantity}</p><p className="mt-1 flex items-center gap-1 text-xs text-slate-500">{transfer.from_location?.name} <ArrowRight className="h-3 w-3" /> {transfer.to_location?.name}</p><p className="mt-1 text-xs text-slate-400">{transfer.reason || 'Stock movement'} · {new Date(transfer.created_at).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })}</p></div>{transfer.status === 'in_transit' && <div className="flex gap-2"><form action={receiveTransferAction}><input type="hidden" name="transfer_id" value={transfer.id} /><Button size="sm"><PackageCheck className="h-3.5 w-3.5" /> Receive</Button></form><form action={cancelTransferAction}><input type="hidden" name="transfer_id" value={transfer.id} /><Button type="submit" variant="outline" size="sm">Cancel</Button></form></div>}</div></div>)}</div>}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span>{children}</label>; }
