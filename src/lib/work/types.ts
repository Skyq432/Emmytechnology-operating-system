export type WorkPriority = 'low' | 'normal' | 'high' | 'urgent';

export type TaskAssignmentStatus =
  | 'pending_acceptance'
  | 'extension_pending'
  | 'active'
  | 'returned'
  | 'completed'
  | 'cancelled';

export type GoalVisibility = 'personal' | 'shared' | 'company';
export type GoalProgressMode = 'numeric' | 'tasks';

export type RejectionReasonCode =
  | 'outside_authority'
  | 'wrong_assignee'
  | 'insufficient_information'
  | 'workload_unavailable'
  | 'outside_skill'
  | 'other';

export type WorkRole =
  | 'super_admin'
  | 'admin'
  | 'growth_lead'
  | 'marketing_manager'
  | 'front_desk'
  | 'operations_lead'
  | 'technician'
  | 'sales_analyst'
  | 'ambassador';

export interface AssignmentDeadlineState {
  status: TaskAssignmentStatus;
  agreedDueAt: string | null;
  completedAt: string | null;
}

export interface TaskVisibilityState {
  createdBy: string;
  assigneeIds: readonly string[];
}
