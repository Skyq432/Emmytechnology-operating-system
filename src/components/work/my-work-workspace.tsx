'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useMemo, useState, useTransition } from 'react';
import {
  acceptTaskAction,
  completeTaskAction,
  completeTodoAction,
  createBroadcastTaskAction,
  createGoalAction,
  createTaskAction,
  createTodoAction,
  deleteTodoAction,
  decideExtensionAction,
  rejectTaskAction,
  requestExtensionAction,
  updateNumericGoalProgressAction,
} from '@/app/modules/activities/actions';
import type {
  getMyGoals,
  getMyTasks,
  getMyTodos,
  getMyWorkDashboard,
  getTeamWorkSummary,
  listAssignableStaff,
} from '@/lib/work/server';
import type { InternalRole } from '@/lib/auth/roles';
import type { GoalProgressMode, GoalVisibility, RejectionReasonCode, WorkPriority } from '@/lib/work/types';
import styles from './my-work-workspace.module.css';

type Summary = Awaited<ReturnType<typeof getMyWorkDashboard>>;
type Todos = Awaited<ReturnType<typeof getMyTodos>>;
type Tasks = Awaited<ReturnType<typeof getMyTasks>>;
type GoalsRaw = Awaited<ReturnType<typeof getMyGoals>>;
type Staff = Awaited<ReturnType<typeof listAssignableStaff>>;
type Team = Awaited<ReturnType<typeof getTeamWorkSummary>>;
type GoalProgress = Record<string, unknown> | null;

type Props = {
  currentUser: { id: string; name: string; role: InternalRole };
  summary: Summary;
  todos: Todos;
  tasks: Tasks;
  goals: {
    goals: GoalsRaw['goals'];
    contributors: GoalsRaw['contributors'];
    progress: Record<string, unknown>;
  };
  staff: Staff;
  team: Team | null;
};

type Tab = 'Today' | 'Tasks' | 'Todo' | 'Goals' | 'Team';
type TaskActionEditor =
  | { type: 'extension'; assignmentId: string }
  | { type: 'reject'; assignmentId: string }
  | { type: 'complete'; assignmentId: string }
  | null;

const rejectionReasons: Array<{ value: RejectionReasonCode; label: string }> = [
  { value: 'outside_authority', label: 'Outside my authority' },
  { value: 'wrong_assignee', label: 'Wrong assignee' },
  { value: 'insufficient_information', label: 'Insufficient information' },
  { value: 'workload_unavailable', label: 'Workload / unavailable' },
  { value: 'outside_skill', label: 'Outside my skill' },
  { value: 'other', label: 'Other' },
];

