# Operations Transfers, Reporting and Attribution Design

## Goal

Extend the approved EmmyTech Operations foundation so staff can correctly assign Ambassador attribution on Draft orders, review/confirm orders safely, move stock between UI and Sango with or without a customer Order, and review Operations by reporting month/date range.

## Access

Operations remains admin-only for now. Admin currently represents EmmyTech staff. Ambassador users do not receive Operations access simply because an Order credits them with commission. Fine-grained staff roles and permissions are deferred to the Administration module.

## Order Attribution and Confirmation

- Draft Orders may have no Ambassador, an automatically detected Ambassador, or an Admin-selected Ambassador.
- The Draft form must show an Ambassador selector independent of whether CRM auto-detected one.
- Auto-detected attribution should preselect the Ambassador and label it as automatic.
- Admin may manually choose/change the Ambassador while the Order is Draft.
- Selecting an Ambassador enables commission percentage and shows the estimated pending commission before confirmation.
- Order confirmation freezes `ambassador_id`, `commission_rate`, `commission_amount`, and attribution source.
- Confirmed attribution is not casually editable; later corrections require a dedicated audited correction flow.
- Orders list should show `Review & Confirm` for Draft orders and `Continue Order` for confirmed orders.
- The Order detail Next Action should explain what staff should do next.

## Stock Transfers

Stock transfer is its own Operations workflow and does not require a customer Order.

A transfer can be:

1. Standalone: e.g. UI -> Sango for restocking.
2. Order-linked: e.g. an Order needs a unit currently at UI, so it moves UI -> Sango before customer fulfilment.

A transfer changes location, not company ownership. UI -> Sango must not reduce total EmmyTech stock.

### Transfer states

- `in_transit`
- `received`
- `cancelled`

Creating/starting a transfer immediately moves physical stock from the source location into the `TRANSIT` location. Receipt moves the same quantity from `TRANSIT` into the destination.

### Transfer fields

- transfer code
- source location
- destination location
- optional related order
- inventory item
- quantity
- carrier type: EmmyTech staff, dispatch rider, supplier delivery, courier, EmmyTech vehicle, other
- optional staff user
- carrier/person name
- phone/reference
- note/reason
- started by / started at
- received by / received at

### Reservation behavior

Standalone transfers may only use available stock.

Order-linked transfers may move stock reserved for that same Order. When a reserved unit moves:

- reservation location changes source -> In Transit on transfer start;
- reservation location changes In Transit -> destination on receipt;
- the Order item remains reserved for the same customer;
- the Order item source location becomes the destination after receipt.

For Phase 1 of Transfers, an order-linked transfer must move the full active reservation quantity for the selected Order item. Partial splitting of one reservation is deferred to avoid ambiguous reservation ownership.

## Reporting Period

Reuse the existing `ReportingPeriodProvider` and `ReportingPeriodPanel`. Add an `operations` audience so help text describes Operations metrics.

The same selected reporting period follows the user across Operations pages.

### Overview

Metrics reflect records in the selected period:

- orders created
- confirmed orders
- completed orders
- order value
- discounts
- Cash-Off recorded on Orders
- pending/earned Ambassador commission
- transfer count
- items moved
- recent Orders/events in the period

Current attention items may still show live state where clearly labeled.

### Orders

Orders default to the selected reporting period using `created_at`, with additional status/search filtering inside that period.

### Inventory

Inventory uses **as-of** reporting, not item-created-date filtering.

For a selected period:

- On hand as of period end = stock movements before `endExclusive`.
- Reservations as of period end = reservations created before `endExclusive` whose release/fulfil/cancel timestamps are not before that end.
- Available = on hand - reserved, clamped at zero.
- Also show movement totals during the selected period.

Current month is a live view. Older periods are historical/read-only summaries.

Inventory also supports a location filter: All, Sango, UI, In Transit.

### Transfers

Transfers default to the selected reporting period by `created_at`, plus location/status filters.

## Security

All new transfer tables and write functions use RLS and `ops_is_admin()` authorization. No Ambassador access is added. Integration writes remain server/RPC controlled.

## UI

Operations navigation becomes:

- Overview
- Orders
- Products
- Inventory
- Transfers
- Website Links

Continue using EmmyTech blue and the simple `?` help pattern.

## Testing

- Pure transfer rule tests for valid locations/status behavior.
- Existing Operations tests remain green.
- Database TEST records validate standalone transfer, order-linked reserved transfer, receipt, stock totals, and cleanup.
- Local `npm run build` remains the final Next.js/TypeScript verification gate before further cross-module changes.
