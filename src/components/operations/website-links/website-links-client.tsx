'use client';

import { useActionState, useMemo, useState } from 'react';
import { Link2, Plus, Search } from 'lucide-react';
import { HelpTip } from '@/components/ui/help-tip';
import { OPERATIONS_HELP } from '@/lib/operations/help';
import { createWebsiteLinkAction, type OperationsActionState } from '@/app/modules/operations/actions';
import type { OperationsInventoryItem, OperationsWebsiteLink } from '@/lib/operations/types';

const initialState: OperationsActionState = { success: false, message: '' };

export function WebsiteLinksClient({ links, inventory, websiteProducts }: { links: OperationsWebsiteLink[]; inventory: OperationsInventoryItem[]; websiteProducts: Array<{ id: string; name: string; slug: string; status: string | null }> }) {
  const [state, formAction, pending] = useActionState(createWebsiteLinkAction, initialState);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const linkedInventoryIds = useMemo(() => new Set(links.filter((link) => link.is_active).map((link) => link.inventory_item_id)), [links]);
  const linkedWebsiteIds = useMemo(() => new Set(links.filter((link) => link.is_active).map((link) => link.website_product_id)), [links]);
  const websiteOnly = websiteProducts.filter((product) => !linkedWebsiteIds.has(product.id));
  const inventoryOnly = inventory.filter((item) => !linkedInventoryIds.has(item.id));

  const filteredLinks = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return links;
    return links.filter((link) => [link.inventory_item?.sku, link.inventory_item?.name, link.website_product?.name, link.relationship_type].filter(Boolean).join(' ').toLowerCase().includes(q));
  }, [links, search]);

  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="mb-5 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="flex items-center gap-2"><p className="text-xs font-black uppercase tracking-[0.16em] text-[#032489]">Optional connection</p><HelpTip text="Website Links connect internal inventory to website products only when you want them connected." label="About Website Links" /></div>
          <h1 className="mt-1.5 text-3xl font-black tracking-[-0.035em]">Website Links</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Products and inventory can work separately. Link them only when there is a useful relationship.</p>
        </div>
        <button onClick={() => setShowCreate((value) => !value)} className="inline-flex items-center gap-2 self-start rounded-lg bg-[#032489] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#021d70]"><Plus className="h-4 w-4" /> {showCreate ? 'Close form' : 'Create link'}</button>
      </div>

      <div className="mb-5 grid gap-3 md:grid-cols-3">
        <Stat label="Active links" value={links.filter((link) => link.is_active).length} help="Internal items that are currently connected to website products." />
        <Stat label="Inventory only" value={inventoryOnly.length} help="Internal items with no website product. This is completely okay." />
        <Stat label="Website only" value={websiteOnly.length} help="Website products with no inventory item. This is also completely okay." />
      </div>

      {showCreate && (
        <form action={formAction} className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2"><h2 className="text-sm font-black text-slate-900">Create optional link</h2><HelpTip text={OPERATIONS_HELP.createWebsiteLink} label="About creating a website link" /></div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Field label="Inventory item"><select name="inventory_item_id" required className="input" defaultValue=""><option value="" disabled>Choose internal item</option>{inventory.map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.name}</option>)}</select></Field>
            <Field label="Website product"><select name="website_product_id" required className="input" defaultValue=""><option value="" disabled>Choose website product</option>{websiteProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></Field>
            <Field label="Relationship"><select name="relationship_type" className="input" defaultValue="stocked"><option value="stocked">Stocked</option><option value="preorder">Pre-order</option><option value="on_demand">On demand</option><option value="dropship">Drop-ship</option><option value="service">Service</option><option value="display_only">Display only</option></select></Field>
            <Field label="Website allocation"><input name="website_allocation" type="number" min="0" className="input" placeholder="Optional" /></Field>
            <label className="flex items-center gap-3 self-end rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-600"><input name="stock_sync_enabled" type="checkbox" className="h-4 w-4" /> Sync stock</label>
          </div>
          {state.message && <p className={`mt-4 text-sm font-bold ${state.success ? 'text-blue-700' : 'text-rose-700'}`}>{state.message}</p>}
          <button disabled={pending} className="mt-5 rounded-lg bg-[#032489] px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">{pending ? 'Linking...' : 'Create link'}</button>
        </form>
      )}

      <div className="mb-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm"><Search className="h-4 w-4 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="Search links..." /></div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {filteredLinks.length === 0 ? <div className="py-14 text-center"><Link2 className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-700">No website links yet</p><p className="mt-1 text-xs text-slate-500">That is okay. Products and inventory do not have to be linked.</p></div> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Inventory</th><th className="px-5 py-3">Website</th><th className="px-5 py-3">Relationship</th><th className="px-5 py-3">Allocation</th><th className="px-5 py-3">Stock sync</th><th className="px-5 py-3">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredLinks.map((link) => <tr key={link.id} className="hover:bg-slate-50/70"><td className="px-5 py-4"><div className="font-black text-[#032489]">{link.inventory_item?.sku || 'Internal item'}</div><div className="mt-1 text-xs text-slate-500">{link.inventory_item?.name || link.inventory_item_id}</div></td><td className="px-5 py-4"><div className="font-bold text-slate-800">{link.website_product?.name || 'Website product'}</div><div className="mt-1 text-xs text-slate-400">{link.website_product?.slug || link.website_product_id}</div></td><td className="px-5 py-4 font-semibold capitalize text-slate-600">{link.relationship_type.replaceAll('_', ' ')}</td><td className="px-5 py-4 font-black text-slate-800">{link.website_allocation ?? '—'}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-black ${link.stock_sync_enabled ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{link.stock_sync_enabled ? 'Enabled' : 'Off'}</span></td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-black ${link.is_active ? 'bg-blue-50 text-[#032489]' : 'bg-slate-100 text-slate-500'}`}>{link.is_active ? 'Active' : 'Inactive'}</span></td></tr>)}</tbody></table></div>
        )}
      </div>
      <style jsx>{`.input{width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;font-size:14px;outline:none;background:#fff}.input:focus{border-color:#032489;box-shadow:0 0 0 3px rgba(3,36,137,.08)}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span>{children}</label>; }
function Stat({ label, value, help }: { label: string; value: number; help: string }) { return <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"><div className="flex items-center gap-1.5"><p className="text-xs font-bold text-slate-500">{label}</p><HelpTip text={help} label={`About ${label}`} /></div><p className="mt-1 text-2xl font-black text-slate-950">{value}</p></div>; }
