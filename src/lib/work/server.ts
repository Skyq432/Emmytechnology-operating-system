import { INTERNAL_ROLES, type InternalRole } from '@/lib/auth/roles';
import { requireInternalUser } from '@/lib/auth/server';
import { isOverdueAssignment } from '@/lib/work/domain';
import type { GoalProgressMode, GoalVisibility, TaskAssignmentStatus, WorkPriority } from '@/lib/work/types';

type TodoRow = {
  id: string;
  owner_id: string;
  title: string;
  notes: string | null;
  priority: WorkPriority;
  scheduled_for: string | null;
  due_at: string | null;
  goal_id: string | null;
  status: 'open' | 'completed' | 'cancelled';
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  created_by: string;
  source_todo_id: string | null;
  goal_id: string | null;
  priority: WorkPriority;
  requested_start_at: string;
  requested_due_at: string;
  status: 'open' | 'cancelled' | 'completed';
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

type AssignmentRow = {
  id: string;
  task_id: string;
  assignee_id: string;
  assigned_by: string;
  status: TaskAssignmentStatus;
  requested_start_at: string;
  requested_due_at: string;
  agreed_start_at: string | null;
  agreed_due_at: string | null;
  accepted_at: string | null;
  completed_at: string | null;
  completion_note: string | null;
  rejection_reason_code: string | null;
  rejection_note: string | null;
  returned_at: string | null;
  created_at: string;
  updated_at: string;
};

type ExtensionRow = {
  id: string;
  task_assignment_id: string;
  requested_by: string;
  original_due_at: string;
  proposed_due_at: string;
  reason: string;
  status: 'pending' | 'approved' | 'declined';
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
};

type GoalRow = {
  id: string;
  title: string;
  description: string | null;
  owner_id: string;
  visibility: GoalVisibility;
  progress_mode: GoalProgressMode;
  start_at: string | null;
  target_at: string | null;
  target_value: number | null;
  current_value: number | null;
  unit: string | null;
  status: 'active' | 'achieved' | 'cancelled' | 'archived';
  created_at: string;
  updated_at: string;
};

type StaffRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: InternalRole;
  avatar_url: string | null;
};

const NIGERIA_OFFSET_MS = 60 * 60 * 1000;