function formatDate(value: string | null | undefined) {
  if (!value) return 'No date';
  return new Intl.DateTimeFormat('en-NG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function statusLabel(status: string) {
  return status.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusBadge(status: string) {
  if (status === 'active' || status === 'completed') return `${styles.badge} ${styles.badgeActive}`;
  if (status === 'returned') return `${styles.badge} ${styles.badgeReturned}`;
  return `${styles.badge} ${styles.badgePending}`;
}

function priorityBadge(priority: string) {
  if (priority === 'urgent') return `${styles.badge} ${styles.badgeUrgent}`;
  if (priority === 'high') return `${styles.badge} ${styles.badgeHigh}`;
  return styles.badge;
}

function progressPercent(progress: GoalProgress) {
  if (!progress) return 0;
  const value = Number(progress.percent_complete ?? 0);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}

export default function MyWorkWorkspace({ currentUser, summary, todos, tasks, goals, staff, team }: Props) {
  const router = useRouter();
  const isAdmin = currentUser.role === 'admin' || currentUser.role === 'super_admin';
  const tabs: Tab[] = isAdmin ? ['Today', 'Tasks', 'Todo', 'Goals', 'Team'] : ['Today', 'Tasks', 'Todo', 'Goals'];
  const [tab, setTab] = useState<Tab>('Today');
  const [busy, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [goalFormOpen, setGoalFormOpen] = useState(false);
  const [taskActionEditor, setTaskActionEditor] = useState<TaskActionEditor>(null);
  const [delegatedTodo, setDelegatedTodo] = useState<{ id: string; title: string } | null>(null);

  const taskMap = useMemo(() => new Map(tasks.tasks.map((task) => [task.id, task])), [tasks.tasks]);
  const staffMap = useMemo(() => new Map(staff.map((person) => [person.id, person])), [staff]);
  const myAssignments = tasks.assignments.filter((assignment) => assignment.assignee_id === currentUser.id);
  const assignedByMe = tasks.assignments.filter((assignment) => {
    const task = taskMap.get(assignment.task_id);
    return assignment.assigned_by === currentUser.id || task?.created_by === currentUser.id;
  });
  const openTodos = todos.filter((todo) => todo.status === 'open');

  function run(action: () => Promise<unknown>, success: string) {
    setMessage(null);
    startTransition(async () => {
      try {
        await action();
        setMessage({ kind: 'success', text: success });
        setTaskActionEditor(null);
        router.refresh();
      } catch (error) {
        setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Something went wrong.' });
      }
    });
  }

  async function submitTodo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get('title') ?? '');
    const priority = String(form.get('priority') ?? 'normal') as WorkPriority;
    const scheduled = String(form.get('scheduled') ?? '');
    run(
      () => createTodoAction({ title, priority, scheduledFor: scheduled ? new Date(scheduled).toISOString() : null }),
      'Todo added.',
    );
    event.currentTarget.reset();
  }

  async function submitTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get('title') ?? '');
    const description = String(form.get('description') ?? '');
    const assigneeId = String(form.get('assignee') ?? '');
    const start = String(form.get('start') ?? '');
    const due = String(form.get('due') ?? '');
    const priority = String(form.get('priority') ?? 'normal') as WorkPriority;
    const goalId = String(form.get('goal') ?? '') || null;
    const broadcast = form.get('broadcast') === 'on';

    if (!start || !due) {
      setMessage({ kind: 'error', text: 'Task start and deadline are required.' });
      return;
    }

    const base = {
      title,
      description,
      requestedStartAt: new Date(start).toISOString(),
      requestedDueAt: new Date(due).toISOString(),
      priority,
      goalId,
    };

    if (broadcast && isAdmin) {
      run(() => createBroadcastTaskAction(base), 'Task sent to everyone.');
    } else {
      if (!assigneeId) {
        setMessage({ kind: 'error', text: 'Choose a staff member.' });
        return;
      }
      run(
        () => createTaskAction({ ...base, assigneeId, sourceTodoId: delegatedTodo?.id ?? null }),
        `Task sent to ${staffMap.get(assigneeId)?.name ?? 'staff member'}.`,
      );
    }
    setTaskFormOpen(false);
    setDelegatedTodo(null);
  }

  async function submitGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const progressMode = String(form.get('progressMode') ?? 'tasks') as GoalProgressMode;
    const visibility = String(form.get('visibility') ?? 'personal') as GoalVisibility;
    const target = String(form.get('targetValue') ?? '');
    run(
      () => createGoalAction({
        title: String(form.get('title') ?? ''),
        description: String(form.get('description') ?? ''),
        visibility,
        progressMode,
        startAt: String(form.get('start') ?? '') ? new Date(String(form.get('start'))).toISOString() : null,
        targetAt: String(form.get('targetAt') ?? '') ? new Date(String(form.get('targetAt'))).toISOString() : null,
        targetValue: progressMode === 'numeric' && target ? Number(target) : null,
        unit: String(form.get('unit') ?? '') || null,
      }),
      'Goal created.',
    );
    setGoalFormOpen(false);
  }

  function beginDelegate(todo: Todos[number]) {
    setDelegatedTodo({ id: todo.id, title: todo.title });
    setTaskFormOpen(true);
    setTab('Tasks');
  }

  const attentionCount = summary.pendingAcceptanceCount + summary.extensionDecisionCount + summary.overdueCount;

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <div className={styles.brandMark}>ET</div>
          <div className={styles.brandText}>
            <strong>My Work</strong>
            <span>EmmyTech OS · {currentUser.name}</span>
          </div>
        </div>
        <Link className={styles.back} href="/">← Command Centre</Link>
      </header>

      <main className={styles.workspace}>
        <section className={styles.hero}>
          <div className={styles.heroMain}>
            <div className={styles.eyebrow}>Your workday</div>
            <h1>Know what needs your attention.</h1>
            <p>Plan private Todos, respond to delegated Tasks, and keep Goals moving without losing accountability.</p>
          </div>
          <div className={styles.attentionCard}>
            <strong className={styles.attentionNumber}>{attentionCount}</strong>
            <span>{attentionCount === 0 ? 'No urgent work needs a response.' : 'items need your attention now.'}</span>
          </div>
        </section>

        {message && <div className={message.kind === 'error' ? styles.error : styles.success}>{message.text}</div>}

        <nav className={styles.tabs} aria-label="My Work sections">
          {tabs.map((item) => (
            <button key={item} className={`${styles.tab} ${tab === item ? styles.tabActive : ''}`} onClick={() => setTab(item)}>
              {item}
            </button>
          ))}
        </nav>

        {tab === 'Today' && (
          <>
            <section className={styles.stats}>
              <div className={styles.stat}><span>Needs response</span><strong className={styles.warning}>{summary.pendingAcceptanceCount}</strong></div>
              <div className={styles.stat}><span>Due today</span><strong>{summary.dueTodayCount}</strong></div>
              <div className={styles.stat}><span>Overdue</span><strong className={styles.danger}>{summary.overdueCount}</strong></div>
              <div className={styles.stat}><span>My Todos today</span><strong className={styles.good}>{summary.todayTodoCount}</strong></div>
            </section>

            <div className={styles.grid}>
              <section className={styles.panel}>
                <div className={styles.panelHeader}>
                  <div><h2>Needs your response</h2><p>Tasks are not your responsibility until you accept them.</p></div>
                </div>
                <div className={styles.list}>
                  {myAssignments.filter((assignment) => assignment.status === 'pending_acceptance' || assignment.status === 'extension_pending').slice(0, 5).map((assignment) => (
                    <TaskCard
                      key={assignment.id}
                      assignment={assignment}
                      task={taskMap.get(assignment.task_id)}
                      currentUserId={currentUser.id}
                      staffMap={staffMap}
                      extensions={tasks.extensions}
                      busy={busy}
                      actionEditor={taskActionEditor}
                      setActionEditor={setTaskActionEditor}
                      run={run}
                    />
                  ))}
                  {!myAssignments.some((assignment) => assignment.status === 'pending_acceptance' || assignment.status === 'extension_pending') && <div className={styles.empty}>Nothing is waiting for your response.</div>}
                </div>
              </section>

              <section className={styles.panel}>
                <div className={styles.panelHeader}>
                  <div><h2>Private Todo</h2><p>Only you can see these items.</p></div>
                </div>
                <form className={styles.quickForm} onSubmit={submitTodo}>
                  <input className={styles.input} name="title" placeholder="What do you need to do?" required />
                  <select className={styles.select} name="priority" defaultValue="normal"><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option><option value="low">Low</option></select>
                  <button className={styles.primary} disabled={busy}>Add Todo</button>
                  <input className={`${styles.input} ${styles.full}`} name="scheduled" type="datetime-local" aria-label="Todo schedule" />
                </form>
                <div className={styles.list}>
                  {openTodos.slice(0, 5).map((todo) => <TodoCard key={todo.id} todo={todo} busy={busy} run={run} onDelegate={() => beginDelegate(todo)} />)}
                  {openTodos.length === 0 && <div className={styles.empty}>Your private Todo list is clear.</div>}
                </div>
              </section>
            </div>
          </>
        )}

        {tab === 'Todo' && (
          <section className={styles.panel}>
            <div className={styles.panelHeader}><div><h2>My private Todo</h2><p>A personal scratchpad. Admin cannot browse this list.</p></div></div>
            <form className={styles.quickForm} onSubmit={submitTodo}>
              <input className={styles.input} name="title" placeholder="Add a Todo..." required />
              <select className={styles.select} name="priority" defaultValue="normal"><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option><option value="low">Low</option></select>
              <button className={styles.primary} disabled={busy}>Add Todo</button>
              <input className={`${styles.input} ${styles.full}`} name="scheduled" type="datetime-local" />
            </form>
            <div className={styles.list}>
              {todos.map((todo) => <TodoCard key={todo.id} todo={todo} busy={busy} run={run} onDelegate={() => beginDelegate(todo)} />)}
            </div>
          </section>
        )}

        {tab === 'Tasks' && (
          <div className={styles.twoCol}>
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div><h2>Tasks assigned to me</h2><p>Accept, negotiate, reject, or complete shared work.</p></div>
                <button className={styles.primary} onClick={() => setTaskFormOpen((open) => !open)}>New Task</button>
              </div>
              {taskFormOpen && <TaskForm staff={staff} goals={goals.goals} isAdmin={isAdmin} delegatedTodo={delegatedTodo} busy={busy} onSubmit={submitTask} onCancel={() => { setTaskFormOpen(false); setDelegatedTodo(null); }} />}
              <div className={styles.list}>
                {myAssignments.map((assignment) => (
                  <TaskCard key={assignment.id} assignment={assignment} task={taskMap.get(assignment.task_id)} currentUserId={currentUser.id} staffMap={staffMap} extensions={tasks.extensions} busy={busy} actionEditor={taskActionEditor} setActionEditor={setTaskActionEditor} run={run} />
                ))}
                {myAssignments.length === 0 && <div className={styles.empty}>No Tasks have been assigned to you yet.</div>}
              </div>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHeader}><div><h2>Delegated by me</h2><p>See who accepted, returned, or completed your Tasks.</p></div></div>
              <div className={styles.list}>
                {assignedByMe.map((assignment) => (
                  <DelegatedTaskCard key={assignment.id} assignment={assignment} task={taskMap.get(assignment.task_id)} staffMap={staffMap} extensions={tasks.extensions} busy={busy} run={run} />
                ))}
                {assignedByMe.length === 0 && <div className={styles.empty}>You have not delegated any Tasks.</div>}
              </div>
            </section>
          </div>
        )}

        {tab === 'Goals' && (
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div><h2>Goals</h2><p>Personal outcomes, shared outcomes, and company targets.</p></div>
              <button className={styles.primary} onClick={() => setGoalFormOpen((open) => !open)}>New Goal</button>
            </div>
            {goalFormOpen && <GoalForm isAdmin={isAdmin} busy={busy} onSubmit={submitGoal} onCancel={() => setGoalFormOpen(false)} />}
            {(['company', 'shared', 'personal'] as GoalVisibility[]).map((visibility) => {
              const filtered = goals.goals.filter((goal) => goal.visibility === visibility);
              if (filtered.length === 0) return null;
              return (
                <div key={visibility}>
                  <div className={styles.sectionTitle}>{visibility} goals</div>
                  <div className={styles.list}>
                    {filtered.map((goal) => {
                      const progress = (goals.progress[goal.id] ?? null) as GoalProgress;
                      return <GoalCard key={goal.id} goal={goal} progress={progress} currentUserId={currentUser.id} isAdmin={isAdmin} busy={busy} run={run} />;
                    })}
                  </div>
                </div>
              );
            })}
            {goals.goals.length === 0 && <div className={styles.empty}>No Goals yet. Start with one outcome worth moving toward.</div>}
          </section>
        )}

        {tab === 'Team' && isAdmin && team && (
          <section className={styles.panel}>
            <div className={styles.panelHeader}><div><h2>Team work</h2><p>Company Tasks only. Private Todos are never included.</p></div></div>
            <section className={styles.stats}>
              <div className={styles.stat}><span>Pending acceptance</span><strong>{team.pendingAcceptance}</strong></div>
              <div className={styles.stat}><span>Active</span><strong>{team.active}</strong></div>
              <div className={styles.stat}><span>Overdue</span><strong className={styles.danger}>{team.overdue}</strong></div>
              <div className={styles.stat}><span>Extensions</span><strong className={styles.warning}>{team.extensionRequests}</strong></div>
            </section>
            <div className={styles.list}>
              {team.staff.map((row) => (
                <div className={styles.teamRow} key={row.staff.id}>
                  <div><strong>{row.staff.name || row.staff.email || 'Staff'}</strong><div className={styles.muted}>{statusLabel(row.staff.role)}</div></div>
                  <div className={styles.teamMetric}><strong>{row.active}</strong><div className={styles.muted}>Active</div></div>
                  <div className={styles.teamMetric}><strong>{row.pendingAcceptance}</strong><div className={styles.muted}>Pending</div></div>
                  <div className={styles.teamMetric}><strong>{row.dueToday}</strong><div className={styles.muted}>Due today</div></div>
                  <div className={styles.teamMetric}><strong className={row.overdue ? styles.danger : ''}>{row.overdue}</strong><div className={styles.muted}>Overdue</div></div>
                  <div className={styles.teamMetric}><strong>{row.extensionRequests}</strong><div className={styles.muted}>Extensions</div></div>
                </div>
              ))}
            </div>
          </section>
        )}
        <div className={styles.footerSpace} />
      </main>
    </div>
  );
}

