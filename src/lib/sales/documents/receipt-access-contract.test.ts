import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const migrationsDir = path.join(root, 'supabase/migrations');
const servicePath = path.join(root, 'src/lib/sales/documents/document-service.ts');

function loadReceiptMigration() {
  const file = readdirSync(migrationsDir).find((name) => name.endsWith('_receipt_branch_cashoff_metadata_20260912.sql'));
  assert.ok(file, 'receipt metadata migration must be committed before it is applied live');
  return readFileSync(path.join(migrationsDir, file), 'utf8');
}

test('receipt storage remains private while server code uses an authorised backend storage path', () => {
  const service = readFileSync(servicePath, 'utf8');
  assert.match(service, /requireSalesActor|requireStaffCapability/);
  assert.match(service, /getSupabaseAdmin\(\)/);
  assert.match(service, /createSignedUrl/);
});

test('final receipt snapshots preserve staff branch gross Cash-Off and actual payment information', () => {
  const sql = loadReceiptMigration();
  for (const token of ['branch_location_id','branch_name','handled_by_user_id','handled_by_name','gross_amount','cash_off_amount','amount_payable','payments']) {
    assert.match(sql, new RegExp(token, 'i'), `receipt migration should snapshot ${token}`);
  }
  assert.match(sql, /sales_ensure_final_sales_receipt_metadata/i);
  assert.match(sql, /sales_ensure_final_repair_receipt_metadata/i);
});

test('repair final receipt settlement counts Cash-Off separately from cash payments', () => {
  const sql = loadReceiptMigration();
  assert.match(sql, /v_paid\s*\+\s*coalesce\(v_repair\.cash_off_amount/i);
  assert.match(sql, /cash_payment_total/i);
  assert.match(sql, /effective_paid/i);
});

test('zero-net confirmed orders can still queue a final receipt', () => {
  const sql = loadReceiptMigration();
  assert.match(sql, /after update of commercial_state/i);
  assert.match(sql, /(?:coalesce\(new\.total_amount\s*,\s*0\)|new\.total_amount)\s*<=\s*0/i);
  assert.match(sql, /sales_ensure_final_sales_receipt_metadata/i);
});
