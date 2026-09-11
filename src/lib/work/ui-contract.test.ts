import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('../../app/modules/activities/page.tsx', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../../components/work/my-work-workspace.tsx', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('../../components/os/ambassador-style-dashboard.tsx', import.meta.url), 'utf8');

test('activities is a real internal My Work route backed by all approved loaders', () => {
  assert.match(page, /requireInternalUser/);
  for (const loader of ['getMyWorkDashboard','getMyTodos','getMyTasks','getMyGoals','listAssignableStaff']) {
    assert.match(page, new RegExp(loader));
  }
  assert.match(page, /getTeamWorkSummary/);
  assert.match(page, /MyWorkWorkspace/);
});

test('My Work exposes Today Tasks Todo Goals and admin Team tabs', () => {
  for (const label of ['Today', 'Tasks', 'Todo', 'Goals', 'Team']) {
    assert.match(workspace, new RegExp(`['\"]${label}['\"]`));
  }
});

test('workspace contains the core task response actions', () => {
  for (const label of ['Accept', 'Request More Time', 'Reject', 'Mark Complete']) {
    assert.match(workspace, new RegExp(label));
  }
});

test('workspace supports quick Todo task delegation and goal creation', () => {
  assert.match(workspace, /Add Todo/);
  assert.match(workspace, /Delegate as Task/);
  assert.match(workspace, /New Task/);
  assert.match(workspace, /New Goal/);
});

test('Command Centre sidebar names the workspace My Work', () => {
  assert.match(dashboard, />My Work</);
  assert.doesNotMatch(dashboard, />My Tasks</);
});
