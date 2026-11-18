import test from 'node:test';
import assert from 'node:assert/strict';
import { computeOrderStats, type OrderStatsInput } from './order-stats.ts';

const order = (over: Partial<OrderStatsInput>): OrderStatsInput => ({
  commercial_state: 'confirmed', status: 'completed', sales_channel: 'direct_sale',
  total_amount: 0, amount_paid: 0, balance_due: 0, deletion_status: 'none', ...over,
});

test('counts confirmed money, splits direct sales from orders', () => {
  const stats = computeOrderStats([
    order({ total_amount: 230000, amount_paid: 230000 }),
    order({ status: 'confirmed', total_amount: 370000, amount_paid: 300000, balance_due: 70000 }),
    order({ sales_channel: 'order', status: 'picking', total_amount: '90000', amount_paid: '0', balance_due: '90000' }),
  ]);
  assert.equal(stats.orders, 3);
  assert.equal(stats.directSales, 2);
  assert.equal(stats.otherOrders, 1);
  assert.equal(stats.salesValue, 690000);
  assert.equal(stats.collected, 530000);
  assert.equal(stats.outstanding, 160000);
  assert.equal(stats.completed, 1);
  assert.equal(stats.inProgress, 2);
});

test('drafts are counted but carry no money; cancelled is neither open nor done', () => {
  const stats = computeOrderStats([
    order({ commercial_state: 'draft', status: 'new', total_amount: 135000, balance_due: 135000 }),
    order({ status: 'cancelled', total_amount: 50000 }),
  ]);
  assert.equal(stats.drafts, 1);
  assert.equal(stats.outstanding, 0);
  assert.equal(stats.salesValue, 50000);
  assert.equal(stats.inProgress, 0);
  assert.equal(stats.completed, 0);
});

test('deleted orders never count; flagged ones still count and are shown', () => {
  const stats = computeOrderStats([
    order({ deletion_status: 'deleted', total_amount: 260000, balance_due: 260000 }),
    order({ deletion_status: 'pending_deletion', total_amount: 175000, balance_due: 175000, status: 'new' }),
  ]);
  assert.equal(stats.orders, 1);
  assert.equal(stats.flaggedForDeletion, 1);
  assert.equal(stats.salesValue, 175000);
  assert.equal(stats.outstanding, 175000);
});
