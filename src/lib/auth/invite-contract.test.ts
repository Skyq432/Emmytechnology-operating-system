import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const publicInvite = path.join(repoRoot, 'src', 'app', 'auth', 'invite', 'page.tsx');
const marketingInvite = path.join(repoRoot, 'src', 'app', 'modules', 'marketing', 'invite', 'page.tsx');

test('public invite validation uses the secure code RPC instead of listing invite rows', () => {
  const source = readFileSync(publicInvite, 'utf8');
  assert.match(source, /\.rpc\(['"]get_invite_link['"]/, 'Public invite validation must use get_invite_link.');
  assert.doesNotMatch(source, /\.from\(['"]invite_links['"]\)\s*\.select/, 'Anonymous invite validation must not directly select invite_links.');
});

test('public invite page distinguishes staff onboarding from Ambassador onboarding', () => {
  const source = readFileSync(publicInvite, 'utf8');
  assert.match(source, /Join EmmyTech Staff/, 'Internal-role invites should present staff onboarding copy.');
  assert.match(source, /Join EmmyTech Ambassador/, 'Ambassador invites must keep Ambassador onboarding copy.');
  assert.match(source, /roleLabel\(/, 'Invite page should display a friendly role label.');
});

test('marketing invitations explicitly request an Ambassador invite', () => {
  const source = readFileSync(marketingInvite, 'utf8');
  assert.match(source, /generate_invite_link_for_role/, 'Marketing invitations must use the role-aware invite RPC.');
  assert.match(source, /p_role\s*:\s*['"]ambassador['"]/, 'Marketing invitations must request the ambassador role explicitly.');
  assert.match(source, /\.eq\(['"]role['"],\s*['"]ambassador['"]\)/, 'Marketing invitation list must stay scoped to Ambassador links.');
});
