// [MERGE] Finance · Product costs: what EmmyTech really paid for each product.
// Private: Supreme Administrator, Growth Lead and Sales Analyst see it; only the
// Supreme Administrator changes it (the database enforces both).
import { StatGrid, StatTile } from '@/components/ui/stat-tile';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PeriodFields } from '@/components/finance/period-fields';
import { financeFieldClass } from '@/components/finance/styles';
import { ActionButton, backPath, FormCard, Input, Note, Notice, PageHead, Section, Two } from '@/components/finance/ui';
import { COST_SOURCE_LABELS, CostInput, InlineForm, SaleCostBadge } from '@/components/finance/cost-ui';
import { joinCostProductAction, setProductCostAction, setSaleCostAction } from '../actions';
import { requireFinancePage } from '@/lib/finance/access';
import { getProductCosts } from '@/lib/finance/data';
import { formatDay } from '@/lib/finance/dates';
import { first, parseOverviewFilters, type SearchParams } from '@/lib/finance/filters';
import { getFinancePeriod, PERIOD_FROM_PAGE } from '@/lib/finance/period-source';
import { naira } from '@/lib/finance/format';
import type { ProductCosts } from '@/lib/finance/types';

const VIEWS = ['missing', 'all'] as const;

function JoinSelect({ products, exclude }: { products: ProductCosts['products']; exclude?: string | null }) {
  return (
    <select name="into" required defaultValue="" className={`${financeFieldClass} h-8 max-w-[200px] rounded-lg px-2 text-xs`}>
      <option value="">Same product as…</option>
      {products.filter((p) => p.id !== exclude).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  );
}

export default async function FinanceProductCostsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireFinancePage('costs');
  const params = await searchParams;
  const back = backPath('/modules/finance/costs', params);
  const { period } = parseOverviewFilters(params, new Date(), await getFinancePeriod(params));
  const view = (VIEWS as readonly string[]).includes(first(params.view) ?? '') ? first(params.view)! : 'missing';
  const data = await getProductCosts(period);
  const edit = data.can_edit;
  const s = data.summary;
  const profit = s.costed_value - s.cost;
  const waitingNow = data.waiting.filter((w) => w.lines_since_start > 0);
  const waitingOlder = data.waiting.filter((w) => w.lines_since_start === 0);
  const lines = view === 'missing' ? data.lines.filter((l) => l.unit_cost === null) : data.lines;
  const historyFor = (id: string) => data.history.filter((h) => h.product_id === id);
  const viewHref = (v: string) => {
    const q = new URLSearchParams();
    for (const [k, val] of Object.entries(params)) {
      const one = Array.isArray(val) ? val[0] : val;
      if (one && k !== 'ok' && k !== 'error' && k !== 'view') q.set(k, one);
    }
    q.set('view', v);
    return `/modules/finance/costs?${q.toString()}`;
  };

  return (
    <div className="space-y-6">
      <PageHead
        title="Product costs"
        sub={<>What EmmyTech really paid · {period.label} · <span className="font-semibold text-slate-700">Private: Supreme Administrator, Growth Lead and Sales Analyst only</span></>}
      />
      <Notice params={params} />
      {!edit ? <Note>View only. The Supreme Administrator sets real costs.</Note> : null}

      {PERIOD_FROM_PAGE ? (
        <form method="get" className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_8px_26px_rgba(15,23,42,0.045)]">
          <PeriodFields period={period} />
          <input type="hidden" name="view" value={view} />
          <button type="submit" className="h-10 rounded-xl bg-emmy-primary px-5 text-sm font-semibold text-white shadow-sm hover:bg-emmy-primary-light">Show</button>
        </form>
      ) : null}

      <StatGrid>
        <StatTile label="Sales with real cost" value={`${s.costed} of ${s.lines}`} tone={s.missing > 0 ? 'danger' : 'success'}
          description={s.missing > 0 ? `${s.missing} still need a real cost.` : 'Every sale in this period has a real cost.'} />
        <StatTile label="Waiting for cost" value={naira(s.missing_value)} tone={s.missing > 0 ? 'danger' : 'neutral'}
          description="Sold value of the sales with no real cost. Their profit is unknown." />
        <StatTile label="Real cost of sales" value={naira(s.cost)} tone="secondary" description="Real cost × quantity, costed sales only." />
        <StatTile label="Profit on costed sales" value={<span className={profit < 0 ? 'text-red-600' : ''}>{naira(profit)}</span>} tone="primary"
          description={s.costed_value > 0 ? `${Math.round((profit / s.costed_value) * 100)}% of what they sold for.` : 'No costed sales yet.'} />
      </StatGrid>

      {data.waiting.length > 0 ? (
        <section className="space-y-2 rounded-2xl border border-red-200 bg-red-50/50 p-4">
          <h2 className="text-base font-extrabold text-red-800">Required: products with no real cost</h2>
          <p className="text-sm text-red-900/80">
            {edit ? 'Enter what one of each cost. Every sale of it, past and future, then gets that cost automatically.' : 'The Supreme Administrator enters what one of each cost.'}
            {' '}If a name is the same product spelled differently, join it instead.
          </p>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Product (as typed in Sales)</TableHead><TableHead className="text-right">Sales waiting</TableHead><TableHead className="text-right">Avg sold for</TableHead><TableHead>Last sold</TableHead>
              {edit ? <><TableHead>Real cost of one</TableHead><TableHead>Or join</TableHead></> : null}
            </TableRow></TableHeader>
            <TableBody>
              {[...waitingNow, ...waitingOlder].map((w) => (
                <TableRow key={w.key} className={w.lines_since_start === 0 ? 'opacity-70' : undefined}>
                  <TableCell className="font-bold">{w.name}
                    {w.spellings.length > 1 ? <span className="block text-xs font-normal text-slate-500">Also typed: {w.spellings.filter((x) => x !== w.name).join(' · ')}</span> : null}
                    {w.lines_since_start === 0 ? <span className="block text-xs font-normal text-slate-500">Sold before Finance started only</span> : null}
                  </TableCell>
                  <TableCell className="text-right">{w.lines}<span className="block text-xs text-slate-400">{Number(w.quantity)} sold</span></TableCell>
                  <TableCell className="text-right font-[family-name:var(--font-mono)]">{naira(w.avg_price)}</TableCell>
                  <TableCell className="whitespace-nowrap text-slate-500">{formatDay(w.last_sold)}</TableCell>
                  {edit ? (
                    <>
                      <TableCell>
                        <InlineForm action={setProductCostAction} back={back} submit="Save" fields={w.product_id ? { product: w.product_id } : { name: w.name }}>
                          <CostInput />
                        </InlineForm>
                      </TableCell>
                      <TableCell>
                        {data.products.length > 0 ? (
                          <InlineForm action={joinCostProductAction} back={back} submit="Join" tone="ghost" fields={w.product_id ? { from_product: w.product_id } : { name: w.name }}>
                            <JoinSelect products={data.products} exclude={w.product_id} />
                          </InlineForm>
                        ) : <span className="text-xs text-slate-400">Nothing to join yet</span>}
                      </TableCell>
                    </>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ) : (
        <Note>Every product EmmyTech has sold has a real cost. New products appear here the first time they are sold.</Note>
      )}

      <Section title="Sales in this period" sub="Each sale gets the cost-list price that applied on its date. Set an exact cost when one unit cost more or less.">
        <div className="flex gap-2 text-sm">
          {[['missing', `Waiting for cost (${s.missing})`], ['all', `All sales (${s.lines})`]].map(([key, label]) => (
            <a key={key} href={viewHref(key)} className={`rounded-lg px-3 py-1.5 font-semibold no-underline ${view === key ? 'bg-emmy-primary text-white' : 'border border-slate-200 bg-white text-slate-700 hover:text-emmy-primary'}`}>{label}</a>
          ))}
        </div>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Date</TableHead><TableHead>Order</TableHead><TableHead>Branch</TableHead><TableHead>Item</TableHead><TableHead className="text-right">Qty</TableHead>
            <TableHead className="text-right">Sold for (each)</TableHead><TableHead className="text-right">Real cost (each)</TableHead><TableHead className="text-right">Profit</TableHead>
            {edit ? <TableHead>Exact cost for this sale</TableHead> : null}
          </TableRow></TableHeader>
          <TableBody>
            {lines.map((l) => (
              <TableRow key={l.order_item_id}>
                <TableCell className="whitespace-nowrap text-slate-500">{formatDay(l.sold_on)}</TableCell>
                <TableCell className="whitespace-nowrap font-bold">{l.order_code}</TableCell>
                <TableCell>{l.branch_name ?? <span className="text-slate-400">No branch</span>}</TableCell>
                <TableCell>{l.item_name}{l.product_name && l.product_name !== l.item_name ? <span className="block text-xs text-slate-400">= {l.product_name}</span> : null}</TableCell>
                <TableCell className="text-right">{Number(l.quantity)}</TableCell>
                <TableCell className="text-right font-[family-name:var(--font-mono)]">{naira(l.unit_price)}</TableCell>
                <TableCell className="text-right"><span className="font-[family-name:var(--font-mono)]">{l.unit_cost === null ? '—' : naira(l.unit_cost)}</span><span className="mt-1 block"><SaleCostBadge source={l.source} /></span></TableCell>
                <TableCell className={`text-right font-[family-name:var(--font-mono)] font-bold ${l.profit !== null && l.profit < 0 ? 'text-red-600' : ''}`}>{l.profit === null ? '—' : naira(l.profit)}</TableCell>
                {edit ? (
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      <InlineForm action={setSaleCostAction} back={back} submit="Set" tone="ghost" fields={{ item: l.order_item_id }}><CostInput placeholder="Exact ₦" /></InlineForm>
                      {l.source === 'exact' ? <ActionButton action={setSaleCostAction} back={back} fields={{ item: l.order_item_id, clear: '1' }} label="Use cost list" /> : null}
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
            {lines.length === 0 ? <TableRow><TableCell colSpan={edit ? 9 : 8} className="text-center text-slate-400">{view === 'missing' ? 'No sale in this period is waiting for a real cost.' : 'No sales in this period.'}</TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </Section>

      <Section title="Cost list" sub="One real cost per product, with history. Supplier bills add new prices automatically from the bill date.">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Product</TableHead><TableHead className="text-right">Real cost now</TableHead><TableHead>Since</TableHead><TableHead>Where it came from</TableHead><TableHead className="text-right">Sold (all time)</TableHead>
            {edit ? <><TableHead>New cost</TableHead><TableHead>Join</TableHead></> : null}
          </TableRow></TableHeader>
          <TableBody>
            {data.products.map((p) => {
              const history = historyFor(p.id);
              return (
                <TableRow key={p.id}>
                  <TableCell className="font-bold">{p.name}
                    {p.inventory_name ? <Badge variant="outline" className="ml-2">Inventory</Badge> : null}
                    {p.spellings.length > 1 ? <span className="block text-xs font-normal text-slate-500">Spellings: {p.spellings.join(' · ')}</span> : null}
                    {history.length > 1 ? (
                      <details className="mt-1 text-xs font-normal text-slate-500">
                        <summary className="cursor-pointer text-emmy-primary">Price history ({history.length})</summary>
                        <ul className="mt-1 space-y-0.5">
                          {history.map((h, i) => (
                            <li key={i} className={h.void ? 'line-through' : undefined}>{formatDay(h.effective_from)}: {naira(h.unit_cost)} · {COST_SOURCE_LABELS[h.source]}{h.bill_ref ? ` ${h.bill_ref} (${h.supplier_name})` : ''}{h.by ? ` · ${h.by}` : ''}{h.note ? ` · ${h.note}` : ''}</li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right font-[family-name:var(--font-mono)] font-bold">{p.unit_cost === null ? <Badge variant="danger">Not set</Badge> : naira(p.unit_cost)}</TableCell>
                  <TableCell className="whitespace-nowrap text-slate-500">{p.effective_from ? formatDay(p.effective_from) : '—'}</TableCell>
                  <TableCell>{p.source ? COST_SOURCE_LABELS[p.source] : '—'}</TableCell>
                  <TableCell className="text-right">{Number(p.sold_qty)}</TableCell>
                  {edit ? (
                    <>
                      <TableCell>
                        <InlineForm action={setProductCostAction} back={back} submit="Save" fields={{ product: p.id }}>
                          <CostInput />
                          <input name="from" type="date" defaultValue={data.today} max={data.today} required title="Applies to sales from this day" className={`${financeFieldClass} h-8 w-36 rounded-lg px-2 text-xs`} />
                        </InlineForm>
                      </TableCell>
                      <TableCell>
                        <InlineForm action={joinCostProductAction} back={back} submit="Join" tone="ghost" fields={{ from_product: p.id }}>
                          <JoinSelect products={data.products} exclude={p.id} />
                        </InlineForm>
                      </TableCell>
                    </>
                  ) : null}
                </TableRow>
              );
            })}
            {data.products.length === 0 ? <TableRow><TableCell colSpan={edit ? 7 : 5} className="text-center text-slate-400">No products on the cost list yet.</TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </Section>

      {edit ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormCard title="Add a product to the cost list" hint="For stock bought but not sold yet. Products sold already appear in the list above." action={setProductCostAction} back={back} submit="Save">
            <Input name="name" placeholder="Product name, e.g. Dell Latitude 3190" required maxLength={160} />
            <Two>
              <Input name="cost" type="number" min="0" step="0.01" placeholder="Real cost of one ₦" required />
              <Input name="from" type="date" defaultValue={data.today} max={data.today} required />
            </Two>
          </FormCard>
        </div>
      ) : null}

      <Note>
        A sale&apos;s real cost is, in order: an exact cost set for that sale; else the product&apos;s cost-list price on the sale date (the first price also covers older sales); else it is missing.
        Staff base prices in Sales and Inventory are negotiation prices and are never used as cost. Names are matched without capitals or extra spaces.
      </Note>
    </div>
  );
}
