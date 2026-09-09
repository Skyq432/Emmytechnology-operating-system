// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ORDER_ITEM_TYPES,
  calculateBalanceDue,
  calculateRepairProfit,
  derivePaymentStatus,
  getRelevantSpecFields,
} from './sales-model.ts';

test('workbook sales categories are normalized into shared order item types', () => {
  assert.deepEqual(ORDER_ITEM_TYPES, ['laptop', 'phone', 'accessory', 'solar', 'other']);
});

test('laptop and phone expose different workbook-aligned specification fields', () => {
  const laptop = getRelevantSpecFields('laptop');
  const phone = getRelevantSpecFields('phone');

  assert.ok(laptop.includes('processor_type'));
  assert.ok(laptop.includes('storage_type'));
  assert.ok(laptop.includes('charger_included'));
  assert.ok(!laptop.includes('network_type'));

  assert.ok(phone.includes('network_type'));
  assert.ok(phone.includes('sim_type'));
  assert.ok(phone.includes('accessories_included'));
  assert.ok(!phone.includes('processor_type'));
});

test('solar and accessory fields stay focused instead of copying device fields', () => {
  assert.deepEqual(getRelevantSpecFields('accessory'), [
    'category', 'subcategory', 'compatible_with', 'colour',
  ]);
  assert.deepEqual(getRelevantSpecFields('solar'), [
    'system_capacity', 'brand', 'model_spec',
  ]);
});

test('payment status and balance derive from total and active payments', () => {
  assert.equal(calculateBalanceDue(400000, 0), 400000);
  assert.equal(derivePaymentStatus(400000, 0), 'unpaid');
  assert.equal(calculateBalanceDue(400000, 100000), 300000);
  assert.equal(derivePaymentStatus(400000, 100000), 'partial');
  assert.equal(calculateBalanceDue(400000, 400000), 0);
  assert.equal(derivePaymentStatus(400000, 400000), 'paid');
  assert.equal(calculateBalanceDue(400000, 450000), 0);
  assert.equal(derivePaymentStatus(400000, 450000), 'paid');
});

test('repair profit matches the workbook commercial model', () => {
  assert.equal(calculateRepairProfit({ amountCharged: 30000, partsCost: 15000, labourCost: 5000 }), 10000);
  assert.equal(calculateRepairProfit({ amountCharged: 5000, partsCost: 1500, labourCost: 1000 }), 2500);
});
