// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSalesOrderDraftItems } from './order-draft.ts';

test('inventory order line keeps shared inventory identity and defaults to internal fulfilment', () => {
  const [line] = buildSalesOrderDraftItems([{
    inventoryItemId: '11111111-1111-1111-1111-111111111111',
    itemName: 'ThinkPad T14',
    itemType: 'laptop',
    category: 'Laptop',
    quantity: 2,
    listPrice: 500000,
    finalUnitPrice: 485000,
  }]);

  assert.deepEqual(line, {
    inventory_item_id: '11111111-1111-1111-1111-111111111111',
    item_name: 'ThinkPad T14',
    item_type: 'laptop',
    category: 'Laptop',
    fulfilment_source: 'internal',
    quantity: 2,
    list_price: 500000,
    final_unit_price: 485000,
    cost_basis: null,
    cost_basis_source: null,
    admin_exception_reason: null,
    note: null,
  });
});

test('supplier or service line preserves explicit cost evidence and fulfilment source', () => {
  const [line] = buildSalesOrderDraftItems([{
    itemName: 'Special order MacBook',
    itemType: 'laptop',
    category: 'Laptop',
    fulfilmentSource: 'supplier',
    quantity: 1,
    listPrice: 1800000,
    finalUnitPrice: 1750000,
    costBasis: 1600000,
    costBasisSource: 'supplier_on_demand',
    note: 'Source after customer confirmation',
  }]);

  assert.equal(line.fulfilment_source, 'supplier');
  assert.equal(line.cost_basis, 1600000);
  assert.equal(line.cost_basis_source, 'supplier_on_demand');
  assert.equal(line.note, 'Source after customer confirmation');
});

test('rejects malformed order lines before the RPC', () => {
  assert.throws(() => buildSalesOrderDraftItems([{
    itemName: 'Service', quantity: 0, listPrice: 10000, finalUnitPrice: 10000, costBasis: 1000,
  }]), /quantity/i);

  assert.throws(() => buildSalesOrderDraftItems([{
    itemName: 'Service', quantity: 1, listPrice: 10000, finalUnitPrice: 10000,
  }]), /cost basis/i);

  assert.throws(() => buildSalesOrderDraftItems([{
    itemName: '', quantity: 1, listPrice: 10000, finalUnitPrice: 10000, costBasis: 1000,
  }]), /name/i);
});
