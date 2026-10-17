# SR-3B — contained PayPal verification

## Boundary and existing defect

SR-1 remains unchanged: authenticated Stripe/PayPal creation and browser-return
verification endpoints return HTTP 503 before order, stock, cart or provider
operations. Both checkout selections remain disabled. No production server,
controller or router imports this verifier or mounts its webhook factory.

The previous PayPal flow created an approval order and trusted browser success
without a completed capture lookup or durable provider binding. It also labeled
PHP-derived numerical totals as USD. Existing security/financial documentation
records these defects; historical orders are not repaired or reinterpreted here.
Approval and even a completed Orders response alone do not establish settlement.

## Durable binding and supported contract

Optional `order.paypalPayment` records a provider order ID, optional capture ID,
fixed merchant ID and sandbox/live environment, explicit PHP currency, and safe
integer expected centavos. First settlement adds the completed capture identity,
local `verifiedAt`, and first webhook event ID if applicable. Nothing defaults or
backfills these fields on historical records.

`createPayPalPaymentVerifier` requires an injected `PayPalVerificationClient`,
explicit merchant/environment/currency, and an optional configured webhook ID.
The client subclasses the installed Checkout Server SDK solely to preserve raw
webhook-event bytes in signature postbacks. Other JSON and OAuth serialization
delegate unchanged to the SDK. No client is initialized at production startup.
No credentials or production configuration were added.

Supported evidence is deliberately narrow: direct merchant, CAPTURE intent,
one purchase unit, one full final capture, PHP. Multiple units/captures,
authorizations, refunds and payment instructions/FX evidence fail closed.
Unknown environments and arbitrary API hosts are rejected. PayPal resources
do not supply Stripe's `livemode`; authenticated SDK API host selection defines
the environment boundary, which is frozen and checked before each request.
SDK and current `api-m` sandbox/live hosts are allowlisted. Response links are
never followed as request destinations.

Internal `bindOrder` requires the owning user, a canonical request ID, an unpaid
reserved PayPal order at `Order Placed`, and explicit stored PHP currency. It
independently GETs the supplied PayPal ID and checks intent, amount, currency,
payee merchant ID, and both purchase-unit `reference_id` and `custom_id` against
the local order ID. A future authorized server creation flow must supply these
references. This phase creates no provider orders or captures. A capture present
in the retrieved order can be bound, but binding alone never marks payment paid.
Webhook data cannot create a binding. Historical missing identities require review.

Merchant/environment-scoped partial unique indexes protect provider order,
capture, and first recorded event IDs. Binding/payment writes explicitly ensure
these indexes exist and fail closed on unavailable uniqueness or duplicate keys.
Schema index declarations follow existing patterns; review index deployment
before restarting against a real database. All verification here mocked indexes;
no database connection, index deployment, migration or record mutation occurred.

## Authoritative settlement and conditional update

Internal `confirmPayment` accepts the local order and owning user. Browser flags,
redirects, prices or transaction overrides do not establish settlement. It GETs
the durably bound provider order, verifies its references/payee/amount/currency,
requires its single capture to be completed and final, then independently GETs
that capture. Capture identity, related order ID, merchant, amount, currency and
completed/final status must agree. A prebound capture cannot be replaced. Pending,
declined, failed, refunded, partially refunded, partial or ambiguous evidence
cannot produce a paid write. Provider responses must be successful HTTP 200.

One conditional order update commits `payment=true`, its first local `paidAt`,
capture ID and verification evidence together. The predicate protects observed
owner, method, unpaid flag, status, reserved inventory, total/currency, full
binding and absence of partial paid evidence. It never writes stock, cart,
workflow status, administrative approval, receipts or Cashier confirmation.

Concurrent/duplicate confirmations return success only with matching durable
paid evidence; original timestamps remain stable. Lost responses after a commit
are retryable. Provider/DB failures return generic errors without secrets and
do not automatically cancel or release stock. The first event ID is evidence,
not a complete delivery ledger. Subsequent events are effect-idempotent through
the paid-state guard and conditional update.

Cancellation-first and stale status/amount/binding updates cannot settle released
orders. Existing payment-first pre-approval customer cancellation still preserves
paid evidence and restores stock at most once. No refund policy changes. Already
verified retries acknowledge historical verification without fetching later
refund/dispute state. Late settlement, refunds/disputes, reservation recovery and
ongoing reconciliation require later SR-5 work before activation.