function nigeriaDayBounds(reference: Date = new Date()) {
  const local = new Date(reference.getTime() + NIGERIA_OFFSET_MS);
  const startLocalAsUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const start = new Date(startLocalAsUtc - NIGERIA_OFFSET_MS);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

function isDueToday(assignment: AssignmentRow, now: Date = new Date()) {
  if (assignment.status !== 'active' || !assignment.agreed_due_at || assignment.completed_at) return false;
  const due = new Date(assignment.agreed_due_at);
  const { start, end } = nigeriaDayBounds(now);
  return due >= start && due < end;
}

function throwIfError(error: { message: string } | null, context: string) {
  if (error) throw new Error(`${context}: ${error.message}`);
}

export async function getMyTodos() {
  const { supabase, user } = await requireInternalUser();
  const { data, error } = await supabase
    .from('work_todos')
    .select('*')
    .eq('owner_id', user.id)
    .order('status', { ascending: true })
    .order('scheduled_for', { ascending: true, nullsFirst: false })
    .order('due_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });

  throwIfError(error, 'Unable to load your Todos');
  return (data ?? []) as TodoRow[];
}

export async function getMyTasks() {
  const { supabase, user } = await requireInternalUser();

  const { data: myAssignments, error: myAssignmentError } = await supabase
    .from('work_task_assignments')
    .select('*')
    .eq('assignee_id', user.id)
    .order('created_at', { ascending: false });
  throwIfError(myAssignmentError, 'Unable to load assigned Tasks');

  const { data: createdTasks, error: createdTaskError } = await supabase
    .from('work_tasks')
    .select('*')
    .eq('created_by', user.id)
    .order('created_at', { ascending: false });
  throwIfError(createdTaskError, 'Unable to load delegated Tasks');

  const createdTaskRows = (createdTasks ?? []) as TaskRow[];
  const createdTaskIds = createdTaskRows.map((task) => task.id);

  let delegatedAssignments: AssignmentRow[] = [];
  if (createdTaskIds.length > 0) {
    const { data, error } = await supabase
      .from('work_task_assignments')
      .select('*')
      .in('task_id', createdTaskIds)
      .order('created_at', { ascending: false });
    throwIfError(error, 'Unable to load delegated Task assignments');
    delegatedAssignments = (data ?? []) as AssignmentRow[];
  }

  const allAssignments = [...((myAssignments ?? []) as AssignmentRow[]), ...delegatedAssignments];
  const assignmentMap = new Map(allAssignments.map((assignment) => [assignment.id, assignment]));
  const dedupedAssignments = [...assignmentMap.values()];
  const taskIds = [...new Set(dedupedAssignments.map((assignment) => assignment.task_id))];

  let taskRows: TaskRow[] = createdTaskRows;
  const missingTaskIds = taskIds.filter((id) => !createdTaskRows.some((task) => task.id === id));
  if (missingTaskIds.length > 0) {
    const { data, error } = await supabase.from('work_tasks').select('*').in('id', missingTaskIds);
    throwIfError(error, 'Unable to load Task details');
    taskRows = [...createdTaskRows, ...((data ?? []) as TaskRow[])];
  }

  const assignmentIds = dedupedAssignments.map((assignment) => assignment.id);
  let extensions: ExtensionRow[] = [];
  if (assignmentIds.length > 0) {
    const { data, error } = await supabase
      .from('work_task_extension_requests')
      .select('*')
      .in('task_assignment_id', assignmentIds)
      .order('created_at', { ascending: false });
    throwIfError(error, 'Unable to load Task extension requests');
    extensions = (data ?? []) as ExtensionRow[];
  }

  return { tasks: taskRows, assignments: dedupedAssignments, extensions };
}

export async function getTaskDetail(taskId: string) {
  const { supabase } = await requireInternalUser();

  const { data: task, error: taskError } = await supabase
    .from('work_tasks')
    .select('*')
    .eq('id', taskId)
    .single();
  throwIfError(taskError, 'Unable to load Task');

  const { data: assignments, error: assignmentError } = await supabase
    .from('work_task_assignments')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true });
  throwIfError(assignmentError, 'Unable to load Task assignments');

  const assignmentRows = (assignments ?? []) as AssignmentRow[];
  const assignmentIds = assignmentRows.map((assignment) => assignment.id);

  let extensions: ExtensionRow[] = [];
  if (assignmentIds.length > 0) {
    const { data, error } = await supabase
      .from('work_task_extension_requests')
      .select('*')
      .in('task_assignment_id', assignmentIds)
      .order('created_at', { ascending: true });
    throwIfError(error, 'Unable to load extension history');
    extensions = (data ?? []) as ExtensionRow[];
  }

  const { data: events, error: eventError } = await supabase
    .from('work_task_events')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true });
  throwIfError(eventError, 'Unable to load Task history');

  const peopleIds = new Set<string>([(task as TaskRow).created_by]);
  for (const assignment of assignmentRows) {
    peopleIds.add(assignment.assignee_id);
    peopleIds.add(assignment.assigned_by);
  }
  for (const event of events ?? []) {
    if (event.actor_id) peopleIds.add(event.actor_id as string);
  }

  let people: StaffRow[] = [];
  if (peopleIds.size > 0) {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, email, role, avatar_url')
      .in('id', [...peopleIds]);
    throwIfError(error, 'Unable to load Task participants');
    people = (data ?? []).filter((person) => INTERNAL_ROLES.includes(person.role as InternalRole)) as StaffRow[];
  }

  return {
    task: task as TaskRow,
    assignments: assignmentRows,
    extensions,
    events: events ?? [],
    people,
  };
}

