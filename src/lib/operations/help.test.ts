// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { OPERATIONS_NAV, OPERATIONS_HELP } from './help.ts';

test('operations navigation includes the shared website Products manager', () => {
  const products = OPERATIONS_NAV.find((item) => item.key === 'products');
  assert.ok(products);
  assert.equal(products.href, '/modules/operations/products');
});

test('Products stays last because it is the independent website catalogue manager', () => {
  assert.equal(OPERATIONS_NAV.at(-1)?.key, 'products');
});

test('every operations navigation item has simple help text', () => {
  for (const item of OPERATIONS_NAV) {
    assert.ok(item.help.length > 10);
    assert.ok(item.help.length < 180);
  }
});

test('core dashboard cards have beginner-friendly help text', () => {
  for (const key of ['openOrders', 'urgent', 'dispatch', 'inventoryItems', 'lowStock', 'websiteLinks']) {
    assert.ok(OPERATIONS_HELP[key]);
    assert.ok(OPERATIONS_HELP[key].length < 180);
  }
});
