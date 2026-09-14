'use client';

import { Search } from 'lucide-react';
import { useCrmData } from '@/components/crm/crm-data-context';

/**
 * Search stays applied as you move between Leads, Funnel and Contacts — it's bound to
 * shared context state rather than local component state, so navigating away and back
 * doesn't clear it.
 */
export function CrmSearchBox() {
  const { query, setQuery } = useCrmData();

  return (
    <div className="flex w-full max-w-xs items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm sm:w-auto">
      <Search className="h-4 w-4 shrink-0 text-slate-400" />
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search leads, products, phone…"
        className="w-full min-w-0 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
      />
    </div>
  );
}
