import assert from 'node:assert/strict';
import test from 'node:test';
import {
  accessibleModules,
  canAccessModule,
  canCreateAmbassadorInvite,
  canCreateStaffInvite,
  isInternalRole,
  operationsNavKeys,
  salesNavKeys,
} from './roles.ts';

test('internal staff roles exclude ambassadors and unknown roles', () => {
  assert.equal(isInternalRole('super_admin'), true);
  assert.equal(isInternalRole('admin'), true);
  assert.equal(isInternalRole('technician'), true);
  assert.equal(isInternalRole('ambassador'), false);
  assert.equal(isInternalRole('mystery_role'), false);
});

test('department access follows the approved role matrix', () => {
  assert.deepEqual(accessibleModules('super_admin'), ['crm','marketing','sales','operations','finance','reports','administration']);
  assert.deepEqual(accessibleModules('growth_lead'), ['crm','marketing','sales','operations','reports']);
  assert.deepEqual(accessibleModules('marketing_manager'), ['crm','marketing']);
  assert.deepEqual(accessibleModules('front_desk'), ['sales','operations']);
  assert.deepEqual(accessibleModules('operations_lead'), ['crm','sales','operations']);
  assert.deepEqual(accessibleModules('technician'), ['sales','operations']);
  assert.deepEqual(accessibleModules('sales_analyst'), ['crm','sales','reports']);
  assert.deepEqual(accessibleModules('ambassador'), []);
  assert.equal(canAccessModule('marketing_manager', 'sales'), false);
  assert.equal(canAccessModule('front_desk', 'operations'), true);
  assert.equal(canAccessModule('front_desk', 'crm'), false);
  assert.equal(canAccessModule('technician', 'crm'), false);
});

test('sales navigation is filtered by role', () => {
  assert.deepEqual(salesNavKeys('front_desk'), ['direct','orders','payments','receipts','customers']);
  assert.deepEqual(salesNavKeys('operations_lead'), ['overview','direct','orders','payments','receipts','customers']);
  assert.deepEqual(salesNavKeys('technician'), ['direct','receipts','customers']);
  assert.equal(salesNavKeys('technician').includes('overview'), false);
  assert.deepEqual(salesNavKeys('sales_analyst'), ['overview','quotations','orders','customers','reports']);
});

test('operations navigation is filtered by role', () => {
  assert.deepEqual(operationsNavKeys('front_desk'), ['orders','inventory','transfers','repairs']);
  assert.deepEqual(operationsNavKeys('technician'), ['inventory','repairs']);
  assert.equal(operationsNavKeys('technician').includes('overview'), false);
  assert.ok(operationsNavKeys('operations_lead').includes('suppliers'));
});

test('invite authority is deliberately narrower than module visibility', () => {
  assert.equal(canCreateStaffInvite('super_admin'), true);
  assert.equal(canCreateStaffInvite('admin'), true);
  assert.equal(canCreateStaffInvite('growth_lead'), false);
  assert.equal(canCreateAmbassadorInvite('growth_lead'), true);
  assert.equal(canCreateAmbassadorInvite('marketing_manager'), true);
  assert.equal(canCreateAmbassadorInvite('front_desk'), false);
});