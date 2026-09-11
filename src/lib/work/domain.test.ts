import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canManageCompanyGoal,
  canReadTask,
  canShowTodoToUser,
  isDueSoonAssignment,
  isOverdueAssignment,
} from './domain.ts';

const now = new Date('2026-09-11T10:00:00.000Z');

test('pending acceptance and extension negotiation never count as overdue', () => {
  assert.equal(
    isOverdueAssignment(
      { status: 'pending_acceptance', agreedDueAt: '2026-09-11T09:00:00.000Z', completedAt: null },
      now,
    ),
    false,
  );

  assert.equal(
    isOverdueAssignment(
      { status: 'extension_pending', agreedDueAt: '2026-09-11T09:00:00.000Z', completedAt: null },
      now,
    ),
    false,
  );
});

test('only active assignments past their agreed deadline are overdue', () => {
  assert.equal(
    isOverdueAssignment(
      { status: 'active', agreedDueAt: '2026-09-11T09:59:59.000Z', completedAt: null },
      now,
    ),
    true,
  );

  assert.equal(
    isOverdueAssignment(
      { status: 'active', agreedDueAt: '2026-09-11T10:00:01.000Z', completedAt: null },
      now,
    ),
    false,
  );
});

test('active assignments due within the next 24 hours are due soon', () => {
  assert.equal(
    isDueSoonAssignment(
      { status: 'active', agreedDueAt: '2026-09-12T09:59:59.000Z', completedAt: null },
      now,
    ),
    true,
  );

  assert.equal(
    isDueSoonAssignment(
      { status: 'active', agreedDueAt: '2026-09-12T10:00:01.000Z', completedAt: null },
      now,
    ),
    false,
  );
});

test('completed assignments are never overdue or due soon', () => {
  const completed = {
    status: 'completed' as const,
    agreedDueAt: '2026-09-11T09:00:00.000Z',
    completedAt: '2026-09-11T08:30:00.000Z',
  };

  assert.equal(isOverdueAssignment(completed, now), false);
  assert.equal(isDueSoonAssignment(completed, now), false);
});

test('personal todos are visible only to their owner, including against admin users', () => {
  assert.equal(canShowTodoToUser('user-grace', 'user-grace'), true);
  assert.equal(canShowTodoToUser('user-grace', 'user-emmanuel'), false);
});

test('task visibility is limited to creator, assignee, or admin', () => {
  const task = {
    createdBy: 'user-grace',
    assigneeIds: ['user-quddus'],
  };

  assert.equal(canReadTask(task, 'user-grace', 'marketing_manager'), true);
  assert.equal(canReadTask(task, 'user-quddus', 'growth_lead'), true);
  assert.equal(canReadTask(task, 'user-success', 'operations_lead'), false);
  assert.equal(canReadTask(task, 'user-emmanuel', 'super_admin'), true);
  assert.equal(canReadTask(task, 'legacy-admin', 'admin'), true);
});

test('company goals can only be managed by admin and super admin', () => {
  assert.equal(canManageCompanyGoal('super_admin'), true);
  assert.equal(canManageCompanyGoal('admin'), true);
  assert.equal(canManageCompanyGoal('growth_lead'), false);
  assert.equal(canManageCompanyGoal('marketing_manager'), false);
  assert.equal(canManageCompanyGoal('operations_lead'), false);
  assert.equal(canManageCompanyGoal('front_desk'), false);
  assert.equal(canManageCompanyGoal('technician'), false);
  assert.equal(canManageCompanyGoal('sales_analyst'), false);
  assert.equal(canManageCompanyGoal('ambassador'), false);
});
