'use client';

import * as React from 'react';
import { CheckCircle2, MessageCircle, Sparkles, Users, Zap } from 'lucide-react';
import { useCrmData } from '@/components/crm/crm-data-context';
import { TrackingBadge } from '@/components/crm/tracking-badge';
import { Card } from '@/components/ui/card';
import { StatTile, StatGrid } from '@/components/ui/stat-tile';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { CRM_STAGES } from '@/lib/crm/domain';
import { cn } from '@/lib/utils';

type FunnelRange = '1-5' | '6-10' | 'all';

const TRACKING_BORDER: Record<string, string> = {
  Automatic: 'border-l-emerald-500',
  Manual: 'border-l-emmy-primary',
  Recommended: 'border-l-amber-500',
};

export default function CrmDashboardPage() {
  const { leads, loading, dbError, openLead } = useCrmData();
  const [range, setRange] = React.useState<FunnelRange>('1-5');

  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading CRM identities…</div>;
  if (dbError) return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm font-semibold text-rose-700">Database connection error: {dbError}</div>;

  const attention = leads.filter((lead) => lead.followupState === 'due');
  const handoffs = leads.filter((lead) => lead.stage === 5);
  const customers = leads.filter((lead) => lead.stage >= 6).length;

  const stageCounts = CRM_STAGES.map((stage) => ({ ...stage, count: leads.filter((lead) => lead.stage === stage.id).length }));
  const maxCount = Math.max(1, ...stageCounts.map((stage) => stage.count));
  const visibleStages = stageCounts.filter((stage) => (range === '1-5' ? stage.id <= 5 : range === '6-10' ? stage.id > 5 : true));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-emmy-primary">CRM Command Centre</div>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-950">Where is everyone in the journey?</h1>
          <p className="mt-1 max-w-[52ch] text-sm text-slate-500">See where every prospect is, what happened last, and the next action most likely to move them forward.</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emmy-primary px-3 py-1.5 text-xs font-extrabold text-white">
          <Zap className="h-3.5 w-3.5" /> Hybrid tracking
        </span>
      </div>

      <StatGrid>
        <StatTile label="Total people" value={leads.length} icon={<Users className="h-4 w-4" />} tone="primary" description="Across all CRM stages" />
        <StatTile label="Need attention" value={attention.length} icon={<Zap className="h-4 w-4" />} tone="secondary" description="Actions due now" />
        <StatTile label="WhatsApp handoffs" value={handoffs.length} icon={<MessageCircle className="h-4 w-4" />} tone="success" description="Outcome requires manual update" />
        <StatTile label="Customers" value={customers} icon={<CheckCircle2 className="h-4 w-4" />} tone="purple" description="Paid / onboarding and beyond" />
      </StatGrid>

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-extrabold text-slate-950">Customer journey</h2>
            <p className="text-sm text-slate-500">Tracked from first spin through advocacy — 10 stages, narrowing as fewer people carry forward.</p>
          </div>
          <div className="flex items-center gap-1.5">
            <TrackingBadge type="Automatic" />
            <TrackingBadge type="Manual" />
            <TrackingBadge type="Recommended" />
          </div>
        </div>

        <div className="mt-4">
          <SegmentedControl
            value={range}
            onChange={setRange}
            size="sm"
            options={[
              { value: '1-5', label: 'Stages 1–5' },
              { value: '6-10', label: 'Stages 6–10' },
              { value: 'all', label: 'View all 10' },
            ]}
          />
        </div>

        <div className="mt-4 flex flex-col items-center gap-1.5">
          {visibleStages.map((stage) => {
            // Real stage counts drop off by orders of magnitude (thousands of spins vs. a
            // handful of advocates) — a linear or even square-root scale still flattens
            // everything past stage 1 onto the same floor width. A log scale compresses
            // that multiplicative gap into something that actually tapers on screen.
            const FLOOR = 25;
            const norm = Math.log(stage.count + 1) / Math.log(maxCount + 1);
            const widthPct = Math.max(FLOOR, Math.round(FLOOR + (100 - FLOOR) * norm));
            return (
              <div
                key={stage.id}
                style={{ width: `${widthPct}%` }}
                className={cn(
                  'flex w-full items-center justify-between gap-3 rounded-lg border border-l-4 bg-surface-muted px-4 py-2.5 transition-[width] duration-200',
                  TRACKING_BORDER[stage.tracking]
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-slate-200 bg-white text-[10.5px] font-extrabold text-slate-500">{stage.id}</div>
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-bold text-slate-950">{stage.name}</div>
                    <div className="truncate text-[11px] text-slate-500">{stage.short}</div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <b className="font-[family-name:var(--font-mono)] text-[15px] font-extrabold text-slate-950">{stage.count}</b>
                  <TrackingBadge type={stage.tracking} />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-base font-extrabold text-slate-950">Needs attention</h2>
          <p className="text-sm text-slate-500">The system should tell staff what to do next.</p>
          <div className="mt-3 flex flex-col">
            {attention.length ? (
              attention.map((lead) => (
                <button
                  type="button"
                  key={lead.id}
                  onClick={() => openLead(lead)}
                  className="flex items-center gap-3 border-b border-slate-100 py-3 text-left last:border-b-0 hover:bg-surface-muted/60"
                >
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-slate-950">{lead.name}</div>
                    <div className="truncate text-xs text-slate-500">
                      {lead.stageName} · {lead.product}
                    </div>
                    <p className="truncate text-xs text-slate-400">
                      {lead.coldLead ? lead.coldReason || 'Cold lead — recovery needed' : lead.atRisk ? `At risk · ${lead.stageAge || ''} in stage` : lead.nextAction}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <TrackingBadge type={lead.tracking} />
                    <span className="text-xs text-slate-400">{lead.age}</span>
                  </div>
                </button>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">Nothing needs attention right now.</div>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-base font-extrabold text-slate-950">Tracking boundaries</h2>
          <p className="text-sm text-slate-500">What the OS knows vs. what staff must confirm.</p>
          <div className="mt-3 flex flex-col gap-3">
            <div className="flex gap-3">
              <div className={cn('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500')} />
              <div>
                <strong className="text-sm text-slate-950">Automatic</strong>
                <p className="text-xs text-slate-500">Spin, voucher claim, product browse, add to cart and WhatsApp button click.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-emmy-primary" />
              <div>
                <strong className="text-sm text-slate-950">Manual</strong>
                <p className="text-xs text-slate-500">WhatsApp outcome, payment confirmation, delivery, feedback and post-sale relationship.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500" />
              <div>
                <strong className="text-sm text-slate-950">Recommended</strong>
                <p className="text-xs text-slate-500">Next-best-action, cross-sell timing and win-back prompts generated from known behavior.</p>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
