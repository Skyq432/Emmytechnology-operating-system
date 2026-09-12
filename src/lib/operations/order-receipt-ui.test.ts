import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const page = readFileSync(path.join(root, 'src/app/modules/operations/orders/[id]/page.tsx'), 'utf8');
const tracking = readFileSync(path.join(root, 'src/lib/operations/tracking-server.ts'), 'utf8');

test('normal Order detail loads authorised final receipt metadata', () => {
  assert.match(tracking, /from\(['"]sales_documents['"]\)/);
  assert.match(tracking, /final_sales_receipt/);
  assert.match(tracking, /order_id/);
});

test('normal Order detail exposes View Final Receipt through the existing document API', () => {
  assert.match(page, /View Final Receipt/);
  assert.match(page, /\/api\/sales\/documents\//);
  assert.match(page, /finalReceipt/);
});
