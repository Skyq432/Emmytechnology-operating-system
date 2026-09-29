'use client';

import { useActionState } from 'react';
import {
  requestOrderDeletionAction,
  resolveOrderDeletionAction,
  type OperationsActionState,
} from '@/app/(staff)/modules/operations/actions';
import { ActionResult } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { OperationsOrder } from '@/lib/operations/types';

const initialState: OperationsActionState = { success: false, message: '' };
const formatDate = (value: string | null) => (value ? new Date(value).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }) : '');

/**
 * Front desk (or anyone with operations.order.manage) can flag an order for deletion
 * with a reason; only admin/super_admin can resolve it — verified live against real
 * users before this was wired in (see ops_request_order_deletion /
 * ops_resolve_order_deletion). Never a hard delete: approving just marks the order
 * deleted, it stays in the database and out of lists/reports.
 */
export function OrderDeletionPanel({ order, viewerRole }: { order: OperationsOrder; viewerRole: string }) {
  const isAdmin = viewerRole === 'admin' || viewerRole === 'super_admin';
  const [requestState, requestAction, requestPending] = useActionState(requestOrderDeletionAction, initialState);
  const [resolveState, resolveAction, resolvePending] = useActionState(resolveOrderDeletionAction, initialState);

  if (order.deletion_status === 'deleted') {
    return (
      <section className="rounded-xl border border-red-200 bg-red-50/60 p-5">
        <h2 className="text-sm font-black text-red-800">This order has been deleted</h2>
        {order.deletion_reason && <p className="mt-2 text-xs text-red-700">Original reason: {order.deletion_reason}</p>}
        <p className="mt-1 text-xs text-red-600">
          Deleted {formatDate(order.deletion_resolved_at)}
          {order.deletion_resolution_note ? ` — ${order.deletion_resolution_note}` : ''}
        </p>
      </section>
    );
  }

  if (order.deletion_status === 'pending_deletion') {
    return (
      <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-5">
        <h2 className="text-sm font-black text-amber-800">Pending deletion</h2>
        <p className="mt-2 text-xs text-amber-700">Reason: {order.deletion_reason}</p>
        <p className="mt-1 text-[11px] text-amber-600">Flagged {formatDate(order.deletion_requested_at)}</p>
        {isAdmin ? (
          <form action={resolveAction} className="mt-4 space-y-3">
            <input type="hidden" name="order_id" value={order.id} />
            <textarea name="note" placeholder="Optional note (why approve or reject)" rows={2} className="input w-full" />
            <div className="flex flex-wrap gap-3">
              <Button type="submit" name="approve" value="true" variant="danger" disabled={resolvePending}>
                {resolvePending ? 'Working…' : 'Approve deletion'}
              </Button>
              <Button type="submit" name="approve" value="false" variant="outline" disabled={resolvePending}>
                {resolvePending ? 'Working…' : 'Reject — restore order'}
              </Button>
            </div>
            <ActionResult state={resolveState} />
          </form>
        ) : (
          <p className="mt-3 text-xs font-semibold text-amber-600">Waiting for an administrator to review this request.</p>
        )}
      </section>
    );
  }

  return (
    <details className="rounded-xl border border-slate-200 bg-white p-5">
      <summary className="cursor-pointer text-sm font-bold text-red-700">Flag this order for deletion</summary>
      <p className="mt-2 text-xs text-slate-500">Use this if the order was created in error. It stays fully visible until an administrator reviews it, and nothing is ever permanently erased.</p>
      <form action={requestAction} className="mt-4 space-y-3">
        <input type="hidden" name="order_id" value={order.id} />
        <textarea name="reason" placeholder="Why should this order be deleted?" required rows={2} className="input w-full" />
        <Button type="submit" variant="danger" disabled={requestPending}>{requestPending ? 'Flagging…' : 'Flag for deletion'}</Button>
        <ActionResult state={requestState} className="mt-1" />
      </form>
    </details>
  );
}