function TodoCard({ todo, busy, run, onDelegate }: { todo: Todos[number]; busy: boolean; run: (action: () => Promise<unknown>, success: string) => void; onDelegate: () => void }) {
  return (
    <div className={styles.todoItem}>
      <div>
        <div className={styles.todoTitle}>{todo.title}</div>
        <div className={styles.meta}><span className={priorityBadge(todo.priority)}>{todo.priority}</span>{todo.scheduled_for && <span className={styles.badge}>{formatDate(todo.scheduled_for)}</span>}<span className={styles.badge}>{statusLabel(todo.status)}</span></div>
      </div>
      <div className={styles.actions}>
        <button className={styles.secondary} disabled={busy || todo.status === 'completed'} onClick={() => run(() => completeTodoAction(todo.id, true), 'Todo completed.')}>✓</button>
        {todo.status === 'open' && <button className={styles.ghost} disabled={busy} onClick={onDelegate}>Delegate as Task</button>}
        <button className={styles.dangerButton} disabled={busy} onClick={() => run(() => deleteTodoAction(todo.id), 'Todo deleted.')}>Delete</button>
      </div>
    </div>
  );
}

function TaskCard({ assignment, task, currentUserId, staffMap, extensions, busy, actionEditor, setActionEditor, run }: {
  assignment: Tasks['assignments'][number]; task: Tasks['tasks'][number] | undefined; currentUserId: string; staffMap: Map<string, Staff[number]>; extensions: Tasks['extensions']; busy: boolean; actionEditor: TaskActionEditor; setActionEditor: (value: TaskActionEditor) => void; run: (action: () => Promise<unknown>, success: string) => void;
}) {
  const currentExtension = extensions.find((request) => request.task_assignment_id === assignment.id && request.status === 'pending');
  return (
    <div className={styles.taskCard}>
      <div className={styles.taskTop}><div><h3>{task?.title ?? 'Task'}</h3><div className={styles.muted}>From {staffMap.get(assignment.assigned_by)?.name ?? 'EmmyTech staff'}</div></div><span className={statusBadge(assignment.status)}>{statusLabel(assignment.status)}</span></div>
      {task?.description && <p>{task.description}</p>}
      <div className={styles.meta}><span className={priorityBadge(task?.priority ?? 'normal')}>{task?.priority ?? 'normal'}</span><span className={styles.badge}>Due {formatDate(assignment.agreed_due_at ?? assignment.requested_due_at)}</span></div>
      {assignment.assignee_id === currentUserId && assignment.status === 'pending_acceptance' && <div className={styles.actions}><button className={styles.primary} disabled={busy} onClick={() => run(() => acceptTaskAction(assignment.id), 'Task accepted.')}>Accept</button><button className={styles.secondary} onClick={() => setActionEditor({ type: 'extension', assignmentId: assignment.id })}>Request More Time</button><button className={styles.dangerButton} onClick={() => setActionEditor({ type: 'reject', assignmentId: assignment.id })}>Reject</button></div>}
      {assignment.assignee_id === currentUserId && assignment.status === 'active' && <div className={styles.actions}><button className={styles.secondary} onClick={() => setActionEditor({ type: 'extension', assignmentId: assignment.id })}>Request More Time</button><button className={styles.primary} onClick={() => setActionEditor({ type: 'complete', assignmentId: assignment.id })}>Mark Complete</button></div>}
      {assignment.status === 'extension_pending' && currentExtension && <p>Extension requested to {formatDate(currentExtension.proposed_due_at)}. Waiting for decision.</p>}
      {actionEditor?.assignmentId === assignment.id && <TaskActionForm editor={actionEditor} busy={busy} run={run} onClose={() => setActionEditor(null)} />}
    </div>
  );
}

