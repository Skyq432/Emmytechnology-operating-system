'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

export interface ProductPickerItem {
  id: string;
  sku: string;
  name: string;
  category?: string | null;
  default_selling_price?: number | null;
}

/**
 * Search-to-pick a product from the inventory catalog. Unlike IdentityPicker, this never
 * hits the network — the whole catalog is already a prop on the Direct Sale and New Order
 * forms, so filtering happens purely client-side. Replaces a single flat <select> that
 * listed every item with no way to filter, which stopped being usable once the catalog
 * grew past a handful of products.
 */
export function ProductPicker<T extends ProductPickerItem>({
  items,
  value,
  onChange,
  placeholder = 'Search by name or SKU...',
  className,
}: {
  items: T[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [query, setQuery] = useState('');
  const selected = items.find((item) => item.id === value) || null;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return items
      .filter((item) =>
        item.name.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q) ||
        (item.category || '').toLowerCase().includes(q)
      )
      .slice(0, 30);
  }, [items, query]);

  function choose(item: T) {
    onChange(item.id);
    setQuery('');
  }

  function clear() {
    onChange('');
    setQuery('');
  }

  if (selected) {
    return (
      <div className={cn('flex items-center justify-between gap-2 rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2.5', className)}>
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-slate-900">{selected.name}</div>
          <div className="text-xs text-slate-500">{selected.sku}{selected.category ? ` · ${selected.category}` : ''}</div>
        </div>
        <button type="button" onClick={clear} className="shrink-0 text-xs font-bold text-emmy-primary">Change</button>
      </div>
    );
  }

  return (
    <div className={cn('relative', className)}>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emmy-primary focus:ring-2 focus:ring-emmy-primary/10"
      />
      {query.trim() ? (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {results.length === 0 ? (
            <div className="px-4 py-3 text-xs text-slate-400">No matching products.</div>
          ) : (
            results.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => choose(item)}
                className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-4 py-2.5 text-left last:border-0 hover:bg-blue-50"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-slate-800">{item.name}</div>
                  <div className="text-xs text-slate-500">{item.sku}{item.category ? ` · ${item.category}` : ''}</div>
                </div>
                {item.default_selling_price != null ? (
                  <span className="shrink-0 text-xs font-bold text-slate-500">₦{Number(item.default_selling_price).toLocaleString('en-NG')}</span>
                ) : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
