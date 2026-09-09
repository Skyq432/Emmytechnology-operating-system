# Repair Card Public Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the secure public Repair Card portal for PIN verification, tracking, remote quote authorization, and in-store final completion consent without exposing Operations tables directly.

**Architecture:** The QR opens a public tokenized card route. All reads/writes go through Next.js server routes using server-only Supabase admin access. A successful PIN check creates a random opaque session token stored as an HttpOnly cookie; only a SHA-256 hash is persisted and every request remains assignment-bound.

**Tech Stack:** Next.js 16.2.6 App Router, React 19.2.4, TypeScript, Node crypto, Supabase/PostgreSQL.

**Spec:** `docs/superpowers/specs/2026-08-30-repair-card-customer-portal-design.md`

## Global Constraints

- Requires the Repair Card Foundation plan to be complete and verified first.
- Never expose Service Role credentials to browser code.
- Anonymous users have no direct Repair table permissions.
- Old sessions/bookmarks must never resolve to a newly assigned customer on a reused physical card.
- Customer API responses exclude parts cost, labour cost, profit, internal notes, suppliers, staff-only comments and unrelated CRM fields.
- Four-character PIN never appears in URLs or portal responses.
- Final completion approval is available only during a live 15-minute Admin-opened handover window.

---

## File Structure

- Create `src/lib/operations/repair-portal.ts` — pure PIN/session/customer-view helpers.
- Create `src/lib/operations/repair-portal.test.ts` — portal/security unit tests.
- Create `src/lib/operations/repair-portal-server.ts` — trusted public-server boundary.
- Create `src/app/repair/[cardToken]/page.tsx` — public Repair Card page.
- Create `src/components/repairs/public/repair-login.tsx` — PIN form.
- Create `src/components/repairs/public/repair-tracker.tsx` — customer-safe tracker.
- Create `src/components/repairs/public/quote-approval.tsx` — approve/decline current quote.
- Create `src/components/repairs/public/completion-consent.tsx` — final accept/problem form.
- Create `src/app/api/repair-card/[cardToken]/verify/route.ts` — PIN verification/session creation.
- Create `src/app/api/repair-card/[cardToken]/session/route.ts` — safe current assignment view.
- Create `src/app/api/repair-card/[cardToken]/quote/route.ts` — remote approval/decline.
- Create `src/app/api/repair-card/[cardToken]/handover/route.ts` — final acceptance/problem report.

---

### Task 1: Pure portal security helpers

**Files:**
- Create: `src/lib/operations/repair-portal.ts`
- Create: `src/lib/operations/repair-portal.test.ts`

**Interfaces:**
- Produces: `REPAIR_PIN_ALPHABET`, `generateRepairPin`, `generatePortalSessionToken`, `hashPortalSessionToken`, `isHandoverWindowActive`, `buildCustomerSafeRepairView`.

- [ ] **Step 1: Write failing tests**

```ts
// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REPAIR_PIN_ALPHABET,
  generateRepairPin,
  hashPortalSessionToken,
  isHandoverWindowActive,
  buildCustomerSafeRepairView,
} from './repair-portal.ts';

test('PIN is four chars and excludes ambiguous symbols', () => {
  for (let i = 0; i < 100; i += 1) {
    const pin = generateRepairPin();
    assert.match(pin, /^[A-HJ-NP-Z2-9]{4}$/);
    assert.equal(pin.length, 4);
  }
  assert.ok(!REPAIR_PIN_ALPHABET.includes('0'));
  assert.ok(!REPAIR_PIN_ALPHABET.includes('O'));
  assert.ok(!REPAIR_PIN_ALPHABET.includes('1'));
  assert.ok(!REPAIR_PIN_ALPHABET.includes('I'));
});

test('session hash is deterministic but does not equal raw token', () => {
  const token = 'example-session-token';
  assert.equal(hashPortalSessionToken(token), hashPortalSessionToken(token));
  assert.notEqual(hashPortalSessionToken(token), token);
});

test('handover window must be active now', () => {
  const now = new Date('2026-08-30T12:00:00Z');
  assert.equal(isHandoverWindowActive('2026-08-30T11:59:00Z','2026-08-30T12:14:00Z',now), true);
  assert.equal(isHandoverWindowActive('2026-08-30T11:00:00Z','2026-08-30T11:15:00Z',now), false);
});

test('customer safe view excludes internal commercial details', () => {
  const view = buildCustomerSafeRepairView({
    repair_code:'REP-1', parts_cost:10000, labour_cost:5000, repair_profit:9000,
    notes:'private', diagnosis:'Public diagnosis', amount_charged:24000, amount_paid:10000, balance_due:14000,
  } as any);
  assert.equal(view.repair_code, 'REP-1');
  assert.equal(view.diagnosis, 'Public diagnosis');
  assert.equal('parts_cost' in view, false);
  assert.equal('labour_cost' in view, false);
  assert.equal('repair_profit' in view, false);
  assert.equal('notes' in view, false);
});
```

