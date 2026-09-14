'use client';

import { MessageCircle } from 'lucide-react';
import { useCrmData } from '@/components/crm/crm-data-context';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const OUTCOMES = ['Contacted', 'Negotiating', 'Paid', 'Lost'] as const;

export default function CrmHandoffPage() {
  const { leads, loading, dbError, openLead, recordOutcome } = useCrmData();

  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading CRM identities…</div>;
  if (dbError) return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm font-semibold text-rose-700">Database connection error: {dbError}</div>;

  const handoffs = leads.filter((lead) => lead.stage === 5);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wide text-emmy-primary">{handoffs.length} awaiting outcome</div>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-950">WhatsApp Handoff Queue</h1>
        <p className="mt-1 max-w-[64ch] text-sm text-slate-500">The OS knows the customer clicked Send to EmmyTech. Staff records the conversation outcome here until WhatsApp is integrated.</p>
      </div>

      <div className="flex items-start gap-3 rounded-2xl bg-amber-50 p-4">
        <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
        <div>
          <strong className="text-sm text-amber-900">Visibility boundary</strong>
          <p className="mt-0.5 text-xs text-amber-800">Do not count these as completed purchases. Record what happened after the WhatsApp handoff.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {handoffs.map((lead) => (
          <Card key={lead.id} className="p-4">
            <button type="button" className="w-full text-left" onClick={() => openLead(lead)}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">WhatsApp handoff</div>
                  <h3 className="text-sm font-extrabold text-slate-950">{lead.name}</h3>
                </div>
                <b className="shrink-0 font-[family-name:var(--font-mono)] text-sm text-slate-950">{lead.age}</b>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-400">Product</span>
                  <div className="font-bold text-slate-950">{lead.product}</div>
                </div>
                <div>
                  <span className="text-slate-400">Cart value</span>
                  <div className="font-bold text-slate-950">{lead.cartValue}</div>
                </div>
                <div>
                  <span className="text-slate-400">Voucher</span>
                  <div className="font-bold text-slate-950">{lead.voucher}</div>
                </div>
                <div>
                  <span className="text-slate-400">Status</span>
                  <div className="font-bold text-slate-950">{lead.whatsappStatus || 'Awaiting staff update'}</div>
                </div>
              </div>
            </button>
            <div className="mt-3 border-t border-slate-100 pt-3">
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">Record manual outcome</div>
              <div className="flex flex-wrap gap-1.5">
                {OUTCOMES.map((outcome) => (
                  <Button key={outcome} size="sm" variant="outline" onClick={() => void recordOutcome(lead, outcome)}>
                    {outcome}
                  </Button>
                ))}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