function TaskActionForm({ editor, busy, run, onClose }: { editor: Exclude<TaskActionEditor, null>; busy: boolean; run: (action: () => Promise<unknown>, success: string) => void; onClose: () => void }) {
  if (editor.type === 'extension') return <form className={styles.modalForm} onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); const due = String(data.get('due')); const reason = String(data.get('reason')); run(() => requestExtensionAction(editor.assignmentId, new Date(due).toISOString(), reason), 'Extension request sent.'); }}><label><span className={styles.label}>Proposed new deadline</span><input className={styles.input} type="datetime-local" name="due" required /></label><label><span className={styles.label}>Reason</span><textarea className={styles.textarea} name="reason" required /></label><div className={styles.actions}><button className={styles.primary} disabled={busy}>Send request</button><button type="button" className={styles.ghost} onClick={onClose}>Cancel</button></div></form>;
  if (editor.type === 'reject') return <form className={styles.modalForm} onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); run(() => rejectTaskAction(editor.assignmentId, String(data.get('reason')) as RejectionReasonCode, String(data.get('note'))), 'Task returned to assigner.'); }}><label><span className={styles.label}>Reason</span><select className={styles.select} name="reason">{rejectionReasons.map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}</select></label><label><span className={styles.label}>Explanation</span><textarea className={styles.textarea} name="note" required /></label><div className={styles.actions}><button className={styles.dangerButton} disabled={busy}>Return Task</button><button type="button" className={styles.ghost} onClick={onClose}>Cancel</button></div></form>;
  return <form className={styles.modalForm} onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); run(() => completeTaskAction(editor.assignmentId, String(data.get('note'))), 'Task completed.'); }}><label><span className={styles.label}>Completion note</span><textarea className={styles.textarea} name="note" placeholder="What was completed?" required /></label><div className={styles.actions}><button className={styles.primary} disabled={busy}>Complete Task</button><button type="button" className={styles.ghost} onClick={onClose}>Cancel</button></div></form>;
}

