import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

function read(path: URL) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

const detailPageUrl = new URL('../../app/modules/activities/tasks/[taskId]/page.tsx', import.meta.url);
const detailComponentUrl = new URL('../../components/work/task-detail.tsx', import.meta.url);
const workspaceUrl = new URL('../../components/work/my-work-workspace.tsx', import.meta.url);
const dashboardUrl = new URL('../../components/os/ambassador-style-dashboard.tsx', import.meta.url);
const notificationCenterUrl = new URL('../../components/work/work-notification-center.tsx', import.meta.url);
const notificationMigrationUrl = new URL('../../../supabase/migrations/20260911123000_work_notifications.sql', import.meta.url);

const detailPage = read(detailPageUrl);
const detailComponent = read(detailComponentUrl);
const workspace = read(workspaceUrl);
const dashboard = read(dashboardUrl);
const notificationCenter = read(notificationCenterUrl);
const notificationMigration = read(notificationMigrationUrl);

test('Task detail route exposes immutable history to permitted participants', () => {
  assert.equal(existsSync(detailPageUrl), true, 'Task detail route must exist');
  assert.equal(existsSync(detailComponentUrl), true, 'Task detail component must exist');
  assert.match(detailPage, /getTaskDetail/i);
  assert.match(detailPage, /TaskDetail/i);
  assert.match(detailComponent, /Task history/i);
  assert.match(detailComponent, /task_created|task_assigned/i);
  assert.match(workspace, /View details/i);
  assert.match(workspace, /\/modules\/activities\/tasks\//i);
});

test('Returned Tasks can be reassigned with a new timeframe or cancelled by the assigner', () => {
  assert.match(workspace, /reassignReturnedTaskAction/i);
  assert.match(workspace, /cancelTaskAssignmentAction/i);
  assert.match(workspace, /Reassign returned Task/i);
  assert.match(workspace, /Cancel assignment/i);
  assert.match(workspace, /New assignee/i);
  assert.match(workspace, /New start/i);
  assert.match(workspace, /New deadline/i);
  assert.match(workspace, /Cancellation reason/i);
});

test('Work notifications use a dedicated recipient-private RLS table and event trigger', () => {
  assert.equal(existsSync(notificationMigrationUrl), true, 'Work notification migration must exist');
  assert.match(notificationMigration, /create table public\.work_notifications/i);
  assert.match(notificationMigration, /recipient_id uuid not null references public\.users/i);
  assert.match(notificationMigration, /alter table public\.work_notifications enable row level security/i);
  assert.match(notificationMigration, /auth\.uid\(\)\s*=\s*recipient_id/i);
  assert.match(notificationMigration, /revoke all on public\.work_notifications from anon/i);
  assert.match(notificationMigration, /create trigger[\s\S]*work_task_events/i);
  assert.match(notificationMigration, /task_assigned/i);
  assert.match(notificationMigration, /extension_requested/i);
  assert.match(notificationMigration, /task_completed/i);
  assert.match(notificationMigration, /alter publication supabase_realtime add table public\.work_notifications/i);
});

test('Work notification bell is live, recipient-scoped, and opens Task detail', () => {
  assert.equal(existsSync(notificationCenterUrl), true, 'Work notification centre must exist');
  assert.match(notificationCenter, /work_notifications/i);
  assert.match(notificationCenter, /postgres_changes/i);
  assert.match(notificationCenter, /recipient_id=eq\./i);
  assert.match(notificationCenter, /Mark all read/i);
  assert.match(notificationCenter, /\/modules\/activities\/tasks\//i);
  assert.match(dashboard, /WorkNotificationCenter/i);
  assert.match(workspace, /WorkNotificationCenter/i);
});
