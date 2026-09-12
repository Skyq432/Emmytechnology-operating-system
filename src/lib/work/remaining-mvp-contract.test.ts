import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

function read(path: URL) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

const detailPageUrl = new URL('../../app/modules/activities/tasks/[taskId]/page.tsx', import.meta.url);
const detailComponentUrl = new URL('../../components/work/task-detail.tsx', import.meta.url);
const returnedControlsUrl = new URL('../../components/work/returned-task-controls.tsx', import.meta.url);
const activitiesPageUrl = new URL('../../app/modules/activities/page.tsx', import.meta.url);
const dashboardUrl = new URL('../../components/os/ambassador-style-dashboard.tsx', import.meta.url);
const notificationCenterUrl = new URL('../../components/work/work-notification-center.tsx', import.meta.url);
const notificationMigrationUrl = new URL('../../../supabase/migrations/20260911103901_work_notifications_20260911.sql', import.meta.url);
const notificationHardeningUrl = new URL('../../../supabase/migrations/20260911104349_work_notifications_harden_updates_20260911.sql', import.meta.url);

const detailPage = read(detailPageUrl);
const detailComponent = read(detailComponentUrl);
const returnedControls = read(returnedControlsUrl);
const activitiesPage = read(activitiesPageUrl);
const dashboard = read(dashboardUrl);
const notificationCenter = read(notificationCenterUrl);
const notificationMigration = read(notificationMigrationUrl);
const notificationHardening = read(notificationHardeningUrl);

test('Task detail route exposes immutable history to permitted participants', () => {
  assert.equal(existsSync(detailPageUrl), true, 'Task detail route must exist');
  assert.equal(existsSync(detailComponentUrl), true, 'Task detail component must exist');
  assert.match(detailPage, /requireInternalUser/i);
  assert.match(detailPage, /getTaskDetail/i);
  assert.match(detailPage, /TaskDetail/i);
  assert.match(detailComponent, /Task history/i);
  assert.match(detailComponent, /task_created|task_assigned/i);
  assert.match(notificationCenter, /\/modules\/activities\/tasks\//i);
});

test('Returned Tasks can be reassigned with a new timeframe or cancelled by the creator or admin', () => {
  assert.equal(existsSync(returnedControlsUrl), true, 'Returned Task controls must exist');
  assert.match(returnedControls, /reassignReturnedTaskAction/i);
  assert.match(returnedControls, /cancelTaskAssignmentAction/i);
  assert.match(returnedControls, /Reassign returned Task/i);
  assert.match(returnedControls, /Cancel assignment/i);
  assert.match(returnedControls, /New assignee/i);
  assert.match(returnedControls, /New start/i);
  assert.match(returnedControls, /New deadline/i);
  assert.match(returnedControls, /Cancellation reason/i);
  assert.match(detailComponent, /canManageReturned/i);
  assert.match(detailComponent, /task\.created_by\s*===\s*currentUserId\s*\|\|\s*isAdmin/i);
});

test('Work notifications use a dedicated recipient-private RLS table and lifecycle trigger', () => {
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
  assert.match(notificationHardening, /grant update \(is_read, read_at\)/i);
});

test('Work notification bell is live, recipient-scoped, and mounted on Command Centre and My Work', () => {
  assert.equal(existsSync(notificationCenterUrl), true, 'Work notification centre must exist');
  assert.match(notificationCenter, /work_notifications/i);
  assert.match(notificationCenter, /postgres_changes/i);
  assert.match(notificationCenter, /recipient_id=eq\./i);
  assert.match(notificationCenter, /Mark all read/i);
  assert.match(notificationCenter, /\/modules\/activities\/tasks\//i);
  assert.match(dashboard, /WorkNotificationCenter/i);
  assert.match(activitiesPage, /WorkNotificationCenter/i);
});
