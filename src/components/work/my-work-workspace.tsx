'use client';

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
} from '@/app/(staff)/modules/activities/actions';
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
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Alert } from '@/components/ui/alert';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { StatGrid, StatTile } from '@/components/ui/stat-tile';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, CheckCircle2, Clock3, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

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

function statusVariant(status: string): 'success' | 'danger' | 'warning' {
  if (status === 'active' || status === 'completed') return 'success';
  if (status === 'returned') return 'danger';
  return 'warning';
}

function priorityVariant(priority: string): 'danger' | 'warning' | 'outline' {
  if (priority === 'urgent') return 'danger';
  if (priority === 'high') return 'warning';
  return 'outline';
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
  const [todoFormOpen, setTodoFormOpen] = useState(false);
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
    const notes = String(form.get('notes') ?? '');
    const goalId = String(form.get('goal') ?? '') || null;
    run(
      () => createTodoAction({
        title,
        priority,
        scheduledFor: scheduled ? new Date(scheduled).toISOString() : null,
        notes: notes || null,
        goalId,
      }),
      'Todo added.',
    );
    event.currentTarget.reset();
    setTodoFormOpen(false);
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
  const clear = attentionCount === 0;

  return (
    <div className="space-y-5">
      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-5 rounded-2xl border p-5 shadow-[var(--shadow-card)]',
          clear ? 'border-emerald-100 bg-gradient-to-br from-emerald-50 to-white' : 'border-amber-100 bg-gradient-to-br from-amber-50 to-white'
        )}
      >
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-emmy-primary">Your workday</div>
          <h1 className="mt-1 text-xl font-extrabold tracking-tight text-slate-950">Know what needs your attention.</h1>
          <p className="mt-1 max-w-[52ch] text-sm text-slate-500">
            Plan private Todos, respond to delegated Tasks, and keep Goals moving without losing accountability.
          </p>
        </div>
        <div className="shrink-0 text-center">
          <div className="font-[family-name:var(--font-mono)] text-3xl font-extrabold text-slate-950">{attentionCount}</div>
          <div className="max-w-[16ch] text-xs text-slate-500">{clear ? 'No urgent work needs a response.' : 'items need your attention now.'}</div>
        </div>
      </div>

      {message && <Alert variant={message.kind === 'error' ? 'error' : 'success'}>{message.text}</Alert>}

      <SegmentedControl value={tab} onChange={setTab} options={tabs.map((item) => ({ value: item, label: item }))} />

      {tab === 'Today' && (
        <>
          <StatGrid className="sm:grid-cols-2 lg:grid-cols-5">
            <StatTile label="Active Tasks" value={summary.activeCount} icon={<Inbox className="h-[15px] w-[15px]" />} tone="purple" description="In progress, any due date" />
            <StatTile label="Needs response" value={summary.pendingAcceptanceCount} icon={<Inbox className="h-[15px] w-[15px]" />} tone="primary" />
            <StatTile label="Due today" value={summary.dueTodayCount} icon={<Clock3 className="h-[15px] w-[15px]" />} tone="secondary" />
            <StatTile label="Overdue" value={summary.overdueCount} icon={<AlertTriangle className="h-[15px] w-[15px]" />} tone="danger" />
            <StatTile label="My Todos" value={summary.openTodoCount} icon={<CheckCircle2 className="h-[15px] w-[15px]" />} tone="success" />
          </StatGrid>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <h2 className="text-sm font-extrabold text-slate-950">Needs your response</h2>
              <p className="text-xs text-slate-500">Tasks are not your responsibility until you accept them.</p>
              <div className="mt-3 flex flex-col">
                {myAssignments
                  .filter((assignment) => assignment.status === 'pending_acceptance' || assignment.status === 'extension_pending')
                  .slice(0, 5)
                  .map((assignment) => (
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
                {!myAssignments.some((assignment) => assignment.status === 'pending_acceptance' || assignment.status === 'extension_pending') && (
                  <EmptyNote>Nothing is waiting for your response.</EmptyNote>
                )}
              </div>
            </Card>

            <Card className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-extrabold text-slate-950">Private Todo</h2>
                  <p className="text-xs text-slate-500">Only you can see these items.</p>
                </div>
                <Button size="sm" onClick={() => setTodoFormOpen((open) => !open)}>
                  + Add Todo
                </Button>
              </div>
              {todoFormOpen && (
                <QuickTodoForm goals={goals.goals} busy={busy} onSubmit={submitTodo} onCancel={() => setTodoFormOpen(false)} />
              )}
              <div className="mt-1 flex flex-col">
                {openTodos.slice(0, 5).map((todo) => (
                  <TodoCard key={todo.id} todo={todo} busy={busy} run={run} onDelegate={() => beginDelegate(todo)} />
                ))}
                {openTodos.length === 0 && <EmptyNote>Your private Todo list is clear.</EmptyNote>}
              </div>
            </Card>
          </div>
        </>
      )}

      {tab === 'Todo' && (
        <Card className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-extrabold text-slate-950">My private Todo</h2>
              <p className="text-xs text-slate-500">A personal scratchpad. Admin cannot browse this list.</p>
            </div>
            <Button size="sm" onClick={() => setTodoFormOpen((open) => !open)}>
              + Add Todo
            </Button>
          </div>
          {todoFormOpen && (
            <QuickTodoForm goals={goals.goals} busy={busy} onSubmit={submitTodo} onCancel={() => setTodoFormOpen(false)} />
          )}
          <div className="mt-1 flex flex-col">
            {todos.map((todo) => (
              <TodoCard key={todo.id} todo={todo} busy={busy} run={run} onDelegate={() => beginDelegate(todo)} />
            ))}
          </div>
        </Card>
      )}

      {tab === 'Tasks' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-extrabold text-slate-950">Tasks assigned to me</h2>
                <p className="text-xs text-slate-500">Accept, negotiate, reject, or complete shared work.</p>
              </div>
              <Button size="sm" onClick={() => setTaskFormOpen((open) => !open)}>
                New Task
              </Button>
            </div>
            {taskFormOpen && (
              <TaskForm
                staff={staff}
                goals={goals.goals}
                isAdmin={isAdmin}
                delegatedTodo={delegatedTodo}
                busy={busy}
                onSubmit={submitTask}
                onCancel={() => {
                  setTaskFormOpen(false);
                  setDelegatedTodo(null);
                }}
              />
            )}
            <div className="mt-1 flex flex-col">
              {myAssignments.map((assignment) => (
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
              {myAssignments.length === 0 && <EmptyNote>No Tasks have been assigned to you yet.</EmptyNote>}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-extrabold text-slate-950">Delegated by me</h2>
            <p className="text-xs text-slate-500">See who accepted, returned, or completed your Tasks.</p>
            <div className="mt-3 flex flex-col">
              {assignedByMe.map((assignment) => (
                <DelegatedTaskCard
                  key={assignment.id}
                  assignment={assignment}
                  task={taskMap.get(assignment.task_id)}
                  staffMap={staffMap}
                  extensions={tasks.extensions}
                  busy={busy}
                  run={run}
                />
              ))}
              {assignedByMe.length === 0 && <EmptyNote>You have not delegated any Tasks.</EmptyNote>}
            </div>
          </Card>
        </div>
      )}

      {tab === 'Goals' && (
        <Card className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-extrabold text-slate-950">Goals</h2>
              <p className="text-xs text-slate-500">Personal outcomes, shared outcomes, and company targets.</p>
            </div>
            <Button size="sm" onClick={() => setGoalFormOpen((open) => !open)}>
              New Goal
            </Button>
          </div>
          {goalFormOpen && <GoalForm isAdmin={isAdmin} busy={busy} onSubmit={submitGoal} onCancel={() => setGoalFormOpen(false)} />}
          {(['company', 'shared', 'personal'] as GoalVisibility[]).map((visibility) => {
            const filtered = goals.goals.filter((goal) => goal.visibility === visibility);
            if (filtered.length === 0) return null;
            return (
              <div key={visibility} className="mt-4">
                <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">{visibility} goals</div>
                <div className="flex flex-col gap-2">
                  {filtered.map((goal) => {
                    const progress = (goals.progress[goal.id] ?? null) as GoalProgress;
                    return <GoalCard key={goal.id} goal={goal} progress={progress} currentUserId={currentUser.id} isAdmin={isAdmin} busy={busy} run={run} />;
                  })}
                </div>
              </div>
            );
          })}
          {goals.goals.length === 0 && <EmptyNote>No Goals yet. Start with one outcome worth moving toward.</EmptyNote>}
        </Card>
      )}

      {tab === 'Team' && isAdmin && team && (
        <Card className="p-5">
          <h2 className="text-sm font-extrabold text-slate-950">Team work</h2>
          <p className="text-xs text-slate-500">Company Tasks only. Private Todos are never included.</p>
          <StatGrid className="mt-4 sm:grid-cols-4">
            <StatTile label="Pending acceptance" value={team.pendingAcceptance} tone="neutral" />
            <StatTile label="Active" value={team.active} tone="primary" />
            <StatTile label="Overdue" value={team.overdue} tone="danger" />
            <StatTile label="Extensions" value={team.extensionRequests} tone="secondary" />
          </StatGrid>
          <Table className="mt-4">
            <TableHeader>
              <TableRow>
                <TableHead>Staff</TableHead>
                <TableHead>Active</TableHead>
                <TableHead>Pending</TableHead>
                <TableHead>Due today</TableHead>
                <TableHead>Overdue</TableHead>
                <TableHead>Extensions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {team.staff.map((row) => (
                <TableRow key={row.staff.id}>
                  <TableCell>
                    <div className="font-bold text-slate-950">{row.staff.name || row.staff.email || 'Staff'}</div>
                    <div className="text-xs text-slate-500">{statusLabel(row.staff.role)}</div>
                  </TableCell>
                  <TableCell>{row.active}</TableCell>
                  <TableCell>{row.pendingAcceptance}</TableCell>
                  <TableCell>{row.dueToday}</TableCell>
                  <TableCell className={row.overdue ? 'font-bold text-red-600' : ''}>{row.overdue}</TableCell>
                  <TableCell>{row.extensionRequests}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">{children}</div>;
}

function QuickTodoForm({ goals, busy, onSubmit, onCancel }: { goals: GoalsRaw['goals']; busy: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onCancel: () => void }) {
  return (
    <form className="mt-3 rounded-xl border border-slate-200 p-4" onSubmit={onSubmit}>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1 md:col-span-2"><span className="text-xs font-bold text-slate-600">Todo</span><Input name="title" placeholder="What do you need to do?" required /></label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-slate-600">Priority</span>
          <Select name="priority" defaultValue="normal">
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </Select>
        </label>
        <label className="flex flex-col gap-1"><span className="text-xs font-bold text-slate-600">Due date</span><Input name="scheduled" type="datetime-local" /></label>
        <label className="flex flex-col gap-1 md:col-span-2">
          <span className="text-xs font-bold text-slate-600">Link to Goal</span>
          <Select name="goal" defaultValue="">
            <option value="">No Goal</option>
            {goals.filter((goal) => goal.status === 'active').map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}
          </Select>
        </label>
        <label className="flex flex-col gap-1 md:col-span-2"><span className="text-xs font-bold text-slate-600">Notes / details</span><Textarea name="notes" placeholder="Anything else that makes this todo actionable" /></label>
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="sm" disabled={busy}>Add Todo</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

function TodoCard({ todo, busy, run, onDelegate }: { todo: Todos[number]; busy: boolean; run: (action: () => Promise<unknown>, success: string) => void; onDelegate: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 py-3 last:border-b-0">
      <div>
        <div className="text-sm font-bold text-slate-950">{todo.title}</div>
        {todo.notes && <div className="mt-0.5 text-xs text-slate-500">{todo.notes}</div>}
        <div className="mt-1 flex flex-wrap gap-1.5">
          <Badge variant={priorityVariant(todo.priority)}>{todo.priority}</Badge>
          {todo.scheduled_for && <Badge variant="outline">{formatDate(todo.scheduled_for)}</Badge>}
          <Badge variant="outline">{statusLabel(todo.status)}</Badge>
        </div>
      </div>
      <div className="flex shrink-0 gap-1.5">
        <Button size="sm" variant="outline" disabled={busy || todo.status === 'completed'} onClick={() => run(() => completeTodoAction(todo.id, true), 'Todo completed.')}>
          ✓
        </Button>
        {todo.status === 'open' && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={onDelegate}>
            Delegate
          </Button>
        )}
        <Button size="sm" variant="danger" disabled={busy} onClick={() => run(() => deleteTodoAction(todo.id), 'Todo deleted.')}>
          Delete
        </Button>
      </div>
    </div>
  );
}

function TaskCard({ assignment, task, currentUserId, staffMap, extensions, busy, actionEditor, setActionEditor, run }: {
  assignment: Tasks['assignments'][number]; task: Tasks['tasks'][number] | undefined; currentUserId: string; staffMap: Map<string, Staff[number]>; extensions: Tasks['extensions']; busy: boolean; actionEditor: TaskActionEditor; setActionEditor: (value: TaskActionEditor) => void; run: (action: () => Promise<unknown>, success: string) => void;
}) {
  const currentExtension = extensions.find((request) => request.task_assignment_id === assignment.id && request.status === 'pending');
  return (
    <div className="border-b border-slate-100 py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-950">{task?.title ?? 'Task'}</h3>
          <div className="text-xs text-slate-500">From {staffMap.get(assignment.assigned_by)?.name ?? 'EmmyTech staff'}</div>
        </div>
        <Badge variant={statusVariant(assignment.status)}>{statusLabel(assignment.status)}</Badge>
      </div>
      {task?.description && <p className="mt-1.5 text-xs text-slate-600">{task.description}</p>}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Badge variant={priorityVariant(task?.priority ?? 'normal')}>{task?.priority ?? 'normal'}</Badge>
        <Badge variant="outline">Due {formatDate(assignment.agreed_due_at ?? assignment.requested_due_at)}</Badge>
      </div>
      {assignment.assignee_id === currentUserId && assignment.status === 'pending_acceptance' && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <Button size="sm" disabled={busy} onClick={() => run(() => acceptTaskAction(assignment.id), 'Task accepted.')}>
            Accept
          </Button>
          <Button size="sm" variant="outline" onClick={() => setActionEditor({ type: 'extension', assignmentId: assignment.id })}>
            Request More Time
          </Button>
          <Button size="sm" variant="danger" onClick={() => setActionEditor({ type: 'reject', assignmentId: assignment.id })}>
            Reject
          </Button>
        </div>
      )}
      {assignment.assignee_id === currentUserId && assignment.status === 'active' && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" onClick={() => setActionEditor({ type: 'extension', assignmentId: assignment.id })}>
            Request More Time
          </Button>
          <Button size="sm" onClick={() => setActionEditor({ type: 'complete', assignmentId: assignment.id })}>
            Mark Complete
          </Button>
        </div>
      )}
      {assignment.status === 'extension_pending' && currentExtension && (
        <p className="mt-2 text-xs text-slate-500">Extension requested to {formatDate(currentExtension.proposed_due_at)}. Waiting for decision.</p>
      )}
      {actionEditor?.assignmentId === assignment.id && <TaskActionForm editor={actionEditor} busy={busy} run={run} onClose={() => setActionEditor(null)} />}
    </div>
  );
}

function TaskActionForm({ editor, busy, run, onClose }: { editor: Exclude<TaskActionEditor, null>; busy: boolean; run: (action: () => Promise<unknown>, success: string) => void; onClose: () => void }) {
  if (editor.type === 'extension')
    return (
      <form
        className="mt-3 flex flex-col gap-3 rounded-xl border border-slate-200 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const due = String(data.get('due'));
          const reason = String(data.get('reason'));
          run(() => requestExtensionAction(editor.assignmentId, new Date(due).toISOString(), reason), 'Extension request sent.');
        }}
      >
        <label className="flex flex-col gap-1"><span className="text-xs font-bold text-slate-600">Proposed new deadline</span><Input type="datetime-local" name="due" required /></label>
        <label className="flex flex-col gap-1"><span className="text-xs font-bold text-slate-600">Reason</span><Textarea name="reason" required /></label>
        <div className="flex gap-2">
          <Button size="sm" disabled={busy}>Send request</Button>
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </form>
    );
  if (editor.type === 'reject')
    return (
      <form
        className="mt-3 flex flex-col gap-3 rounded-xl border border-slate-200 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          run(() => rejectTaskAction(editor.assignmentId, String(data.get('reason')) as RejectionReasonCode, String(data.get('note'))), 'Task returned to assigner.');
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-slate-600">Reason</span>
          <Select name="reason">
            {rejectionReasons.map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}
          </Select>
        </label>
        <label className="flex flex-col gap-1"><span className="text-xs font-bold text-slate-600">Explanation</span><Textarea name="note" required /></label>
        <div className="flex gap-2">
          <Button size="sm" variant="danger" disabled={busy}>Return Task</Button>
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </form>
    );
  return (
    <form
      className="mt-3 flex flex-col gap-3 rounded-xl border border-slate-200 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        run(() => completeTaskAction(editor.assignmentId, String(data.get('note'))), 'Task completed.');
      }}
    >
      <label className="flex flex-col gap-1"><span className="text-xs font-bold text-slate-600">Completion note</span><Textarea name="note" placeholder="What was completed?" required /></label>
      <div className="flex gap-2">
        <Button size="sm" disabled={busy}>Complete Task</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </form>
  );
}

function DelegatedTaskCard({ assignment, task, staffMap, extensions, busy, run }: { assignment: Tasks['assignments'][number]; task: Tasks['tasks'][number] | undefined; staffMap: Map<string, Staff[number]>; extensions: Tasks['extensions']; busy: boolean; run: (action: () => Promise<unknown>, success: string) => void }) {
  const pendingExtension = extensions.find((request) => request.task_assignment_id === assignment.id && request.status === 'pending');
  return (
    <div className="border-b border-slate-100 py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-950">{task?.title ?? 'Task'}</h3>
          <div className="text-xs text-slate-500">To {staffMap.get(assignment.assignee_id)?.name ?? 'Staff member'}</div>
        </div>
        <Badge variant={statusVariant(assignment.status)}>{statusLabel(assignment.status)}</Badge>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Badge variant={priorityVariant(task?.priority ?? 'normal')}>{task?.priority ?? 'normal'}</Badge>
        <Badge variant="outline">Due {formatDate(assignment.agreed_due_at ?? assignment.requested_due_at)}</Badge>
      </div>
      {assignment.status === 'returned' && <p className="mt-2 text-xs text-slate-500">{assignment.rejection_note || 'Task was returned.'}</p>}
      {pendingExtension && (
        <div className="mt-3 rounded-xl border border-slate-200 p-3">
          <strong className="text-xs font-bold text-slate-950">Extension requested</strong>
          <div className="mt-0.5 text-xs text-slate-500">{pendingExtension.reason}</div>
          <div className="text-xs text-slate-500">New deadline: {formatDate(pendingExtension.proposed_due_at)}</div>
          <div className="mt-2 flex gap-1.5">
            <Button size="sm" disabled={busy} onClick={() => run(() => decideExtensionAction(pendingExtension.id, 'approved'), 'Extension approved.')}>Approve</Button>
            <Button size="sm" variant="danger" disabled={busy} onClick={() => run(() => decideExtensionAction(pendingExtension.id, 'declined'), 'Extension declined.')}>Decline</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function TaskForm({ staff, goals, isAdmin, delegatedTodo, busy, onSubmit, onCancel }: { staff: Staff; goals: GoalsRaw['goals']; isAdmin: boolean; delegatedTodo: { id: string; title: string } | null; busy: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onCancel: () => void }) {
  return (
    <form className="mt-3 rounded-xl border border-slate-200 p-4" onSubmit={onSubmit}>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1"><span className="text-xs font-bold text-slate-600">Task</span><Input name="title" defaultValue={delegatedTodo?.title ?? ''} required /></label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-slate-600">Assign to</span>
          <Select name="assignee" defaultValue="">
            <option value="">Choose staff…</option>
            {staff.map((person) => <option key={person.id} value={person.id}>{person.name || person.email} · {statusLabel(person.role)}</option>)}
          </Select>
        </label>
        <label className="flex flex-col gap-1"><span className="text-xs font-bold text-slate-600">Starts</span><Input type="datetime-local" name="start" required /></label>
        <label className="flex flex-col gap-1"><span className="text-xs font-bold text-slate-600">Due</span><Input type="datetime-local" name="due" required /></label>
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
          <span className="text-xs font-bold text-slate-600">Goal</span>
          <Select name="goal" defaultValue="">
            <option value="">No Goal</option>
            {goals.filter((goal) => goal.status === 'active').map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}
          </Select>
        </label>
        <label className="flex flex-col gap-1 md:col-span-2"><span className="text-xs font-bold text-slate-600">Instructions</span><Textarea name="description" /></label>
        {isAdmin && (
          <label className="flex items-center gap-2 md:col-span-2 text-xs font-bold text-slate-600">
            <input type="checkbox" name="broadcast" className="h-4 w-4" /> Assign to Everyone
          </label>
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="sm" disabled={busy}>Send Task</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

function GoalForm({ isAdmin, busy, onSubmit, onCancel }: { isAdmin: boolean; busy: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onCancel: () => void }) {
  return (
    <form className="mt-3 rounded-xl border border-slate-200 p-4" onSubmit={onSubmit}>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1"><span className="text-xs font-bold text-slate-600">Goal</span><Input name="title" required /></label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-slate-600">Visibility</span>
          <Select name="visibility" defaultValue="personal">
            <option value="personal">Personal</option>
            <option value="shared">Shared</option>
            {isAdmin && <option value="company">Company</option>}
          </Select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-slate-600">Progress</span>
          <Select name="progressMode" defaultValue="tasks">
            <option value="tasks">Linked Tasks</option>
            <option value="numeric">Numeric target</option>
          </Select>
        </label>
        <label className="flex flex-col gap-1"><span className="text-xs font-bold text-slate-600">Target value (numeric goals)</span><Input name="targetValue" type="number" min="0" step="any" /></label>
        <label className="flex flex-col gap-1"><span className="text-xs font-bold text-slate-600">Unit</span><Input name="unit" placeholder="conversions, ₦, repairs…" /></label>
        <label className="flex flex-col gap-1"><span className="text-xs font-bold text-slate-600">Starts</span><Input name="start" type="datetime-local" /></label>
        <label className="flex flex-col gap-1"><span className="text-xs font-bold text-slate-600">Target date</span><Input name="targetAt" type="datetime-local" /></label>
        <label className="flex flex-col gap-1 md:col-span-2"><span className="text-xs font-bold text-slate-600">Description</span><Textarea name="description" /></label>
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="sm" disabled={busy}>Create Goal</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

function GoalCard({ goal, progress, currentUserId, isAdmin, busy, run }: { goal: GoalsRaw['goals'][number]; progress: GoalProgress; currentUserId: string; isAdmin: boolean; busy: boolean; run: (action: () => Promise<unknown>, success: string) => void }) {
  const percent = progressPercent(progress);
  const canUpdate = goal.progress_mode === 'numeric' && (goal.owner_id === currentUserId || isAdmin);
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-950">{goal.title}</h3>
          <div className="text-xs text-slate-500">{statusLabel(goal.visibility)} · target {formatDate(goal.target_at)}</div>
        </div>
        <Badge variant={statusVariant(goal.status)}>{statusLabel(goal.status)}</Badge>
      </div>
      {goal.description && <p className="mt-1.5 text-xs text-slate-600">{goal.description}</p>}
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-emmy-primary transition-all" style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Badge variant="outline">{percent}% complete</Badge>
        {progress && goal.progress_mode === 'numeric' && (
          <Badge variant="outline">{String(progress.current_value ?? 0)} / {String(progress.target_value ?? goal.target_value ?? 0)} {goal.unit ?? ''}</Badge>
        )}
        {progress && goal.progress_mode === 'tasks' && (
          <Badge variant="outline">{String(progress.completed_assignments ?? 0)} / {String(progress.total_assignments ?? 0)} assignments</Badge>
        )}
      </div>
      {canUpdate && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            run(() => updateNumericGoalProgressAction(goal.id, Number(data.get('current'))), 'Goal progress updated.');
          }}
        >
          <Input name="current" type="number" min="0" step="any" defaultValue={goal.current_value ?? 0} className="max-w-[150px]" />
          <Button size="sm" variant="outline" disabled={busy}>Update progress</Button>
        </form>
      )}
    </div>
  );
}
