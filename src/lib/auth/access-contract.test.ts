import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const source = (relative: string) => readFileSync(path.join(root, relative), 'utf8');

test('login accepts centralized internal roles instead of literal admin only', () => {
  const login = source('src/app/auth/login/page.tsx');
  assert.match(login, /isInternalRole\(profile\?\.role\)/);
  assert.doesNotMatch(login, /profile\?\.role\s*!==\s*['"]admin['"]/);
});

test('home requires an internal user and dispatches to a role-specific home', () => {
  const home = source('src/app/(staff)/page.tsx');
  assert.match(home, /requireInternalUser\(/);
  assert.match(home, /role=\{role\}/);
  assert.doesNotMatch(home, /profile\?\.role\s*!==\s*['"]admin['"]/);
});

test('AppShell filters primary navigation with the centralized module policy', () => {
  const shell = source('src/components/os/app-shell.tsx');
  assert.match(shell, /accessibleModules\(role\)/);
  assert.match(shell, /roleLabel\(role\)/);
});

test('dynamic module route enforces server-side module access', () => {
  const modulePage = source('src/app/(staff)/modules/[slug]/page.tsx');
  assert.match(modulePage, /requireModuleAccess\(/);
});
