import assert from 'node:assert/strict';
import test from 'node:test';
import { capabilitiesForRole, hasCapability } from './roles.ts';

test('legacy administrators retain every sensitive commercial capability', () => {
  for (const role of ['super_admin', 'admin'] as const) {
    assert.equal(hasCapability(role, 'sales.credit.approve'), true);
    assert.equal(hasCapability(role, 'sales.refund.manage'), true);
    assert.equal(hasCapability(role, 'sales.pricing.admin'), true);
    assert.equal(hasCapability(role, 'sales.settings.manage'), true);
    assert.equal(hasCapability(role, 'operations.inventory.manage'), true);
    assert.equal(hasCapability(role, 'operations.supplier.manage'), true);
  }
});

test('growth lead can run normal commercial work without inheriting financial administration', () => {
  assert.equal(hasCapability('growth_lead', 'sales.read'), true);
  assert.equal(hasCapability('growth_lead', 'sales.direct.manage'), true);
  assert.equal(hasCapability('growth_lead', 'sales.order.manage'), true);
  assert.equal(hasCapability('growth_lead', 'sales.payment.record'), true);
  assert.equal(hasCapability('growth_lead', 'sales.quotation.manage'), true);
  assert.equal(hasCapability('growth_lead', 'operations.order.manage'), true);
  assert.equal(hasCapability('growth_lead', 'operations.transfer.manage'), true);
  assert.equal(hasCapability('growth_lead', 'operations.repair.finance'), true);
  assert.equal(hasCapability('growth_lead', 'sales.credit.approve'), false);
  assert.equal(hasCapability('growth_lead', 'sales.refund.manage'), false);
  assert.equal(hasCapability('growth_lead', 'sales.pricing.admin'), false);
  assert.equal(hasCapability('growth_lead', 'sales.settings.manage'), false);
});

test('front desk can serve customers and record money but cannot change stock or financial policy', () => {
  assert.equal(hasCapability('front_desk', 'sales.direct.manage'), true);
  assert.equal(hasCapability('front_desk', 'sales.order.manage'), true);
  assert.equal(hasCapability('front_desk', 'sales.payment.record'), true);
  assert.equal(hasCapability('front_desk', 'operations.order.manage'), true);
  assert.equal(hasCapability('front_desk', 'operations.inventory.read'), true);
  assert.equal(hasCapability('front_desk', 'operations.transfer.manage'), true);
  assert.equal(hasCapability('front_desk', 'operations.repair.intake'), true);
  assert.equal(hasCapability('front_desk', 'operations.repair.finance'), true);
  assert.equal(hasCapability('front_desk', 'operations.repair.handover'), true);
  assert.equal(hasCapability('front_desk', 'operations.inventory.manage'), false);
  assert.equal(hasCapability('front_desk', 'sales.credit.approve'), false);
  assert.equal(hasCapability('front_desk', 'sales.refund.manage'), false);
});

test('operations lead can manage operations but cannot alter pricing, credit or refunds', () => {
  assert.equal(hasCapability('operations_lead', 'operations.inventory.manage'), true);
  assert.equal(hasCapability('operations_lead', 'operations.transfer.manage'), true);
  assert.equal(hasCapability('operations_lead', 'operations.repair.technical'), true);
  assert.equal(hasCapability('operations_lead', 'operations.repair.finance'), true);
  assert.equal(hasCapability('operations_lead', 'operations.supplier.manage'), true);
  assert.equal(hasCapability('operations_lead', 'operations.website.manage'), true);
  assert.equal(hasCapability('operations_lead', 'sales.payment.record'), true);
  assert.equal(hasCapability('operations_lead', 'sales.credit.approve'), false);
  assert.equal(hasCapability('operations_lead', 'sales.refund.manage'), false);
  assert.equal(hasCapability('operations_lead', 'sales.pricing.admin'), false);
});

test('technician is limited to customer lookup, direct sale cover, inventory lookup and technical repair work', () => {
  assert.deepEqual(capabilitiesForRole('technician'), [
    'sales.read',
    'sales.direct.manage',
    'operations.read',
    'operations.inventory.read',
    'operations.repair.read',
    'operations.repair.technical',
  ]);
  assert.equal(hasCapability('technician', 'sales.payment.record'), false);
  assert.equal(hasCapability('technician', 'operations.transfer.manage'), false);
  assert.equal(hasCapability('technician', 'operations.repair.finance'), false);
  assert.equal(hasCapability('technician', 'operations.repair.handover'), false);
  assert.equal(hasCapability('technician', 'operations.inventory.manage'), false);
});

test('sales analyst is read-only for commercial data', () => {
  assert.deepEqual(capabilitiesForRole('sales_analyst'), ['sales.read']);
  assert.equal(hasCapability('sales_analyst', 'sales.quotation.manage'), false);
  assert.equal(hasCapability('sales_analyst', 'sales.order.manage'), false);
  assert.equal(hasCapability('sales_analyst', 'sales.payment.record'), false);
});

test('marketing manager and ambassador have no Sales or Operations action capability', () => {
  assert.deepEqual(capabilitiesForRole('marketing_manager'), []);
  assert.deepEqual(capabilitiesForRole('ambassador'), []);
});
