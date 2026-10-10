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
10-unit processing charge in that total. The endpoint neither adds nor removes
fees. Nonnegative finite amounts are rounded to centavos before integer summation;
unsafe amounts are reported as exclusions and an unsafe accumulated sum fails.
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
cancellation preserves payment metadata, and no refund ledger exists. This API
does not represent net receipts or pretend cancellation is a refund.

### Phase 2.1 metadata and remaining coverage limits

Before Phase 2.1, Stripe/PayPal verification saved only `payment: true`.
Neither flow persists a provider success/capture timestamp, session/intent ID,
capture payload or independent transaction/receipt record. Stripe has no webhook
or settlement lookup; PayPal creates an order but has no capture/status lookup.
Both existing authenticated return callbacks accept `success: "true"`.
Their success rules and authorization remain unchanged. Analytics reads this
application truth; it does not claim independently verified provider settlement.

On the first unpaid-to-paid callback, an atomic update now saves numeric `paidAt`
using the backend confirmation-time clock, matching cash confirmation and range
boundaries. This is **local application confirmation time**, not provider
settlement time. An existing `paidAt` is
preserved. Already-paid retries never replace the time or populate missing
historical metadata; concurrent callbacks remain one Order/payment. Failed or
cancelled callbacks do not receive a payment timestamp. Creation, modification
and provider session-creation times are never substituted for successful-payment
time. The dashboard does not repair Orders on read.

New order creation snapshots the backend's actual currency: COD/Stripe `PHP`,
PayPal `USD`, using the same constants as the provider requests. There is **no
global PHP invariant**. Amounts, provider requests and cash confirmation behavior
are otherwise unchanged. Client-supplied timestamps/currencies are ignored.

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
and PayPal's actual USD checkout, with no FX conversion or reconciliation added.

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
`paymentMethod: 'COD'`, finite positive stored amount. Provider orders or unusable
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
calls, caches or dependencies. PAMO analytics and both frontends remain frozen.

## Verification

Run `node --test tests/*.test.js` from `backend`. Focused tests execute real
analytics functions with projected cursor fixtures, plus the actual HTTP route
and existing Cashier authorization. They cover range/date/money semantics,
coverage gaps, reconciliation, bounded ordering, projection and safe failures.

`PAMO_CASHIER_DASHBOARD_INTEGRATION=1` additionally enables the real MongoDB test.
It asserts and uses a fresh `pamo_cash_test_*` database, never writes the
application database, verifies persisted-record reconciliation and read-only
behavior, and removes only its own isolated test database afterward.

`PAMO_INVENTORY_INTEGRATION=1` enables the existing isolated inventory/payment
suite, extended with actual request-currency assertions, persisted confirmation
times, concurrent retry stability, unchanged amounts/status/stock and preserved
legacy metadata. Provider API calls are mocked; no real charge/capture is sent.
`PAMO_DASHBOARD_INTEGRATION=1` runs the unchanged PAMO dashboard integration suite.
