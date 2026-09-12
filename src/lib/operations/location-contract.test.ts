import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const migrationPath = path.join(root, 'supabase/migrations/20260912060000_staff_default_branch_and_transaction_location.sql');

test('staff branch migration exists', () => {
  assert.equal(existsSync(migrationPath), true, 'staff branch migration must be committed before it is applied live');
});

test('staff branch is assigned from existing Operations locations and snapshotted on customer transactions', () => {
  const sql = readFileSync(migrationPath, 'utf8');
  assert.match(sql, /users[\s\S]*default_location_id/i);
  assert.match(sql, /references\s+public\.ops_locations\s*\(id\)/i);
  assert.match(sql, /ops_orders[\s\S]*branch_location_id/i);
  assert.match(sql, /ops_repairs[\s\S]*branch_location_id/i);
  assert.match(sql, /handled_by_user_id/i);
  assert.match(sql, /handled_by_name/i);
});

test('ordinary staff transactions require a default branch while service/system inserts remain possible', () => {
  const sql = readFileSync(migrationPath, 'utf8');
  assert.match(sql, /staff transaction requires an assigned default branch/i);
  assert.match(sql, /auth\.uid\(\)/i);
  assert.match(sql, /before insert/i);
  assert.match(sql, /ops_orders/i);
  assert.match(sql, /ops_repairs/i);
});

test('branch assignment is admin controlled and transaction override is restricted and audited', () => {
  const sql = readFileSync(migrationPath, 'utf8');
  assert.match(sql, /set_staff_default_location/i);
  assert.match(sql, /super_admin|admin/i);
  assert.match(sql, /ops_override_transaction_branch/i);
  assert.match(sql, /operations_lead/i);
  assert.match(sql, /override reason is required/i);
  assert.match(sql, /branch_location_overridden_by/i);
  assert.match(sql, /branch_location_override_reason/i);
  assert.match(sql, /branch_location_overridden_at/i);
});
