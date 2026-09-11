import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const source = (relativePath: string) => readFileSync(path.join(repoRoot, relativePath), 'utf8');

const operationsGuardFiles = [
  'src/lib/operations/server.ts',
  'src/lib/operations/inventory-server.ts',
  'src/lib/operations/transfer-server.ts',
  'src/lib/operations/repair-server.ts',
  'src/lib/operations/tracking-server.ts',
];

test('core Operations server modules no longer block every non-admin role', () => {
  for (const file of operationsGuardFiles) {
    const code = source(file);
    assert.doesNotMatch(code, /profile\?\.role\s*!==\s*['"]admin['"]/, `${file} still hardcodes admin-only access.`);
    assert.match(code, /requireStaffCapability/, `${file} should use the central staff capability guard.`);
  }
});

test('Sales actor supports internal staff while reserving admin authority for admin roles', () => {
  const code = source('src/lib/sales/server.ts');
  assert.match(code, /hasCapability\(profile\.role,\s*['"]sales\.read['"]\)/, 'Sales should require the centralized sales.read capability.');
  assert.match(code, /profile\.role\s*===\s*['"]super_admin['"]\s*\|\|\s*profile\.role\s*===\s*['"]admin['"]/, 'Only super_admin/admin should receive Sales admin authority.');
  assert.match(code, /authorityLevel:\s*['"]salesperson['"]/, 'Internal staff should have a safe baseline salesperson authority when no profile exists.');
});

test('pricing exceptions are protected at the database security boundary', () => {
  const code = source('supabase/migrations/20260911103500_protect_pricing_exceptions.sql');
  assert.match(code, /sales\.pricing\.admin/, 'Pricing exception migration must require the pricing-admin capability.');
  assert.match(code, /sales_create_direct_sale_draft/, 'Direct Sale pricing exceptions must be hardened.');
  assert.match(code, /sales_create_order_draft/, 'Sales Order pricing exceptions must be hardened.');
  assert.match(code, /sales_publish_quotation_version/, 'Quotation pricing exceptions must be hardened.');
});