function DelegatedTaskCard({ assignment, task, staffMap, extensions, busy, run }: { assignment: Tasks['assignments'][number]; task: Tasks['tasks'][number] | undefined; staffMap: Map<string, Staff[number]>; extensions: Tasks['extensions']; busy: boolean; run: (action: () => Promise<unknown>, success: string) => void }) {
  const pendingExtension = extensions.find((request) => request.task_assignment_id === assignment.id && request.status === 'pending');
  return <div className={styles.taskCard}><div className={styles.taskTop}><div><h3>{task?.title ?? 'Task'}</h3><div className={styles.muted}>To {staffMap.get(assignment.assignee_id)?.name ?? 'Staff member'}</div></div><span className={statusBadge(assignment.status)}>{statusLabel(assignment.status)}</span></div><div className={styles.meta}><span className={priorityBadge(task?.priority ?? 'normal')}>{task?.priority ?? 'normal'}</span><span className={styles.badge}>Due {formatDate(assignment.agreed_due_at ?? assignment.requested_due_at)}</span></div>{assignment.status === 'returned' && <p>{assignment.rejection_note || 'Task was returned.'}</p>}{pendingExtension && <div className={styles.modalForm}><strong>Extension requested</strong><span className={styles.muted}>{pendingExtension.reason}</span><span className={styles.muted}>New deadline: {formatDate(pendingExtension.proposed_due_at)}</span><div className={styles.actions}><button className={styles.primary} disabled={busy} onClick={() => run(() => decideExtensionAction(pendingExtension.id, 'approved'), 'Extension approved.')}>Approve</button><button className={styles.dangerButton} disabled={busy} onClick={() => run(() => decideExtensionAction(pendingExtension.id, 'declined'), 'Extension declined.')}>Decline</button></div></div>}</div>;
}

