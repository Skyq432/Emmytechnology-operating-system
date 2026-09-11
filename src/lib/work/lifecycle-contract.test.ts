import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../../../supabase/migrations/20260911114500_work_task_lifecycle_rpcs.sql', import.meta.url),
  'utf8',
);

const functions = [
  'work_create_task',
  'work_create_broadcast_task',
  'work_accept_task',
  'work_reject_task',
  'work_request_extension',
  'work_decide_extension',
  'work_complete_task',
  'work_reassign_returned_task',
  'work_cancel_assignment',
];

test('all lifecycle RPCs exist and use auth.uid for the acting user', () => {
  for (const name of functions) {
    assert.match(migration, new RegExp(`create or replace function public\\.${name}`, 'i'));
  }
  const authUidMatches = migration.match(/auth\.uid\(\)/gi) ?? [];
  assert.ok(authUidMatches.length >= functions.length);
});

test('private event writer is not executable by ordinary client roles', () => {
  assert.match(migration, /create or replace function public\.work_append_task_event/i);
  assert.match(migration, /revoke all on function public\.work_append_task_event[\s\S]*from public, anon, authenticated/i);
});

test('broadcast creation is restricted to admin and super admin', () => {
  const start = migration.indexOf('create or replace function public.work_create_broadcast_task');
  assert.notEqual(start, -1);
  const fragment = migration.slice(start, start + 6500);
  assert.match(fragment, /work_is_admin\(auth\.uid\(\)\)/i);
});

test('extension decisions require assigner, creator, or admin authority', () => {
  const start = migration.indexOf('create or replace function public.work_decide_extension');
  assert.notEqual(start, -1);
  const fragment = migration.slice(start, start + 7000);
  assert.match(fragment, /assigned_by\s*<>\s*v_actor/i);
  assert.match(fragment, /created_by\s*<>\s*v_actor/i);
  assert.match(fragment, /work_is_admin\(v_actor\)/i);
});

test('completion requires a non-empty completion note', () => {
  const start = migration.indexOf('create or replace function public.work_complete_task');
  assert.notEqual(start, -1);
  const fragment = migration.slice(start, start + 4500);
  assert.match(fragment, /length\(trim\(coalesce\(p_completion_note, ''\)\)\)\s*=\s*0/i);
});

test('rejection supports only the approved reason codes and requires explanation', () => {
  const start = migration.indexOf('create or replace function public.work_reject_task');
  assert.notEqual(start, -1);
  const fragment = migration.slice(start, start + 5000);
  for (const value of ['outside_authority','wrong_assignee','insufficient_information','workload_unavailable','outside_skill','other']) {
    assert.match(fragment, new RegExp(`'${value}'`));
  }
  assert.match(fragment, /length\(trim\(coalesce\(p_note, ''\)\)\)\s*=\s*0/i);
});
