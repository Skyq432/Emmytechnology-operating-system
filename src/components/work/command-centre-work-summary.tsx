import Link from 'next/link';
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, Inbox } from 'lucide-react';
import type { getMyWorkDashboard } from '@/lib/work/server';
import styles from './command-centre-work-summary.module.css';

type Summary = Awaited<ReturnType<typeof getMyWorkDashboard>>;

export default function CommandCentreWorkSummary({ summary }: { summary: Summary }) {
  const attention = summary.pendingAcceptanceCount + summary.extensionDecisionCount + summary.overdueCount;
  const clear = attention === 0 && summary.dueTodayCount === 0;

  return (
    <section className={styles.wrap}>
      <div className={styles.heading}>
        <div>
          <div className={styles.eyebrow}>Today</div>
          <h2>{clear ? 'You’re clear for now.' : 'Your work needs attention.'}</h2>
          <p>
            {clear
              ? summary.nextTask
                ? `Your next accepted Task is due ${new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(summary.nextTask.assignment.agreed_due_at ?? summary.nextTask.assignment.requested_due_at))}.`
                : 'No accepted Task is currently waiting on you.'
              : 'Respond to new Tasks first, then handle accepted work by deadline.'}
          </p>
        </div>
        <Link href="/modules/activities" className={styles.openButton}>Open My Work <ArrowRight size={16} /></Link>
      </div>

      <div className={styles.metrics}>
        <div className={styles.metric}><Inbox size={18} /><div><strong>{summary.pendingAcceptanceCount}</strong><span>Need response</span></div></div>
        <div className={styles.metric}><Clock3 size={18} /><div><strong>{summary.dueTodayCount}</strong><span>Due today</span></div></div>
        <div className={`${styles.metric} ${summary.overdueCount ? styles.danger : ''}`}><AlertTriangle size={18} /><div><strong>{summary.overdueCount}</strong><span>Overdue</span></div></div>
        <div className={styles.metric}><CheckCircle2 size={18} /><div><strong>{summary.todayTodoCount}</strong><span>Private Todos</span></div></div>
      </div>

      {summary.extensionDecisionCount > 0 && (
        <Link href="/modules/activities" className={styles.extension}>
          <strong>{summary.extensionDecisionCount}</strong> deadline extension request{summary.extensionDecisionCount === 1 ? '' : 's'} waiting for your decision.
          <ArrowRight size={15} />
        </Link>
      )}
    </section>
  );
}
