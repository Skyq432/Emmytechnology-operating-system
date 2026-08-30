# Repair Card Admin UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current basic Repairs UI with a practical Admin workflow for Identity lookup, device intake, card assignment, diagnosis/quotes, payments, technician work, customer approvals, handover, collection, printable slips and Repair Card management.

**Architecture:** Keep the existing Operations module and routing. Split the Repair UI into focused components backed by the Repair server functions/RPCs from the foundation plan. Avoid a giant all-purpose form; the list handles intake/search, while repair detail owns workflow actions and card/consent/payment history.

**Tech Stack:** Next.js 16.2.6, React 19.2.4, TypeScript, Tailwind CSS 4, lucide-react.

**Spec:** `docs/superpowers/specs/2026-08-30-repair-card-customer-portal-design.md`

## Global Constraints

- Requires Repair Card Foundation and Public Portal plans to be implemented first where referenced.
- Operations remains Admin-only.
- Customer PIN appears only in the internal Repair Card Access section and printable slip, never in list tables.
- No automatic WhatsApp/SMS integration.
- No changes to `main` during development/testing.
- Keep the existing EmmyTech Operations visual language; do not redesign unrelated modules.

---

## File Structure

- Modify `src/app/modules/operations/repairs/page.tsx` — load repairs/cards and render list.
- Modify `src/components/operations/repairs/repairs-client.tsx` — search/list + new intake flow.
- Create `src/components/operations/repairs/customer-identity-field.tsx` — CRM Identity search and fallback contact capture.
- Create `src/components/operations/repairs/device-picker.tsx` — previous EmmyTech device selection/manual device.
- Create `src/components/operations/repairs/card-picker.tsx` — available card selection.
- Modify `src/app/modules/operations/repairs/[id]/page.tsx` — compose focused detail sections.
- Create `src/components/operations/repairs/repair-card-access.tsx`.
- Create `src/components/operations/repairs/repair-quote-panel.tsx`.
- Create `src/components/operations/repairs/repair-payments.tsx`.
- Create `src/components/operations/repairs/repair-work-panel.tsx`.
- Create `src/components/operations/repairs/repair-consents.tsx`.
- Create `src/components/operations/repairs/repair-handover.tsx`.
- Create `src/components/operations/repairs/repair-timeline.tsx`.
- Create `src/app/modules/operations/repairs/cards/page.tsx`.
- Create `src/components/operations/repairs/repair-cards-dashboard.tsx`.
- Create `src/app/modules/operations/repairs/[id]/print/page.tsx` — printable intake slip/internal tag.
- Modify `src/app/modules/operations/sales-actions.ts` — repair action wrappers/revalidation.

---

### Task 1: Repair data read models for Admin UI

**Files:**
- Modify: `src/lib/operations/repair-server.ts`
- Modify: `src/lib/operations/types.ts`

**Interfaces:**
- Produces: `getRepairAdminList`, `getRepairAdminDetail`, `getRepairCardsDashboard`, `getCustomerKnownDevices`.

- [ ] **Step 1: Define focused Admin view types**

Add types for:

```ts
export interface RepairListRow {
  id: string;
  repair_code: string;
  identity_id: string;
  customer_name: string | null;
  customer_phone: string | null;
  device_type: string | null;
  brand: string | null;
  model: string | null;
  status: RepairStatus;
  card_code: string | null;
  current_quote_status: RepairQuoteStatus | null;
  payment_status: 'unpaid' | 'partial' | 'paid' | 'refunded';
  amount_paid: number;
  balance_due: number;
  received_at: string;
  updated_at: string;
}
```

Also define `RepairAdminDetail` with customer Identity, active assignment, quote history, payment history, consents and events.

- [ ] **Step 2: Implement joined queries with explicit relation selects**

Use server-side Admin queries and map numeric values explicitly. Do not expose raw UUIDs in normal UI copy.

- [ ] **Step 3: Implement known-device lookup by Identity**

Return devices from previous Orders/serialized units with enough fields to prefill intake:

```text
original_order_id
inventory_unit_id
brand
model
serial_or_imei
purchase date/order code
```

- [ ] **Step 4: Run TypeScript/Operations tests and commit**

```bash
npm run test:operations
git add src/lib/operations/repair-server.ts src/lib/operations/types.ts
git commit -m "feat: add repair admin read models"
```

---

### Task 2: Rebuild New Repair intake around CRM Identity and card assignment

