'use client';

import { useActionState, useState } from 'react';
import { saveDraftFulfilmentSourceAction } from '@/app/modules/operations/order-fulfilment-actions';

const initial = { success: false, message: '' };

type Item = {
  id: string;
  item_name: string;
  inventory_item_id: string | null;
  fulfilment_source: string;
  source_location_id: string | null;
};

type Location = { id: string; code?: string | null; name: string };

export function DraftFulfilmentSource({
  orderId,
  item,
  locations,
}: {
  orderId: string;
  item: Item;
  locations: Location[];
}) {
  const [state, action, pending] = useActionState(saveDraftFulfilmentSourceAction, initial);
  const [source, setSource] = useState(item.fulfilment_source || (item.inventory_item_id ? 'internal' : 'manual'));

  return (
    <form action={action} className="mt-3 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-[180px_1fr_auto] md:items-end">
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="item_id" value={item.id} />
      <label>
        <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-500">Fulfilment</span>
        <select name="fulfilment_source" value={source} onChange={(event) => setSource(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
          {item.inventory_item_id ? <option value="internal">Internal stock</option> : null}
          <option value="supplier">Supplier sourced</option>
          <option value="dropship">Dropship</option>
          <option value="manual">Manual / service</option>
        </select>
      </label>
      {source === 'internal' ? <label>
        <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-500">Stock location</span>
        <select name="source_location_id" defaultValue={item.source_location_id || ''} required className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
          <option value="">Choose location</option>
          {locations.map((location) => <option key={location.id} value={location.id}>{location.code ? `${location.code} · ` : ''}{location.name}</option>)}
        </select>
      </label> : <input type="hidden" name="source_location_id" value="" />}
      <button disabled={pending} className="rounded-lg bg-[#032489] px-4 py-2 text-xs font-black text-white disabled:opacity-50">{pending ? 'Saving…' : 'Save source'}</button>
      {state.message ? <div className={`text-xs font-semibold md:col-span-3 ${state.success ? 'text-emerald-700' : 'text-rose-700'}`}>{state.message}</div> : null}
    </form>
  );
}
