# Operations Location, Cash-Off & Receipt Design

## Goal
Make Front Desk and Operations workflows match EmmyTech's real office structure, make Cash-Off usable consistently in Direct Sale, normal Orders and Repairs, and make final receipts viewable by authorised staff without weakening private document storage.

## Approved behavior

### Front Desk access
- Front Desk has no CRM module access.
- Front Desk does not see Sales Overview.
- Front Desk enters Sales through Direct Sale and Operations through Orders.
- Direct URLs to disallowed Sales/Operations overview pages are blocked/redirected, not merely hidden.

### Staff default branch
- Reuse existing `ops_locations` records; current live stores include Sango and UI.
- Admin/Super Admin assigns each internal staff member a default branch.
- Customer-facing transactions snapshot both the acting staff member and branch.
- Ordinary staff cannot choose a branch per transaction.
- Super Admin and Operations Lead may override transaction branch with a required reason.
- If an operational staff member has no assigned branch, creating a new sale/order/repair is blocked with a clear message.
- Branch attribution is separate from stock source location: a sale handled at Sango may still fulfil stock from UI.

### Cash-Off
- Same rule across Direct Sale, normal Orders and Repairs.
- Staff may apply any amount from zero to the lesser of the customer's available Cash-Off balance and the amount owed.
- Draft Direct Sales/Orders reserve no wallet funds. Cash-Off is debited atomically when the transaction is confirmed.
- Repair Cash-Off is applied only after an approved repair quote exists. Applying it immediately debits the wallet and counts toward the repair payment/start gate.
- Low-level wallet debit functions are not exposed as a generic staff control. Staff invoke transaction-specific guarded RPCs.
- Every redemption is idempotent and linked to the commercial transaction.
- Eligible cancellation reverses the Cash-Off with a compensating ledger credit; ledger history is never deleted.
- Reporting distinguishes gross transaction value, Cash-Off redeemed and actual cash/customer payment received.

### Receipts
- Existing final sales/repair receipt infrastructure is reused.
- Private `sales-documents` storage remains private.
- Authorised staff request receipt access through the server; the server verifies capability/transaction access and returns a short-lived signed URL.
- Document rendering/storage is performed through a privileged backend path after staff authorisation, rather than requiring Front Desk direct storage permissions.
- Final receipt snapshots permanently include staff, branch, gross amount, discounts, Cash-Off, actual payments and balance.
- View Final Receipt is available from Direct Sale, normal Order, Repair and the receipt centre where the user has the corresponding operational capability.

## Security
- Continue using the central role/capability model.
- Do not broaden `ops_is_admin()` for ordinary staff.
- Branch assignment is Admin/Super Admin controlled.
- Branch override is Super Admin/Operations Lead only and requires an audit reason.
- Cash-Off balance is rechecked inside the same database transaction that applies a redemption.
- Redeem/refund operations use stable idempotency keys.
- Schema/function/RLS changes must be committed as migration files before applying them live.

## Out of scope
- New physical branches beyond existing Operations locations.
- New accounting package integration.
- Rebuilding receipt templates from scratch.
- Allowing ordinary staff to edit their own default branch.
- Changing the existing Ambassador/Marketing workspace.
