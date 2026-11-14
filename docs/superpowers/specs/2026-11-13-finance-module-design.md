# Finance Module Design (full plan, phased)

Status: DRAFT for owner review, 2026-11-13. Nothing is built yet.

## Goal
Turn the empty Finance space in EmmyTech OS into the place where the owner sees where the money comes from, where it goes, who owes us, who we owe, what we pay staff, and whether each month made a profit, per branch.

Finance covers the six areas already promised in the menu: **income, expenses, receivables, payables, payroll and budgets**.

## Where we start from
Finance does not start empty. Sales and Operations already record most of the money coming in. Finance **reads** that data and never copies it, following the rule in the Sales spec: *"Finance later consumes the same payment and receipt evidence for accounting and reconciliation."*

| Already in the database | What Finance uses it for |
|---|---|
| `ops_order_payments`, `ops_repair_payments` (joined in `sales_unified_payments`) | Money in, by method (bank transfer, POS, cash, split, other), date and staff |
| `sales_revenue_balances` | Sales value, cash collected, outstanding balance and gross profit for each order and repair |
| `sales_credit_releases` | Approved customer credit with due dates (receivables) |
| `sales_refunds` | Money paid back to customers |
| `ops_inventory_units.unit_cost`, `ops_order_items.unit_cost_snapshot`, repair `parts_cost` / `labour_cost`, solar `installation_cost` | Cost of goods sold, for gross profit |
| `ops_suppliers`, `ops_inventory_units.supplier_id` | Who we buy stock from (no bills or supplier payments yet) |
| `payouts`, `ambassador_bonuses`, `ops_orders.commission_*`, `spin_cashout_requests` | Money owed or paid to ambassadors and Spin Wheel winners |
| Cash Off redemptions | Discount given, which is not cash received. Reports keep it separate. |
| `ops_locations` (Sango, UI) and staff default branch | Splitting every figure by branch |

**Missing today:** expenses, money accounts (banks, POS terminals, cash drawers) and their balances, supplier bills and supplier payments, payroll, budgets.

## Who sees what
| Role | Access |
|---|---|
| Super Admin, Admin | Everything. Record and approve expenses, bills, payroll and budgets. |
| Staff at a branch (Front Desk, Operations Lead, Technician) | **Petty cash only**: log their own petty cash spending for admin approval. No other Finance pages. |
| Growth Lead, Sales Analyst | **View only**: Overview, Reports, Receivables, Payables, Budgets. No editing. Payroll shows totals only, never individual salaries (to be confirmed, see Q4). |
| Everyone else | No Finance access (unchanged) |

This needs Finance added to `growth_lead` and `sales_analyst` in `MODULE_ACCESS` ([roles.ts](EmmyTech-OS: src/lib/auth/roles.ts)), plus a new `FINANCE_NAV_KEYS` / `FINANCE_ACCESS` pair and `finance.*` capabilities in the same style as Sales and Operations.

## Finance menu (final shape)
1. **Overview**: money in and out today, this week and this month, by branch
2. **Money In**: every customer payment from Sales and Repairs (read-only)
3. **Expenses**: what the company spends, with receipt photo and category
4. **Accounts**: bank accounts, POS terminals and cash drawers, with running balances
5. **Receivables**: who owes EmmyTech, and how late they are
6. **Payables**: who EmmyTech owes (suppliers, ambassadors, Spin Wheel cash-outs)
7. **Payroll**: staff pay and monthly pay runs
8. **Budgets**: monthly limit for each expense category, against actual spend
9. **Reports**: monthly Profit & Loss, by branch, with CSV download

## How it is built (owner decision 2026-11-13)
- **The existing EmmyTech OS code is not touched** while Finance is being built.
- Finance is written as a **separate project** in `C:\Users\USER\Downloads\EmmyTech-Finance`, using the same stack, versions and look (Next.js 16, React 19, Tailwind 4, Supabase).
- It runs against a **local test database on this PC** (PGlite: real Postgres inside the app, owner decision 2026-11-13) holding **TEST data only**, never the live EmmyTech database.
- Only when Finance is finished and passes testing with that data does it get merged into EmmyTech OS, with the owner's OK.
- Anything that has to change in existing code (Finance access in `roles.ts`, the "Received into" picker on payment forms, the supplier bill step when stock is received) is written as separate, clearly labelled merge patches in `EmmyTech-Finance/merge/`. They are applied only at merge time.
- `EmmyTech-Finance/MERGE.md` lists every file, migration and patch, and where each one goes.

## Phases
Each phase ships on its own, gets tested with real data, and is reviewed by the owner before the next phase starts.

### Phase 1: Finance shell + Money In overview (no new data entry)
- Finance sub-menu, access rules and capabilities as above. The "we are currently working on this" placeholder is removed.
- **Overview** shows money collected (today, week, month, custom range) split by branch, payment method and source (sale, repair). It also shows refunds paid, Cash Off redeemed (shown apart from cash) and net cash in.
- **Money In** is a searchable list of all payments from `sales_unified_payments`, with void status, staff and branch, plus CSV download.
- **Why first:** it is useful on day one, it reads only existing data, and it shows straight away whether staff record payments properly. Every later phase depends on that.

