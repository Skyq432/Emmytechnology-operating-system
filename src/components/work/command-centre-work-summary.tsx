import Link from 'next/link';
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, Inbox, ListChecks } from 'lucide-react';
import { StatGrid, StatTile } from '@/components/ui/stat-tile';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { getMyWorkDashboard } from '@/lib/work/server';

type Summary = Awaited<ReturnType<typeof getMyWorkDashboard>>;

export default function CommandCentreWorkSummary({ summary }: { summary: Summary }) {
  const attention = summary.pendingAcceptanceCount + summary.extensionDecisionCount + summary.overdueCount;
  const clear = attention === 0 && summary.dueTodayCount === 0;

  return (
    <div
      className={cn(
        'rounded-2xl border p-5 shadow-[var(--shadow-card)]',
        clear ? 'border-emerald-100 bg-gradient-to-br from-emerald-50 to-white' : 'border-amber-100 bg-gradient-to-br from-amber-50 to-white'
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-emmy-primary">
            <span className={cn('h-1.5 w-1.5 rounded-full', clear ? 'bg-emerald-500' : 'bg-amber-500')} />
            Today
          </div>
          <h2 className="mt-1 text-lg font-extrabold tracking-tight text-slate-950">{clear ? 'You’re clear for now.' : 'Your work needs attention.'}</h2>
          <p className="mt-0.5 max-w-[48ch] text-sm text-slate-500">
            {clear
              ? summary.nextTask
                ? `Your next accepted Task is due ${new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(summary.nextTask.assignment.agreed_due_at ?? summary.nextTask.assignment.requested_due_at))}.`
                : 'No accepted Task is currently waiting on you.'
              : 'Respond to new Tasks first, then handle accepted work by deadline.'}
          </p>
        </div>
        <Link href="/modules/activities" className={cn(buttonVariants({ size: 'sm' }), 'shrink-0')}>
          Open My Work <ArrowRight className="ml-1.5 h-4 w-4" />
        </Link>
      </div>

      <StatGrid className="mt-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile label="Active Tasks" value={summary.activeCount} icon={<ListChecks className="h-[15px] w-[15px]" />} tone="purple" description="In progress, any due date" />
        <StatTile label="Need response" value={summary.pendingAcceptanceCount} icon={<Inbox className="h-[15px] w-[15px]" />} tone="primary" />
        <StatTile label="Due today" value={summary.dueTodayCount} icon={<Clock3 className="h-[15px] w-[15px]" />} tone="secondary" />
        <StatTile label="Overdue" value={summary.overdueCount} icon={<AlertTriangle className="h-[15px] w-[15px]" />} tone="danger" />
        <StatTile label="Private Todos" value={summary.openTodoCount} icon={<CheckCircle2 className="h-[15px] w-[15px]" />} tone="success" />
      </StatGrid>

      {summary.extensionDecisionCount > 0 && (
        <Link
          href="/modules/activities"
          className="mt-4 flex items-center gap-2 rounded-xl bg-amber-100/70 px-3.5 py-2.5 text-sm font-bold text-amber-800 hover:bg-amber-100"
        >
          <strong>{summary.extensionDecisionCount}</strong> deadline extension request{summary.extensionDecisionCount === 1 ? '' : 's'} waiting for your
          decision.
          <ArrowRight className="ml-auto h-4 w-4 shrink-0" />
        </Link>
      )}
    </div>
  );
}
