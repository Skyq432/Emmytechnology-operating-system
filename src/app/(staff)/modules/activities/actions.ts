'use server';

import { revalidatePath } from 'next/cache';
import { requireInternalUser } from '@/lib/auth/server';
import type {
  GoalProgressMode,
  GoalVisibility,
  RejectionReasonCode,
  WorkPriority,
} from '@/lib/work/types';

type TodoInput = {
  title: string;
  notes?: string | null;
  priority?: WorkPriority;
  scheduledFor?: string | null;
  dueAt?: string | null;
  goalId?: string | null;
};

type TaskInput = {
  title: string;
  description?: string | null;
  assigneeId: string;
  requestedStartAt: string;
  requestedDueAt: string;
  priority?: WorkPriority;
  sourceTodoId?: string | null;
  goalId?: string | null;
};

type BroadcastTaskInput = Omit<TaskInput, 'assigneeId' | 'sourceTodoId'>;

type GoalInput = {
  title: string;
  description?: string | null;
  visibility: GoalVisibility;
  progressMode: GoalProgressMode;
  startAt?: string | null;
  targetAt?: string | null;
  targetValue?: number | null;
  unit?: string | null;
};

type GoalUpdateInput = {
  goalId: string;
  title: string;
  description?: string | null;
  visibility: GoalVisibility;
  startAt?: string | null;
  targetAt?: string | null;
  status: 'active' | 'achieved' | 'cancelled' | 'archived';
};

function assertNoError(error: { message: string } | null, context: string) {
  if (error) throw new Error(`${context}: ${error.message}`);
}