**Files:**
- Modify: `src/components/operations/repairs/repairs-client.tsx`
- Create: `src/components/operations/repairs/customer-identity-field.tsx`
- Create: `src/components/operations/repairs/device-picker.tsx`
- Create: `src/components/operations/repairs/card-picker.tsx`
- Modify: `src/app/modules/operations/sales-actions.ts`
- Modify: `src/app/modules/operations/repairs/page.tsx`

**Interfaces:**
- Consumes: `/api/operations/identities`, `getCustomerKnownDevices`, available cards, `createRepairWithCard`.

- [ ] **Step 1: Extract reusable Identity search UI from the current Order pattern**

The Repair field must support typing name/phone/email, selecting an existing Identity, and clearing the selection. Preserve the typed contact fields if no Identity is selected so server-side auto-resolution can run.

- [ ] **Step 2: Add previous-device selection**

After an Identity is selected, fetch known EmmyTech devices and show concise options such as:

```text
HP EliteBook 840 G8 · Serial 5CG… · Order OPS-000421
Samsung A15 · IMEI 35… · Order OPS-000388
```

Selecting one fills hidden `original_order_id` and `inventory_unit_id` plus visible device fields.

- [ ] **Step 3: Preserve manual device entry**

Provide “Different / external device” so staff can enter device type, brand, model and Serial/IMEI manually.

- [ ] **Step 4: Add intake fields**

Capture:

```text
condition received
accessories received
fault reported
staff intake note
```

Do not ask for diagnosis/parts/profit during intake; those belong to the repair detail workflow.

- [ ] **Step 5: Add available-card picker**

Show only `available` cards. Make card selection required for the new card-based flow. Use simple labels `RC-01`, `RC-02`, etc.

- [ ] **Step 6: Submit atomically**

The action calls `createRepairWithCard`, returns created repair/card/PIN, revalidates Repairs/Card dashboard and directs staff to repair detail.

- [ ] **Step 7: Commit**

```bash
git add src/components/operations/repairs/repairs-client.tsx src/components/operations/repairs/customer-identity-field.tsx src/components/operations/repairs/device-picker.tsx src/components/operations/repairs/card-picker.tsx src/app/modules/operations/sales-actions.ts src/app/modules/operations/repairs/page.tsx
git commit -m "feat: add identity-based repair intake"
```

---

### Task 3: Repair Card Access and printable intake slip

**Files:**
- Create: `src/components/operations/repairs/repair-card-access.tsx`
- Create: `src/app/modules/operations/repairs/[id]/print/page.tsx`
- Modify: `src/app/modules/operations/repairs/[id]/page.tsx`
- Modify: `src/app/modules/operations/sales-actions.ts`

**Interfaces:**
- Consumes: active card assignment, `regenerateRepairPin`.

- [ ] **Step 1: Build internal Repair Card Access panel**

Show:

```text
Card: RC-07
Physical status: With Customer
Access PIN: K7M4
Assignment: Active
```

Buttons:

```text
Copy PIN
Regenerate PIN
Print Slip
```

No PIN in URL query strings or list tables.

- [ ] **Step 2: Add PIN regeneration confirmation**

Explain that regeneration signs out the customer's existing Repair Card sessions. Call the server action and refresh the displayed PIN only after success.

- [ ] **Step 3: Build print-only intake slip**

Print page includes:

```text
EmmyTech Repair
Repair code
Repair Card code
Temporary PIN
Customer name
Device
Reported fault
Date received
Return-card instruction
```

Use print CSS to remove navigation and make the slip readable on A4/thermal-style printing.

- [ ] **Step 4: Add internal gadget tag block**

Same print page includes a smaller cut-out tag with Repair code, Card code, device and received date. If internal QR generation is already available without adding a dependency, link it to authenticated Admin repair detail; otherwise print the text code only and leave QR artwork to the later physical-card design phase.

- [ ] **Step 5: Commit**

```bash
git add src/components/operations/repairs/repair-card-access.tsx src/app/modules/operations/repairs/[id]/print/page.tsx src/app/modules/operations/repairs/[id]/page.tsx src/app/modules/operations/sales-actions.ts
git commit -m "feat: add repair card access and print slip"
```

---

### Task 4: Diagnosis and versioned quote UI

**Files:**
- Create: `src/components/operations/repairs/repair-quote-panel.tsx`
- Modify: `src/app/modules/operations/repairs/[id]/page.tsx`
- Modify: `src/app/modules/operations/sales-actions.ts`

**Interfaces:**
- Consumes: quote history, `publishRepairQuote`.

- [ ] **Step 1: Build quote composer**

Fields:

