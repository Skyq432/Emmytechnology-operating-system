# EmmyTech Sales System Design

## Purpose

Build Sales as EmmyTech's central commercial transaction workspace without duplicating the CRM, Operations inventory, Operations order, Repair, or Finance domains.

Sales owns the commercial decision and financial customer-facing documents. Operations continues to own physical execution.

The selected architecture is:

> CRM owns the customer relationship. Sales owns quotations, commercial terms, payments, receipts, credit decisions and sales reporting. Operations owns stock and fulfilment. Finance later consumes the same payment and receipt evidence for accounting and reconciliation.

The system must preserve one source of truth for each concern rather than copying records between departments.

## Core Department Boundary

The intended flow is:

```text
Marketing / enquiry
        ↓
CRM Identity / Lead
        ↓
Sales
  quotation / direct sale / order
  price / discount / acceptance
  payment / receipt / credit
        ↓
Confirmed commercial transaction
        ↓
Operations
  stock reservation / transfer
  picking / packing / dispatch
  delivery / collection / repair
        ↓
Finance
  reconciliation / accounting / reporting
```

Sales may display Operations fulfilment state, but it does not duplicate Operations controls.

Operations may display payment and commercial release state when needed for execution, but it does not own pricing policy, quotation acceptance, receipts or credit approval.

## Sales Workspace Navigation

The target Sales workspace contains:

1. Overview
2. Direct Sale
3. Quotations
4. Orders
5. Payments
6. Receipts
7. Customers
8. Credit & Outstanding
9. Returns & Refunds
10. Sales Team
11. Reports
12. Settings

These pages are implemented incrementally. The architecture must support the full list without requiring a second sales data model later.

## Shared Customer Identity

`public.identities` remains the canonical customer/person record.

Every quotation, direct sale and order must resolve to an Identity.

Sales entry searches by:

- normalized phone;
- email;
- name.

If an existing Identity is selected, Sales reuses it and preserves existing CRM, Ambassador and acquisition attribution.

If no Identity exists, Sales creates/resolves one using the same Identity signal/upsert mechanism already used by Operations.

Sales must not create an independent customer master table.

A customer view may aggregate related commercial records through `identity_id`, including:

- quotations;
- direct sales/orders;
- payments;
- receipts;
- repair revenue references;
- returns/refunds;
- outstanding credit.

Detailed CRM activity remains in CRM.

## Shared Order Model

Confirmed sales and normal Orders reuse the existing Operations Order foundation (`ops_orders` and related order items/payments) rather than introducing a competing `sales_orders` table.

Sales adds commercial metadata and Sales-specific read models around the shared Order record.

The Order should distinguish at least:

- normal fulfilment Order;
- direct sale / office sale.

Recommended additive fields include a commercial channel/type such as:

- `order`
- `direct_sale`

and a fulfilment mode such as:

- `operations_fulfilment`
- `immediate_collection`

Exact field names may follow existing repository conventions during implementation, but the domain distinction is required.

### Sales view of an Order

Sales owns/displays:

- customer Identity;
- salesperson;
- source / Ambassador attribution;
- quotation source when applicable;
- items and commercial source type;
- list/default price;
- final selling price;
- discounts and approvals;
- transaction total;
- amount paid;
- outstanding balance;
- payment status;
- credit release state;
- receipts;
- commercial status.

### Operations view of the same Order

Operations owns/displays:

- inventory reservation;
- source location or supplier;
- transfers;
- picking;
- packing;
- dispatch;
- delivery/collection;
- physical handover.

The same Order ID links the two departmental views.

## Direct Sale

Direct Sale supports office/walk-in/immediate-purchase transactions without forcing the customer through a quotation workflow.

Flow:

```text
Find/create CRM Identity
        ↓
Build cart
        ↓
Physical inventory and/or explicit service lines
        ↓
Pricing and discount validation
        ↓
Confirm commercial sale
        ↓
Record/validate payment or Admin credit approval
        ↓
Complete immediate handover
        ↓
Inventory leaves stock
        ↓
Receipt documents
```

A Direct Sale is still represented by the shared Order foundation so customer history, payments, inventory, receipts and reports remain consistent.

