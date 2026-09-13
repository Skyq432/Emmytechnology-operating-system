'use client';

import { ChevronRight } from 'lucide-react';
import { useCrmData } from '@/components/crm/crm-data-context';
import { CrmSearchBox } from '@/components/crm/crm-search-box';
import { initialsFor } from '@/lib/crm/domain';

export default function CrmContactsPage() {
  const { filteredLeads, loading, dbError, openLead } = useCrmData();

  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading CRM identities…</div>;
  if (dbError) return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm font-semibold text-rose-700">Database connection error: {dbError}</div>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-emmy-primary">{filteredLeads.length} contacts</div>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-950">Contacts</h1>
          <p className="mt-1 max-w-[64ch] text-sm text-slate-500">People are stored once, while funnel stage, activities and commercial history build around the same profile.</p>
        </div>
        <CrmSearchBox />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filteredLeads.map((lead) => (
          <button
            type="button"
            key={lead.id}
            onClick={() => openLead(lead)}
            className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-emmy-primary/30"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-extrabold text-slate-600">{initialsFor(lead.name)}</span>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-extrabold text-slate-950">{lead.name}</h3>
              <p className="truncate text-xs text-slate-500">{lead.phone}</p>
              <span className="truncate text-xs text-slate-400">{lead.product}</span>
            </div>
            <ChevronRight className="h-[18px] w-[18px] shrink-0 text-slate-400" />
          </button>
        ))}
      </div>
    </div>
  );
}
