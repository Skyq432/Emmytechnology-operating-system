import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const route = readFileSync(path.join(root, 'src/app/api/marketing/spin-wheel/route.ts'), 'utf8');

test('Spin Wheel admin API uses centralized Marketing RBAC instead of legacy admin literal', () => {
  assert.match(route, /canAccessModule\(/);
  assert.match(route, /isInternalRole\(/);
  assert.doesNotMatch(route, /profile\?\.role\s*===\s*["']admin["']/);
});
