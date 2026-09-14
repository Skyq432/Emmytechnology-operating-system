import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('help tip uses a plain question mark without a circle icon', () => {
  const source = readFileSync(new URL('../../components/ui/help-tip.tsx', import.meta.url), 'utf8');
  assert.equal(source.includes('CircleHelp'), false);
});

test('operations sub-nav does not wrap help tips in a second round bubble', () => {
  // Sub-nav rendering moved from the standalone SubNav component (deleted once
  // Marketing migrated onto it too) into AppShell's Sections segment.
  const source = readFileSync(new URL('../../components/os/app-shell.tsx', import.meta.url), 'utf8');
  assert.equal(source.includes("rounded-full bg-white/10"), false);
  assert.equal(source.includes("rounded-full bg-white"), false);
});
