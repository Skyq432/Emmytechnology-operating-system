'use client';

import { useActionState, useMemo, useState } from 'react';
import { Link2, Plus, Search } from 'lucide-react';
import { HelpTip } from '@/components/ui/help-tip';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ActionResult } from '@/components/ui/alert';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { OPERATIONS_HELP } from '@/lib/operations/help';
import { createWebsiteLinkAction, type OperationsActionState } from '@/app/(staff)/modules/operations/actions';
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
          <div className="flex items-center gap-2"><p className="text-xs font-black uppercase tracking-[0.16em] text-emmy-primary">Optional connection</p><HelpTip text="Website Links connect internal inventory to website products only when you want them connected." label="About Website Links" /></div>
          <h1 className="mt-1.5 text-3xl font-black tracking-[-0.035em]">Website Links</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Products and inventory can work separately. Link them only when there is a useful relationship.</p>
        </div>
        <Button onClick={() => setShowCreate((value) => !value)} className="self-start"><Plus className="h-4 w-4" /> {showCreate ? 'Close form' : 'Create link'}</Button>
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
            <Field label="Inventory item"><Select name="inventory_item_id" required defaultValue=""><option value="" disabled>Choose internal item</option>{inventory.map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.name}</option>)}</Select></Field>
            <Field label="Website product"><Select name="website_product_id" required defaultValue=""><option value="" disabled>Choose website product</option>{websiteProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</Select></Field>
            <Field label="Relationship"><Select name="relationship_type" defaultValue="stocked"><option value="stocked">Stocked</option><option value="preorder">Pre-order</option><option value="on_demand">On demand</option><option value="dropship">Drop-ship</option><option value="service">Service</option><option value="display_only">Display only</option></Select></Field>
            <Field label="Website allocation"><Input name="website_allocation" type="number" min="0" placeholder="Optional" /></Field>
            <label className="flex items-center gap-3 self-end rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-600"><input name="stock_sync_enabled" type="checkbox" className="h-4 w-4" /> Sync stock</label>
          </div>
          <ActionResult state={state} className="mt-4" />
          <Button type="submit" disabled={pending} className="mt-5">{pending ? 'Linking...' : 'Create link'}</Button>
        </form>
      )}

      <div className="mb-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm"><Search className="h-4 w-4 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="Search links..." /></div>

      {filteredLinks.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white py-14 text-center shadow-sm">
          <Link2 className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm font-bold text-slate-700">No website links yet</p>
          <p className="mt-1 text-xs text-slate-500">That is okay. Products and inventory do not have to be linked.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow><TableHead>Inventory</TableHead><TableHead>Website</TableHead><TableHead>Relationship</TableHead><TableHead>Allocation</TableHead><TableHead>Stock sync</TableHead><TableHead>Status</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {filteredLinks.map((link) => (
              <TableRow key={link.id}>
                <TableCell><div className="font-black text-emmy-primary">{link.inventory_item?.sku || 'Internal item'}</div><div className="mt-1 text-xs text-slate-500">{link.inventory_item?.name || link.inventory_item_id}</div></TableCell>
                <TableCell><div className="font-bold text-slate-800">{link.website_product?.name || 'Website product'}</div><div className="mt-1 text-xs text-slate-400">{link.website_product?.slug || link.website_product_id}</div></TableCell>
                <TableCell className="font-semibold capitalize text-slate-600">{link.relationship_type.replaceAll('_', ' ')}</TableCell>
                <TableCell className="font-black text-slate-800">{link.website_allocation ?? '—'}</TableCell>
                <TableCell><Badge variant={link.stock_sync_enabled ? 'warning' : 'outline'}>{link.stock_sync_enabled ? 'Enabled' : 'Off'}</Badge></TableCell>
                <TableCell><Badge variant={link.is_active ? 'default' : 'outline'}>{link.is_active ? 'Active' : 'Inactive'}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span>{children}</label>; }
function Stat({ label, value, help }: { label: string; value: number; help: string }) { return <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"><div className="flex items-center gap-1.5"><p className="text-xs font-bold text-slate-500">{label}</p><HelpTip text={help} label={`About ${label}`} /></div><p className="mt-1 text-2xl font-black text-slate-950">{value}</p></div>; }
