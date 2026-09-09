'use client';

import { useMemo, useState } from 'react';
import { changeOrderStatusAction } from '@/app/modules/operations/actions';
import {
  getOrderStatusLabel,
  getSkippedOrderStatuses,
  requiresStatusTransitionReason,
  type OrderStatus,
} from '@/lib/operations/domain';

export function FulfilmentControl({
  orderId,
  currentStatus,
  allowedStatuses,
}: {
  orderId: string;
  currentStatus: OrderStatus;
  allowedStatuses: OrderStatus[];
}) {
  const [status, setStatus] = useState<OrderStatus>(allowedStatuses[0] || currentStatus);
  const requiresReason = requiresStatusTransitionReason(currentStatus, status);
  const skipped = useMemo(() => getSkippedOrderStatuses(currentStatus, status), [currentStatus, status]);

  if (allowedStatuses.length === 0) {
    return <p className="mt-3 text-sm text-slate-500">No further status move.</p>;
  }

  return (
    <form action={changeOrderStatusAction} className="mt-4 space-y-3">
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="current_status" value={currentStatus} />
      <select name="status" value={status} onChange={(e) => setStatus(e.target.value as OrderStatus)} className="input">
        {allowedStatuses.map((item) => <option key={item} value={item}>{getOrderStatusLabel(item)}</option>)}
      </select>
      {skipped.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          This will skip: {skipped.map(getOrderStatusLabel).join(', ')}. A reason is required.
        </div>
      )}
      <textarea
        name="note"
        required={requiresReason}
        minLength={requiresReason ? 5 : undefined}
        className="input min-h-20"
        placeholder={requiresReason ? 'Reason for skipping these fulfilment steps *' : 'Optional note'}
      />
      <button className="w-full rounded-lg bg-[#032489] px-4 py-2.5 text-sm font-black text-white">Update fulfilment</button>
    </form>
  );
}
