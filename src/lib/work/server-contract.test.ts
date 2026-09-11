import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const server = readFileSync(new URL('./server.ts', import.meta.url), 'utf8');

const functions = [
  'getMyWorkDashboard',
  'getMyTodos',
  'getMyTasks',
  'getTaskDetail',
  'getMyGoals',
  'getTeamWorkSummary',
  'listAssignableStaff',
];

test('server data layer exposes the approved work loaders', () => {
  for (const name of functions) {
    assert.match(server, new RegExp(`export async function ${name}\\b`));
  }
});

test('work loaders use requireInternalUser and keep the authenticated RLS client', () => {
  assert.match(server, /requireInternalUser/);
  assert.doesNotMatch(server, /supabase-admin|service_role|createAdminClient/i);
  const calls = server.match(/await requireInternalUser\(\)/g) ?? [];
  assert.ok(calls.length >= 7);
});

test('private Todo loaders always scope to the current user', () => {
  const start = server.indexOf('export async function getMyTodos');
  assert.notEqual(start, -1);
  const fragment = server.slice(start, start + 2200);
  assert.match(fragment, /from\('work_todos'\)/);
  assert.match(fragment, /\.eq\('owner_id', user\.id\)/);
});

test('dashboard summary contains the required attention counters', () => {
  const start = server.indexOf('export async function getMyWorkDashboard');
  assert.notEqual(start, -1);
  const fragment = server.slice(start, start + 6500);
  for (const key of [
    'pendingAcceptanceCount',
    'extensionDecisionCount',
    'dueTodayCount',
    'overdueCount',
    'todayTodoCount',
    'nextTask',
    'goalHighlight',
  ]) {
    assert.match(fragment, new RegExp(key));
  }
});

test('team summary is admin-only and never queries private Todos', () => {
  const start = server.indexOf('export async function getTeamWorkSummary');
  assert.notEqual(start, -1);
  const end = server.indexOf('export async function', start + 40);
  const fragment = server.slice(start, end === -1 ? undefined : end);
  assert.match(fragment, /role !== 'admin' && role !== 'super_admin'/);
  assert.doesNotMatch(fragment, /work_todos/);
});

test('assignable staff list is restricted to internal EmmyTech roles', () => {
  const start = server.indexOf('export async function listAssignableStaff');
  assert.notEqual(start, -1);
  const fragment = server.slice(start, start + 1800);
  assert.match(fragment, /INTERNAL_ROLES/);
  assert.match(fragment, /\.in\('role'/);
});
