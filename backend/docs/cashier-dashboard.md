# Cashier Dashboard overview contract

`GET /api/order/cashier/dashboard/overview?range=today` follows the existing
`/api/order/cashier/*` route convention and uses the existing `token` header and
`cashierAuth`. It accepts the existing Admin credential and database-authorized
Cashier accounts; missing, invalid, customer and revoked sessions are rejected.
The overview introduces no authentication changes, frontend integration or writes.

Only `range` is supported. Omission defaults to `today`; empty, unsupported,
repeated, structured and extra parameters receive HTTP 400. Database failures,
cursor failures and unsafe monetary sums receive a generic HTTP 500, never a
successful zero response. Valid empty data returns numeric zeros and empty lists.

## Calendar and trend

The operational timezone is `Asia/Manila`, matching the existing PAMO calendar
convention. UTC millisecond timestamps remain unchanged in storage. Boundaries
are calculated with UTC calendar operations and Manila's fixed UTC+08 offset,
independent of the server timezone. Start is inclusive; request-time end is
exclusive, consistent with the existing dashboard API.

| Range | Start | Trend granularity |
| --- | --- | --- |
| `today` | Current Manila midnight | Hour, through the current partial hour |
| `last7days` | Current day plus previous six calendar days | Day |
| `last30days` | Current day plus previous 29 calendar days | Day |
| `thisyear` | January 1 in Manila | Month, through the current partial month |
| `alltime` | Null | Month from first dated eligible payment to current month; year when this exceeds 120 months |

Each point has a stable `key`, a simple calendar `label`, numeric `amount`, and
`transactionCount`. Points are chronological and missing buckets are zero-filled.
All-time data without any dated eligible payment has no dated points. Its
`undatedAmount` and `undatedTransactions` explicitly reconcile otherwise valid
undated payments, rather than assigning them a fabricated calendar bucket.

## Canonical payment truth

There is no separate payment/transaction/receipt model. The existing Cashier
Transactions and Receipt Records pages use Orders with `payment: true`.
One Order `_id` is one business payment; callbacks and repeated state transitions
do not add transactions. Existing checkout request-ID uniqueness and atomic
manual confirmation remain untouched.

Collections use **stored `Order.amount`**, not item snapshot sums or current
product prices. Current reservation stores the merchandise subtotal plus the
10-peso processing charge in that total. The endpoint neither adds nor removes
fees. Eligible amounts must have exact, safe centavo precision; fractional-cent
and invalid amounts are excluded for review, not rounded into collections.
An unsafe accumulated sum fails.
Average is total collected divided by eligible paid transactions, rounded to
centavos; no transactions yields zero. The optional `Order.paymentCurrency`
snapshot identifies the unit of the stored amount; it has no default.

`paidAt` drives historical selection, never order creation time. Date-less paid
Orders cannot be attributed to a selected historical period. All Time can include
their otherwise eligible stored amounts, explicitly separated from its trend and
excluded from timestamp-sorted Recent Payments.

Unpaid orders, including cancelled/rejected orders and unsuccessful payment
attempts, never contribute collections. Already-paid cancelled orders retain
their collected amount: the actual Cashier Transactions view retains them,
cancellation preserves payment metadata and records eligible refund obligations.
There is no executed-refund ledger or refund subtraction in this API. It reports
historical collections, not net receipts; cancellation is not a completed refund.

### Current payment, currency, and refund boundaries

New COD orders use the approved PHP monetary contract and canonical server-side
prices. Cashier confirmation requires an unpaid `Sent to Cashier` order, COD,
explicit PHP currency, an exact positive total, and a valid unique official
receipt number. Its atomic update records payment, receipt, staff identity, and
local confirmation time, then returns the order to `Packing`. Duplicate or
conflicting confirmations do not overwrite existing evidence. Unknown historical
currency/precision is not repaired to make an order payable.

### Receipt index readiness (CQ-8B2)

`backend/utils/receiptIndex.js` owns lazy receipt-index readiness, requested only
after Cashier eligibility checks. It preserves the existing index exactly:

```js
{ receiptNumber: 1 }
// Options:
{
    name: 'cashier_receipt_unique',
    unique: true,
    partialFilterExpression: { receiptNumber: { $type: 'string' } }
}
```

