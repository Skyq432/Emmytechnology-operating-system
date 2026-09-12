import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const salesPage = readFileSync(path.join(root, 'src/app/modules/sales/page.tsx'), 'utf8');
const operationsPage = readFileSync(path.join(root, 'src/app/modules/operations/page.tsx'), 'utf8');

test('technician bypasses Sales Overview and lands on Direct Sale', () => {
  assert.match(salesPage, /role\s*===\s*['"]technician['"][\s\S]*redirect\(['"]\/modules\/sales\/direct['"]\)/);
});

test('technician bypasses Operations Overview and lands on Repairs', () => {
  assert.match(operationsPage, /role\s*===\s*['"]technician['"][\s\S]*redirect\(['"]\/modules\/operations\/repairs['"]\)/);
});
