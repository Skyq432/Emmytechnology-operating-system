'use client';

import { useActionState, useMemo, useState } from 'react';
import { PackageCheck } from 'lucide-react';
import { changeOrderStatusAction, completeOrderHandoverAction, type OperationsActionState } from '@/app/(staff)/modules/operations/actions';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Alert, ActionResult } from '@/components/ui/alert';
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
  hasActiveReservations,
}: {
  orderId: string;
  currentStatus: OrderStatus;
  allowedStatuses: OrderStatus[];
  /** Reserved stock is waiting on this order — completion must go through the handover
   * action below (which actually consumes it), not the plain status-changer. */
  hasActiveReservations: boolean;
}) {
  const initialState: OperationsActionState = { success: false, message: '' };
  const [status, setStatus] = useState<OrderStatus>(allowedStatuses[0] || currentStatus);
  const requiresReason = requiresStatusTransitionReason(currentStatus, status);
  const skipped = useMemo(() => getSkippedOrderStatuses(currentStatus, status), [currentStatus, status]);
  const [handoverState, handoverAction, handoverPending] = useActionState(completeOrderHandoverAction, initialState);
  const [statusState, statusAction, statusPending] = useActionState(changeOrderStatusAction, initialState);

  return (
    <div className="mt-4 space-y-4">
      {hasActiveReservations && (
        <div className="rounded-xl border border-emmy-primary/20 bg-blue-50 p-4">
          <div className="flex items-center gap-2 text-sm font-black text-emmy-primary">
            <PackageCheck className="h-4 w-4" /> Reserved stock is waiting on this order
          </div>
          <p className="mt-1 text-xs text-slate-600">Completing handover hands the reserved item(s) to the customer and decrements stock. This is the only way to mark this order completed.</p>
          <form action={handoverAction} className="mt-3 space-y-2">
            <input type="hidden" name="order_id" value={orderId} />
            <Textarea name="note" className="min-h-16" placeholder="Optional note" />
            <ActionResult state={handoverState} />
            <Button type="submit" disabled={handoverPending} className="w-full">{handoverPending ? 'Completing…' : 'Complete handover'}</Button>
          </form>
        </div>
      )}

      {allowedStatuses.length === 0 ? (
        !hasActiveReservations && <p className="text-sm text-slate-500">No further status move.</p>
      ) : (
        <form action={statusAction} className="space-y-3">
          <input type="hidden" name="order_id" value={orderId} />
          <input type="hidden" name="current_status" value={currentStatus} />
          <Select name="status" value={status} onChange={(e) => setStatus(e.target.value as OrderStatus)}>
            {allowedStatuses.map((item) => <option key={item} value={item}>{getOrderStatusLabel(item)}</option>)}
          </Select>
          {skipped.length > 0 && (
            <Alert variant="warning">
              This will skip: {skipped.map(getOrderStatusLabel).join(', ')}. A reason is required.
            </Alert>
          )}
          <Textarea
            name="note"
            required={requiresReason}
            minLength={requiresReason ? 5 : undefined}
            className="min-h-20"
            placeholder={requiresReason ? 'Reason for skipping these fulfilment steps *' : 'Optional note'}
          />
          <ActionResult state={statusState} />
          <Button type="submit" disabled={statusPending} className="w-full">{statusPending ? 'Updating…' : 'Update fulfilment'}</Button>
        </form>
      )}
    </div>
  );
}
