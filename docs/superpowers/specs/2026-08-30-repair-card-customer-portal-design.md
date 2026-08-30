# Repair Card Customer Portal Design

## Goal

Turn EmmyTech Repairs into a controlled end-to-end workflow that works for staff and customers, while introducing 30 reusable physical Repair Cards with permanent QR codes.

The design must:

- keep `identities` as the canonical customer/person record;
- automatically resolve or create an Identity when an Order or Repair is created;
- let a customer take a reusable Repair Card home and scan it to track the current repair;
- prevent a previous customer from ever seeing a later customer's repair when the same physical card is reused;
- require customer approval before repair work begins;
- enforce any admin-selected payment requirement before work begins;
- require an in-store final customer acceptance before a completed repair can be collected/closed;
- keep a complete internal audit trail of quote changes, payments, approvals, handover and card reuse.

## Existing Foundation

The current application already has:

- CRM `identities` as the person/customer record;
- an Operations Identity search used by New Order;
- `upsert_identity_from_signals(...)` and identity-matching primitives in the database;
- `ops_repairs` linked optionally to `identity_id`, `original_order_id` and `inventory_unit_id`;
- repair list/detail UI;
- serialized inventory units for known devices;
- admin-only Operations access.

This design extends those foundations instead of creating a second customer database or rebuilding Repairs from scratch.

## Approaches Considered

### 1. Put everything directly on `ops_repairs`

This would add card code, PIN, approvals and payment fields directly to the repair row.

Advantages:
- fastest initial implementation;
- fewer tables.

Problems:
- poor history when a quote changes;
- difficult to prove which exact quote a customer approved;
- card reuse history becomes unsafe and hard to audit;
- browser sessions and PIN revocation become tangled with the repair row.

Not recommended.

### 2. Repair job plus dedicated card, quote, payment, consent and session records

`ops_repairs` stays the repair job while small related tables own reusable cards, assignments, quotes, payments, consent and portal sessions.

Advantages:
- safe card reuse;
- immutable approval history;
- clean payment ledger;
- strong customer privacy;
- each unit has one clear responsibility;
- can expand beyond 30 cards later without redesign.

This is the recommended architecture.

### 3. Build a generic workflow/approval engine for the whole EmmyTech OS

This could eventually support Orders, Repairs, HR and other approval processes.

Advantages:
- very flexible long term.

Problems:
- much larger project than the current need;
- slower to test;
- increases risk of breaking unrelated modules.

Not recommended for this phase.

## Identity Rule for Orders and Repairs

Identity linking becomes a global Operations rule.

When staff creates an Order or Repair:

1. Search CRM Identity by name, phone or email.
2. If staff selects a match, use that Identity.
3. If no Identity was selected, normalize the submitted contact details and call the existing identity resolver/upsert logic.
4. The resolver reuses a strong existing match or creates a new Identity.
5. The resulting `identity_id` is always stored on the new Order/Repair.

Phone normalization must treat common Nigerian forms as the same number, for example:

- `08031234567`
- `2348031234567`
- `+2348031234567`

The UI still shows likely matches before submit. Server-side resolution is the final duplicate-protection layer.

Creating an Identity does not automatically create a Lead unless the existing CRM rules specifically require one. Identity remains the stable person record.

## Repair Intake

A new Repair intake is organized into four steps.

### 1. Customer

Staff can search the same CRM Identity source used by Orders.

If an existing customer is selected, the form fills:

- name;
- phone;
- email where available;
- Identity reference.

If no matching Identity exists, staff enters the customer details and the system creates/resolves the Identity automatically during submission.

### 2. Device

If the customer has known EmmyTech devices/orders, staff can select a previous device. The system can then prefill:

- original Order;
- serialized inventory unit where available;
- brand;
- model;
- serial / IMEI;
- purchased-from-EmmyTech state.

A device bought elsewhere can always be entered manually.

### 3. Intake condition and fault

Capture at minimum:

- device type;
- brand/model;
- serial/IMEI where known;
- condition received;
- accessories received;
- customer-reported fault;
- staff intake notes.

### 4. Repair Card assignment

Staff selects an available physical Repair Card.

The system atomically:

- creates the repair;
- assigns the selected card;
- generates a new four-character temporary access PIN;
- records the assignment and intake event.

