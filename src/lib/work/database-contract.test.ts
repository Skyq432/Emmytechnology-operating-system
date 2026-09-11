import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../../../supabase/migrations/20260911113000_work_management_foundation.sql', import.meta.url),
  'utf8',
);

const tables = [
  'work_todos',
  'work_tasks',
  'work_task_assignments',
  'work_task_extension_requests',
  'work_task_events',
  'work_goals',
  'work_goal_contributors',
];

test('foundation creates all seven work management tables', () => {
  for (const table of tables) {
    assert.match(migration, new RegExp(`create table public\\.${table}`, 'i'));
  }
});

test('RLS is enabled on every work table', () => {
  for (const table of tables) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  }
});

test('domain constraints lock down priority, assignment status, goal visibility and progress modes', () => {
  for (const value of ['low', 'normal', 'high', 'urgent']) assert.match(migration, new RegExp(`'${value}'`));
  for (const value of ['pending_acceptance', 'extension_pending', 'active', 'returned', 'completed', 'cancelled']) {
    assert.match(migration, new RegExp(`'${value}'`));
  }
  for (const value of ['personal', 'shared', 'company']) assert.match(migration, new RegExp(`'${value}'`));
  for (const value of ['numeric', 'tasks']) assert.match(migration, new RegExp(`'${value}'`));
  for (const value of ['outside_authority', 'wrong_assignee', 'insufficient_information', 'workload_unavailable', 'outside_skill', 'other']) {
    assert.match(migration, new RegExp(`'${value}'`));
  }
});

test('todo privacy policy is owner-only and does not contain admin override', () => {
  const start = migration.indexOf('create policy "owners manage their todos"');
  assert.notEqual(start, -1);
  const fragment = migration.slice(start, start + 700);
  assert.match(fragment, /auth\.uid\(\) = owner_id/i);
  assert.doesNotMatch(fragment, /super_admin|admin/i);
});

test('task visibility supports creator, assignee and admin roles', () => {
  assert.match(migration, /work_can_read_task/i);
  assert.match(migration, /created_by = auth\.uid\(\)/i);
  assert.match(migration, /assignee_id = auth\.uid\(\)/i);
  assert.match(migration, /super_admin/i);
  assert.match(migration, /admin/i);
});
