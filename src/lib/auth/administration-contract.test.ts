import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const pagePath = path.join(root, 'src/app/modules/administration/page.tsx');
const clientPath = path.join(root, 'src/components/administration/staff-admin.tsx');

test('Administration is a real guarded staff route', () => {
  assert.equal(existsSync(pagePath), true);
  const source = readFileSync(pagePath, 'utf8');
  assert.match(source, /requireModuleAccess\(['"]administration['"]\)/);
  assert.match(source, /StaffAdmin/);
});

test('Administration staff UI manages roles and role-bound invitations', () => {
  assert.equal(existsSync(clientPath), true);
  const source = readFileSync(clientPath, 'utf8');
  assert.match(source, /set_staff_role/);
  assert.match(source, /generate_invite_link_for_role/);
  assert.match(source, /p_max_uses\s*:\s*1/);
  assert.match(source, /p_expiry_days\s*:\s*7/);
  assert.match(source, /Copy Invite Link/);
});

test('Administration loads active store branches and allows admin-controlled staff branch assignment', () => {
  const page = readFileSync(pagePath, 'utf8');
  const client = readFileSync(clientPath, 'utf8');
  assert.match(page, /default_location_id/);
  assert.match(page, /ops_locations/);
  assert.match(page, /location_type['"]?,\s*['"]store|eq\(['"]location_type['"],\s*['"]store['"]\)/);
  assert.match(client, /Default branch/i);
  assert.match(client, /set_staff_default_location/);
  assert.match(client, /p_location_id/);
});
