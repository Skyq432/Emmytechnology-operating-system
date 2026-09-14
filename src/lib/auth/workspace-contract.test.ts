import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const source = (relative: string) => readFileSync(path.join(root, relative), 'utf8');

test('Marketing, Sales and Operations layouts use server-side module guards', () => {
  for (const [file, module] of [
    ['src/app/(staff)/modules/marketing/layout.tsx', 'marketing'],
    ['src/app/(staff)/modules/sales/layout.tsx', 'sales'],
    ['src/app/(staff)/modules/operations/layout.tsx', 'operations'],
  ] as const) {
    assert.match(source(file), new RegExp(`requireModuleAccess\\(['\"]${module}['\"]\\)`));
  }
});

test('Sales and Operations sections filter through the centralized policy', () => {
  // Sub-nav filtering moved out of each module's own layout and into the AppShell
  // sidebar's Sections segment, which builds its list from these same policy functions.
  const subNav = source('src/lib/os/sub-navigation.ts');
  assert.match(subNav, /salesNavKeys\(role\)/);
  assert.match(subNav, /operationsNavKeys\(role\)/);
});

test('AppShell shows a friendly role label from the centralized policy', () => {
  const shell = source('src/components/os/app-shell.tsx');
  assert.match(shell, /roleLabel\(role\)/);
  assert.match(shell, /accessibleModules\(role\)/);
});
