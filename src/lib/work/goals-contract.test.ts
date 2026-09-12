import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../../../supabase/migrations/20260911101849_work_goals_20260911.sql', import.meta.url),
  'utf8',
);

test('goal RPCs exist for create, update, contributors and numeric progress', () => {
  for (const name of [
    'work_create_goal',
    'work_update_goal',
    'work_set_goal_contributors',
    'work_update_numeric_goal_progress',
    'work_get_goal_progress',
  ]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${name}`, 'i'));
  }
});

test('company goal creation is restricted to admin and super admin', () => {
  const start = migration.indexOf('create or replace function public.work_create_goal');
  assert.notEqual(start, -1);
  const fragment = migration.slice(start, start + 6500);
  assert.match(fragment, /p_visibility\s*=\s*'company'[\s\S]*work_is_admin\(v_actor\)/i);
});

test('contributors must be internal staff and personal goals cannot have shared contributors', () => {
  const start = migration.indexOf('create or replace function public.work_set_goal_contributors');
  assert.notEqual(start, -1);
  const fragment = migration.slice(start, start + 6500);
  assert.match(fragment, /visibility\s*=\s*'personal'/i);
  assert.match(fragment, /work_is_internal_user/i);
});

test('numeric progress only applies to numeric goals and requires goal management authority', () => {
  const start = migration.indexOf('create or replace function public.work_update_numeric_goal_progress');
  assert.notEqual(start, -1);
  const fragment = migration.slice(start, start + 5000);
  assert.match(fragment, /progress_mode\s*<>\s*'numeric'/i);
  assert.match(fragment, /owner_id\s*<>\s*v_actor/i);
  assert.match(fragment, /work_is_admin\(v_actor\)/i);
});

test('task-based progress is derived from linked task assignments and never from todo visibility', () => {
  const start = migration.indexOf('create or replace function public.work_get_goal_progress');
  assert.notEqual(start, -1);
  const fragment = migration.slice(start, start + 7000);
  assert.match(fragment, /work_task_assignments/i);
  assert.match(fragment, /work_tasks/i);
  assert.doesNotMatch(fragment, /work_todos/i);
});

test('personal goal contributor policy excludes admin override', () => {
  assert.match(migration, /drop policy if exists "goal owners manage contributors"/i);
  assert.match(migration, /g\.visibility in \('shared','company'\)[\s\S]*work_is_admin/i);
});