Concurrent confirmations share initialization. Success is cached for the current
connection/database/client/collection context; connection lifecycle events and
context replacement invalidate it. Failure blocks payment and permits a later
retry. Obsolete initialization cannot authorize payment or erase newer readiness.
A final synchronous assertion precedes the unchanged atomic payment update.
Duplicate keys retain HTTP 409; other readiness failures retain the safe HTTP 500.
No schema index, global startup dependency, historical backfill, or index migration
is introduced. Missing historical receipts remain excluded by the partial filter.

Mocked tests verify these boundaries, not live MongoDB index behavior. The guard
does not cancel operations already handed to Mongoose, alter its buffering policy,
or detect out-of-band index deletion on an unchanged connection. Index maintenance
requires controlled reinitialization/restart; real index and concurrency validation
still requires the approved disposable replica set under CQ-8B3 safeguards.

### Other payment boundaries

Public Stripe/PayPal creation and browser-verification endpoints return HTTP 503
before order, cart, stock, or provider work. Browser success flags are not payment
evidence. Server-authoritative verifier utilities and webhook router factories
exist, but neither provider webhook router is mounted in `server.js`. Their
presence does not authorize activation or establish live settlement compatibility.

Payment recovery remains a dormant metadata/decision foundation: no worker,
scheduler, automatic inventory release, or provider execution is activated.
Eligible paid cancellations retain payment evidence and create a durable
`Refund Required` obligation in the cancellation/inventory transaction. Unpaid
COD without contradictory evidence derives `Not Required`; ambiguous records
require review. `Refund Pending`, `Refunded`, and `Refund Failed` require real
process/evidence and are not writable states of the current workflow. No refund
execution or manual payout-confirmation endpoint exists.

See [containment](payment-containment.md), [Stripe](stripe-verification.md),
[PayPal](paypal-verification.md), [recovery](payment-recovery.md),
[cancellation/refunds](cancellation-refunds.md), and [PHP money](php-money.md).
Credential rotation, isolated database concurrency, provider integration/refunds,
and live Cloudinary operations retain documented verification limitations.

### Historical Phase 2.1 context and remaining coverage limits

Before the later security phases, online callbacks trusted browser success flags
and lacked the current provider-binding/verifier infrastructure. Phase 2.1 added
local confirmation timestamps and currency snapshots; its old PayPal checkout
used USD. Those historical descriptions are not the current executable payment
contract. PHP approval does not reinterpret old USD or missing-currency records.
No historical provider identifiers, timestamps, or currencies are fabricated.
The dashboard does not repair Orders on read.

Only explicit `paymentCurrency: 'PHP'` contributes to Peso totals, transaction
counts, trends, methods and recent payments, regardless of method label.
Missing/malformed currency is counted in `currencyUnresolvedPaidOrders` for
**every** method. Known non-PHP currency is counted separately in
`nonPhpPaidOrders`; it is never converted or mixed into Peso totals. Both make
coverage incomplete. Eligible real legacy method labels are preserved, with an
absent/blank label returned as `null`.

No historical currency or payment time is inferred from today's configuration,
method name, receipt number or order creation date. There is no persisted
alternative canonical source in the current model/write paths from which to
recover missing values. No backfill/migration or application-data write was
performed. Older unpaid Orders can receive a future local confirmation time,
but retain unknown currency unless it was already stored truthfully.

A read-only development audit during Phase 2.1 found one paid Order: one valid
`paidAt`, zero missing/invalid payment times, zero known currency snapshots,
one unknown currency, and zero alternative provider metadata records. The
missing-time distribution by method was empty. These counts describe the audit
snapshot, not a permanent data guarantee; the currency cannot be safely repaired
from that record. Full-provider Peso coverage remains limited by unknown history
and historical foreign-currency records, with no FX conversion or reconciliation
added. The old PayPal USD checkout is disabled, not a current payment option.

Consumers must respect `collectionPeriodComplete` and `trendComplete`; a valid
response may have incomplete coverage and must not be presented as a complete
collection report. Exclusion counters can overlap, and undated paid-order counts
cover all dates because their period is unknowable. Currency/invalid-amount
counters cover dated payments in range plus undated candidates. The paid
cancellation counter covers all dates and indicates retained paid records,
not exclusions/refunds.

