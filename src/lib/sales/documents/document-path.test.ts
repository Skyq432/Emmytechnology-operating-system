// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { documentStoragePath } from './document-path.ts';

test('document storage paths are private, stable and filename-safe', () => {
  assert.equal(
    documentStoragePath({ documentType: 'payment_receipt', documentNumber: 'RCT-P/2026 #1', issuedAt: '2026-08-31T05:00:00.000Z' }),
    '2026/payment_receipt/RCT-P_2026_1.pdf',
  );
});
