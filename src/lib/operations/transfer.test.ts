// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canCreateTransfer,
  canReceiveTransfer,
  canCancelTransfer,
} from './transfer.ts';

test('a stock transfer cannot start and end at the same location', () => {
  assert.equal(canCreateTransfer({ from: 'UI', to: 'UI' }), false);
});

test('staff-created transfers cannot use In Transit as the final destination', () => {
  assert.equal(canCreateTransfer({ from: 'UI', to: 'TRANSIT' }), false);
});

test('UI and Sango can transfer stock in either direction', () => {
  assert.equal(canCreateTransfer({ from: 'UI', to: 'SANGO' }), true);
  assert.equal(canCreateTransfer({ from: 'SANGO', to: 'UI' }), true);
});

test('only in-transit transfers can be received or cancelled', () => {
  assert.equal(canReceiveTransfer('in_transit'), true);
  assert.equal(canCancelTransfer('in_transit'), true);
  for (const status of ['received', 'cancelled']) {
    assert.equal(canReceiveTransfer(status), false);
    assert.equal(canCancelTransfer(status), false);
  }
});
