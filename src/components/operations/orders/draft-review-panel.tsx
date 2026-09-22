'use client';

import { useActionState } from 'react';
import {
  confirmOrderAction,
  updateDraftAttributionAction,
  type OperationsActionState,
} from '@/app/(staff)/modules/operations/actions';
import { HelpTip } from '@/components/ui/help-tip';
import { ActionResult } from '@/components/ui/alert';
import type { OperationsOrder } from '@/lib/operations/types';

const initialState: OperationsActionState = { success: false, message: '' };
const money = (value: number | null | undefined) => `₦${Number(value || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

/**
 * "Review before confirmation" — attribution save and the Confirm order button both
 * need to show their own real error (e.g. "Choose an internal stock location before
 * confirming") instead of crashing the whole page, which is why this is a client
 * component with useActionState rather than the plain server-action forms it replaced.
 */
export function DraftReviewPanel({
  order,
  ambassadors,
  estimatedCommission,
}: {
  order: OperationsOrder;
  ambassadors: Array<{ id: string; name: string; tag: string | null }>;
  estimatedCommission: number;
}) {
  const [attributionState, attributionAction, attributionPending] = useActionState(updateDraftAttributionAction, initialState);
  const [confirmState, confirmAction, confirmPending] = useActionState(confirmOrderAction, initialState);

  return (
    <section className="mb-5 rounded-xl border border-blue-200 bg-blue-50/60 p-5">
      <div className="flex items-start gap-2">
        <div>
          <h2 className="font-black text-[#032489]">Review before confirmation</h2>
          <p className="mt-1 text-sm text-slate-600">Check customer, sales details, Ambassador, commission, price and fulfilment source. Internal-stock lines must have a real stock location before confirmation.</p>
        </div>
        <HelpTip text="Draft is preparation only. Confirm when the sale is real and internal stock has a source location." label="About confirming" />
      </div>

      <form action={attributionAction} className="mt-4 grid gap-3 rounded-lg bg-white p-4 md:grid-cols-[1fr_180px_auto] md:items-end">
        <input type="hidden" name="order_id" value={order.id} />
        <input type="hidden" name="attribution_source" value="manual_admin" />
        <label>
          <span className="mb-1.5 block text-xs font-bold text-slate-600">Ambassador</span>
          <select name="ambassador_id" defaultValue={order.ambassador_id || ''} className="input">
            <option value="">No Ambassador</option>
            {ambassadors.map((item) => <option key={item.id} value={item.id}>{item.name}{item.tag ? ` · ${item.tag}` : ''}</option>)}
          </select>
        </label>
        <label>
          <span className="mb-1.5 block text-xs font-bold text-slate-600">Commission %</span>
          <input name="commission_rate" type="number" min="0" step="0.01" defaultValue={Number(order.commission_rate || 0)} className="input" />
        </label>
        <button type="submit" disabled={attributionPending} className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-black text-[#032489]">{attributionPending ? 'Saving…' : 'Save attribution'}</button>
        <div className="md:col-span-3"><ActionResult state={attributionState} /></div>
      </form>

      <form action={confirmAction} className="mt-4">
        <input type="hidden" name="order_id" value={order.id} />
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <p className="text-sm text-slate-600">Total <strong>{money(order.total_amount)}</strong>{order.ambassador_id ? ` · Estimated commission ${money(estimatedCommission)}` : ' · No Ambassador commission'}</p>
          <button type="submit" disabled={confirmPending} className="rounded-lg bg-[#032489] px-5 py-2.5 text-sm font-black text-white">{confirmPending ? 'Confirming…' : 'Confirm order'}</button>
        </div>
        <ActionResult state={confirmState} className="mt-3" />
      </form>
    </section>
  );
}