```text
Customer-safe diagnosis
Proposed repair/work
Quoted amount
Estimated completion
Payment requirement: None / Partial / Full
Required deposit amount when Partial
```

- [ ] **Step 2: Show current customer approval state**

Display `Awaiting customer approval`, `Approved`, `Declined`, or `Superseded` prominently.

- [ ] **Step 3: Show immutable quote history**

Each version displays amount, requirement, publish time and approval result. Never edit an approved version in place.

- [ ] **Step 4: Require explicit “Publish revised quote” for changes after approval**

A revised quote creates the next version and puts the repair back behind customer approval/payment gates.

- [ ] **Step 5: Commit**

```bash
git add src/components/operations/repairs/repair-quote-panel.tsx src/app/modules/operations/repairs/[id]/page.tsx src/app/modules/operations/sales-actions.ts
git commit -m "feat: add versioned repair quotes"
```

---

### Task 5: Repair payment ledger and payment gate visibility

**Files:**
- Create: `src/components/operations/repairs/repair-payments.tsx`
- Modify: `src/app/modules/operations/repairs/[id]/page.tsx`
- Modify: `src/app/modules/operations/sales-actions.ts`

**Interfaces:**
- Consumes: repair payments, `recordRepairPayment`.

- [ ] **Step 1: Build payment summary**

Show:

```text
Approved quote
Required before work
Paid
Remaining before work
Final outstanding balance
```

- [ ] **Step 2: Build payment recording form**

Use existing Operations-compatible methods:

```text
Bank transfer
POS
Cash
Split
Other
```

Capture amount/reference/date/note.

- [ ] **Step 3: Show chronological payment history**

Each transaction shows amount/method/time/reference. Internal void behavior can be added only if the foundation RPC supports it; do not invent a client-only delete.

- [ ] **Step 4: Surface repair-start lock**

When the customer has approved but the required payment is incomplete, show a clear non-destructive callout:

```text
Repair work is locked until ₦X more is recorded.
```

- [ ] **Step 5: Commit**

```bash
git add src/components/operations/repairs/repair-payments.tsx src/app/modules/operations/repairs/[id]/page.tsx src/app/modules/operations/sales-actions.ts
git commit -m "feat: add repair payment ledger UI"
```

---

### Task 6: Technician workflow, quality check and rework

**Files:**
- Create: `src/components/operations/repairs/repair-work-panel.tsx`
- Modify: `src/app/modules/operations/repairs/[id]/page.tsx`
- Modify: `src/app/modules/operations/sales-actions.ts`

**Interfaces:**
- Consumes: `advanceRepairWorkflow` and current repair gate state.

- [ ] **Step 1: Replace generic status dropdown with contextual actions**

Examples:

```text
Start Diagnosis
Waiting for Parts
Start Repair
Send to Quality Check
Mark Ready for Collection
Resume Rework
Cancel Repair
```

Only render valid actions, but rely on server/database gates as final authority.

- [ ] **Step 2: Keep internal technician fields separate from customer-safe diagnosis**

Capture technician, repair type, parts replaced, parts cost, labour cost, condition returned and internal notes in this panel.

- [ ] **Step 3: Add quality-check completion step**

Do not permit `ready_collection` directly from `in_progress`; require the quality-check path unless the database design explicitly allows a reasoned Admin override.

- [ ] **Step 4: Handle rework visibly**

When customer reports a final-handover problem, show the reported category/comment and a “Resume Repair” action.

- [ ] **Step 5: Commit**

```bash
git add src/components/operations/repairs/repair-work-panel.tsx src/app/modules/operations/repairs/[id]/page.tsx src/app/modules/operations/sales-actions.ts
git commit -m "feat: add repair technician workflow"
```

---

### Task 7: Customer consents, handover and collection

**Files:**
- Create: `src/components/operations/repairs/repair-consents.tsx`
- Create: `src/components/operations/repairs/repair-handover.tsx`
- Modify: `src/app/modules/operations/repairs/[id]/page.tsx`
- Modify: `src/app/modules/operations/sales-actions.ts`

**Interfaces:**
- Consumes: consent records, `beginRepairHandover`, `completeRepairCollection`.

- [ ] **Step 1: Show both approval records separately**

Display:

```text
Repair Authorization — approved/declined + quote version + timestamp
Completion Acceptance — accepted/problem + timestamp
```

- [ ] **Step 2: Build Begin Customer Handover action**

Only available at `ready_collection`. After start, show the countdown/expiry timestamp and tell staff the customer's portal has been temporarily unlocked.