function TaskForm({ staff, goals, isAdmin, delegatedTodo, busy, onSubmit, onCancel }: { staff: Staff; goals: GoalsRaw['goals']; isAdmin: boolean; delegatedTodo: { id: string; title: string } | null; busy: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onCancel: () => void }) {
  return <form className={styles.modalForm} onSubmit={onSubmit}><div className={styles.formGrid}><label><span className={styles.label}>Task</span><input className={styles.input} name="title" defaultValue={delegatedTodo?.title ?? ''} required /></label><label><span className={styles.label}>Assign to</span><select className={styles.select} name="assignee" defaultValue=""><option value="">Choose staff…</option>{staff.map((person) => <option key={person.id} value={person.id}>{person.name || person.email} · {statusLabel(person.role)}</option>)}</select></label><label><span className={styles.label}>Starts</span><input className={styles.input} type="datetime-local" name="start" required /></label><label><span className={styles.label}>Due</span><input className={styles.input} type="datetime-local" name="due" required /></label><label><span className={styles.label}>Priority</span><select className={styles.select} name="priority" defaultValue="normal"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label><label><span className={styles.label}>Goal</span><select className={styles.select} name="goal" defaultValue=""><option value="">No Goal</option>{goals.filter((goal) => goal.status === 'active').map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}</select></label><label className={styles.full}><span className={styles.label}>Instructions</span><textarea className={styles.textarea} name="description" /></label>{isAdmin && <label className={styles.full}><input type="checkbox" name="broadcast" /> Assign to Everyone</label>}</div><div className={styles.actions}><button className={styles.primary} disabled={busy}>Send Task</button><button type="button" className={styles.ghost} onClick={onCancel}>Cancel</button></div></form>;
}

