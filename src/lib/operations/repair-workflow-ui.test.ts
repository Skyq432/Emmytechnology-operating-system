// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { getRepairWorkflowActions } from './repair-domain.ts';

test('diagnosing never offers awaiting parts directly', () => {
  const actions = getRepairWorkflowActions({
    status: 'diagnosing',
    quoteStatus: null,
    amountPaid: 0,
    requiredBeforeStart: 0,
  });
  assert.equal(actions.some((action) => action.status === 'awaiting_parts'), false);
});

test('diagnosing asks staff to publish a quote before moving forward', () => {
  const actions = getRepairWorkflowActions({
    status: 'diagnosing',
    quoteStatus: null,
    amountPaid: 0,
    requiredBeforeStart: 0,
  });
  assert.deepEqual(actions.map((action) => action.key), ['publish_quote', 'cancel']);
});

test('approved and sufficiently paid repair can start work', () => {
  const actions = getRepairWorkflowActions({
    status: 'awaiting_payment',
    quoteStatus: 'approved',
    amountPaid: 20000,
    requiredBeforeStart: 20000,
  });
  assert.equal(actions.some((action) => action.status === 'in_progress'), true);
});
