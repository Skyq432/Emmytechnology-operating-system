// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REPAIR_STATUS_SEQUENCE,
  requiredBeforeRepairStart,
  canStartRepair,
  deriveRepairPaymentStatus,
  canBeginHandover,
  canCompleteRepairCollection,
} from './repair-domain.ts';

test('repair flow contains customer approval, quality check and rework', () => {
  assert.deepEqual(REPAIR_STATUS_SEQUENCE, [
    'received','diagnosing','awaiting_customer_approval','awaiting_payment',
    'awaiting_parts','in_progress','quality_check','ready_collection','rework','collected','cancelled',
  ]);
});

test('required-before-start follows none partial full rules', () => {
  assert.equal(requiredBeforeRepairStart('none', 45000, 0), 0);
  assert.equal(requiredBeforeRepairStart('partial', 45000, 20000), 20000);
  assert.equal(requiredBeforeRepairStart('full', 45000, 0), 45000);
});

test('repair cannot start until current quote is approved and payment gate is met', () => {
  assert.equal(canStartRepair({ quoteStatus: 'published', amountPaid: 45000, requiredBeforeStart: 0 }), false);
  assert.equal(canStartRepair({ quoteStatus: 'approved', amountPaid: 10000, requiredBeforeStart: 20000 }), false);
  assert.equal(canStartRepair({ quoteStatus: 'approved', amountPaid: 20000, requiredBeforeStart: 20000 }), true);
});

test('payment state derives from approved quote total', () => {
  assert.equal(deriveRepairPaymentStatus(45000, 0), 'unpaid');
  assert.equal(deriveRepairPaymentStatus(45000, 10000), 'partial');
  assert.equal(deriveRepairPaymentStatus(45000, 45000), 'paid');
});

test('handover requires ready collection and collection requires acceptance, zero balance and card resolution', () => {
  assert.equal(canBeginHandover('quality_check'), false);
  assert.equal(canBeginHandover('ready_collection'), true);
  assert.equal(canCompleteRepairCollection({ finalAccepted: true, balanceDue: 0, cardResolved: true }), true);
  assert.equal(canCompleteRepairCollection({ finalAccepted: false, balanceDue: 0, cardResolved: true }), false);
  assert.equal(canCompleteRepairCollection({ finalAccepted: true, balanceDue: 1000, cardResolved: true }), false);
});
