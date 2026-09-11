import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const source = (relative: string) => readFileSync(path.join(root, relative), 'utf8');

test('Marketing, Sales and Operations layouts use server-side module guards', () => {
  for (const [file, module] of [
    ['src/app/modules/marketing/layout.tsx', 'marketing'],
    ['src/app/modules/sales/layout.tsx', 'sales'],
    ['src/app/modules/operations/layout.tsx', 'operations'],
  ] as const) {
    assert.match(source(file), new RegExp(`requireModuleAccess\\(['\"]${module}['\"]\\)`));
  }
});

test('Sales and Operations shells filter their existing navigation through the centralized policy', () => {
  assert.match(source('src/components/sales/sales-shell.tsx'), /salesNavKeys\(role\)/);
  assert.match(source('src/components/operations/operations-shell.tsx'), /operationsNavKeys\(role\)/);
});

test('Marketing sidebar treats approved internal roles as staff and shows a friendly role label', () => {
  const sidebar = source('src/components/marketing/sidebar.tsx');
  assert.match(sidebar, /isInternalRole\(role\)/);
  assert.match(sidebar, /roleLabel\(role\)/);
});