## Direct Sale Inventory Rule

Physical products in a Direct Sale must come from real available Operations inventory.

Staff cannot manually type a physical product and bypass inventory.

### Serialized products

For serialized stock such as phones and laptops, Sales must select the exact available inventory unit, including the serial/IMEI where applicable.

The exact unit is linked to the sale and becomes `sold` only when the direct-sale handover is completed.

### Quantity stock

For quantity stock such as accessories, Sales selects the inventory item, location and quantity.

The system validates current available quantity and reduces physical stock through the existing inventory movement/reservation model.

### Services / non-stock lines

Services and legitimate non-stock charges are explicit line types. Examples include installation, setup or delivery charges.

They do not create fake inventory movements.

A transaction may contain both physical and service lines.

## Direct Sale Payment and Handover Gate

A Direct Sale may be commercially confirmed before the full balance is paid so Sales Value and Cash Collected remain distinct.

Physical handover is blocked while balance remains unless an active Admin credit-release approval permits the outstanding amount.

Recommended state behavior:

- confirmed + fully paid -> handover allowed;
- confirmed + partial/unpaid + no credit approval -> handover blocked;
- confirmed + partial/unpaid + valid Admin credit approval -> handover allowed within the approved balance/terms;
- handover completion -> serialized units become sold / quantity stock physically leaves inventory.

This prevents a partial payment from silently releasing expensive stock.

## Quotations

Quotations are potential revenue and must never be counted as actual Sales Value until converted into a commercial transaction.

Quotation lifecycle:

```text
Draft
  ↓
Publish version
  ↓
PDF generated automatically
  ↓
Staff preview
  ↓
Staff optionally sends
  ↓
Customer accepts / declines
  ↓
Accepted version frozen
  ↓
Convert once to Direct Sale OR Order
```

## Quotation Versioning

Published quotation versions are immutable.

A revision creates the next version instead of editing a previously published version.

Recommended model:

- quotation master: stable quotation code/customer/overall lifecycle;
- quotation version: immutable published commercial snapshot;
- quotation items: version-specific item snapshots;
- acceptance: tied to an exact version;
- delivery/send history: records when and where a published version was sent.

Example:

```text
QT-2026-00481
V1 ₦520,000 — Superseded
V2 ₦495,000 — Accepted
```

Accepted versions remain immutable after conversion.

## Quotation PDF and Email Rule

Publishing a quotation automatically generates its PDF.

Email is not automatic.

Staff must preview the generated document and deliberately choose `Send to Customer`.

The system stores separate timestamps for:

- published;
- document generated;
- sent to customer;
- customer accepted/declined.

The company archive/reference copy is recorded when the quotation is sent.

If the staff publishes a revised version, only the selected/current version is sent; previous sent versions remain in history.

## Quotation Acceptance

Both digital and offline acceptance are supported.

### Digital acceptance

The customer receives a secure version-specific acceptance link and may:

- Accept Quotation;
- Decline Quotation.

The acceptance stores an immutable snapshot/reference of the exact version, Identity, timestamp and acceptance method.

### Offline acceptance

Staff may record customer acceptance received through:

- WhatsApp;
- phone call;
- email;
- in person;
- other.

Offline acceptance records:

- exact quotation version;
- acceptance channel;
- note/evidence reference where available;
- staff actor;
- timestamp.

Offline acceptance must remain distinguishable from a customer-authenticated digital acceptance.

## Quotation Conversion

An accepted quotation can be converted exactly once.

Staff chooses one of:

- Convert to Direct Sale;
- Convert to Order.

The resulting transaction receives the accepted version's frozen commercial snapshot.

The quotation records the resulting transaction reference and cannot be converted again.

### Direct Sale conversion

Direct Sale conversion revalidates real available inventory at conversion/checkout time.

If required physical stock is not available, the system does not fabricate inventory. Staff must source/change the transaction or convert to a normal Order where appropriate.

### Order conversion

Order conversion may contain internal stock, pre-order, supplier-sourced, on-demand and service lines. Operations then owns fulfilment decisions.

## Quotation Inventory Rule

A quotation does not reserve stock.

