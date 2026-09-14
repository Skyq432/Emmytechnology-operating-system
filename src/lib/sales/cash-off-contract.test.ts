import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const migrationsDir = path.join(root, 'supabase/migrations');

function loadMigration() {
  const file = readdirSync(migrationsDir).find((name) => name.endsWith('_commercial_cash_off_redemption_20260912.sql'));
  assert.ok(file, 'commercial Cash-Off migration must be committed before it is applied live');
  return readFileSync(path.join(migrationsDir, file), 'utf8');
}

function extractFunction(sql: string, functionName: string) {
  const pattern = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+public\\.${functionName}\\b[\\s\\S]*?\\$\\$;`,
    'i',
  );
  const match = sql.match(pattern);
  assert.ok(match, `${functionName} must exist in the Cash-Off migration`);
  return match[0];
}

test('commercial Cash-Off migration supports Direct Sale, Order and Repair redemption', () => {
  const sql = loadMigration();
  assert.match(sql, /commercial_set_draft_cash_off/i);
  assert.match(sql, /ops_confirm_order/i);
  assert.match(sql, /sales_confirm_direct_sale/i);
  assert.match(sql, /ops_apply_repair_cash_off/i);
  assert.match(sql, /ops_repairs[\s\S]*cash_off_amount/i);
});

test('order confirmation rechecks balance and debits Cash-Off atomically with an idempotent order reference', () => {
  const sql = loadMigration();
  assert.match(sql, /order_redemption:/i);
  assert.match(sql, /cash_off_apply_transaction/i);
  assert.match(sql, /Insufficient Cash Off balance/i);
  assert.match(sql, /cash_off_amount/i);
  assert.match(sql, /commercial_state\s*<>\s*'draft'|commercial_state<>'draft'/i);
});

test('repair Cash-Off requires an approved quote and contributes to settlement without becoming a cash payment', () => {
  const sql = loadMigration();
  const repairCashOffFunction = extractFunction(sql, 'ops_apply_repair_cash_off');
  assert.match(repairCashOffFunction, /current repair quote must be approved/i);
  assert.match(repairCashOffFunction, /repair_redemption:/i);
  assert.match(repairCashOffFunction, /cash_off_amount/i);
  assert.match(repairCashOffFunction, /amount_paid[\s\S]*cash_off_amount|cash_off_amount[\s\S]*amount_paid/i);
  assert.doesNotMatch(repairCashOffFunction, /insert\s+into\s+public\.ops_repair_payments/i);
});

test('cancellation reverses only a real prior redemption through a compensating Cash-Off ledger entry', () => {
  const sql = loadMigration();
  assert.match(sql, /order_refund:/i);
  assert.match(sql, /repair_refund:/i);
  assert.match(sql, /transaction_type\s*=\s*'order_redemption'|transaction_type='order_redemption'/i);
  assert.match(sql, /credit_cash_off|cash_off_apply_transaction/i);
  assert.match(sql, /after update of status/i);
});

test('low-level wallet functions are not granted as generic staff controls by this migration', () => {
  const sql = loadMigration();
  assert.doesNotMatch(sql, /grant execute on function public\.debit_cash_off[\s\S]*authenticated/i);
  assert.doesNotMatch(sql, /grant execute on function public\.cash_off_apply_transaction[\s\S]*authenticated/i);
});
