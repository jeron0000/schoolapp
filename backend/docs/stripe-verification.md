# SR-3A — contained Stripe verification

Stripe and PayPal remain unavailable. The four authenticated online endpoints
still use the unchanged SR-1 HTTP 503 handler. Checkout controls and return-page
behavior are unchanged. No production router/server imports the new verifier or
webhook factory; no environment flag activates payment creation or confirmation.
No provider client is initialized at production startup by this implementation.

## Durable binding and supported context

`order.stripePayment` is an optional subdocument. It stores one Session identity,
an optional write-once PaymentIntent identity, fixed account ID and boolean mode,
explicit `php` currency, and a positive safe-integer expected amount in centavos.
Successful verification records the captured Charge ID, local `verifiedAt`, and
the first applicable signed event ID when triggered by a webhook. Historical
orders get no default binding, fabricated provider ID, or inferred paid evidence.

`createStripePaymentVerifier` accepts an injected Stripe client and explicit
account/mode/currency policy. It supports direct-account, one-time card Checkout
in PHP only. Connect/organization contexts, recovered replacement Sessions,
subscriptions and other payment methods are rejected. Nothing reads a caller's
account header, browser price, currency, payment flag or transaction override.

Internal `bindSession` requires the authenticated owner, a reserved unpaid Stripe
order at `Order Placed`, a canonical checkout request ID, and stored PHP currency.
It independently retrieves the Session under the fixed merchant context and
checks its ID, mode, amount, currency, environment, `client_reference_id`, and
`metadata.orderId/userId`. The caller's Session ID alone cannot establish trust.
Webhook metadata never creates a binding. The Session must have been created by
the merchant with the required order/owner references; SR-3A creates no Sessions.
A PaymentIntent absent at initial binding can be adopted once from the retrieved
bound Session during settlement; a different prebound intent is rejected.

Account/mode-scoped partial unique indexes prevent Session, PaymentIntent, and
the recorded first event from being attached to different orders. The schema
declares them and every binding/payment mutation explicitly ensures their
availability, following the existing Cashier fail-closed index pattern. Index
failure or duplicate-key conflict prevents mutation. No indexes or application
records were changed by the synthetic verification workflow.

## Authoritative payment and atomic transition

Internal `confirmPayment` scopes lookup to the authenticated owner and local
order; it does not accept a browser-supplied provider ID as settlement evidence.
The provider client retrieves its own Account, the durably bound Session, and
the Session's PaymentIntent with expanded latest Charge. Verification requires:

- Exact account, environment, ownership and order references.
- Session `mode=payment`, `status=complete`, `payment_status=paid`.
- Exact frozen amount/currency across Session, PaymentIntent and Charge.
- PaymentIntent `status=succeeded` and the full expected `amount_received`.
- A successful paid/captured card Charge, with the full expected captured amount,
  the correct intent, and no refund or dispute at first verification.

These checks follow the installed Stripe SDK (20.4.1) and official references:
[Session](https://docs.stripe.com/api/checkout/sessions/object),
[PaymentIntent](https://docs.stripe.com/api/payment_intents/object),
[Charge](https://docs.stripe.com/api/charges/object), and
[Account retrieval](https://docs.stripe.com/api/accounts/retrieve).
Completed checkout alone can still be processing. Captured payment is not an
irrevocable bank payout; future refunds/disputes require separate reconciliation.

One conditional MongoDB order update commits `payment=true`, its first local
`paidAt`, and provider evidence together. The predicate locks the observed owner,
Stripe method, unpaid flag, eligible status, reserved inventory, stored total/
currency, full binding and absence of partial settlement evidence. It never
changes workflow status, products, cart, reservations, restoration, receipts,
Cashier identity, or approval rules. One document needs no separate inventory
transaction or delivery-receipt collection.

Duplicate/concurrent confirmations succeed only with matching persisted verified
evidence; timestamps are stable. A lost response after atomic commit is safely
retryable. `verifiedAt`/new `paidAt` represent local verification time, not Session
creation time or an invented provider settlement timestamp. The first `eventId`
is audit evidence, not a comprehensive webhook delivery ledger. Different events
for the same transaction remain effect-idempotent through the payment CAS.

Cancellation-first or changed-status races reject the stale payment write.
Existing payment-first pre-approval cancellation remains permitted: it preserves
payment evidence and releases stock at most once. This phase does not change
that policy or issue refunds. Cancelled/released late settlements and legacy
paid records without verified bindings remain explicit review cases.

## Amount/currency contract

The expected total comes from the canonical stored order; product snapshots are
validated for whole-centavo precision and safe quantities. Current product data
is never repriced, and the already-included fee is never added again. Conversion
uses decimal digits and integer arithmetic, not floating-point multiplication,
rounding or conversion rates. Sub-cent, unsafe, missing-currency and ambiguous
floating-point totals fail closed (including `0.1 + 0.2` artifacts).

Existing canonical creation still uses major-unit Number arithmetic and the
storefront displays `$` while COD declares PHP. Neither is changed here.
PHP is the explicitly constrained test/integration contract, **not a newly
approved currency policy**. Approved currency, actual merchant support, fees,
rounding policy and account/mode configuration must be verified before activation.

## Signed webhooks — unmounted

`createStripeWebhookRouter` uses bounded `express.raw` bytes and the installed
SDK's `constructEvent` with a 300-second signature tolerance before lookup or
provider operations. It supports only `checkout.session.completed` and
`checkout.session.async_payment_succeeded` from the expected direct-account mode.
Missing/invalid signatures, modified bytes, parsed JSON, unsupported types and
connected/organization contexts fail closed. Event metadata/status never replaces
the authoritative retrieval of an existing bound Session.

A signed completion notification whose payment is not yet settled is acknowledged
as `paid:false, pending:true` without storing processed/paid evidence. A later
supported success notification verifies current state. Out-of-order/duplicate
notifications cannot downgrade or duplicate payment. Failure/expiry events never
cancel an order or restore stock. Provider/DB errors and review conflicts remain
retryable failures with generic messages and no secret logging.

The factory must be mounted **before** `express.json()` in any later authorized
integration, as required by [Stripe webhook guidance](https://docs.stripe.com/webhooks).
The current `server.js` remains unchanged. Loopback tests demonstrate correct
raw-body ordering, preserved JSON routes, and failure when JSON parsing runs first.

## Required work before reactivation

User approval is required before activating any online method. Outstanding work:
server-side canonical Session creation with idempotent provider requests and the
required metadata; durable recovery for provider creation/binding failure;
late-settlement/cancellation review; complete retry/reconciliation policy and
delivery observability; approved currency/fee/rounding policy; verified merchant
account/environment and rotated credentials; authorized webhook wiring and
provider test-mode end-to-end checks; integration/security review and explicit
reactivation authorization. PayPal is a separate phase and stays contained.

No live provider requests, real charges, production reconciliation, credential
rotation, UI changes, authentication changes, or Git publication were performed.
The synthetic tests do not establish production account compatibility, live
delivery reliability, or real MongoDB unique-index/concurrency behavior.

## Verification

Run `node --test tests/stripePayment.test.js` and the full existing backend suite
with all `PAMO_*_INTEGRATION` flags disabled. Tests use synthetic provider responses,
the real SDK's synthetic webhook-signature helpers, mocked models/indexes, the
real cancellation utility with synthetic transactions, and loopback HTTP only.
Existing SR-1/SR-2/COD/Cashier tests remain part of the full regression suite.
