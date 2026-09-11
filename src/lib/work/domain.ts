import type { AssignmentDeadlineState, TaskVisibilityState, WorkRole } from './types.ts';

const ADMIN_ROLES: readonly WorkRole[] = ['admin', 'super_admin'];

export function isOverdueAssignment(
  assignment: AssignmentDeadlineState,
  now: Date = new Date(),
): boolean {
  if (assignment.status !== 'active' || assignment.completedAt || !assignment.agreedDueAt) {
    return false;
  }

  return new Date(assignment.agreedDueAt).getTime() < now.getTime();
}

export function isDueSoonAssignment(
  assignment: AssignmentDeadlineState,
  now: Date = new Date(),
  dueSoonWindowMs: number = 24 * 60 * 60 * 1000,
): boolean {
  if (assignment.status !== 'active' || assignment.completedAt || !assignment.agreedDueAt) {
    return false;
  }

  const dueAt = new Date(assignment.agreedDueAt).getTime();
  const current = now.getTime();

  return dueAt >= current && dueAt <= current + dueSoonWindowMs;
}

export function canShowTodoToUser(ownerId: string, viewerId: string): boolean {
  return ownerId === viewerId;
}

export function canReadTask(
  task: TaskVisibilityState,
  viewerId: string,
  viewerRole: WorkRole,
): boolean {
  if (ADMIN_ROLES.includes(viewerRole)) return true;
  if (task.createdBy === viewerId) return true;
  return task.assigneeIds.includes(viewerId);
}

export function canManageCompanyGoal(role: WorkRole): boolean {
  return ADMIN_ROLES.includes(role);
}
