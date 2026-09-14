'use client';

import { type FormEvent, useState } from 'react';
import {
  cancelTaskAssignmentAction,
  reassignReturnedTaskAction,
} from '@/app/(staff)/modules/activities/actions';
import type { getMyTasks, listAssignableStaff } from '@/lib/work/server';
import type { WorkPriority } from '@/lib/work/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

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
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => setMode(mode === 'reassign' ? null : 'reassign')}>
          Reassign returned Task
        </Button>
        <Button size="sm" variant="danger" disabled={busy} onClick={() => setMode(mode === 'cancel' ? null : 'cancel')}>
          Cancel assignment
        </Button>
      </div>

      {mode === 'reassign' && (
        <form className="mt-3 rounded-xl border border-slate-200 p-4" onSubmit={submitReassign}>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold text-slate-600">New assignee</span>
              <Select name="assignee" defaultValue="" required>
                <option value="">Choose staff…</option>
                {staff.map((person) => (
                  <option key={person.id} value={person.id}>{person.name || person.email}</option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold text-slate-600">Priority</span>
              <Select name="priority" defaultValue="normal">
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </Select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold text-slate-600">New start</span>
              <Input name="start" type="datetime-local" required />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold text-slate-600">New deadline</span>
              <Input name="due" type="datetime-local" required />
            </label>
            <label className="flex flex-col gap-1 md:col-span-2">
              <span className="text-xs font-bold text-slate-600">Reassignment note</span>
              <Textarea name="note" placeholder="Optional context for the new assignee" />
            </label>
          </div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" disabled={busy}>Reassign</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setMode(null)}>Close</Button>
          </div>
        </form>
      )}

      {mode === 'cancel' && (
        <form className="mt-3 rounded-xl border border-slate-200 p-4" onSubmit={submitCancel}>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-slate-600">Cancellation reason</span>
            <Textarea name="reason" required />
          </label>
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="danger" disabled={busy}>Cancel assignment</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setMode(null)}>Keep Task</Button>
          </div>
        </form>
      )}
    </div>
  );
}
