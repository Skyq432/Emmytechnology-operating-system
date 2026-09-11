'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { getTaskDetail, listAssignableStaff } from '@/lib/work/server';
import ReturnedTaskControls from '@/components/work/returned-task-controls';
import styles from './task-detail.module.css';

type Detail = Awaited<ReturnType<typeof getTaskDetail>>;
type Staff = Awaited<ReturnType<typeof listAssignableStaff>>;

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function label(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const eventLabels: Record<string, string> = {
  task_created: 'Task created',
  task_assigned: 'Task assigned',
  task_accepted: 'Task accepted',
  task_rejected: 'Task rejected',
  task_returned: 'Task returned',
  extension_requested: 'Extension requested',
  extension_approved: 'Extension approved',
  extension_declined: 'Extension declined',
  task_completed: 'Task completed',
  task_reassigned: 'Task reassigned',
  task_cancelled: 'Task cancelled',
};

export default function TaskDetail({
  detail,
  staff,
  currentUserId,
  isAdmin,
}: {
  detail: Detail;
  staff: Staff;
  currentUserId: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const people = new Map(detail.people.map((person) => [person.id, person]));
  const canManageReturned = detail.task.created_by === currentUserId || isAdmin;

  function run(action: () => Promise<unknown>, success: string) {
    setMessage(null);
    startTransition(async () => {
      try {
        await action();
        setMessage(success);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Unable to update Task.');
      }
    });
  }

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div>
          <span className={styles.eyebrow}>My Work</span>
          <h1>{detail.task.title}</h1>
        </div>
        <Link className={styles.back} href="/modules/activities">← Back to My Work</Link>
      </header>

      <main className={styles.content}>
        {message && <div className={styles.message}>{message}</div>}
        <section className={styles.summary}>
          <div><span>Status</span><strong>{label(detail.task.status)}</strong></div>
          <div><span>Priority</span><strong>{label(detail.task.priority)}</strong></div>
          <div><span>Created</span><strong>{formatDate(detail.task.created_at)}</strong></div>
          <div><span>Created by</span><strong>{people.get(detail.task.created_by)?.name || people.get(detail.task.created_by)?.email || 'EmmyTech staff'}</strong></div>
        </section>

        {detail.task.description && <section className={styles.card}><h2>Instructions</h2><p>{detail.task.description}</p></section>}

        <section className={styles.card}>
          <h2>Assignments</h2>
          <div className={styles.stack}>
            {detail.assignments.map((assignment) => {
              const assignee = people.get(assignment.assignee_id);
              return (
                <div className={styles.assignment} key={assignment.id}>
                  <div className={styles.assignmentTop}>
                    <div><strong>{assignee?.name || assignee?.email || 'Staff member'}</strong><span>{label(assignment.status)}</span></div>
                    <div className={styles.dates}><span>Start: {formatDate(assignment.agreed_start_at ?? assignment.requested_start_at)}</span><span>Due: {formatDate(assignment.agreed_due_at ?? assignment.requested_due_at)}</span></div>
                  </div>
                  {assignment.rejection_note && <p><strong>Return reason:</strong> {assignment.rejection_note}</p>}
                  {assignment.completion_note && <p><strong>Completion note:</strong> {assignment.completion_note}</p>}
                  {assignment.status === 'returned' && canManageReturned && <ReturnedTaskControls assignment={assignment} staff={staff} busy={busy} run={run} />}
                </div>
              );
            })}
          </div>
        </section>

        <section className={styles.card}>
          <h2>Task history</h2>
          <p className={styles.help}>This timeline is append-only. Past acceptance, rejection, extension and completion events are never rewritten.</p>
          <div className={styles.timeline}>
            {detail.events.map((event) => {
              const actor = people.get(String(event.actor_id));
              return (
                <div className={styles.event} key={String(event.id)}>
                  <span className={styles.dot} />
                  <div>
                    <strong>{eventLabels[String(event.event_type)] ?? label(String(event.event_type))}</strong>
                    <span>{actor?.name || actor?.email || 'EmmyTech staff'} · {formatDate(String(event.created_at))}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