The customer takes the physical card home. The device stays with EmmyTech and receives a separate temporary internal repair tag.

## Physical Repair Cards

The first rollout contains 30 cards:

- `RC-01`
- `RC-02`
- ...
- `RC-30`

The schema is not hard-coded to 30; more cards can be added later.

Each card has:

- a stable internal ID;
- human-readable `card_code`;
- permanent random public QR token;
- operational state: `available`, `assigned`, `missing`, or `retired`;
- timestamps/audit metadata.

The printed QR contains only the permanent card tracking URL/token. It never contains:

- repair ID;
- customer Identity;
- customer name;
- PIN.

The visible card can contain the card code and simple instructions such as “Scan to track your repair. Keep this card and return it when collecting your device.”

## Card Assignment

A card is reusable; an assignment is not.

Each assignment links:

- one Repair Card;
- one Repair;
- the repair's Identity;
- the generated PIN;
- active/closed state;
- assignment start/end times;
- PIN generation/version information;
- handover-window information.

Rules:

- a Repair Card can have at most one active assignment;
- a Repair can have at most one active Repair Card assignment;
- a card cannot be reassigned until its previous assignment is closed or explicitly marked missing/retired through an admin override;
- assignment history is never deleted when the card is reused.

This is the main privacy boundary between Customer 1 and Customer 2.

## Four-Character Repair PIN

Each assignment receives a random four-character alphanumeric PIN.

Allowed characters exclude visually confusing values such as `0`, `O`, `1`, and `I`.

Example character set:

`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`

Example PINs:

- `K7M4`
- `B4X9`
- `7Q2H`

The PIN belongs to the assignment, not the card.

Admin can view the active PIN from the internal Repair Card Access section so it can be re-sent manually if the customer forgets it.

The system does not send WhatsApp/SMS automatically in this phase. Staff can:

- copy the PIN;
- print it on the intake/repair slip;
- manually send the same PIN through WhatsApp/SMS.

Regenerating a PIN:

- creates a new PIN;
- invalidates the previous PIN;
- revokes every existing public portal session for that assignment;
- records an audit event.

## Public Customer Portal Security

The permanent Repair Card URL never directly exposes the current repair.

Flow:

1. Customer scans the physical card.
2. Public page identifies the card by its random permanent public token.
3. No repair/customer data is shown yet.
4. Customer enters the current assignment PIN.
5. Verification is rate-limited.
6. A successful verification creates a random server-side portal session tied to that exact assignment.
7. The session token is stored in an HttpOnly, Secure, SameSite cookie scoped to that repair-card path.
8. Every portal read/write validates the session, assignment and revocation state on the server.

The browser session is tied to `assignment_id`, never just `card_id`.

Therefore, when RC-07 changes from Assignment A to Assignment B, a browser authenticated to Assignment A cannot silently begin viewing Assignment B.

### Failed PIN protection

PIN attempts are rate-limited per card/assignment and client fingerprint through server-side API logic.

Baseline rule:

- after 5 failed attempts in a short window, temporarily block additional attempts;
- responses do not reveal customer or repair information;
- repeated failures are auditable.

Public browser code never receives the Service Role key. Existing server-only Supabase admin access is used only inside trusted Next.js server routes/actions.

## Portal Session Revocation

All portal sessions for an assignment are revoked when any of these occur:

- PIN regenerated;
- assignment closed;
- repair collected/closed;
- card marked missing/retired;
- Admin explicitly revokes customer access.

If a previous customer opens an old bookmark after the assignment ends, the server must not resolve them to the card's new assignment.

They receive a generic ended-session message and no information about the current customer or repair.

## Customer Portal Content

After successful authentication, the customer can see only customer-safe repair information.

Examples:

- repair code;
- device summary;
- date received;
- fault they reported;
- customer-safe diagnosis;
- current status;
- customer-visible timeline;
- current approved/pending quote;
- estimated completion;
- amount quoted;
- amount paid;
- outstanding balance;
- repair warranty when available;
- remote quote-approval action when required;
- final handover action only during an active in-store handover window.

The customer portal must not expose:

- parts supplier;
- internal parts cost;
- internal labour cost;
- repair profit;
- internal technician notes;
- private staff comments;
- unrelated CRM information;
- other customers/repairs.

## Repair Quote Versions

Repair authorization is based on versioned quotes, not a mutable amount field.