Creating, publishing or sending a quotation leaves inventory sellable.

Customer-facing quotation wording should make clear that stock/pricing remain subject to availability until the sale/order is confirmed.

Reservation begins only under the existing confirmed Order rules or the Direct Sale checkout/handover rules.

## Order / Quotation Fulfilment Sources

Quotation and normal Order lines may represent:

- available internal stock;
- pre-order;
- supplier-sourced;
- on-demand;
- service/non-stock.

Direct Sale physical lines remain restricted to real available inventory.

## Pricing Snapshot

Every commercial line must preserve a frozen pricing snapshot so later catalogue changes do not rewrite history.

Required commercial values include:

- default/list selling price;
- final selling price;
- quantity;
- line subtotal;
- discount amount;
- discount percentage;
- cost basis used for profitability;
- gross profit;
- gross margin;
- discount reason where applicable;
- pricing/discount approval reference when required.

## Official Profitability Measure

Sales uses Gross Margin, not markup, as the official profitability measure.

Formula:

```text
Gross Margin % = (Selling Price - Cost) / Selling Price × 100
```

Gross Margin powers:

- minimum-margin protection;
- discount approval;
- salesperson performance;
- product/category profitability;
- Sales reporting.

Markup may be displayed later as a secondary metric but does not control pricing policy.

## Cost Basis Hierarchy

Sales uses this cost hierarchy:

1. exact serialized-unit cost;
2. weighted/current inventory cost basis for quantity stock;
3. product default cost;
4. supplier/on-demand transaction cost.

Sales staff cannot reduce/alter the cost basis to make a discount appear profitable.

Cost overrides are Admin-controlled, require a reason and are audited.

For supplier/on-demand lines, the commercial transaction must record the expected/approved source cost used for margin decisions. Later actual procurement variance may be reported separately by Operations/Finance without rewriting the original Sales approval evidence.

## Margin Policy

Minimum gross margin is configurable.

Resolution hierarchy:

1. product-specific minimum margin override;
2. category minimum margin;
3. company default minimum margin.

The initial percentages are configuration data, not hard-coded business constants.

Sales Settings must allow Admin to manage these policies without code changes.

## Discount Authority

Discounting uses configurable tiered authority.

Recommended permission levels:

- salesperson;
- sales manager;
- Admin.

Each level can have a maximum discount percentage.

A salesperson/manager discount is permitted only when both conditions pass:

1. requested discount is within that actor's configured authority;
2. final price remains at or above the resolved minimum gross-margin floor.

If either rule fails, a higher approval level is required.

Admin may approve exceptional below-floor pricing with a mandatory reason.

Every approved exception records:

- item/transaction;
- original price;
- requested/final price;
- cost basis;
- resulting gross margin;
- discount percentage/amount;
- reason;
- requester;
- approver;
- timestamp.

No client-side-only pricing bypass is acceptable. Final validation must occur server/database-side at confirmation/conversion.

## Sales Permission Profile

The existing authenticated user remains the actor identity.

Sales permission/authority should be represented separately from general application role where needed so discount thresholds and Sales Manager authority are configurable without conflating all app permissions.

At minimum the Sales domain needs effective levels equivalent to:

- salesperson;
- manager;
- Admin.

Existing Admin users always retain highest authority.

## Payments

Sales is the central commercial reporting surface for customer money received, but source modules retain their canonical payment ledgers.

Current canonical sources include:

- `ops_order_payments` for Orders/direct sales;
- `ops_repair_payments` for Repairs.

Do not copy the same payment into a second mutable Sales payment table merely for reporting.

Instead, build a unified Sales payment read model/event projection over canonical payment rows, with stable source identifiers.

Future billable modules can publish equivalent canonical payment events into the same reporting/receipt interfaces.

Each payment exposes:

- customer Identity;
- source type;
- source transaction/code;
- amount;
- method;
- reference;
- paid timestamp;
- recorded by;
- void/refund state where applicable.

Supported methods remain compatible with existing Operations methods:

- bank transfer;
- POS;
- cash;
- split;
- other.

## Sales Value, Cash Collected and Outstanding

These metrics must never be collapsed into one number.

### Sales Value

