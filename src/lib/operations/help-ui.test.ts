// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('help tip uses a plain question mark without a circle icon', () => {
  const source = readFileSync(new URL('../../components/ui/help-tip.tsx', import.meta.url), 'utf8');
  assert.equal(source.includes('CircleHelp'), false);
});

test('operations sidebar does not wrap help tips in a second round bubble', () => {
  const source = readFileSync(new URL('../../components/operations/operations-shell.tsx', import.meta.url), 'utf8');
  assert.equal(source.includes("rounded-full bg-white/10"), false);
  assert.equal(source.includes("rounded-full bg-white"), false);
});
