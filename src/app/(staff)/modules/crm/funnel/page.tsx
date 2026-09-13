'use client';

import { ArrowUpRight, Sparkles } from 'lucide-react';
import { useCrmData } from '@/components/crm/crm-data-context';
import { CrmSearchBox } from '@/components/crm/crm-search-box';
import { TrackingBadge } from '@/components/crm/tracking-badge';
import { CRM_STAGES } from '@/lib/crm/domain';
import type { Lead } from '@/lib/crm/types';
import { cn } from '@/lib/utils';

const PRIORITY_BADGE: Record<Lead['priority'], string> = {
  High: 'bg-red-50 text-red-700',
  Medium: 'bg-amber-50 text-amber-700',
  Normal: 'bg-slate-100 text-slate-600',
};

function LeadCard({ lead, onOpen }: { lead: Lead; onOpen: () => void }) {
  return (
    <button
      type="button"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', lead.id);
      }}
      onClick={onOpen}
      title="Open identity or drag to another stage"
      className="flex w-full flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm hover:border-emmy-primary/30"
    >
      <div className="flex items-center justify-between gap-2">
        <strong className="truncate text-sm text-slate-950">{lead.name}</strong>
        <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold', PRIORITY_BADGE[lead.priority])}>{lead.priority}</span>
      </div>
      <p className="truncate text-xs text-slate-500">{lead.product}</p>
      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
        <span>Last: {lead.lastAction}</span>
      </div>
      <div className="flex items-start gap-2 rounded-lg bg-surface-muted p-2">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emmy-primary" />
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Action status</div>
          <div className="truncate text-xs font-bold text-slate-800">{lead.nextAction}</div>
        </div>
      </div>
      <div className="flex items-center justify-between text-[11px] text-slate-500">
        <span>{lead.owner}</span>
        <span className="flex items-center gap-1 font-bold text-emmy-primary">
          Open <ArrowUpRight className="h-3 w-3" />
        </span>
      </div>
    </button>
  );
}

export default function CrmFunnelPage() {
  const { filteredLeads, loading, dbError, openLead, moveLead } = useCrmData();

  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading CRM identities…</div>;
  if (dbError) return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm font-semibold text-rose-700">Database connection error: {dbError}</div>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-emmy-primary">10 stages</div>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-950">Behavior Funnel</h1>
          <p className="mt-1 max-w-[64ch] text-sm text-slate-500">Drag a person between stages when staff needs to confirm or correct the journey. Every manual move is saved to CRM history.</p>
        </div>
        <CrmSearchBox />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <TrackingBadge type="Automatic" /> <span>system event</span>
        <TrackingBadge type="Manual" /> <span>staff confirmation</span>
        <TrackingBadge type="Recommended" /> <span>system suggestion</span>
      </div>

      <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex gap-3">
          {CRM_STAGES.map((stage) => {
            const cards = filteredLeads.filter((lead) => lead.stage === stage.id);
            return (
              <div
                key={stage.id}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const id = event.dataTransfer.getData('text/plain');
                  const lead = filteredLeads.find((item) => item.id === id);
                  if (lead) void moveLead(lead, stage.id);
                }}
                className="flex w-[240px] shrink-0 flex-col gap-2 rounded-2xl border border-slate-200 bg-surface-muted p-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="grid h-6 w-6 place-items-center rounded-md bg-white text-[10.5px] font-extrabold text-slate-500">{stage.id}</span>
                    <strong className="text-sm text-slate-950">{stage.name}</strong>
                  </div>
                  <b className="font-[family-name:var(--font-mono)] text-sm text-slate-950">{cards.length}</b>
                </div>
                <p className="text-xs text-slate-500">{stage.short}</p>
                <TrackingBadge type={stage.tracking} />
                <div className="flex flex-col gap-2">
                  {cards.length ? (
                    cards.map((lead) => <LeadCard key={lead.id} lead={lead} onOpen={() => openLead(lead)} />)
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-300 p-3 text-center text-[11px] text-slate-400">Drop a record here</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
