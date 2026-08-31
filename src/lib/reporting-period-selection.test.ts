// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReportingPeriodSelection } from './reporting-period-selection.ts';

test('reporting selection defaults safely to this month', () => {
  assert.deepEqual(parseReportingPeriodSelection(null), { preset: 'this_month' });
  assert.deepEqual(parseReportingPeriodSelection('not json'), { preset: 'this_month' });
});

test('reporting selection accepts supported custom and selected-month values', () => {
  assert.deepEqual(
    parseReportingPeriodSelection(JSON.stringify({ preset: 'custom', startDate: '2026-08-01', endDate: '2026-08-31' })),
    { preset: 'custom', startDate: '2026-08-01', endDate: '2026-08-31' },
  );
  assert.deepEqual(
    parseReportingPeriodSelection(JSON.stringify({ preset: 'selected_month', startDate: '2026-07-01' })),
    { preset: 'selected_month', startDate: '2026-07-01' },
  );
});

test('reporting selection rejects unsupported presets and malformed dates', () => {
  assert.deepEqual(parseReportingPeriodSelection(JSON.stringify({ preset: 'forever' })), { preset: 'this_month' });
  assert.deepEqual(parseReportingPeriodSelection(JSON.stringify({ preset: 'custom', startDate: 'August', endDate: '2026-08-31' })), { preset: 'this_month' });
});