- [ ] **Step 2: Run RED**

```bash
node --experimental-strip-types --test src/lib/operations/repair-portal.test.ts
```

- [ ] **Step 3: Implement helpers using Node crypto**

```ts
import { createHash, randomBytes, randomInt } from 'node:crypto';

export const REPAIR_PIN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRepairPin() {
  return Array.from({ length: 4 }, () => REPAIR_PIN_ALPHABET[randomInt(REPAIR_PIN_ALPHABET.length)]).join('');
}

export function generatePortalSessionToken() {
  return randomBytes(32).toString('base64url');
}

export function hashPortalSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
```

Implement the remaining helpers with explicit allow-listed output fields.

- [ ] **Step 4: Run GREEN and commit**

```bash
node --experimental-strip-types --test src/lib/operations/repair-portal.test.ts
npm run test:operations
git add src/lib/operations/repair-portal.ts src/lib/operations/repair-portal.test.ts
git commit -m "feat: add repair portal security helpers"
```

---

### Task 2: Trusted server boundary for card/PIN/session verification

**Files:**
- Create: `src/lib/operations/repair-portal-server.ts`
- Create: `src/app/api/repair-card/[cardToken]/verify/route.ts`
- Create: `src/app/api/repair-card/[cardToken]/session/route.ts`

**Interfaces:**
- Produces: `verifyRepairCardPin`, `getRepairPortalSession`, `revokeRepairPortalSession`, `getCustomerSafeRepairPortalData`.

- [ ] **Step 1: Implement card lookup without leaking assignment data**

Use `getSupabaseAdmin()` only server-side. Card lookup must filter by `public_token` and active card/assignment but return a generic invalid response when no usable assignment exists.

- [ ] **Step 2: Implement rate-limit decision**

Before checking the PIN, count failed `ops_repair_access_attempts` for the same card and client fingerprint in the recent lock window. Baseline:

```ts
const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;
```

Client fingerprint must be a one-way hash of stable request inputs such as forwarded IP + user-agent; do not persist raw IP unnecessarily.

- [ ] **Step 3: Verify PIN in constant-time style**

Compare normalized four-character values server-side. Record every failed attempt and a success audit row. Do not return whether card/assignment/PIN specifically was wrong.

- [ ] **Step 4: Create assignment-bound portal session**

On success:

```ts
const rawToken = generatePortalSessionToken();
const tokenHash = hashPortalSessionToken(rawToken);
```

Persist only `tokenHash`, assignment ID, repair ID, expiry/revocation fields. Set the raw token as an HttpOnly Secure SameSite=Lax cookie scoped to `/repair/${cardToken}`.

- [ ] **Step 5: Validate every session request against assignment state**

A session is valid only if:

```text
session not revoked
session not expired
assignment still active
assignment id matches session assignment id
card public token still maps to that same assignment card
repair not collected/closed
```

Never replace an invalid old assignment session with the card's new active assignment.

- [ ] **Step 6: Return allow-listed safe view only**

`getCustomerSafeRepairPortalData` returns repair, current quote, customer-visible events, payment summary and handover availability. It must not use `select('*')` for the final public object.

- [ ] **Step 7: Commit**

```bash
git add src/lib/operations/repair-portal-server.ts src/app/api/repair-card/[cardToken]/verify/route.ts src/app/api/repair-card/[cardToken]/session/route.ts
git commit -m "feat: secure repair card portal sessions"
```

---

### Task 3: Public Repair Card login and tracker UI

**Files:**
- Create: `src/app/repair/[cardToken]/page.tsx`
- Create: `src/components/repairs/public/repair-login.tsx`
- Create: `src/components/repairs/public/repair-tracker.tsx`

**Interfaces:**
- Consumes: verification/session endpoints from Task 2.
- Produces: customer portal UX.

- [ ] **Step 1: Build server page shell with no customer data in initial HTML**

The page receives only `cardToken`; it must not server-render repair/customer details before session verification.

- [ ] **Step 2: Build four-character PIN input**

Use four visual boxes backed by one controlled value, uppercase automatically, allow only the approved alphabet, and submit to the verification endpoint.

- [ ] **Step 3: Show generic failure copy**

Examples:

```text
We could not verify this Repair Card access. Check the code and try again.
Too many attempts. Please wait a few minutes or contact EmmyTech.
```

Do not reveal whether a repair exists.