Value of confirmed commercial sales after transaction discounts, before later returns/refunds.

Quotations do not contribute to Sales Value.

### Cash Collected

Sum of non-void customer payments actually received during the selected period.

Cash Collected may differ from Sales Value because customers can pay deposits, balances or old credit in a different period from the original sale.

### Outstanding

Unpaid balance on active confirmed commercial transactions, net of valid payments/refunds according to the source transaction.

Example:

```text
Sale Value        ₦500,000
Cash Collected    ₦300,000
Outstanding       ₦200,000
```

Reports must allow the user to understand both commercial closing performance and actual cash collection.

## Receipt Engine

Receipts are immutable customer-facing financial documents generated from canonical payment/transaction snapshots.

Receipt records are separate from mutable payment/order rows so a later product-price change cannot rewrite an issued document.

Recommended receipt types:

- payment receipt;
- final consolidated sales receipt;
- refund/credit document.

Receipt numbering must be unique and human-readable. Exact numbering format may use a shared sequence such as:

- payment: `RCT-P-######`;
- final sale: `RCT-S-######`;
- refund: `RCT-R-######`.

The implementation may include the year if consistent with the company's preferred document numbering, but numbering must remain stable after issue.

## Payment Receipt Rule

Every successful non-void payment creates exactly one payment receipt.

The receipt snapshot includes at least:

- receipt number;
- customer name/contact snapshot;
- customer Identity reference;
- source transaction/code;
- items/service summary where appropriate;
- transaction total;
- amount received in this payment;
- cumulative amount paid after the payment;
- remaining balance;
- payment method;
- payment reference;
- salesperson/recording staff where applicable;
- date/time;
- company details from configured document settings.

Creation must be idempotent so retries cannot issue duplicate receipts for the same source payment.

## Final Consolidated Receipt Rule

When a sale/order becomes fully paid, create exactly one final consolidated sales receipt for that commercial transaction.

The final receipt shows:

- complete purchased items/services;
- final prices and discounts;
- transaction total;
- payment history/summary;
- total paid;
- zero outstanding balance;
- salesperson/source references;
- customer and company details.

For a transaction paid in one payment, the payment receipt and final receipt may both exist internally, but customer delivery should use one email containing the relevant documents rather than sending unnecessary duplicate emails.

Final receipt generation must be idempotent.

A Repair payment receives payment receipts through the same receipt engine, but Repair itself remains operationally owned by Operations. A final Repair receipt policy may use the fully-paid Repair transaction snapshot without turning the Repair into an Order.

## Receipt Email Delivery

Receipt generation is automatic after eligible payments.

Receipt delivery is also automatic for the normal receipt flow.

The system sends the receipt to:

- the customer's email when a valid email exists;
- the configured official EmmyTech company/archive email.

If a customer does not yet have an email, the receipt is still generated and archived; the delivery state records `customer_email_missing` rather than failing the payment.

Email failures do not roll back a successful customer payment. They are recorded as delivery failures and can be retried from the Receipt Centre.

Company/archive email is configuration, not a hard-coded address.

## Document Generation and Storage

EmmyTech's existing LaTeX quotation and receipt templates remain the desired document design source.

The Sales document subsystem must expose a renderer boundary so commercial logic does not depend on the PDF technology.

Conceptually:

```text
Immutable document snapshot
        ↓
Document Renderer
        ↓
PDF bytes
        ↓
Private durable storage
        ↓
Document record + delivery history
```

The renderer will consume the supplied existing LaTeX templates during the document implementation phase.

Before Phase 4 enables production PDF/email delivery, implementation must verify that the deployment runtime can compile/render the LaTeX safely. If the web runtime cannot host a LaTeX compiler, the renderer must run in an isolated compatible worker/container while the Sales application keeps the same renderer interface. Commercial/payment behavior must never depend on shelling out to an unavailable binary at request time.

Generated documents are stored privately (for example in a private Supabase Storage bucket) and accessed by authenticated Admin/Sales staff or time-limited delivery links. Public permanent raw document URLs are not required.

## Receipt Immutability, Void and Reissue

Issued receipts cannot be edited in place or deleted as if they never existed.