function requireText(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required`);
  return trimmed;
}

function optionalText(value?: string | null) {
  const trimmed = value?.trim() ?? '';
  return trimmed || null;
}

function refreshWorkPaths() {
  revalidatePath('/modules/activities');
  revalidatePath('/');
}

async function ensureGoalVisible(
  supabase: Awaited<ReturnType<typeof requireInternalUser>>['supabase'],
  goalId?: string | null,
) {
  if (!goalId) return;
  const { data, error } = await supabase.from('work_goals').select('id').eq('id', goalId).maybeSingle();
  assertNoError(error, 'Unable to validate Goal');
  if (!data) throw new Error('Goal is not available to you');
}

export async function createTodoAction(input: TodoInput) {
  const { supabase, user } = await requireInternalUser();
  await ensureGoalVisible(supabase, input.goalId);

  const { data, error } = await supabase
    .from('work_todos')
    .insert({
      owner_id: user.id,
      title: requireText(input.title, 'Todo title'),
      notes: optionalText(input.notes),
      priority: input.priority ?? 'normal',
      scheduled_for: input.scheduledFor ?? null,
      due_at: input.dueAt ?? null,
      goal_id: input.goalId ?? null,
      status: 'open',
    })
    .select('*')
    .single();

  assertNoError(error, 'Unable to create Todo');
  refreshWorkPaths();
  return data;
}

export async function updateTodoAction(todoId: string, input: TodoInput) {
  const { supabase, user } = await requireInternalUser();
  await ensureGoalVisible(supabase, input.goalId);

  const { data, error } = await supabase
    .from('work_todos')
    .update({
      title: requireText(input.title, 'Todo title'),
      notes: optionalText(input.notes),
      priority: input.priority ?? 'normal',
      scheduled_for: input.scheduledFor ?? null,
      due_at: input.dueAt ?? null,
      goal_id: input.goalId ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', todoId)
    .eq('owner_id', user.id)
    .select('*')
    .single();

  assertNoError(error, 'Unable to update Todo');
  refreshWorkPaths();
  return data;
}

export async function completeTodoAction(todoId: string, completed = true) {
  const { supabase, user } = await requireInternalUser();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('work_todos')
    .update({
      status: completed ? 'completed' : 'open',
      completed_at: completed ? now : null,
      updated_at: now,
    })
    .eq('id', todoId)
    .eq('owner_id', user.id)
    .select('*')
    .single();

  assertNoError(error, 'Unable to update Todo completion');
  refreshWorkPaths();
  return data;
}

export async function deleteTodoAction(todoId: string) {
  const { supabase, user } = await requireInternalUser();
  const { error } = await supabase
    .from('work_todos')
    .delete()
    .eq('id', todoId)
    .eq('owner_id', user.id);

  assertNoError(error, 'Unable to delete Todo');
  refreshWorkPaths();
}

export async function createTaskAction(input: TaskInput) {
  const { supabase } = await requireInternalUser();
  const { data, error } = await supabase.rpc('work_create_task', {
    p_title: requireText(input.title, 'Task title'),
    p_description: optionalText(input.description),
    p_assignee_id: input.assigneeId,
    p_requested_start_at: input.requestedStartAt,
    p_requested_due_at: input.requestedDueAt,
    p_priority: input.priority ?? 'normal',
    p_source_todo_id: input.sourceTodoId ?? null,
    p_goal_id: input.goalId ?? null,
  });

  assertNoError(error, 'Unable to assign Task');
  refreshWorkPaths();
  return data as string;
}

export async function createBroadcastTaskAction(input: BroadcastTaskInput) {
  const { supabase } = await requireInternalUser();
  const { data, error } = await supabase.rpc('work_create_broadcast_task', {
    p_title: requireText(input.title, 'Task title'),
    p_description: optionalText(input.description),
    p_requested_start_at: input.requestedStartAt,
    p_requested_due_at: input.requestedDueAt,
    p_priority: input.priority ?? 'normal',
    p_goal_id: input.goalId ?? null,
  });

  assertNoError(error, 'Unable to assign Task to everyone');
  refreshWorkPaths();
  return data as string;
}

export async function acceptTaskAction(assignmentId: string) {
  const { supabase } = await requireInternalUser();
  const { error } = await supabase.rpc('work_accept_task', { p_assignment_id: assignmentId });
  assertNoError(error, 'Unable to accept Task');
  refreshWorkPaths();
}

export async function rejectTaskAction(
  assignmentId: string,
  reasonCode: RejectionReasonCode,
  note: string,
) {
  const { supabase } = await requireInternalUser();
  const { error } = await supabase.rpc('work_reject_task', {
    p_assignment_id: assignmentId,
    p_reason_code: reasonCode,
    p_note: requireText(note, 'Rejection explanation'),
  });
  assertNoError(error, 'Unable to return Task');
  refreshWorkPaths();
}

export async function requestExtensionAction(
  assignmentId: string,
  proposedDueAt: string,
  reason: string,
) {
  const { supabase } = await requireInternalUser();
  const { data, error } = await supabase.rpc('work_request_extension', {
    p_assignment_id: assignmentId,
    p_proposed_due_at: proposedDueAt,
    p_reason: requireText(reason, 'Extension reason'),
  });
  assertNoError(error, 'Unable to request more time');
  refreshWorkPaths();
  return data as string;
}

export async function decideExtensionAction(
  requestId: string,
  decision: 'approved' | 'declined',
  note?: string | null,
) {
  const { supabase } = await requireInternalUser();
  const { error } = await supabase.rpc('work_decide_extension', {
    p_request_id: requestId,
    p_decision: decision,
    p_note: optionalText(note),
  });
  assertNoError(error, 'Unable to decide extension request');
  refreshWorkPaths();
}

export async function completeTaskAction(assignmentId: string, completionNote: string) {
  const { supabase } = await requireInternalUser();
  const { error } = await supabase.rpc('work_complete_task', {
    p_assignment_id: assignmentId,
    p_completion_note: requireText(completionNote, 'Completion note'),
  });
  assertNoError(error, 'Unable to complete Task');
  refreshWorkPaths();
}

export async function reassignReturnedTaskAction(input: {
  assignmentId: string;
  newAssigneeId: string;
  requestedStartAt: string;
  requestedDueAt: string;
  priority: WorkPriority;
  note?: string | null;
}) {
  const { supabase } = await requireInternalUser();
  const { data, error } = await supabase.rpc('work_reassign_returned_task', {
    p_assignment_id: input.assignmentId,
    p_new_assignee_id: input.newAssigneeId,
    p_requested_start_at: input.requestedStartAt,
    p_requested_due_at: input.requestedDueAt,
    p_priority: input.priority,
    p_note: optionalText(input.note),
  });
  assertNoError(error, 'Unable to reassign Task');
  refreshWorkPaths();
  return data as string;
}

export async function cancelTaskAssignmentAction(assignmentId: string, reason: string) {
  const { supabase } = await requireInternalUser();
  const { error } = await supabase.rpc('work_cancel_assignment', {
    p_assignment_id: assignmentId,
    p_reason: requireText(reason, 'Cancellation reason'),
  });
  assertNoError(error, 'Unable to cancel Task');
  refreshWorkPaths();
}

export async function createGoalAction(input: GoalInput) {
  const { supabase } = await requireInternalUser();
  const { data, error } = await supabase.rpc('work_create_goal', {
    p_title: requireText(input.title, 'Goal title'),
    p_description: optionalText(input.description),
    p_visibility: input.visibility,
    p_progress_mode: input.progressMode,
    p_start_at: input.startAt ?? null,
    p_target_at: input.targetAt ?? null,
    p_target_value: input.targetValue ?? null,
    p_unit: optionalText(input.unit),
  });
  assertNoError(error, 'Unable to create Goal');
  refreshWorkPaths();
  return data as string;
}

export async function updateGoalAction(input: GoalUpdateInput) {
  const { supabase } = await requireInternalUser();
  const { error } = await supabase.rpc('work_update_goal', {
    p_goal_id: input.goalId,
    p_title: requireText(input.title, 'Goal title'),
    p_description: optionalText(input.description),
    p_visibility: input.visibility,
    p_start_at: input.startAt ?? null,
    p_target_at: input.targetAt ?? null,
    p_status: input.status,
  });
  assertNoError(error, 'Unable to update Goal');
  refreshWorkPaths();
}

export async function setGoalContributorsAction(goalId: string, userIds: string[]) {
  const { supabase } = await requireInternalUser();
  const { error } = await supabase.rpc('work_set_goal_contributors', {
    p_goal_id: goalId,
    p_user_ids: userIds,
  });
  assertNoError(error, 'Unable to update Goal contributors');
  refreshWorkPaths();
}

export async function updateNumericGoalProgressAction(goalId: string, currentValue: number) {
  const { supabase } = await requireInternalUser();
  const { error } = await supabase.rpc('work_update_numeric_goal_progress', {
    p_goal_id: goalId,
    p_current_value: currentValue,
  });
  assertNoError(error, 'Unable to update Goal progress');
  refreshWorkPaths();
}