export async function getMyGoals() {
  const { supabase } = await requireInternalUser();
  const { data: goals, error } = await supabase
    .from('work_goals')
    .select('*')
    .order('status', { ascending: true })
    .order('target_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });
  throwIfError(error, 'Unable to load Goals');

  const goalRows = (goals ?? []) as GoalRow[];
  const goalIds = goalRows.map((goal) => goal.id);

  let contributors: Array<{ goal_id: string; user_id: string; added_by: string; created_at: string }> = [];
  if (goalIds.length > 0) {
    const { data, error: contributorError } = await supabase
      .from('work_goal_contributors')
      .select('*')
      .in('goal_id', goalIds);
    throwIfError(contributorError, 'Unable to load Goal contributors');
    contributors = data ?? [];
  }

  const progress = new Map<string, unknown>();
  for (const goal of goalRows) {
    const { data, error: progressError } = await supabase.rpc('work_get_goal_progress', { p_goal_id: goal.id });
    throwIfError(progressError, `Unable to load progress for ${goal.title}`);
    progress.set(goal.id, data?.[0] ?? null);
  }

  return { goals: goalRows, contributors, progress };
}

export async function listAssignableStaff() {
  const { supabase } = await requireInternalUser();
  const { data, error } = await supabase
    .from('users')
    .select('id, name, email, role, avatar_url')
    .in('role', [...INTERNAL_ROLES])
    .order('name', { ascending: true });

  throwIfError(error, 'Unable to load EmmyTech staff');
  return (data ?? []) as StaffRow[];
}

export async function getMyWorkDashboard() {
  const { supabase, user } = await requireInternalUser();
  const now = new Date();
  const { start, end } = nigeriaDayBounds(now);

  const { data: assignments, error: assignmentError } = await supabase
    .from('work_task_assignments')
    .select('*')
    .eq('assignee_id', user.id)
    .in('status', ['pending_acceptance', 'extension_pending', 'active'])
    .order('agreed_due_at', { ascending: true, nullsFirst: false });
  throwIfError(assignmentError, 'Unable to load work summary');
  const assignmentRows = (assignments ?? []) as AssignmentRow[];

  const { count: todayTodoCount, error: todoError } = await supabase
    .from('work_todos')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', user.id)
    .eq('status', 'open')
    .gte('scheduled_for', start.toISOString())
    .lt('scheduled_for', end.toISOString());
  throwIfError(todoError, 'Unable to count today Todos');

  const { data: delegatedAssignments, error: delegatedError } = await supabase
    .from('work_task_assignments')
    .select('id')
    .eq('assigned_by', user.id);
  throwIfError(delegatedError, 'Unable to load delegated work');
  const delegatedIds = (delegatedAssignments ?? []).map((item) => item.id as string);

  let extensionDecisionCount = 0;
  if (delegatedIds.length > 0) {
    const { count, error } = await supabase
      .from('work_task_extension_requests')
      .select('id', { count: 'exact', head: true })
      .in('task_assignment_id', delegatedIds)
      .eq('status', 'pending');
    throwIfError(error, 'Unable to count extension requests');
    extensionDecisionCount = count ?? 0;
  }

  const activeAssignments = assignmentRows.filter((assignment) => assignment.status === 'active');
  const pendingAcceptanceCount = assignmentRows.filter((assignment) => assignment.status === 'pending_acceptance').length;
  const dueTodayCount = activeAssignments.filter((assignment) => isDueToday(assignment, now)).length;
  const overdueCount = activeAssignments.filter((assignment) =>
    isOverdueAssignment(
      {
        status: assignment.status,
        agreedDueAt: assignment.agreed_due_at,
        completedAt: assignment.completed_at,
      },
      now,
    ),
  ).length;

  const nextAssignment = activeAssignments
    .filter((assignment) => assignment.agreed_due_at && new Date(assignment.agreed_due_at) >= now)
    .sort((a, b) => new Date(a.agreed_due_at!).getTime() - new Date(b.agreed_due_at!).getTime())[0] ?? null;

  let nextTask: TaskRow | null = null;
  if (nextAssignment) {
    const { data, error } = await supabase.from('work_tasks').select('*').eq('id', nextAssignment.task_id).single();
    throwIfError(error, 'Unable to load next Task');
    nextTask = data as TaskRow;
  }

  const { data: goalRows, error: goalError } = await supabase
    .from('work_goals')
    .select('*')
    .eq('status', 'active')
    .order('target_at', { ascending: true, nullsFirst: false })
    .limit(1);
  throwIfError(goalError, 'Unable to load Goal highlight');

  let goalHighlight: { goal: GoalRow; progress: unknown } | null = null;
  const goal = ((goalRows ?? [])[0] ?? null) as GoalRow | null;
  if (goal) {
    const { data, error } = await supabase.rpc('work_get_goal_progress', { p_goal_id: goal.id });
    throwIfError(error, 'Unable to load Goal highlight progress');
    goalHighlight = { goal, progress: data?.[0] ?? null };
  }

  return {
    pendingAcceptanceCount,
    extensionDecisionCount,
    dueTodayCount,
    overdueCount,
    todayTodoCount: todayTodoCount ?? 0,
    nextTask: nextTask ? { task: nextTask, assignment: nextAssignment } : null,
    goalHighlight,
  };
}

export async function getTeamWorkSummary() {
  const { supabase, role } = await requireInternalUser();
  if (role !== 'admin' && role !== 'super_admin') {
    throw new Error('Only Admin or Super Admin can view the Team work summary');
  }

  const { data: staff, error: staffError } = await supabase
    .from('users')
    .select('id, name, email, role, avatar_url')
    .in('role', [...INTERNAL_ROLES])
    .order('name', { ascending: true });
  throwIfError(staffError, 'Unable to load staff summary');

  const { data: assignments, error: assignmentError } = await supabase
    .from('work_task_assignments')
    .select('*');
  throwIfError(assignmentError, 'Unable to load Team Tasks');

  const assignmentRows = (assignments ?? []) as AssignmentRow[];
  const assignmentIds = assignmentRows.map((assignment) => assignment.id);
  const extensionByAssignment = new Map<string, number>();

  if (assignmentIds.length > 0) {
    const { data: extensions, error } = await supabase
      .from('work_task_extension_requests')
      .select('task_assignment_id')
      .in('task_assignment_id', assignmentIds)
      .eq('status', 'pending');
    throwIfError(error, 'Unable to load Team extension requests');
    for (const extension of extensions ?? []) {
      const id = extension.task_assignment_id as string;
      extensionByAssignment.set(id, (extensionByAssignment.get(id) ?? 0) + 1);
    }
  }

  const now = new Date();
  const rows = ((staff ?? []) as StaffRow[]).map((person) => {
    const personAssignments = assignmentRows.filter((assignment) => assignment.assignee_id === person.id);
    const active = personAssignments.filter((assignment) => assignment.status === 'active');
    return {
      staff: person,
      pendingAcceptance: personAssignments.filter((assignment) => assignment.status === 'pending_acceptance').length,
      active: active.length,
      dueToday: active.filter((assignment) => isDueToday(assignment, now)).length,
      overdue: active.filter((assignment) =>
        isOverdueAssignment(
          {
            status: assignment.status,
            agreedDueAt: assignment.agreed_due_at,
            completedAt: assignment.completed_at,
          },
          now,
        ),
      ).length,
      extensionRequests: personAssignments.reduce(
        (sum, assignment) => sum + (extensionByAssignment.get(assignment.id) ?? 0),
        0,
      ),
      completed: personAssignments.filter((assignment) => assignment.status === 'completed').length,
    };
  });

  return {
    pendingAcceptance: rows.reduce((sum, row) => sum + row.pendingAcceptance, 0),
    active: rows.reduce((sum, row) => sum + row.active, 0),
    dueToday: rows.reduce((sum, row) => sum + row.dueToday, 0),
    overdue: rows.reduce((sum, row) => sum + row.overdue, 0),
    extensionRequests: rows.reduce((sum, row) => sum + row.extensionRequests, 0),
    staff: rows,
  };
}