Corrections use controlled actions:

```text
Original receipt
      ↓
Void with reason / reference
      ↓
Correct source transaction/payment if permitted
      ↓
Reissue replacement document
```

The audit trail retains both original and replacement document references.

Void/reissue authority is restricted to Admin or an explicitly configured high-authority Sales role.

## Credit Release

Full payment is the normal physical-release rule.

Admin may approve a credit/partial-payment release per transaction.

A credit-release approval records:

- Order/direct sale;
- approved outstanding amount or credit limit;
- due date;
- reason;
- approving Admin;
- timestamp;
- active/revoked/settled state.

Physical release is allowed only if the current outstanding balance is within the valid approval.

A credit approval does not make the transaction fully paid and does not trigger a final consolidated receipt.

The Outstanding/Credit workspace highlights approaching and overdue due dates.

## Returns and Refunds

Completed sales and issued receipts are never deleted to simulate a return.

Returns/refunds are formal linked records against the original commercial transaction.

A return/refund records:

- original transaction;
- original item/quantity/unit where applicable;
- reason;
- returned condition;
- refund amount;
- refund method/reference;
- staff actor;
- required approver;
- timestamp;
- inventory disposition.

Inventory disposition may include:

- returned to available stock after validation;
- faulty;
- returned/inspection;
- retired/other controlled state.

A returned serialized unit must reference the exact original sold unit.

Refunds create a refund/credit document rather than altering the original receipt.

Reporting distinguishes:

- Gross Sales;
- Returns/Refunds;
- Net Sales;
- Cash Refunded.

## Repair Revenue Integration

Repairs remain owned by Operations.

Repair payments feed Sales reporting and receipt generation using the canonical Repair payment ledger.

Flow:

```text
Operations Repair
      ↓
Repair payment recorded
      ↓
Sales unified payment/read model
      ↓
Payment receipt
      ↓
Sales cash/revenue reports
```

Sales must not create a duplicate Repair record.

The Sales UI may link back to the Repair code/detail for context.

## Sales Events and Audit Trail

Important commercial actions emit immutable audit/event records.

Initial event vocabulary should cover at least:

- `quote.created`
- `quote.published`
- `quote.sent`
- `quote.accepted.digital`
- `quote.accepted.offline`
- `quote.declined`
- `quote.converted`
- `sale.created`
- `sale.confirmed`
- `sale.credit_approved`
- `sale.handover_completed`
- `discount.requested`
- `discount.approved`
- `discount.rejected`
- `payment.recorded`
- `receipt.issued`
- `receipt.delivery_succeeded`
- `receipt.delivery_failed`
- `receipt.voided`
- `return.created`
- `refund.recorded`

Events that change money, inventory, quotation conversion, receipt creation or approval must be idempotent and server-controlled.

## Sales Overview

The Overview should answer two questions:

1. What commercial value are we closing/collecting?
2. What needs attention now?

Primary period metrics:

- Sales Value;
- Cash Collected;
- Outstanding;
- Gross Profit;
- Gross Margin;
- Orders;
- Direct Sales;
- quotation accepted/conversion rate.

Attention signals may include:

- quotations awaiting customer response;
- accepted quotations not converted;
- payments/credit due today;
- overdue credit;
- discount approvals waiting;
- high-value open quotations;
- receipt delivery failures;
- returns/refunds awaiting approval.

Quotation value remains separate from confirmed Sales Value.

## Sales Team Performance

Salesperson performance should not rank people only by headline Sales Value.

Supported metrics include:

- Sales Value;
- Cash Collected;
- Outstanding created/managed;
- Gross Profit;
- Gross Margin;
- Direct Sales count/value;
- Orders count/value;
- quotations created/sent;
- accepted quotation value;
- quotation conversion rate;
- discount amount/rate;
- returns/refunds.

Performance reporting must preserve original salesperson/closer attribution even after Operations ownership changes.

No composite leaderboard score is required in the initial build; the data should support one later if management chooses a policy.

## Customer Sales View

The Sales customer page is a commercial summary over Identity, not a replacement CRM.

It may show:

- Identity/contact summary;
- Sales Value lifetime/period;
- Cash Collected;
- Outstanding;
- recent quotations;
- recent orders/direct sales;
- receipts;
- credit status;
- returns/refunds;
- related Repair revenue links.

A link opens the full CRM Identity when detailed relationship history is needed.

## Error Handling and Safety Rules

The system must enforce these rules server/database-side, not only in React:

- every quotation/sale has a valid Identity;
- quotations do not reserve stock;
- accepted quotation converts at most once;
- direct sale physical lines require real available inventory;
- exact serialized units cannot be sold twice;
- quantity stock cannot go negative;
- pricing cannot bypass discount authority/margin rules;
- below-margin exceptions require recorded Admin approval;
- canonical payments are not duplicated merely for Sales reporting;
- one payment creates at most one payment receipt;
- one fully paid sale creates at most one final receipt;
- email failure cannot undo a valid payment;
- stock handover with outstanding balance requires valid credit approval;
- issued documents are immutable;
- returns/refunds preserve original transaction evidence.

Database transactions/RPCs should lock relevant commercial/inventory rows during confirmation, conversion, direct-sale handover and refund-sensitive operations.

## Security

Sales workspace is authenticated and role/permission controlled.

Sensitive values such as unit cost, gross profit, margin floor and internal approval notes are internal-only and must not appear in customer-facing quotation/receipt acceptance pages unless intentionally part of the document.

Digital quotation acceptance uses a secure, unguessable, version-specific token/session flow. A public token must never expose another quotation/customer through enumeration.

Email/API credentials remain server-side environment secrets.

Private document storage uses authenticated access or time-limited signed delivery URLs.

## Reporting Definitions

To keep dashboards consistent:

- **Quoted Value:** value of selected published quotation versions, reported separately from actual sales.
- **Sales Value:** final value of confirmed commercial transactions before later returns/refunds.
- **Gross Sales:** Sales Value before returns/refunds.
- **Net Sales:** Gross Sales minus approved returns/refunds according to reporting period policy.
- **Cash Collected:** non-void payments received in the selected period.
- **Cash Refunded:** actual refund payments in the selected period.
- **Outstanding:** current unpaid amount on active confirmed transactions.
- **Gross Profit:** selling value minus resolved/frozen cost basis on sold lines, adjusted by approved returns where applicable.
- **Gross Margin:** Gross Profit / Sales Value for compatible sold lines, using the frozen cost basis.

Reports must avoid double-counting an Order payment again when it appears through the unified Sales payment projection.

## Settings

Sales Settings should eventually manage configuration data including:

- salesperson discount threshold;
- manager discount threshold;
- company default minimum gross margin;
- category minimum gross margins;
- product overrides;
- official company/archive email;
- company document details;
- quotation validity/default wording;
- receipt/quotation numbering configuration where permitted;
- high-authority void/refund permissions.

Configuration changes affect future decisions/documents and do not rewrite frozen historical snapshots.

## Phase 1 — Commercial Foundation

Phase 1 establishes the safe architecture before building all user interfaces.

Scope:

1. Dedicated `/modules/sales` route and Sales shell/navigation.
2. Shared Sales domain types and pure pricing/margin functions with tests.
3. Sales permission/authority model.
4. Additive commercial metadata on shared Orders for direct-sale/order distinction and Sales attribution where missing.
5. Quotation master/version/item/acceptance/send-history schema.
6. Configurable discount and minimum gross-margin policy schema.
7. Immutable commercial pricing snapshot fields needed on quotation/order lines.
8. Unified Sales payment read model over canonical Order and Repair payment ledgers.
9. Receipt/document metadata schema with idempotency constraints, without enabling production LaTeX/email delivery yet.
10. Credit-release approval schema/gates.
11. Return/refund foundation records needed to preserve immutable original sales.
12. Server/RPC boundaries for Identity resolution, quote publishing/conversion, pricing validation and direct-sale confirmation/handover.
13. Initial Overview read model using Sales Value, Cash Collected and Outstanding definitions.

Phase 1 must be additive/backward-compatible with existing Operations Orders and Repairs.

## Phase 2 — Direct Sales

Scope:

1. Customer Identity lookup/create.
2. Direct-sale cart.
3. Real inventory search.
4. Exact serialized-unit selection.
5. Quantity inventory selection/location.
6. Explicit service/non-stock lines.
7. Controlled pricing and discount approval UX.
8. Payment summary.
9. Credit-release gate.
10. Atomic immediate handover/stock consumption.
11. Direct-sale detail and audit trail.

## Phase 3 — Quotations

Scope:

1. Quotation create/edit draft.
2. Publish immutable versions.
3. Automatic document-generation request/state.
4. Staff preview/send controls.
5. Send history.
6. Digital secure accept/decline.
7. Offline acceptance with channel/audit evidence.
8. Version history.
9. Convert accepted quotation once to Direct Sale or Order.
10. Stock revalidation on Direct Sale conversion.

## Phase 4 — Documents and Receipt Delivery

Scope:

1. Integrate the supplied existing LaTeX quotation and receipt templates behind the renderer boundary.
2. Verify/deploy a compatible LaTeX rendering runtime/worker.
3. Private PDF storage.
4. Automatic payment receipt generation.
5. Final consolidated sales receipt generation at full payment.
6. Automatic receipt email to customer and company archive email.
7. Quotation manual send email flow.
8. Receipt Centre with view/download/print/retry delivery.
9. Void/reissue workflow.
10. Delivery logging and retry behavior.

Production document delivery is not considered complete until rendering and email behavior are tested in the real deployment environment.

## Phase 5 — Credit, Returns and Reporting

Scope:

1. Credit & Outstanding workspace.
2. Due/overdue attention states.
3. Formal returns/refunds.
4. Inventory disposition on returns.
5. Refund documents.
6. Gross Sales / Returns / Net Sales reporting.
7. Salesperson performance.
8. Product/category/source profitability.
9. Discount and margin reporting.

## Phase 6 — Cross-Department Integration and Final QC

Scope:

1. Repair payments visible in Sales reporting/receipt centre.
2. CRM Identity commercial history links/events.
3. Operations commercial-release visibility.
4. Finance-ready reconciliation interfaces/events.
5. End-to-end idempotency, permissions and concurrency tests.
6. Production build/type verification.
7. Marked TEST direct sale, quotation, partial payment, final payment, credit release, return/refund and Repair-payment scenarios.
8. Clean TEST data after verification.

## Explicit Non-Goals for the Initial Sales Build

The initial architecture does not require:

- a second customer database;
- a second inventory database;
- a second Order database;
- a duplicate mutable Sales payment ledger;
- automatic quotation emailing immediately on publish;
- online payment gateway integration;
- tax/VAT automation not already required by EmmyTech's current business process;
- a salesperson leaderboard composite score;
- changing the existing Repair ownership model;
- changing `main` while development/testing is ongoing.

## Acceptance Criteria

The completed Sales system should ultimately demonstrate all of the following:

1. A new or existing customer is resolved to one CRM Identity.
2. A Direct Sale cannot sell a physical item that is not actually available.
3. A serialized unit cannot be sold twice.
4. Quotations never reserve stock.
5. Published quotation versions are immutable.
6. Digital and offline acceptance are distinguishable and auditable.
7. An accepted quotation converts at most once to Direct Sale or Order.
8. Controlled pricing enforces both authority threshold and gross-margin floor.
9. Product/category/company margin configuration resolves predictably.
10. Cost basis follows the approved hierarchy and staff cannot manipulate it casually.
11. Sales Value, Cash Collected and Outstanding are reported separately.
12. Partial payments generate payment receipts; full payment generates one final consolidated receipt.
13. Receipt creation is idempotent and issued receipts are immutable.
14. Receipt email failure can be retried without duplicating payment/receipt records.
15. Admin credit approval is required before stock handover with an outstanding balance.
16. Returns/refunds preserve original sale/receipt evidence and adjust reporting explicitly.
17. Repair payments feed Sales cash/receipt reporting without duplicating the Repair.
18. Orders remain the same shared records seen by Sales and Operations.
19. Historical pricing, cost, margin, approval and document snapshots do not change when current product/settings data changes.
20. `main` remains untouched until the development branch has been tested and explicitly promoted.