## Response

A successful response contains `success: true` plus:

| Field | Contract |
| --- | --- |
| `range` | `key`, ISO `start` (null for All Time), ISO `end`, `timezone` |
| `currency` | `PHP`, for the eligible collection amounts |
| `summary` | Numeric `totalCollected`, `paidTransactions`, `awaitingPayment`, `averageTransaction` |
| `collectionTrend` | `granularity`, `points`, `undatedAmount`, `undatedTransactions` |
| `paymentMethodBreakdown` | Real `{ method, transactionCount, amount, percentage }` rows; largest amount first, then method |
| `awaitingPayments` | At most five oldest actionable queue entries, with stable ascending `_id` ties |
| `recentPayments` | At most five latest eligible dated payments within range, with stable descending `_id` ties |
| `dataQuality` | `undatedPaidOrders`, `invalidPaidAmounts`, `currencyUnresolvedPaidOrders`, `nonPhpPaidOrders`, `paidCancelledOrders`, `nonActionableAwaitingOrders`, `collectionPeriodComplete`, `trendComplete` |

Method percentages use **collected amount**, not transaction count, rounded to
two decimal places. Independent rounding may total 99.99/100.01; zero money yields
zero percentages. Zero-amount successful payments still count as transactions.

Awaiting Payment is **current and range-independent**. Eligibility follows the
existing manual confirmation guards: `status: 'Sent to Cashier'`, `payment: false`,
`paymentMethod: 'COD'`, explicit PHP currency, and an exact positive stored amount.
Provider orders or unusable
amounts shown in the broader workspace queue are counted explicitly as
`nonActionableAwaitingOrders`, not as payments the Cashier can confirm.

Awaiting rows contain `_id`, historical `studentName`, item-line `itemCount`
(matching the existing Cashier table), stored `amountDue`, `status`,
`sentToCashierAt`, `waitingSince`, and `waitingTimeSource`. A missing queue-entry
time uses a valid order-creation timestamp explicitly labelled `orderCreated`;
it never fabricates `sentToCashierAt`. Completely unknown waiting times are null
and sort last. All detail timestamps use the existing numeric millisecond format.

Recent rows contain `_id`, historical `studentName`, `amount`, `paymentMethod`,
actual `receiptNumber` or null, `paidAt`, and `status`. No receipt/reference is
fabricated. Snapshot names avoid student lookups; no email, phone, address, user
ID, confirmation identity, authentication data or provider payload is returned.

One projected lean Order cursor reads canonical paid records and the current
queue. It retains only five records per detail list plus aggregate buckets and
methods. There are no catalog/user joins, N+1 reads, writes, new indexes, provider
calls, caches or dependencies introduced by the overview. This endpoint does not
mutate orders, inventory, payment evidence, or refund obligations.

## Verification

From the repository root, run
`node --test backend/tests/cashierDashboard.test.js` with all integration flags
disabled for synthetic verification. Focused tests execute real
analytics functions with projected cursor fixtures, plus the actual HTTP route
and existing Cashier authorization. They cover range/date/money semantics,
coverage gaps, reconciliation, bounded ordering, projection and safe failures.

`PAMO_CASHIER_DASHBOARD_INTEGRATION` explicitly opts into the real MongoDB test.
It asserts and uses a fresh `pamo_cash_test_*` database, never writes the
application database, verifies persisted-record reconciliation and read-only
behavior, and removes only its own isolated test database afterward.

`PAMO_INVENTORY_INTEGRATION` and `PAMO_DASHBOARD_INTEGRATION` opt into the separate
inventory and PAMO dashboard database suites. CQ-8B3 replaced their legacy
application-environment loaders with the shared isolated-test helper; they no
longer read `.env` or use application connection settings. Do not enable them
without a verified isolated server/configuration; generated names alone do not
establish safe isolation. Provider fixtures never establish real payment
settlement. See the root [testing guide](../../README.md#seven-opt-in-mongodb-integration-suites)
for all seven suites, their configuration ownership, and verification limits.