- [ ] **Step 3: Refresh consent state after customer acts**

The Admin page should make the final acceptance/problem visible after normal revalidation/refresh; do not implement aggressive polling unless needed.

- [ ] **Step 4: Build controlled collection form**

Checkboxes/status should reflect real conditions rather than allowing the user to lie around server gates. Require:

```text
Completion accepted
Balance = ₦0
Device handed over confirmation
Repair Card returned
```

If card is missing, reveal an explicit override with mandatory reason.

- [ ] **Step 5: Complete collection atomically**

After success show `Collected`, card assignment closed and card `Available` or `Missing` as appropriate.

- [ ] **Step 6: Commit**

```bash
git add src/components/operations/repairs/repair-consents.tsx src/components/operations/repairs/repair-handover.tsx src/app/modules/operations/repairs/[id]/page.tsx src/app/modules/operations/sales-actions.ts
git commit -m "feat: add repair handover and collection workflow"
```

---

### Task 8: Repair timeline and operational list signals

**Files:**
- Create: `src/components/operations/repairs/repair-timeline.tsx`
- Modify: `src/components/operations/repairs/repairs-client.tsx`
- Modify: `src/app/modules/operations/repairs/[id]/page.tsx`

**Interfaces:**
- Consumes: `ops_repair_events` and list read model.

- [ ] **Step 1: Build internal timeline**

Render event title, actor when available, date/time and internal note/metadata summary without dumping raw JSON.

- [ ] **Step 2: Improve Repairs list columns**

Use concise operational columns:

```text
Repair
Customer / Device
Card
Status
Approval
Payment
Received
```

- [ ] **Step 3: Add attention badges**

Examples: `Awaiting approval`, `Payment needed`, `Ready collection`, `Rework`, `Card missing`.

- [ ] **Step 4: Preserve search**

Search repair code, customer, phone, device, serial/IMEI and card code.

- [ ] **Step 5: Commit**

```bash
git add src/components/operations/repairs/repair-timeline.tsx src/components/operations/repairs/repairs-client.tsx src/app/modules/operations/repairs/[id]/page.tsx
git commit -m "feat: improve repair operations visibility"
```

---

### Task 9: Repair Cards dashboard

**Files:**
- Create: `src/app/modules/operations/repairs/cards/page.tsx`
- Create: `src/components/operations/repairs/repair-cards-dashboard.tsx`
- Modify: `src/components/operations/repairs/repairs-client.tsx`

**Interfaces:**
- Consumes: `getRepairCardsDashboard`.

- [ ] **Step 1: Add summary metrics**

```text
30 Total
Available
With Customers
Missing
Retired
```

- [ ] **Step 2: Add card table**

Columns:

```text
Card
State
Current repair/customer (Admin only)
Assigned since
Action
```

- [ ] **Step 3: Show card history drill-down**

For a selected card show past assignments with repair code, assigned/closed dates. Do not show historical PINs beyond the active assignment; old PINs are operationally unnecessary after closure.

- [ ] **Step 4: Add missing/retired management only through explicit actions**

No direct inline status mutation without reason/audit-capable server action.

- [ ] **Step 5: Link Cards from Repairs page**

Add a compact `Repair Cards` action near the Repairs page title.

- [ ] **Step 6: Commit**

```bash
git add src/app/modules/operations/repairs/cards/page.tsx src/components/operations/repairs/repair-cards-dashboard.tsx src/components/operations/repairs/repairs-client.tsx
git commit -m "feat: add reusable repair cards dashboard"
```

---

### Task 10: Admin UI verification

**Files:**
- No planned source changes unless a verified defect is found.

- [ ] **Step 1: Run Operations tests and production build**

```bash
npm run test:operations
npm run build
```

Expected: exit 0.

- [ ] **Step 2: Walk one complete marked TEST repair**

Verify intake -> Identity -> device -> card -> PIN -> diagnosis -> quote -> customer approval -> payment gate -> repair -> QC -> ready collection -> begin handover -> customer acceptance -> collection -> card available.

- [ ] **Step 3: Walk one rework path**

At final handover choose Report a Problem, verify `rework`, card remains assigned, then resume work.

- [ ] **Step 4: Walk one missing-card override**

Complete a TEST repair with mandatory missing-card reason, verify card becomes `missing` and cannot be assigned again.

- [ ] **Step 5: Clean all TEST data and restore any test card intentionally used for normal return**

Keep only intentionally marked missing test card if testing requires it, then explicitly reactivate it through Admin action so all 30 cards return to expected initial operational state.
