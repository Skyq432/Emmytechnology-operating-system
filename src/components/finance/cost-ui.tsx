// [MERGE] Real product cost: small pieces shared by the Product costs page and
// the Real cost box on an Inventory product page (server-safe, no client JS).
import { Badge } from '@/components/ui/badge';
import { setInventoryRealCostAction } from '@/app/(staff)/modules/finance/actions';
import { formatDay } from '@/lib/finance/dates';
import { naira } from '@/lib/finance/format';
import type { CostSource, InventoryRealCost } from '@/lib/finance/types';
import { financeFieldClass } from './styles';

export const COST_SOURCE_LABELS: Record<CostSource, string> = {
  manual: 'Set by hand',
  inventory: 'Set in Inventory',
  supplier_bill: 'Supplier bill',
};

export function SaleCostBadge({ source }: { source: 'exact' | 'list' | null }) {
  if (source === 'exact') return <Badge variant="info">Exact for this sale</Badge>;
  if (source === 'list') return <Badge variant="success">From cost list</Badge>;
  return <Badge variant="danger">No real cost</Badge>;
}

/** A small one-line form inside a table row. */
export function InlineForm({ action, back, fields, children, submit, tone = 'primary' }: {
  action: (fd: FormData) => Promise<void>; back: string; fields: Record<string, string>; children?: React.ReactNode; submit: string;
  tone?: 'primary' | 'ghost';
}) {
  const cls = tone === 'primary'
    ? 'bg-emmy-primary text-white hover:bg-emmy-primary-light'
    : 'border border-slate-200 bg-white text-slate-700 hover:text-emmy-primary';
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="_back" value={back} />
      {Object.entries(fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
      {children}
      <button type="submit" className={`h-8 whitespace-nowrap rounded-lg px-3 text-xs font-bold ${cls}`}>{submit}</button>
    </form>
  );
}

export function CostInput({ name = 'cost', placeholder = 'Real cost ₦', defaultValue }: { name?: string; placeholder?: string; defaultValue?: number | null }) {
  return (
    <input name={name} type="number" min="0" step="0.01" required placeholder={placeholder} defaultValue={defaultValue ?? undefined}
      className={`${financeFieldClass} h-8 w-32 rounded-lg px-2 text-xs`} />
  );
}

/**
 * The Real cost box on an Inventory product page. Render it only for people who
 * may see real cost (canSeeCost); only the Supreme Administrator gets the form.
 * The "Default cost" / base price above it is the staff negotiation price.
 */
export function RealCostCard({ itemId, cost, back }: { itemId: string; cost: InventoryRealCost; back: string }) {
  return (
    <section className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50/40 p-5 shadow-sm">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <h2 className="text-sm font-black text-slate-900">Real cost <span className="ml-1 rounded-md bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Private</span></h2>
          <p className="mt-1 max-w-xl text-xs leading-5 text-slate-500">
            What EmmyTech really paid for one. Finance uses it for profit. Only the Supreme Administrator, Growth Lead and Sales Analyst see this box.
            The base price above is the staff negotiation price, not the real cost.
          </p>
        </div>
        <div className="min-w-[180px] rounded-lg bg-white px-4 py-3 ring-1 ring-emerald-100">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Real cost now</div>
          <div className="mt-1 font-[family-name:var(--font-mono)] text-lg font-black text-slate-900">{cost.unit_cost === null ? 'Not set' : naira(cost.unit_cost)}</div>
          {cost.unit_cost !== null && cost.effective_from && cost.source ? (
            <div className="mt-0.5 text-[11px] text-slate-500">{COST_SOURCE_LABELS[cost.source]} · from {formatDay(cost.effective_from)}</div>
          ) : <div className="mt-0.5 text-[11px] font-semibold text-red-600">Sales of this product count as missing cost.</div>}
        </div>
      </div>
      {cost.can_edit ? (
        <form action={setInventoryRealCostAction} className="mt-4 flex flex-wrap items-end gap-3">
          <input type="hidden" name="_back" value={back} />
          <input type="hidden" name="inventory_item" value={itemId} />
          <label className="flex flex-col gap-1 text-xs font-bold text-slate-600">{cost.unit_cost === null ? 'Real cost of one' : 'New real cost of one'}
            <input name="cost" type="number" min="0" step="0.01" required placeholder="₦" className={`${financeFieldClass} w-44`} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold text-slate-600">Applies to sales from
            <input name="from" type="date" defaultValue={cost.today} max={cost.today} required className={`${financeFieldClass} w-44`} />
          </label>
          <button type="submit" className="h-10 rounded-xl bg-emmy-primary px-5 text-sm font-semibold text-white shadow-sm hover:bg-emmy-primary-light">Save real cost</button>
          {cost.unit_cost === null ? <p className="w-full text-[11px] text-slate-500">The first cost also covers older sales of this product.</p> : null}
        </form>
      ) : <p className="mt-3 text-[11px] text-slate-500">View only. The Supreme Administrator sets real cost.</p>}
    </section>
  );
}