## Webhooks — authenticated but unmounted

`createPayPalWebhookRouter` bounds raw JSON to 256 KiB. The service accepts raw
bytes, validates UTF-8/JSON and required transmission headers, then posts the
exact received event bytes, configured webhook ID and five PayPal headers to
`/v1/notifications/verify-webhook-signature` through the authenticated client.
The SDK's normal JSON.stringify would reformat the event; the isolated serializer
preserves whitespace and escapes inside `webhook_event`. Certificate URLs are
limited to PayPal HTTPS certificate paths and are never fetched locally.

Only provider `verification_status=SUCCESS` permits local lookup. Only v2
`PAYMENT.CAPTURE.COMPLETED` capture events are supported; identity/payee/amount/
currency must match a prebound order, and first settlement still retrieves fresh
provider order/capture state. Duplicate or out-of-order completion events cannot
duplicate effects. Unsupported/reversal events cannot downgrade or release stock.
An unsettled or conflicting event receives a non-2xx retry/review response,
without storing processed/paid evidence. Future mounting must precede JSON
middleware; parsed bodies fail closed. Unrelated JSON routes stay unchanged.

## Currency and activation blockers

PHP is only the constrained dormant test contract, **not approved PayPal policy**.
No USD relabeling, FX, inferred historical currency or merchant-support assumption
is introduced. Canonical stored totals include their existing fee; no repricing
or fee is added. Decimal digits and integer arithmetic enforce exact centavos,
safe totals/quantities and item precision. Unsupported sub-cent and floating-point
artifacts fail closed rather than being silently rounded. Existing canonical
Number arithmetic and storefront currency presentation are unchanged.

Before reactivation: approve currency/fee/rounding policy, verify merchant PHP
capability and account/app/environment, rotate exposed credentials separately,
review real MongoDB index/concurrency behavior, implement authorized canonical
provider creation/capture with operation-specific PayPal-Request-Id and durable
binding/recovery, coordinate cancellation/late settlement and refunds/disputes,
define retry/reconciliation/observability, configure authenticated webhook wiring,
run separately authorized sandbox end-to-end checks, and obtain explicit user
reactivation approval. SDK compatibility must be tested with actual response
shapes; no dependency upgrade occurred. Real captures are outside this phase.

## Research and verification evidence

Antigravity 1.3.4 was present. `agy --version`, `agy --help`, `agy help` and
`agy models` were checked. Model discovery failed with restricted session-file
access and a sign-in response. No Gemini model/research prompt was invoked;
no credentials, records or private source were transmitted. Main-agent fallback
read official PayPal documentation directly on 2026-10-14:

- [Orders v2](https://developer.paypal.com/api/orders/v2/schema.json), schema 2.36:
  CAPTURE intent, purchase-unit references/payee and order versus capture status.
- [Payments v2](https://developer.paypal.com/api/payments/v2/schema.json), schema
  2.12: capture retrieval, completed state, related order ID and payee.
- [Webhooks v1](https://developer.paypal.com/api/webhooks/v1/schema.json), schema
  1.11: signature request fields and SUCCESS/FAILURE response. These API schemas
  did not provide publication dates; version numbers are not SDK versions.
- [Webhook integration](https://developer.paypal.com/api/rest/webhooks/rest/):
  exact postback event formatting and sandbox event testing.
- [Webhook overview](https://developer.paypal.com/api/webhooks/overview/), updated
  June 4, 2026: authentication, app scoping and retries (up to 25 over three days).
- [Currency codes](https://developer.paypal.com/api/codes/currency), updated
  August 17, 2026: PHP availability is not merchant receiving-capability proof.
- [Idempotency](https://developer.paypal.com/api/rest/reference/idempotency/),
  updated August 11, 2026: operation-specific request IDs for future POST retries.

Run `node --test tests/paypalPayment.test.js`, then all backend tests with
inventory/Hero/admin-dashboard/Cashier-dashboard integration flags disabled.
Synthetic SDK requests, mocked signature responses/models/indexes, real SDK
serialization, real cancellation utility with mocked transactions, and loopback
HTTP verify contained behavior. Tests prove neither PayPal's real cryptographic
verification/merchant capability nor actual MongoDB indexes/concurrency. No live
provider requests, real payments, production DB, UI edits or Git publication.
