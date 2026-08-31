// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { SALES_NAV } from './navigation.ts';

test('Sales navigation exposes the approved commercial workspace in stable order', () => {
  assert.deepEqual(SALES_NAV.map((item) => item.label), [
    'Overview', 'Direct Sale', 'Quotations', 'Orders', 'Payments', 'Receipts',
    'Customers', 'Credit & Outstanding', 'Returns & Refunds', 'Sales Team', 'Reports', 'Settings',
  ]);
  assert.equal(SALES_NAV[0].href, '/modules/sales');
  assert.equal(SALES_NAV[1].href, '/modules/sales/direct');
});