- [ ] **Step 4: Build authenticated tracker**

Show only customer-safe sections:

```text
Repair code
Device
Reported issue
Current status
Customer-safe diagnosis
Timeline
Quote/payment summary
Warranty when available
```

- [ ] **Step 5: Verify responsive 9/10 mobile usability manually**

Use browser devtools widths 360px, 390px and desktop. Ensure no internal IDs or horizontal overflow.

- [ ] **Step 6: Commit**

```bash
git add src/app/repair/[cardToken]/page.tsx src/components/repairs/public/repair-login.tsx src/components/repairs/public/repair-tracker.tsx
git commit -m "feat: add repair customer tracking portal"
```

---

### Task 4: Remote quote approval/decline

**Files:**
- Create: `src/components/repairs/public/quote-approval.tsx`
- Create: `src/app/api/repair-card/[cardToken]/quote/route.ts`
- Modify: `src/lib/operations/repair-portal-server.ts`

**Interfaces:**
- Produces: `approveCurrentRepairQuote`, `declineCurrentRepairQuote`.

- [ ] **Step 1: Add server action that validates session + current quote**

Approve is valid only when the authenticated assignment owns the repair and the current quote is `published`.

- [ ] **Step 2: Write immutable authorization consent**

Persist quote ID/version, assignment, Identity, consent wording version and a complete approved customer quote snapshot. Then mark quote `approved`.

- [ ] **Step 3: Derive post-approval repair state**

If `amount_paid < required_before_start`, set `awaiting_payment`; otherwise move to the next internal work-ready state defined by the foundation workflow.

- [ ] **Step 4: Add decline path**

Decline stores a consent/event and marks quote `declined`; repair remains active for controlled unrepaired return rather than entering repair work.

- [ ] **Step 5: Build portal UI with explicit amount and terms**

Before approval, show exact quote amount, estimated completion and payment requirement. Disable double-submission and refresh portal state after success.

- [ ] **Step 6: Commit**

```bash
git add src/components/repairs/public/quote-approval.tsx src/app/api/repair-card/[cardToken]/quote/route.ts src/lib/operations/repair-portal-server.ts
git commit -m "feat: add customer repair authorization"
```

---

### Task 5: In-store final completion acceptance/problem report

**Files:**
- Create: `src/components/repairs/public/completion-consent.tsx`
- Create: `src/app/api/repair-card/[cardToken]/handover/route.ts`
- Modify: `src/lib/operations/repair-portal-server.ts`

**Interfaces:**
- Produces: `acceptCompletedRepair`, `reportRepairHandoverProblem`.

- [ ] **Step 1: Require active handover window server-side**

Do not rely on UI visibility. The server must verify `ready_collection`, active assignment, `handover_started_at <= now < handover_expires_at`.

- [ ] **Step 2: Record completion acceptance immutably**

Store repair/assignment/Identity, final quote reference, device snapshot, condition-returned snapshot, consent wording version, portal session ID and timestamp.

- [ ] **Step 3: Add problem report path**

Allow only these structured reasons plus free comment:

```text
original_fault_still_exists
new_issue_noticed
repair_incomplete
device_condition_concern
other
```

Write event, expire handover window and set repair to `rework`.

- [ ] **Step 4: Build final portal UI**

Outside handover window:

```text
Your device is ready for collection.
Final confirmation will become available when staff begins your handover.
```

Inside window show Confirm Repair Complete / Report a Problem.

- [ ] **Step 5: Commit**

```bash
git add src/components/repairs/public/completion-consent.tsx src/app/api/repair-card/[cardToken]/handover/route.ts src/lib/operations/repair-portal-server.ts
git commit -m "feat: add in-store repair completion consent"
```

---

### Task 6: Security regression verification

**Files:**
- Modify: `src/lib/operations/repair-portal.test.ts` if needed for regression cases.

- [ ] **Step 1: Add stale-session regression test**

Model Assignment A session, close A, assign same card to B, and assert session A validation returns invalid rather than B's data.

- [ ] **Step 2: Add customer-safe projection regression test**

Assert forbidden keys remain absent.

- [ ] **Step 3: Run full Operations tests and production build**

```bash
npm run test:operations
npm run build
```

Expected: both exit 0.

- [ ] **Step 4: Manual public portal test with marked TEST repair**

Verify wrong PIN, correct PIN, quote approval, handover unavailable remotely, Admin-opened handover, acceptance/problem paths, collection revocation and stale browser behavior.

- [ ] **Step 5: Clean all TEST records and commit any necessary test-only fixes**

```bash
git add src/lib/operations/repair-portal.test.ts
git commit -m "test: cover repair portal privacy boundaries"
```
