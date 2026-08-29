# EmmyTech Order Integration Design

## Purpose

Make Operations orders the operational transaction record that connects CRM, Ambassador, Spin/Cash-Off, Products, Inventory and delivery without turning the Order page into a duplicate CRM screen.

The selected architecture is:

> Each module owns its data but publishes important events and links through IDs.

Identity connects the person. Order connects the transaction. Important events connect the modules.

## Core UX Rule

An Order page stays intentionally small and operational. It should show only what staff need to understand and fulfil the sale:

1. Customer
2. Order items
3. Price, discount and payment
4. Source / Ambassador commission
5. Fulfilment and delivery
6. Next action
7. Short operational timeline
8. Compact links to related CRM/lead/conversion records

Detailed CRM history, Spin Wheel history and marketing activity remain in their own modules.

## Shared Identity

- `public.identities` remains the canonical person/customer identity.
- Operations orders link to `identity_id` instead of creating a separate customer record whenever a match exists.
- Order entry searches Identity by normalized phone first, and may also match email/name.
- If a likely match exists, the operator confirms the suggested Identity and the form fills known customer details.
- If no match exists, Operations may create a new Identity as part of order creation in a later phase; Phase 1 will support selecting an existing Identity and manual customer entry without destructive merging.
- Opening the related Identity from an Order should be one click.
- CRM should later expose related Operations orders using the same `identity_id`.

## Draft and Confirmation Rule

Orders use two commercial states conceptually:

- Draft: editable preparation. No stock reservation, no commission, no Cash-Off redemption, and no CRM stage automation.
- Confirmed: business commitment. Confirmation may trigger stock reservation, CRM movement, attribution lock and pending commission.

The current Operations fulfilment status field remains for physical workflow. A new commercial state is additive so existing fulfilment status behavior is preserved.

## CRM Integration

- CRM remains the owner of funnel state and customer history.
- Order confirmation publishes an `order.confirmed` business event.
- If the linked Identity is below CRM Stage 5, confirmation advances it to Stage 5 (Purchase).
- It must never move an Identity backwards if CRM already places the customer at Stage 5 or higher.
- CRM stage changes use the existing CRM history/manual-update mechanisms so CRM remains authoritative.
- Payment confirmation can later publish `payment.confirmed` and allow CRM to advance into Stage 6 when the existing CRM rules say that is appropriate.

## Attribution

An order must preserve distinct responsibilities rather than one generic "owner":

- acquisition source
- original Ambassador, if any
- marketing/source reference, if any
- sales closer/creator
- current Operations owner/team
- delivery/transport handler

Moving responsibility does not erase original attribution.

When an Order comes from an existing lead/identity, Operations should derive the original Ambassador from the existing lead/CRM attribution when available.

## Pricing

Orders and order items need a frozen commercial snapshot so historical orders do not change when website prices or commission rules change later.

Order pricing must support:

- unit/list price
- quantity
- subtotal
- discount type
- discount amount
- discount percentage when applicable
- Cash-Off amount
- delivery charge
- final order total
- amount paid
- balance due
- payment status

Discount types should support at least:

- website sale
- ambassador discount
- negotiated discount
- campaign/promotion
- Cash-Off redemption
- manager discount
- bundle discount
- loyalty discount
- manual adjustment

A manual discount should record who approved it and an optional reason.

## Ambassador Commission

Commission is an order-level commercial snapshot linked to the attributed Ambassador.

Required state:

- ambassador_id
- commission_rate
- commission_amount
- commission_status

Recommended statuses:

- none
- pending
- earned
- paid
- cancelled

Rules:

- Draft Order: no pending commission.
- Confirmed Order with eligible Ambassador: pending commission.
- Payment confirmed: pending -> earned.
- Cancelled before earning: pending -> cancelled.
- Commission rate and amount are frozen on the Order so later default-rate changes do not rewrite history.
- Ambassador dashboard should read the shared conversion/order-linked commission state rather than receiving copied numbers.

## Inventory and SKU

- Operations SKU is automatically generated; staff should not manually invent it.
- Recommended pattern: `ET-INV-000001`, `ET-INV-000002`, ...
- SKU identifies the inventory item, not its location.
- Locations are separate from SKU because the same item may move between Sango and UI.

## Locations

`ops_locations` remains the location master.

Initial EmmyTech operational locations:

- Sango
- UI
- In Transit

Inventory availability is location-aware.

Inventory screens should support filtering by location and show total plus per-location quantities.