function GoalForm({ isAdmin, busy, onSubmit, onCancel }: { isAdmin: boolean; busy: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onCancel: () => void }) {
  return <form className={styles.modalForm} onSubmit={onSubmit}><div className={styles.formGrid}><label><span className={styles.label}>Goal</span><input className={styles.input} name="title" required /></label><label><span className={styles.label}>Visibility</span><select className={styles.select} name="visibility" defaultValue="personal"><option value="personal">Personal</option><option value="shared">Shared</option>{isAdmin && <option value="company">Company</option>}</select></label><label><span className={styles.label}>Progress</span><select className={styles.select} name="progressMode" defaultValue="tasks"><option value="tasks">Linked Tasks</option><option value="numeric">Numeric target</option></select></label><label><span className={styles.label}>Target value (numeric goals)</span><input className={styles.input} name="targetValue" type="number" min="0" step="any" /></label><label><span className={styles.label}>Unit</span><input className={styles.input} name="unit" placeholder="conversions, ₦, repairs…" /></label><label><span className={styles.label}>Starts</span><input className={styles.input} name="start" type="datetime-local" /></label><label><span className={styles.label}>Target date</span><input className={styles.input} name="targetAt" type="datetime-local" /></label><label className={styles.full}><span className={styles.label}>Description</span><textarea className={styles.textarea} name="description" /></label></div><div className={styles.actions}><button className={styles.primary} disabled={busy}>Create Goal</button><button type="button" className={styles.ghost} onClick={onCancel}>Cancel</button></div></form>;
}

function GoalCard({ goal, progress, currentUserId, isAdmin, busy, run }: { goal: GoalsRaw['goals'][number]; progress: GoalProgress; currentUserId: string; isAdmin: boolean; busy: boolean; run: (action: () => Promise<unknown>, success: string) => void }) {
  const percent = progressPercent(progress);
  const canUpdate = goal.progress_mode === 'numeric' && (goal.owner_id === currentUserId || isAdmin);
  return <div className={styles.goalCard}><div className={styles.taskTop}><div><h3>{goal.title}</h3><div className={styles.muted}>{statusLabel(goal.visibility)} · target {formatDate(goal.target_at)}</div></div><span className={statusBadge(goal.status)}>{statusLabel(goal.status)}</span></div>{goal.description && <p>{goal.description}</p>}<div className={styles.progressTrack}><div className={styles.progressFill} style={{ width: `${percent}%` }} /></div><div className={styles.meta}><span className={styles.badge}>{percent}% complete</span>{progress && goal.progress_mode === 'numeric' && <span className={styles.badge}>{String(progress.current_value ?? 0)} / {String(progress.target_value ?? goal.target_value ?? 0)} {goal.unit ?? ''}</span>}{progress && goal.progress_mode === 'tasks' && <span className={styles.badge}>{String(progress.completed_assignments ?? 0)} / {String(progress.total_assignments ?? 0)} assignments</span>}</div>{canUpdate && <form className={styles.actions} onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); run(() => updateNumericGoalProgressAction(goal.id, Number(data.get('current'))), 'Goal progress updated.'); }}><input className={styles.input} name="current" type="number" min="0" step="any" defaultValue={goal.current_value ?? 0} style={{ maxWidth: 150 }} /><button className={styles.secondary} disabled={busy}>Update progress</button></form>}</div>;
}
