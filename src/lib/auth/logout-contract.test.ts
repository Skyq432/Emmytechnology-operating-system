import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const source = (relative: string) => readFileSync(path.join(root, relative), 'utf8');

const accountMenuPath = path.join(root, 'src/components/os/account-menu.tsx');

test('command centre exposes a real Supabase logout action', () => {
  assert.equal(existsSync(accountMenuPath), true, 'account menu component must exist');
  const accountMenu = source('src/components/os/account-menu.tsx');
  const dashboard = source('src/components/os/ambassador-style-dashboard.tsx');

  assert.match(accountMenu, /auth\.signOut\(\)/);
  assert.match(accountMenu, /router\.replace\(['"]\/auth\/login['"]\)/);
  assert.match(accountMenu, /Log out/i);
  assert.match(dashboard, /AccountMenu/);
});
