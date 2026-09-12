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
  'src/lib/operations/identity-server.ts',
  'src/lib/operations/sales-server.ts',
  'src/lib/operations/reporting-server.ts',
  'src/lib/operations/attribution-server.ts',
];

test('core Operations server modules no longer block every non-admin role', () => {
  for (const file of operationsGuardFiles) {
    const code = source(file);
    assert.doesNotMatch(code, /profile\?\.role\s*!==\s*['"]admin['"]/, `${file} still hardcodes admin-only access.`);
    assert.match(code, /requireStaffCapability/, `${file} should use the central staff capability guard.`);
  }
});

test('customer lookup keeps cash-off visibility narrower than customer visibility', () => {
  const code = source('src/lib/operations/identity-server.ts');
  assert.match(code, /requireStaffCapability\(['"]sales\.read['"]\)/, 'Customer lookup should require sales.read.');
  assert.match(code, /hasCapability\(role,\s*['"]sales\.payment\.record['"]\)/, 'Cash-off balance should require payment capability.');
});

test('Sales actor supports internal staff while reserving admin authority for admin roles', () => {
  const code = source('src/lib/sales/server.ts');
  assert.match(code, /hasCapability\(profile\.role,\s*['"]sales\.read['"]\)/, 'Sales should require the centralized sales.read capability.');
  assert.match(code, /profile\.role\s*===\s*['"]super_admin['"]\s*\|\|\s*profile\.role\s*===\s*['"]admin['"]/, 'Only super_admin/admin should receive Sales admin authority.');
  assert.match(code, /salesProfile\?\.authority_level[\s\S]{0,120}\|\|\s*['"]salesperson['"]/, 'Internal staff should have a safe baseline salesperson authority when no profile exists.');
});

test('pricing exceptions are protected at the database security boundary', () => {
  const code = source('supabase/migrations/20260911093234_protect_pricing_exceptions_20260911.sql');
  assert.match(code, /sales\.pricing\.admin/, 'Pricing exception migration must require the pricing-admin capability.');
  assert.match(code, /sales_create_direct_sale_draft/, 'Direct Sale pricing exceptions must be hardened.');
  assert.match(code, /sales_create_order_draft/, 'Sales Order pricing exceptions must be hardened.');
  assert.match(code, /sales_publish_quotation_version/, 'Quotation pricing exceptions must be hardened.');
});

test('technician repair edits go through the narrow field-specific RPC', () => {
  const server = source('src/lib/operations/repair-server.ts');
  const migration = source('supabase/migrations/20260911093735_repair_technical_write_boundary_20260911.sql');
  assert.match(server, /\.rpc\(['"]ops_update_repair_work_details['"]/, 'Repair work edits must use the scoped RPC.');
  assert.match(migration, /drop policy if exists "technical staff update repair work"/, 'Generic technician UPDATE policy must be removed.');
});
