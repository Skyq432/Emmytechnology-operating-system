// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canTransitionOrderStatus,
  getOrderStatusLabel,
  getSkippedOrderStatuses,
  requiresStatusTransitionReason,
} from './domain.ts';

test('normal fulfilment flow moves forward one stage at a time', () => {
  assert.equal(canTransitionOrderStatus('new', 'confirmed'), true);
  assert.equal(canTransitionOrderStatus('confirmed', 'stock_check'), true);
  assert.equal(canTransitionOrderStatus('packing', 'ready_dispatch'), true);
  assert.equal(canTransitionOrderStatus('delivered', 'completed'), true);
});

test('admin fulfilment can move to any later normal stage', () => {
  assert.equal(canTransitionOrderStatus('new', 'delivered'), true);
  assert.equal(canTransitionOrderStatus('stock_check', 'ready_dispatch'), true);
});

test('forward jumps require a reason but single-step moves do not', () => {
  assert.equal(requiresStatusTransitionReason('new', 'confirmed'), false);
  assert.equal(requiresStatusTransitionReason('new', 'delivered'), true);
  assert.equal(requiresStatusTransitionReason('stock_check', 'ready_dispatch'), true);
});

test('skipped statuses are reported for the audit timeline', () => {
  assert.deepEqual(getSkippedOrderStatuses('new', 'delivered'), [
    'confirmed',
    'stock_check',
    'assigned',
    'picking',
    'packing',
    'ready_dispatch',
    'dispatched',
  ]);
  assert.deepEqual(getSkippedOrderStatuses('picking', 'packing'), []);
});

test('normal fulfilment flow cannot move backwards', () => {
  assert.equal(canTransitionOrderStatus('packing', 'picking'), false);
  assert.equal(canTransitionOrderStatus('dispatched', 'confirmed'), false);
});

test('active orders can be put on hold or cancelled', () => {
  assert.equal(canTransitionOrderStatus('assigned', 'on_hold'), true);
  assert.equal(canTransitionOrderStatus('picking', 'cancelled'), true);
});

test('held orders can resume into a normal non-terminal stage', () => {
  assert.equal(canTransitionOrderStatus('on_hold', 'picking'), true);
  assert.equal(canTransitionOrderStatus('on_hold', 'completed'), false);
});

test('completed and cancelled orders are terminal', () => {
  assert.equal(canTransitionOrderStatus('completed', 'new'), false);
  assert.equal(canTransitionOrderStatus('completed', 'cancelled'), false);
  assert.equal(canTransitionOrderStatus('cancelled', 'new'), false);
});

test('status labels are readable for operators', () => {
  assert.equal(getOrderStatusLabel('stock_check'), 'Stock Check');
  assert.equal(getOrderStatusLabel('ready_dispatch'), 'Ready for Dispatch');
});
