# Dashboard overview contract

`GET /api/dashboard/overview?range=30d` uses the existing `token` header and
`adminAuth`. Only the existing PAMO Admin credential is accepted; student and
Cashier tokens are denied by that middleware. Authentication responses retain
the existing `{ success: false, message }` convention.

Supported ranges are `7d`, `30d` (default), and `thisMonth`. Invalid, repeated,
or structured range values return HTTP 400; other query parameters are rejected.
Ranges use Philippines calendar
days (`Asia/Manila`), including today through the request time: `start` is
inclusive and `end` exclusive. Both are ISO timestamps. The current day is
partial. Current order states, recent orders, and inventory are not filtered
by the financial date range.

A successful response has `success: true` and:

| Field | Meaning |
| --- | --- |
| `range` | `key`, `start`, `end`, `timezone` |
| `currency` | `PHP`: historical merchandise snapshot values, with no currency conversion |
| `summary.totalSales` | Merchandise sales from eligible paid orders, excluding fees |
| `summary.paidOrders` | Unique eligible paid orders in the range |
| `summary.awaitingApproval` | Current `Order Placed` orders |
| `summary.lowStockProducts` | Unique products with at least one applicable size needing stock attention |
| `salesTrend` | Chronological daily `{ date, sales, paidOrders }`, including actual zero days |
| `orderStatusCounts` | Counts keyed by actual persisted workflow statuses; payment is not a new status |
| `recentOrders` | Latest six by creation time, with `_id`, `customerName` from the address snapshot, `amount`, `date`, `status`, `payment`, optional `cancellationSource`, and item-line count `itemCount` |
| `topProducts` | Up to five `{ productId, name, quantitySold, sales }`, ranked by sold quantity, then merchandise sales |
| `lowStockProducts` | Up to five `{ productId, name, affectedSizes: [{ size, stock }] }`, ordered by lowest stock, number of affected sizes, then name/ID |
| `dataQuality` | The coverage and exclusion counts below |

Financial eligibility is defined once: persisted `payment: true`, status other
than `Cancelled`, a valid numeric millisecond `paidAt` in the range, and a
nonempty historical item snapshot with nonnegative numeric prices and positive
integer quantities. Invalid or unsafe monetary snapshots are excluded and
reported. Decimal arithmetic rounds each snapshot price × quantity to centavos
before summing lines. Summary, daily trend, and product ranking use this same
population and calculation; progressing an order cannot count it again.

No current product prices or merchandising tags affect historical sales.
Deleted products remain in rankings using order snapshots; the latest included
snapshot supplies the display name. Missing legacy product IDs remain null,
with snapshot names used only to keep those rankings separate.

Inventory uses the shared inventory helpers: applicable product sizes (or the
existing `One Size` fallback), missing/invalid stock as zero, and the existing
0 / 1–5 / 6+ stock labels. Multiple affected sizes still count as one product.
Only projected product fields are streamed; details are bounded in memory.

## Payment data limitations

- Cashier confirmation records `paidAt`. Current Stripe/PayPal verification
  sets `payment` without recording a confirmation timestamp. These and other
  undated active paid orders are excluded from period analytics; creation time
  is never substituted. `dataQuality.undatedPaidOrders` counts them across all
  dates because their payment period cannot be determined.
- `dataQuality.invalidPaidOrderSnapshots` counts invalid snapshots with a
  valid payment timestamp in the selected period.
- `dataQuality.salesPeriodComplete` is false when either coverage count above
  is nonzero. Consumers must not present an incomplete period as complete.
- Paid cancellations/rejections are excluded from active sales and counted in
  `dataQuality.paidCancelledOrders` across all dates. The repository has no
  refund ledger. This is not a refunds, net receipts, or retained-revenue report;
  exclusion must not be described as a refund.
- The API reads the existing persisted payment flag; it does not independently
  verify payment providers. PayPal currently requests USD while the merchandise
  catalog/Stripe use PHP. This endpoint performs no provider reconciliation or
  conversion and must not be interpreted as a collected-cash report.

All reads are side-effect free. Database failures return HTTP 500 with a generic
message. No analytics tables, caching, payment writes, or frontend changes are
introduced.

Verification follows the existing Node test pattern: `node --test tests/*.test.js`
from `backend`. The database-backed dashboard suite opts in with
`PAMO_DASHBOARD_INTEGRATION=1` and uses a fresh asserted test database, never the
application database. Existing inventory integration remains separately opt-in.
