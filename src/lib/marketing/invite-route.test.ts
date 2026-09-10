import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const inviteRoute = path.join(repoRoot, 'src', 'app', 'auth', 'invite', 'page.tsx');

test('public ambassador invite route exists and keeps the invite signup contract', () => {
  assert.equal(
    existsSync(inviteRoute),
    true,
    'Expected src/app/auth/invite/page.tsx to exist so generated Ambassador invite URLs resolve.',
  );

  const source = readFileSync(inviteRoute, 'utf8');
  assert.match(source, /\.from\(['"]invite_links['"]\)/, 'Invite route must validate against invite_links.');
  assert.match(source, /\.auth\.signUp\(/, 'Invite route must create the invited Supabase Auth account.');
  assert.match(source, /invite_code\s*:\s*code/, 'Invite route must pass the invite code in signup metadata.');
  assert.match(source, /role\s*:\s*inviteData\?\.role\s*\|\|\s*['"]ambassador['"]/, 'Invite route must preserve the Ambassador role metadata.');
});

test('invite code badge is not nested inside a paragraph', () => {
  const source = readFileSync(inviteRoute, 'utf8');

  assert.doesNotMatch(
    source,
    /<p[^>]*>\s*Invite Code:\s*<Badge[\s\S]*?<\/Badge>\s*<\/p>/,
    'Badge renders a div, so nesting it inside <p> causes an invalid HTML hydration error.',
  );
});