### Phase 2: Accounts + Expenses
- **Accounts are created by admins in the app, never hard-coded** (owner decision 2026-11-13). If EmmyTech starts using OPay tomorrow, an admin clicks **Add account** and creates "OPay". If it later opens Kuda, the admin adds "Kuda" the same way. No developer is needed.
  - Fields: name (e.g. "OPay – Main"), type (bank / mobile money / POS terminal / cash drawer), provider (OPay, Kuda, Moniepoint, GTBank, ... free text), last 4 digits of the account number, branch (or "company-wide"), opening balance + opening date, active yes/no.
  - An account EmmyTech stops using is **archived, not deleted**. Its history and balance stay in the reports, and it simply no longer appears in pick lists.
- **Every payment says which account received it.** The Sales and Repair payment forms get a **Received into** account picker, filled in automatically from the staff member's branch + payment method (e.g. a transfer at Sango defaults to the Sango bank account). Staff can change it. A **split** payment is recorded as separate parts, one per account.
- Payments recorded before this change show as **Unassigned** in Finance. An admin can bulk-assign them, or they are counted from the opening-balance date only.
- New `finance_expense_categories` table (rent, fuel and transport, data and airtime, electricity and diesel, repairs parts not on a job, marketing, salaries, other) that admins can edit.
- New `finance_expenses` table: amount, date, category, branch, account paid from, payee, note, and a receipt photo (private storage bucket, short-lived signed links like sales documents).
- Transfers between accounts (for example, cash banked from the drawer), so balances stay correct.
- Account balance = opening balance + money in − expenses − refunds − payouts ± transfers.

### Phase 3: Receivables + Payables
- **Receivables** lists every order and repair with an outstanding balance (`sales_revenue_balances`) and any approved credit due dates (`sales_credit_releases`). Ageing buckets: not due, 1–30, 31–60, 60+ days late. Each row has a WhatsApp reminder link.
- **Payables** (confirmed 2026-11-13: EmmyTech does take stock and pay the supplier later) adds two new tables:
  - `finance_supplier_bills`: stock bought from a supplier, with amount, due date, and a link to the stock units received. When Operations receives stock on credit, it creates the bill in the same step, so the debt is never forgotten.
  - `finance_supplier_payments`: what was paid against each bill and from which account. Part payments are allowed, and the bill shows paid / part-paid / overdue.
  - For each supplier: total owed, what is overdue, and a payment history.
- Payables also shows money already owed elsewhere in the system: earned ambassador commissions not yet paid, pending `payouts`, and pending `spin_cashout_requests`.

### Phase 4: Profit & Loss + daily cash-up
- **Monthly P&L per branch and in total:**
  Revenue − Cost of goods = Gross profit − Expenses − Payroll = Net profit.
- **Daily cash-up:** at close, admins enter the cash counted in each drawer. The system shows expected vs counted and flags any difference, which needs a reason.
- **Simple bank check:** tick off payments against the bank statement. Unmatched items stay flagged.

### Phase 5: Payroll
- Staff pay profile (Super Admin only): base salary, fixed allowances, payment account.
- Monthly pay run: draft → admin approves → marked paid. Each paid line becomes a salary expense automatically.
- Deductions for salary advances and loans, with the balance carried forward.
- Optional: staff sales commission added to the pay run (needs a rule, see Q4).

### Phase 6: Budgets
- Monthly budget for each expense category, per branch and in total.
- Budget vs actual on the Overview, with a warning at 80% and 100%.

## Rules every phase follows
- **One source of truth.** Finance reads Sales and Operations records. It never re-types or copies them.
- **Money records are never deleted.** A mistake is voided with a reason, the same way payments are today, and every change is logged with who and when.
- **Security as in the rest of the OS.** RLS on every new table, staff act through guarded RPCs, and migration files are committed before anything goes live. Receipts and payslips stay in private storage.
- **Naira only,** stored as `numeric`.
- **Test data first.** Each phase is checked with TEST records, which are then cleaned up, as in the Sales build.

## Out of scope (for now)
- A full double-entry ledger or chart of accounts for an accountant. Phase 4 data can be exported to one later.
- Tax filing (VAT, PAYE, FIRS). The fields can be added once we know which apply.
- QuickBooks, Zoho or Sage integration.
- Other currencies.
- Staff recording anything other than petty cash. Bills, payroll and budgets stay admin-only.

## Questions for the owner (needed before or during each phase)
1. ~~Money accounts~~ **Answered 2026-11-13:** admins create accounts in the app as EmmyTech opens them (OPay, Kuda, ...). Split payments are recorded as one part per account.
2. ~~Petty cash~~ **Answered 2026-11-13:** staff can record petty cash spending. Design: staff log a petty cash expense from their branch cash drawer (amount, category, note, receipt photo). Admin approves or rejects it. Staff see only their own entries, never totals or other Finance pages.
3. ~~Supplier credit~~ **Answered 2026-11-13:** yes, EmmyTech takes stock and pays later, so the full supplier bills + payments design goes ahead.
4. **Payroll** (Phase 5): **partly answered 2026-11-13:** staff *may* earn commission, so the pay run gets an optional commission line per staff member (commission rules set per staff member, zero by default). Still open: fixed monthly salaries? Should Growth Lead and Sales Analyst see total payroll, or no payroll at all?
5. ~~Referral Tracker POS~~ **Answered 2026-11-13:** it is EmmyTech's own money. Finance includes Referral Tracker POS deposits and withdrawals as their own income stream and in account balances.
6. ~~Opening balances~~ **Answered 2026-11-13:** Finance starts counting from the month in which data is first entered. When an account is set up, its balance on the first day of that month is the opening balance. Payments before that month are not counted in Finance.
