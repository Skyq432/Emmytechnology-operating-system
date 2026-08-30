// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOperationsIdentitySignals, normalizeOperationsPhone } from './identity-domain.ts';

test('Nigerian phone forms normalize to the same value', () => {
  assert.equal(normalizeOperationsPhone('08031234567'), '+2348031234567');
  assert.equal(normalizeOperationsPhone('2348031234567'), '+2348031234567');
  assert.equal(normalizeOperationsPhone('+234 803 123 4567'), '+2348031234567');
});

test('identity signals omit blanks and use normalized phone', () => {
  assert.deepEqual(buildOperationsIdentitySignals({ name: 'Ada Obi', phone: '08031234567', email: 'ADA@EXAMPLE.COM' }), [
    { type: 'phone', value: '+2348031234567' },
    { type: 'email', value: 'ada@example.com' },
    { type: 'name', value: 'Ada Obi' },
  ]);
});

test('identity signals do not create blank customer signals', () => {
  assert.deepEqual(buildOperationsIdentitySignals({ name: ' ', phone: '', email: null }), []);
});
