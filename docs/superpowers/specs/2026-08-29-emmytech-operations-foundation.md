# EmmyTech Operations Foundation Specification

## Goal
Build the first live EmmyTech Operations workspace around internal inventory and internal order tracking between the in-house team.

## Product and inventory separation
- `public.products` remains the website/marketing catalogue.
- Operations inventory is independent and uses `ops_inventory_items`.
- An Operations item may exist without a website product.
- A website product may exist without an Operations item.
- Linking is optional and explicit through `ops_website_product_links`.
- Linking does not automatically make physical stock equal website stock.

## Operations order model
Operations owns the internal execution of an order after a requirement/order enters the team. An Operations order can originate from CRM, a website product, an internal request, WhatsApp/manual entry, or another source.

An order must support:
- human-readable order code
- customer/reference information without requiring a CRM record
- current status
- priority
- current team/owner
- due date
- one or more order items
- items linked to internal inventory when relevant
- items linked only to website products when relevant
- fully manual/non-catalogue items when relevant
- immutable activity timeline
- internal handovers with acknowledgement

## Initial order statuses
`new -> confirmed -> stock_check -> assigned -> picking -> packing -> ready_dispatch -> dispatched -> delivered -> completed`

Exceptional terminal/side statuses: `cancelled`, `on_hold`.

The UI must not silently move an order backwards through the normal fulfilment flow.

## Internal inventory model
Inventory must support:
- internal SKU
- item name
- description
- category
- unit
- serial tracking flag
- reorder level
- active/inactive status
- locations
- stock ledger movements
- reserved quantities
- optional website links

Physical inventory quantity is an Operations concern. Website publication/allocation is separate.

## Website relationship types
- `stocked`
- `preorder`
- `on_demand`
- `dropship`
- `service`
- `display_only`

## Initial workspace
`/modules/operations` becomes a real workspace with:
- Overview
- Orders
- Inventory
- Website Links

The later foundation expansion will add Suppliers, Procurement and Receiving after this core is proven.

## Database rules
- New Operations tables use the `ops_` prefix.
- New Operations tables have RLS enabled from day one.
- Existing `public.products`, CRM and Ambassador tables are not restructured by this release.
- Database changes are additive and must not alter current production behaviour.
- Stock and order history tables are append-oriented audit records.

## Access for first release
Existing EmmyTech admin users can access Operations. The schema leaves room for dedicated Operations team membership/roles later.

## Technology
- Next.js 16 App Router
- React 19
- TypeScript
- Supabase/PostgreSQL
- Existing EmmyTech OS UI primitives and shell
- No separate login and no separate application

## Open-source references
- `BoviliusMeidi/inventory-management`: Next.js/Supabase architecture, inventory and order patterns.
- `infiniteoo/wms`: warehouse workflow, activity/timeline and operational feature ideas.

Code must be adapted to EmmyTech rather than copied as a standalone application.