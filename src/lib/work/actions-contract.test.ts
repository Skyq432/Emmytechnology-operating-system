import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const actions = readFileSync(
  new URL('../../app/modules/activities/actions.ts', import.meta.url),
  'utf8',
);

const actionNames = [
  'createTodoAction',
  'updateTodoAction',
  'completeTodoAction',
  'deleteTodoAction',
  'createTaskAction',
  'createBroadcastTaskAction',
  'acceptTaskAction',
  'rejectTaskAction',
  'requestExtensionAction',
  'decideExtensionAction',
  'completeTaskAction',
  'reassignReturnedTaskAction',
  'cancelTaskAssignmentAction',
  'createGoalAction',
  'updateGoalAction',
  'setGoalContributorsAction',
  'updateNumericGoalProgressAction',
];

test('activities exposes Todo, Task and Goal server actions', () => {
  for (const name of actionNames) {
    assert.match(actions, new RegExp(`export async function ${name}\\b`));
  }
});

test('mutations use the authenticated internal-user context, not a service role', () => {
  assert.match(actions, /requireInternalUser/);
  assert.doesNotMatch(actions, /supabase-admin|service_role|createAdminClient/i);
});

test('Todo CRUD explicitly scopes mutations to the current owner', () => {
  assert.match(actions, /from\('work_todos'\)/);
  assert.match(actions, /\.eq\('owner_id', user\.id\)/);
});

test('Task lifecycle actions call the narrow database RPCs', () => {
  for (const rpc of [
    'work_create_task',
    'work_create_broadcast_task',
    'work_accept_task',
    'work_reject_task',
    'work_request_extension',
    'work_decide_extension',
    'work_complete_task',
    'work_reassign_returned_task',
    'work_cancel_assignment',
  ]) {
    assert.match(actions, new RegExp(`rpc\\('${rpc}'`));
  }
});

test('all work mutations revalidate My Work and the Command Centre', () => {
  assert.match(actions, /revalidatePath\('\/modules\/activities'\)/);
  assert.match(actions, /revalidatePath\('\/'\)/);
  assert.match(actions, /function refreshWorkPaths/);
});