Each quote stores a snapshot of:

- repair;
- quote version;
- customer-safe diagnosis;
- proposed repair/work description;
- quoted amount;
- estimated completion text/date;
- payment requirement;
- required amount before work;
- published timestamp;
- status;
- staff creator.

Quote statuses include:

- `draft`
- `published`
- `approved`
- `declined`
- `superseded`

Once approved, the approved snapshot is immutable.

If the price or material scope changes later, staff publishes a new quote version. The previous customer approval is not rewritten.

The Repair returns to customer approval/payment gating until the latest quote is approved and its start-payment requirement is satisfied.

## First Customer Approval: Repair Authorization

The first approval can happen remotely.

After diagnosis, staff publishes the quote and the portal shows:

- diagnosis;
- repair/work description;
- quoted amount;
- estimated completion;
- payment requirement.

Customer can choose:

- Approve Repair;
- Decline Repair.

On approval, store immutable consent with:

- repair ID;
- assignment ID;
- quote ID/version;
- Identity ID;
- complete approved quote snapshot;
- consent wording/version;
- portal session reference;
- timestamp.

The technician cannot start the actual repair before this approval exists for the current quote.

If the customer declines, work does not begin. The device proceeds to a controlled unrepaired-return/collection flow while the card remains assigned until handover is complete.

## Repair Payment Ledger

Repairs use their own payment ledger because Repairs are not normal sales Orders.

Each payment record stores:

- repair;
- amount;
- payment method;
- reference;
- paid at;
- note;
- recorded by;
- void state where needed.

The repair's summary fields (`amount_paid`, `balance_due`, `payment_status`) are calculated from active payment records and the currently approved quote.

Supported methods remain compatible with Operations payment methods:

- bank transfer;
- POS;
- cash;
- split;
- other.

## Admin-Selected Payment Requirement

Every quote has one of three payment requirements:

1. No payment required before work.
2. Partial payment/deposit required before work.
3. Full payment required before work.

For partial payment, Admin chooses the required amount.

Rules:

- `none` => required-before-start is 0;
- `partial` => required-before-start is the entered deposit amount;
- `full` => required-before-start equals the quote amount.

The system blocks transition into actual repair work until:

- the current quote is approved; and
- `amount_paid >= required_before_start`.

Staff may still diagnose, revise quotes, record notes, record payments, communicate with the customer or cancel the job while the payment gate is unmet.

## Repair Workflow

The enhanced repair states are:

- `received`
- `diagnosing`
- `awaiting_customer_approval`
- `awaiting_payment`
- `awaiting_parts`
- `in_progress`
- `quality_check`
- `ready_collection`
- `rework`
- `collected`
- `cancelled`

Normal repaired flow:

`received -> diagnosing -> awaiting_customer_approval -> awaiting_payment (only when needed) -> awaiting_parts (only when needed) -> in_progress -> quality_check -> ready_collection -> collected`

Important gates:

- `in_progress` requires approved current quote and satisfied start-payment requirement;
- `ready_collection` requires the repair work/quality-check path to have completed;
- `collected` cannot be set by a plain status dropdown; it is produced only by the controlled collection/handover completion action.

If the customer reports a problem during final handover, status becomes `rework` and the job remains active.

Cancellation requires a reason and never automatically frees an active card while EmmyTech still holds the customer's device.

## Internal Repair Events

Create an immutable Repair event timeline for important actions, including:

- repair received;
- Identity resolved/created;
- Repair Card assigned;
- PIN regenerated;
- diagnosis recorded;
- quote published/revised;
- customer quote approved/declined;
- payment recorded/voided;
- payment gate satisfied;
- work started;
- awaiting parts;
- quality check completed;
- ready for collection;
- handover started;
- customer completion accepted;
- customer reported problem;
- card returned/missing;
- repair collected/closed.

Events support an internal/customer visibility flag so customer-safe milestones can drive the public timeline without exposing internal notes.

Important repair milestones should also publish lightweight Identity/CRM events so staff can see repair history from the customer's Identity without duplicating the Repair record into CRM.

## Second Customer Approval: Final Completion Acceptance

The final approval is in-store only.

A repair at `ready_collection` does not automatically show the final acceptance button.

When the customer is physically present, staff clicks:

`Begin Customer Handover`

This opens a 15-minute handover window for the active assignment.