## Reservation vs Physical Stock

Order confirmation should reduce **available-to-sell** stock through reservation, not immediately pretend that the physical unit left the building.

Example with 10 units on hand and confirmed order quantity 1:

- on hand: 10
- reserved: 1
- available: 9

When the item physically leaves the location:

- on hand: 9
- reserved: 0
- available: 9

If the order is cancelled before fulfilment, the reservation is released without a fake stock movement.

## Supplier / Third-Party Fulfilment

A line item may be fulfilled from:

- Sango stock
- UI stock
- internal transfer
- supplier / third party
- direct/drop-ship path

Later supplier tracking must record:

- supplier
- source location/supplier
- destination location
- transport method
- staff/rider/company handling the movement
- expected arrival
- actual receipt
- receiving staff
- accepted quantity/condition

Stock only becomes available at an EmmyTech location after receipt is acknowledged.

## Transport / Delivery

Transport should support:

- EmmyTech staff
- dispatch rider
- supplier delivery
- courier
- EmmyTech vehicle
- other

The Order should expose only the current delivery summary: handler, status, destination and ETA. Detailed movement history stays in Operations movement records.

## Event Backbone

Modules publish important business events rather than directly rewriting every other module.

Initial event vocabulary:

- `order.created`
- `order.confirmed`
- `order.cancelled`
- `order.stock_reserved`
- `order.stock_released`
- `order.dispatched`
- `order.delivered`
- `payment.confirmed`
- `cashoff.redeemed`
- `commission.pending`
- `commission.earned`
- `commission.cancelled`

`ops_order_events` remains the Order operational timeline. Cross-module customer-visible/history events may also be reflected into `identity_events` with the linked `identity_id`.

Events must be idempotent where money, inventory or commission changes are involved.

## Order Health / Next Action

The Order should eventually calculate a small operational summary:

- On Track
- Attention
- At Risk
- Blocked
- Overdue

and expose one clear `Next action` with owner and due time.

This is a later UI/workflow layer; Phase 1 only establishes the data required for it.

## Phase 1 Scope

Phase 1 delivers the safe foundation needed before Transfers/Suppliers/Dispatch are built:

1. Auto-generated inventory SKU.
2. Seed/use Sango, UI and In Transit operational locations.
3. Add Identity, Lead and Ambassador links to Operations orders.
4. Add commercial state (`draft` / `confirmed`).
5. Add order pricing, discount, Cash-Off summary and payment fields.
6. Add frozen Ambassador commission snapshot/status.
7. Add inventory reservation ledger/state separate from physical movement.
8. Add transactional Order confirmation RPC that:
   - requires draft state,
   - locks attribution,
   - reserves available inventory where requested,
   - creates pending commission when eligible,
   - advances CRM to Stage 5 only when it is below Stage 5,
   - records Order and Identity events,
   - does not redeem Cash-Off or mark payment confirmed yet.
9. Add Identity lookup/autofill in Order creation.
10. Update the Order UI to show only the necessary commercial/fulfilment summary.
11. Expose related Order links from CRM in a later dedicated CRM UI increment, using the same `identity_id`.

## Out of Phase 1

These are intentionally deferred until the foundation is tested:

- supplier master and purchase orders
- transfer workflow between Sango/UI
- receiving workflow
- courier/dispatch records
- serial/IMEI unit tracking
- real payment ledger/invoice/receipt workflow
- Cash-Off redemption/refund automation
- Ambassador payout execution
- returns and repairs
- advanced order-health rules

## Security

New Operations integration tables/functions must use RLS and server-side/RPC writes.

The existing project currently has older public tables with RLS disabled, including `identities`, `identity_events`, older CRM tables and Spin Wheel tables. Do not blindly enable RLS without correct policies because it could break current flows. New Operations code should avoid exposing new direct client writes to those tables; integration writes should be server-controlled.

## Non-Negotiable Data Rules

- `public.products` remains the single website Product catalogue.
- `ops_inventory_items` remains the internal Operations item master.
- Product and inventory remain optionally linked.
- Website product stock is not automatically treated as internal warehouse stock.
- Inventory changes that affect quantity are transactional.
- Order confirmation never moves CRM backward.
- Draft orders do not affect stock, commission or CRM stage.
- Historical price/discount/commission snapshots do not change when defaults change later.
- Original Ambassador attribution survives later department handoffs.
- The normal Order page stays concise; detailed histories stay in their owning modules.
