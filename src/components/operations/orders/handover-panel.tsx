'use client';

import { useActionState } from 'react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import {
  acknowledgeHandoverAction,
  createHandoverAction,
  type OperationsActionState,
} from '@/app/(staff)/modules/operations/actions';
import { ActionResult } from '@/components/ui/alert';
import type { OperationsHandover } from '@/lib/operations/types';

const initialState: OperationsActionState = { success: false, message: '' };

function AcknowledgeButton({ handoverId, orderId }: { handoverId: string; orderId: string }) {
  const [state, action, pending] = useActionState(acknowledgeHandoverAction, initialState);
  return (
    <form action={action} className="mt-2">
      <input type="hidden" name="handover_id" value={handoverId} />
      <input type="hidden" name="order_id" value={orderId} />
      <button type="submit" disabled={pending} className="inline-flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-xs font-black text-[#032489]"><CheckCircle2 className="h-3.5 w-3.5" /> {pending ? 'Acknowledging…' : 'Acknowledge'}</button>
      <ActionResult state={state} className="mt-2" />
    </form>
  );
}

/**
 * Create-handover and acknowledge both need to show their own real error instead of
 * crashing the whole page, hence useActionState here rather than the plain
 * server-action forms this replaced.
 */
export function HandoverPanel({
  orderId,
  users,
  handoffs,
}: {
  orderId: string;
  users: Array<{ id: string; name: string | null; email: string | null }>;
  handoffs: OperationsHandover[];
}) {
  const [state, action, pending] = useActionState(createHandoverAction, initialState);

  return (
    <>
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-black">Hand over responsibility</h2>
        <form action={action} className="mt-4 space-y-3">
          <input type="hidden" name="order_id" value={orderId} />
          <input name="to_team" required className="input" placeholder="Destination team" />
          <select name="to_user_id" className="input" defaultValue="">
            <option value="">No specific owner</option>
            {users.map((user) => <option key={user.id} value={user.id}>{user.name || user.email}</option>)}
          </select>
          <textarea name="note" className="input min-h-20" placeholder="What should happen next?" />
          <ActionResult state={state} />
          <button type="submit" disabled={pending} className="w-full rounded-lg bg-[#032489] px-4 py-2.5 text-sm font-black text-white">{pending ? 'Creating…' : 'Create handover'}</button>
        </form>
      </section>
      {handoffs.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b px-5 py-4"><h2 className="text-sm font-black">Handovers</h2></div>
          <div className="divide-y">
            {handoffs.map((handoff) => (
              <div key={handoff.id} className="p-4">
                <p className="text-sm font-black">{handoff.from_team || 'Unassigned'} <ArrowRight className="inline h-3 w-3" /> {handoff.to_team}</p>
                <p className="mt-1 text-xs capitalize text-slate-500">{handoff.status}</p>
                {handoff.status === 'pending' && <AcknowledgeButton handoverId={handoff.id} orderId={orderId} />}
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