During that window the authenticated customer portal shows:

- instruction to test the gadget;
- Confirm Repair Complete;
- Report a Problem.

Outside the handover window, the customer only sees that the device is ready for collection.

### Confirm Repair Complete

Record immutable completion consent containing:

- repair ID;
- assignment ID;
- Identity ID;
- final approved quote/reference;
- device snapshot;
- condition-returned snapshot where recorded;
- consent wording/version;
- portal session reference;
- accepted timestamp.

This confirms customer acceptance of the completed repair. It does not by itself close the repair.

### Report a Problem

Customer can select/report an issue such as:

- original fault still exists;
- new issue noticed;
- repair incomplete;
- device-condition concern;
- other.

The event is recorded, the handover window ends, status becomes `rework`, and the Repair Card stays with the customer.

## Completing Collection

After final customer acceptance, staff completes the handover only when all required conditions are satisfied:

- final customer acceptance exists for a repaired job;
- outstanding repair balance is zero;
- device has been handed back;
- physical Repair Card has been returned, or an authorized missing-card override with reason is recorded.

The collection action atomically:

- sets repair to `collected`;
- records `collected_at`;
- closes the active card assignment;
- invalidates the PIN;
- revokes all public portal sessions;
- marks the returned Repair Card `available`;
- writes final repair/card audit events.

For a customer-declined repair, the in-store handover uses a separate “Device returned unrepaired” acknowledgement instead of pretending a repair was completed.

## Missing Repair Card

A lost card must never be silently recycled.

Admin can complete collection without physical card return only through an explicit override that:

- requires a reason;
- records the actor/time;
- marks the physical card `missing`;
- closes the assignment;
- revokes PIN/sessions;
- prevents that card from being assigned again until Admin deliberately reactivates/replaces it.

## Internal Gadget Tag

The reusable card stays with the customer, so the device receives a cheap temporary internal tag.

The tag includes at least:

- Repair code;
- Repair Card code;
- device summary;
- received date.

It may also contain an internal QR that opens the authenticated Admin repair detail page. The internal QR is not the customer portal QR.

## Printable Intake Slip

After repair creation, Admin can print a simple intake slip containing:

- repair code;
- card code;
- temporary PIN;
- customer name;
- device;
- reported fault;
- date received;
- instruction to keep/return the Repair Card.

Admin can also copy the PIN for manual WhatsApp/SMS delivery.

No automatic messaging integration is included in this phase.

## Repair Card Admin View

Repairs gets a Repair Cards management view showing:

- total cards;
- available;
- assigned/with customers;
- missing;
- retired;
- current repair/customer for assigned cards (admin only);
- assignment age;
- card history.

Initial seed creates RC-01 through RC-30 as available cards with unique random public QR tokens.

The view provides QR output suitable for the physical card artwork/printing workflow. Final graphic artwork can be handled separately.

## Repair Detail UI

The internal Repair detail page should be reorganized into clear sections instead of one generic status dropdown.

Recommended sections:

- Customer & CRM Identity;
- Device & intake condition;
- Repair Card Access;
- Diagnosis & Quote;
- Payments;
- Repair Work / Technician;
- Customer Approvals;
- Handover & Collection;
- Timeline / audit history.

The current generic “Move repair forward” selector is replaced with actions that respect workflow gates.

## Repair List UI

The Repair list remains searchable but should expose operational signals such as:

- status;
- card code;
- customer/device;
- quote/approval state;
- payment state;
- ready-for-collection state;
- handover/rework attention.

No customer PIN should appear in the list table.

## Help Icon UI Cleanup

The Operations blue sidebar currently visually wraps the `HelpTip` in an additional circular background, producing an oversized floating bubble.

For the sidebar only:

- remove the extra outer circular wrapper;
- keep a small subtle help marker;
- no large background disc;
- hover/focus changes only the small marker's emphasis;
- tooltip behavior remains unchanged.

This is a visual-only change and does not affect Repair behavior.

## Data Model

The implementation should add dedicated records around the existing `ops_repairs` table.

### `ops_repair_cards`

Owns each reusable physical card and permanent QR identity.

### `ops_repair_card_assignments`

Owns each historical pairing of one physical card with one repair, including PIN and handover-window state.

### `ops_repair_quotes`

Owns immutable/versioned diagnosis/quote proposals and payment requirements.

