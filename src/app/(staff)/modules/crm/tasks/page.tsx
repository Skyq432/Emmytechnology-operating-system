'use client';

import { useCrmData } from '@/components/crm/crm-data-context';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { CrmTask, Lead } from '@/lib/crm/types';

type TaskWithLead = CrmTask & { lead: Lead };

const PRIORITY_BADGE: Record<string, string> = {
  high: 'bg-red-50 text-red-700',
  medium: 'bg-amber-50 text-amber-700',
  normal: 'bg-slate-100 text-slate-600',
};

export default function CrmTasksPage() {
  const { leads, loading, dbError, openLead, recordTaskOutcome } = useCrmData();

  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading CRM identities…</div>;
  if (dbError) return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm font-semibold text-rose-700">Database connection error: {dbError}</div>;

  const tasks: TaskWithLead[] = leads.flatMap((lead) => (lead.tasks ?? []).map((task) => ({ ...task, lead })));
  const isOpen = (task: TaskWithLead) => task.status.toLowerCase() === 'open';
  const sortByDue = (a: TaskWithLead, b: TaskWithLead) => {
    const aTime = a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
    const bTime = b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
    return aTime - bTime;
  };

  const openTasks = tasks.filter(isOpen).sort(sortByDue);
  const closedTasks = tasks
    .filter((task) => !isOpen(task))
    .sort((a, b) => sortByDue(b, a))
    .slice(0, 10);

  function renderTask(task: TaskWithLead, openTask: boolean) {
    return (
      <Card key={task.id} className={cn('p-4', !openTask && 'opacity-70')}>
        <button type="button" className="flex w-full items-start gap-3 text-left" onClick={() => openLead(task.lead)}>
          <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', openTask ? 'bg-amber-500' : 'bg-emerald-500')} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <strong className="text-sm text-slate-950">{task.title}</strong>
              <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold', PRIORITY_BADGE[task.priority.toLowerCase()] ?? PRIORITY_BADGE.normal)}>{task.priority}</span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
              <span>{task.lead.name}</span>
              <span>·</span>
              <span>{task.due}</span>
              {task.expires && (
                <>
                  <span>·</span>
                  <span className="text-amber-600">{task.expires}</span>
                </>
              )}
              <span>·</span>
              <span>{task.owner}</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">{task.description || 'Take the required follow-up action and record the outcome.'}</p>
          </div>
        </button>

        {openTask ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void recordTaskOutcome(task.lead, task, 'Contacted')}>
              Contacted
            </Button>
            <Button size="sm" variant="outline" onClick={() => void recordTaskOutcome(task.lead, task, 'No response')}>
              No response
            </Button>
            <Button size="sm" onClick={() => void recordTaskOutcome(task.lead, task, 'Completed')}>
              Complete
            </Button>
          </div>
        ) : (
          <div className="mt-2 text-xs font-bold text-slate-500">{task.outcome || task.status}</div>
        )}
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wide text-emmy-primary">{openTasks.length} open</div>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-950">Tasks & Follow-ups</h1>
        <p className="mt-1 max-w-[64ch] text-sm text-slate-500">Only actionable follow-ups appear here. The CRM waits for the right contact window and avoids back-to-back chasing.</p>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-extrabold text-slate-950">Needs action</h2>
            <p className="text-xs text-slate-500">Due follow-ups, ordered by urgency.</p>
          </div>
          <span className="font-[family-name:var(--font-mono)] text-sm font-extrabold text-slate-950">{openTasks.length}</span>
        </div>
        <div className="flex flex-col gap-2">
          {openTasks.length ? (
            openTasks.map((task) => renderTask(task, true))
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">No follow-up is due right now.</div>
          )}
        </div>
      </div>

      {closedTasks.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-extrabold text-slate-950">Recently closed</h2>
              <p className="text-xs text-slate-500">Completed, cancelled or expired follow-ups.</p>
            </div>
            <span className="font-[family-name:var(--font-mono)] text-sm font-extrabold text-slate-950">{closedTasks.length}</span>
          </div>
          <div className="flex flex-col gap-2">{closedTasks.map((task) => renderTask(task, false))}</div>
        </div>
      )}
    </div>
  );
}
