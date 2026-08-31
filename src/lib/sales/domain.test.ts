// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateGrossMargin,
  resolveMinimumMargin,
  evaluateSalesPrice,
  deriveSalesPeriodMetrics,
} from './domain.ts';

test('gross margin uses profit divided by selling price, not markup', () => {
  assert.equal(calculateGrossMargin(500000, 450000), 10);
  assert.equal(calculateGrossMargin(0, 450000), 0);
});

test('minimum margin resolves product then category then company default', () => {
  assert.deepEqual(resolveMinimumMargin({ productMargin: 4, categoryMargin: 7, companyMargin: 8 }), { margin: 4, source: 'product' });
  assert.deepEqual(resolveMinimumMargin({ productMargin: null, categoryMargin: 7, companyMargin: 8 }), { margin: 7, source: 'category' });
  assert.deepEqual(resolveMinimumMargin({ productMargin: null, categoryMargin: null, companyMargin: 8 }), { margin: 8, source: 'company' });
});

test('price is allowed only when discount authority and margin floor both pass', () => {
  const allowed = evaluateSalesPrice({ listPrice: 500000, requestedPrice: 485000, cost: 450000, actorDiscountLimitPercent: 3, minimumGrossMarginPercent: 5, actorLevel: 'salesperson' });
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.requiresAdminApproval, false);

  const belowMargin = evaluateSalesPrice({ listPrice: 500000, requestedPrice: 485000, cost: 490000, actorDiscountLimitPercent: 3, minimumGrossMarginPercent: 5, actorLevel: 'salesperson' });
  assert.equal(belowMargin.allowed, false);
  assert.equal(belowMargin.requiresAdminApproval, true);
  assert.equal(belowMargin.reason, 'below_margin_floor');
});

test('admin exception can approve below-floor price only when explicitly marked', () => {
  const result = evaluateSalesPrice({ listPrice: 500000, requestedPrice: 470000, cost: 490000, actorDiscountLimitPercent: 100, minimumGrossMarginPercent: 5, actorLevel: 'admin', adminExceptionApproved: true });
  assert.equal(result.allowed, true);
  assert.equal(result.isException, true);
});

test('period metrics keep sales value cash collected and outstanding separate', () => {
  assert.deepEqual(deriveSalesPeriodMetrics([
    { salesValue: 500000, cashCollected: 300000, outstanding: 200000, grossProfit: 50000 },
    { salesValue: 100000, cashCollected: 100000, outstanding: 0, grossProfit: 20000 },
  ]), {
    salesValue: 600000,
    cashCollected: 400000,
    outstanding: 200000,
    grossProfit: 70000,
    grossMargin: 11.666666666666666,
  });
});
