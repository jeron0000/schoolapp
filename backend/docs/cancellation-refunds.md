# SR-6B4 cancellation and refund obligations

Eligibility is unchanged: customers may cancel their own Order Placed orders;
Admin may reject Order Placed orders. Paid status is never cleared by cancellation.
Cancellation and the optional refund obligation share the existing MongoDB
transaction with at-most-once inventory release. Historical orders without a
reservation marker do not receive invented stock restoration.

Recorded paid cancellations create one optional `refund` subdocument with
`status: Refund Required` and `requiredAt`. Payment identifiers, receipts,
timestamps, amounts, currency and provider evidence remain intact. Duplicate
cancellations return existing state without replacing obligation timestamps.

Unpaid COD with no contradictory payment/refund/recovery metadata is Not
Required (derived). Missing/malformed payment flags, contradictory paid metadata
and unpaid online attempts return 409 requiring payment review before a new
cancellation. No provider closure or nonpayment is inferred. Existing cancelled
historical paid/unknown records show Refund Required or payment-review wording
without database backfill. This does not independently verify historical payment.

The five classifications are Not Required, Refund Required, Refund Pending,
Refunded and Refund Failed. Only the first two are reachable in this phase.
Pending requires a real initiated process; Refunded requires verified provider
evidence or a separately authorized auditable manual confirmation; Failed
requires an actual failed attempt. No refund status setter, execution endpoint,
manual cash payout confirmation, amount conversion, queue or scheduler exists.
The schema rejects unsupported later states; browser/staff request fields cannot
set them. No refund amount or completion date is fabricated.

Customer history strips internal provider/staff/recovery metadata after deriving
a safe refund summary. My Orders and existing staff detail panels distinguish
order cancellation from refund completion using existing theme styles.

Stripe/PayPal remain contained; provider refunds and recovery execution remain
absent. Paid amounts still represent historical collections, not net revenue or
refunded balances. Financial reconciliation, refund amount/currency policy,
refund initiation/confirmation permissions and evidence retention must be
approved before a real refund workflow is added.

Tests use synthetic model/provider fixtures. Existing provider settlement race
tests and inventory integration tests remain relevant. Mock tests do not prove
MongoDB transaction behavior; opt-in suites require a separately configured
isolated database. No live refunds or application database mutation are authorized.
