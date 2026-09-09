# Sales Workbook-Aligned Operations Design

## Goal

Align EmmyTech Operations with the existing Sales Database workbook without importing any historical rows and without recreating the workbook as separate data silos.

The workbook is used only as a field/workflow reference.

## Source Model Reviewed

The workbook contains five operating sheets:

- Phone Sales
- Laptop Sales
- Accessories & Solar
- Repairs
- Stock Inventory

Useful concepts from those sheets are normalized into the OS.

## Architecture

- `identities` remains the canonical customer/person record.
- `ops_orders` remains the commercial/operational transaction.
- `ops_order_items` owns sale-item snapshots and category-specific details.
- `ops_order_payments` owns payment history.
- `ops_inventory_items` owns the item/product type being stocked.
- `ops_inventory_units` owns individual serialized devices (serial / IMEI).
- `ops_suppliers` owns supplier details.
- `ops_repairs` owns repair workflow and links optionally to Identity, original Order and serialized unit.
- `ops_solar_installations` owns solar installation fulfilment linked to an Order item.

No Phone Sales/Laptop Sales/Solar Sales duplicate tables are created.

## Order Types

Orders support:

- laptop
- phone
- accessory
- solar
- other

Repair is a separate module, not a normal sales Order type.

## Order Item Snapshot

Each order item can store:

- item type
- product/item name
- brand
- model
- condition
- list price
- agreed selling price
- unit cost snapshot (admin/internal)
- quantity
- discount
- warranty period
- warranty expiry
- flexible `specs` JSON for category-specific values

### Laptop specs

Workbook-aligned fields include:

- generation
- processor type
- processor speed
- RAM
- storage size
- storage type
- screen size
- touchscreen
- colour
- OS installed
- charger included
- bag included

Serial number belongs to `ops_inventory_units`, not the generic Order item when an internal serialized unit is used.

### Phone specs

Workbook-aligned fields include:

- storage capacity
- RAM
- colour
- network type
- SIM type
- accessories included

IMEI 1 / IMEI 2 belong to `ops_inventory_units` when the actual device is known.

### Accessory specs

Workbook-aligned fields include:

- category
- subcategory
- compatible with
- colour
- condition

### Solar specs

Product/spec fields remain on the Order Item while installation execution lives in `ops_solar_installations`.

## Pricing and Profitability

Orders continue to show customer-facing money simply.

Internal/admin calculations may use:

- unit cost snapshot
- sale price
- discount
- delivery charge
- Ambassador commission
- payment totals

Historical order cost/price snapshots do not change when inventory/product defaults change later.

## Payment Ledger

`ops_order_payments` records individual payments instead of only a yes/no paid state.

Fields:

- order
- amount
- payment method
- reference
- paid at
- note
- recorded by
- void state

Payment methods include workbook-compatible values:

- bank_transfer
- pos
- cash
- split
- other

Order `amount_paid`, `balance_due` and `payment_status` are recalculated from active payment records.

Recommended payment states:

- unpaid
- partial
- paid
- refund_pending
- refunded

Commission remains pending after Order confirmation and becomes earned when the Order is fully paid. Payout remains a separate Ambassador process.

## Sales Staff Attribution

Orders can store:

- sales staff user ID when the closer exists in EmmyTech users
- sales staff name snapshot for historical/display use

This is distinct from original Ambassador attribution, Operations owner and delivery handler.

## Inventory Items

Add workbook-aligned master attributes where useful:

- brand
- default condition
- default unit cost
- default selling price
- supplier (optional default/preferred supplier)

Existing auto SKU remains the inventory-item identifier.

## Serialized Inventory Units

`ops_inventory_units` tracks actual devices.

Fields include:

- inventory item
- serial number
- IMEI 1
- IMEI 2
- condition
- acquisition date
- unit cost
- supplier
- current location
- status
- optional reserved Order / Order Item
- optional sold Order / Order Item

At least one of serial number / IMEI 1 / IMEI 2 is expected for serialized devices, but non-serialized stock continues to use quantity movements only.

Unit statuses:

- available
- reserved
- in_transit
- sold
- repair
- returned
- faulty
- retired

## Suppliers

`ops_suppliers` stores:

- name
- phone
- email
- address
- notes
- active flag

Supplier sourcing/receiving workflows can build on this later.

## Repairs

Repairs are separate because the workbook already shows a distinct lifecycle.

Fields include:

- repair/job code
- Identity/customer
- optional original Order
- optional inventory/serialized unit
- date received / completed / collected
- device type
- brand / model
- serial or IMEI fallback
- purchased from us state
- customer fault report
- technician diagnosis
- repair type
- parts replaced
- parts cost
- labour cost
- amount charged
- repair profit (derived)
- status
- repair warranty period / expiry
- condition received / returned
- payment status
- balance due
- technician user/name
- notes

Repair can later publish CRM/Identity events but does not duplicate the CRM customer history.

## Solar Installation

`ops_solar_installations` links to an Order + solar Order Item.

Fields include:

- installation required
- address
- scheduled date
- completed date
- installer user/name
- installation cost
- system capacity
- status
- notes

Statuses:

- not_required
- pending
- scheduled
- in_progress
- completed
- cancelled

## UI Rules

The normal Order screen stays concise.

Primary cards remain:

- Customer
- Price & Payment
- Source & Commission
- Order Items / Fulfilment
- Next Action

Category-specific details appear in collapsible/smaller item-detail sections rather than 30-column forms.

New Order uses an Order Type selector and reveals only relevant fields.

Admin-only internal cost/profit values are not shown to Ambassador users. Operations remains admin-only for now.

## No Historical Import

This phase MUST NOT copy, migrate or normalize existing workbook rows into Supabase.

The workbook is only the design reference. Historical import is a separate later project after the model and UI are stable.

## Security

All new Operations tables use RLS and `ops_is_admin()` policies. New writes go through admin-checked server/RPC paths.