### `ops_repair_payments`

Owns repair payment history.

### `ops_repair_consents`

Owns immutable customer authorization and final-acceptance acknowledgements.

Consent types include:

- `repair_authorization`
- `completion_acceptance`
- `unrepaired_return_acknowledgement`

### `ops_repair_events`

Owns the auditable Repair timeline and customer-visible milestones.

### `ops_repair_portal_sessions`

Owns revocable customer browser sessions tied to one card assignment.

### `ops_repair_access_attempts`

Owns short-lived PIN-attempt/rate-limit audit data.

Existing `ops_repairs` remains the current repair summary/job record and receives only fields needed for current-state/gating summaries.

## Server Boundaries

### Admin Operations server

Authenticated Admin-only server functions/RPCs own:

- create repair + card assignment;
- publish/revise quote;
- record/void repair payment;
- regenerate PIN;
- move repair through allowed internal stages;
- begin handover;
- complete collection;
- mark/reactivate card missing where authorized.

### Public repair portal server

Public browser requests go through dedicated Next.js server routes/actions.

They:

- use server-only Supabase admin access;
- never expose the Service Role key;
- validate card token, PIN/session and rate limits;
- return only customer-safe fields;
- write only narrowly defined customer actions such as quote approval, final acceptance and problem report.

No public client receives direct read access to Operations tables.

## Database Security

All new Operations tables use RLS.

Normal table access is Admin-only through `ops_is_admin()` policies.

Anonymous/public users receive no direct table SELECT/INSERT/UPDATE/DELETE grants.

Customer portal access is mediated through trusted Next.js server code and narrowly scoped database operations.

The four-character PIN may be displayed to authenticated Admin because EmmyTech staff need to recover it for a customer. It must never be included in customer-safe data responses, logs rendered to the browser, list tables, or URLs.

## Migration Strategy

The migration is additive and backward-compatible.

- preserve existing `ops_repairs` rows;
- extend the allowed repair status set safely;
- do not assign cards to historical repairs automatically;
- seed only the 30 new physical card definitions;
- existing Repairs without a card remain readable;
- new card-based workflow applies to newly created/enrolled repairs;
- no historical workbook import is performed.

A rollback script should remove only the new Repair Card/portal structures and restore the previous repair status constraint without deleting unrelated Operations data.

## Testing Requirements

### Identity

- existing Identity selected by Order/Repair is preserved;
- same normalized phone resolves to the same Identity;
- genuinely new customer creates one Identity;
- Order and Repair both store resulting `identity_id`.

### Card assignment/privacy

- RC-07 can only have one active assignment;
- old assignment closes before RC-07 can be reused;
- Customer 1 session cannot read Customer 2 assignment after card reuse;
- regenerated PIN invalidates old PIN and sessions;
- missing card cannot be reassigned.

### Quote/approval

- work cannot start without current quote approval;
- revised quote requires fresh approval;
- approved quote snapshot cannot be silently modified;
- customer decline prevents repair work.

### Payment gate

- none/partial/full rules calculate required-before-start correctly;
- `in_progress` is blocked while the required amount is unpaid;
- payments recalculate paid/balance/payment state;
- collection is blocked with outstanding balance.

### Handover

- final acceptance unavailable before Admin begins handover;
- handover window expires after 15 minutes;
- final acceptance is valid only for ready-for-collection repaired job;
- customer problem report moves job to rework;
- collection closes assignment and revokes sessions;
- missing-card override requires reason.

### Public portal

- no customer data before PIN/session verification;
- wrong PIN does not disclose whether a repair exists;
- rate limiting activates after repeated failure;
- customer-safe response excludes internal costs/profit/notes;
- stale cookie/bookmark never switches to the next card assignment.

### UI

- Repair intake supports Identity search and auto-create fallback;
- Repair Cards dashboard accurately shows 30-card state;
- PIN is available only in internal repair/card access UI;
- print slip and internal tag contain the intended fields;
- sidebar help marker has no oversized circular wrapper.

## Explicit Non-Goals for This Phase

- automatic WhatsApp/SMS sending;
- customer online payment gateway;
- final physical graphic/card artwork production;
- generic company-wide workflow engine;
- importing historical Repairs from the workbook;
- exposing Repairs to Ambassadors;
- changing production `main` while this feature is still being developed/tested.
