'use client';

import { useActionState, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { saveDraftFulfilmentSourceAction } from '@/app/(staff)/modules/operations/order-fulfilment-actions';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ActionResult } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import type { OperationsLocation, OperationsOrderItem } from '@/lib/operations/types';

const initial = { success: false, message: '' };

export function DraftFulfilmentSource({
  orderId,
  item,
  locations,
}: {
  orderId: string;
  item: Pick<OperationsOrderItem, 'id' | 'item_name' | 'inventory_item_id' | 'fulfilment_source' | 'source_location_id'>;
  locations: OperationsLocation[];
}) {
  const [state, action, pending] = useActionState(saveDraftFulfilmentSourceAction, initial);
  const [source, setSource] = useState<string>(item.fulfilment_source || (item.inventory_item_id ? 'internal' : 'manual'));
  // Flag this card the moment it's missing what confirmation needs, rather than only
  // after Confirm order has already failed elsewhere on the page — so staff land here
  // to fill it in instead of hunting for which item an error message meant.
  const needsLocation = source === 'internal' && !item.source_location_id;

  return (
    <form
      action={action}
      className={cn(
        'mt-3 grid gap-2 rounded-lg border p-3 md:grid-cols-[180px_1fr_auto] md:items-end',
        needsLocation ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50'
      )}
    >
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="item_id" value={item.id} />
      {needsLocation && (
        <div className="flex items-center gap-2 text-xs font-bold text-amber-800 md:col-span-3">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Needs a stock location before this Order can be confirmed
        </div>
      )}
      <label>
        <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-500">Fulfilment</span>
        <Select name="fulfilment_source" value={source} onChange={(event) => setSource(event.target.value)} className="h-9 text-xs">
          {item.inventory_item_id ? <option value="internal">Internal stock</option> : null}
          <option value="supplier">Supplier sourced</option>
          <option value="dropship">Dropship</option>
          <option value="manual">Manual / service</option>
        </Select>
      </label>
      {source === 'internal' ? <label>
        <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-500">Stock location</span>
        <Select name="source_location_id" defaultValue={item.source_location_id || ''} required className="h-9 text-xs">
          <option value="">Choose location</option>
          {locations.map((location) => <option key={location.id} value={location.id}>{location.code ? `${location.code} · ` : ''}{location.name}</option>)}
        </Select>
      </label> : <input type="hidden" name="source_location_id" value="" />}
      <Button type="submit" size="sm" disabled={pending}>{pending ? 'Saving…' : 'Save source'}</Button>
      <ActionResult state={state} className="md:col-span-3" />
    </form>
  );
}
