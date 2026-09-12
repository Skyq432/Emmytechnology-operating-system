'use client';

import { useActionState } from 'react';
import { applyRepairCashOffAction, type RepairCashOffActionState } from '@/app/modules/operations/cash-off-actions';

const initialState: RepairCashOffActionState = { success: false, message: '' };
const money = (value: number) => `₦${Number(value || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

export function RepairCashOffPanel({
  repairId,
  walletBalance,
  currentCashOff,
  quoteAmount,
  cashPaid,
  quoteApproved,
  canApply,
}: {
  repairId: string;
  walletBalance: number;
  currentCashOff: number;
  quoteAmount: number;
  cashPaid: number;
  quoteApproved: boolean;
  canApply: boolean;
}) {
  const [state, action, pending] = useActionState(applyRepairCashOffAction, initialState);
  const maximumTotal = Math.max(0, Math.min(currentCashOff + walletBalance, quoteAmount - cashPaid));
  const effectivePaid = cashPaid + currentCashOff;
  const balance = Math.max(quoteAmount - effectivePaid, 0);

  return (
    <section className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 shadow-sm">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-700">Customer Cash-Off</p>
          <h2 className="mt-1 text-lg font-black text-slate-900">Use Cash-Off on this repair</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">Cash-Off reduces what the customer owes but is kept separate from actual cash, POS or bank-transfer payments.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <Metric label="Wallet" value={money(walletBalance)} />
          <Metric label="Used here" value={money(currentCashOff)} />
          <Metric label="Cash paid" value={money(cashPaid)} />
          <Metric label="Balance" value={money(balance)} />
        </div>
      </div>

      {!quoteApproved ? (
        <div className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">The current repair quote must be approved before Cash-Off can be used.</div>
      ) : !canApply ? (
        <div className="mt-4 rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-600">Your role can view this repair but cannot apply customer funds.</div>
      ) : maximumTotal <= currentCashOff ? (
        <div className="mt-4 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-emerald-800">No additional Cash-Off can be applied to the current balance.</div>
      ) : (
        <form action={action} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <input type="hidden" name="repair_id" value={repairId} />
          <label className="flex-1">
            <span className="mb-1.5 block text-xs font-bold text-slate-700">Total Cash-Off to use on this repair</span>
            <input
              name="cash_off_amount"
              type="number"
              min={currentCashOff}
              max={maximumTotal}
              defaultValue={currentCashOff || Math.min(walletBalance, balance)}
              required
              className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
            />
            <span className="mt-1 block text-[11px] text-slate-500">Maximum currently allowed: {money(maximumTotal)}</span>
          </label>
          <button disabled={pending} className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">
            {pending ? 'Applying…' : 'Apply Cash-Off'}
          </button>
        </form>
      )}
      {state.message ? <div className={`mt-3 rounded-lg px-3 py-2 text-sm font-semibold ${state.success ? 'bg-white text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{state.message}</div> : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-white px-3 py-2"><div className="text-[10px] font-bold uppercase text-slate-400">{label}</div><div className="mt-1 font-black text-slate-800">{value}</div></div>;
}
