'use client';

import { type FormEvent, useState } from 'react';
import {
  cancelTaskAssignmentAction,
  reassignReturnedTaskAction,
} from '@/app/modules/activities/actions';
import type { getMyTasks, listAssignableStaff } from '@/lib/work/server';
import type { WorkPriority } from '@/lib/work/types';
import styles from './my-work-workspace.module.css';

type Tasks = Awaited<ReturnType<typeof getMyTasks>>;
type Staff = Awaited<ReturnType<typeof listAssignableStaff>>;

export default function ReturnedTaskControls({
  assignment,
  staff,
  busy,
  run,
}: {
  assignment: Tasks['assignments'][number];
  staff: Staff;
  busy: boolean;
  run: (action: () => Promise<unknown>, success: string) => void;
}) {
  const [mode, setMode] = useState<'reassign' | 'cancel' | null>(null);

  function submitReassign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const start = String(data.get('start') ?? '');
    const due = String(data.get('due') ?? '');
    const assignee = String(data.get('assignee') ?? '');
    const priority = String(data.get('priority') ?? 'normal') as WorkPriority;
    const note = String(data.get('note') ?? '');
    if (!start || !due || !assignee) return;

    run(
      () => reassignReturnedTaskAction({
        assignmentId: assignment.id,
        newAssigneeId: assignee,
        requestedStartAt: new Date(start).toISOString(),
        requestedDueAt: new Date(due).toISOString(),
        priority,
        note,
      }),
      'Returned Task reassigned.',
    );
    setMode(null);
  }

  function submitCancel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const reason = String(data.get('reason') ?? '');
    run(() => cancelTaskAssignmentAction(assignment.id, reason), 'Task assignment cancelled.');
    setMode(null);
  }

  return (
    <div>
      <div className={styles.actions}>
        <button className={styles.secondary} disabled={busy} onClick={() => setMode(mode === 'reassign' ? null : 'reassign')}>
          Reassign returned Task
        </button>
        <button className={styles.dangerButton} disabled={busy} onClick={() => setMode(mode === 'cancel' ? null : 'cancel')}>
          Cancel assignment
        </button>
      </div>

      {mode === 'reassign' && (
        <form className={styles.modalForm} onSubmit={submitReassign}>
          <div className={styles.formGrid}>
            <label>
              <span className={styles.label}>New assignee</span>
              <select className={styles.select} name="assignee" defaultValue="" required>
                <option value="">Choose staff…</option>
                {staff.map((person) => (
                  <option key={person.id} value={person.id}>{person.name || person.email}</option>
                ))}
              </select>
            </label>
            <label>
              <span className={styles.label}>Priority</span>
              <select className={styles.select} name="priority" defaultValue="normal">
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
            <label>
              <span className={styles.label}>New start</span>
              <input className={styles.input} name="start" type="datetime-local" required />
            </label>
            <label>
              <span className={styles.label}>New deadline</span>
              <input className={styles.input} name="due" type="datetime-local" required />
            </label>
            <label className={styles.full}>
              <span className={styles.label}>Reassignment note</span>
              <textarea className={styles.textarea} name="note" placeholder="Optional context for the new assignee" />
            </label>
          </div>
          <div className={styles.actions}>
            <button className={styles.primary} disabled={busy}>Reassign</button>
            <button type="button" className={styles.ghost} onClick={() => setMode(null)}>Close</button>
          </div>
        </form>
      )}

      {mode === 'cancel' && (
        <form className={styles.modalForm} onSubmit={submitCancel}>
          <label>
            <span className={styles.label}>Cancellation reason</span>
            <textarea className={styles.textarea} name="reason" required />
          </label>
          <div className={styles.actions}>
            <button className={styles.dangerButton} disabled={busy}>Cancel assignment</button>
            <button type="button" className={styles.ghost} onClick={() => setMode(null)}>Keep Task</button>
          </div>
        </form>
      )}
    </div>
  );
}
