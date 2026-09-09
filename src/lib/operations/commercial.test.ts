// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateOrderTotals,
  canConfirmOrder,
  shouldAdvanceCrmToPurchase,
} from './commercial.ts';

test('draft orders can be confirmed but confirmed orders cannot be confirmed twice', () => {
  assert.equal(canConfirmOrder('draft'), true);
  assert.equal(canConfirmOrder('confirmed'), false);
});

test('order totals include discount, cash-off and delivery', () => {
  const totals = calculateOrderTotals({ subtotal: 450000, discountAmount: 20000, cashOffAmount: 1200, deliveryCharge: 3000 });
  assert.deepEqual(totals, { subtotal: 450000, discountAmount: 20000, cashOffAmount: 1200, deliveryCharge: 3000, totalAmount: 431800 });
});

test('order total never goes below zero', () => {
  const totals = calculateOrderTotals({ subtotal: 1000, discountAmount: 800, cashOffAmount: 500, deliveryCharge: 0 });
  assert.equal(totals.totalAmount, 0);
});

test('CRM only advances to Purchase when current stage is below 5', () => {
  assert.equal(shouldAdvanceCrmToPurchase(1), true);
  assert.equal(shouldAdvanceCrmToPurchase(4), true);
  assert.equal(shouldAdvanceCrmToPurchase(5), false);
  assert.equal(shouldAdvanceCrmToPurchase(8), false);
  assert.equal(shouldAdvanceCrmToPurchase(null), true);
});
