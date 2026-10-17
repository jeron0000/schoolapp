# SR-1 online payment containment

Stripe and PayPal checkout and browser-return confirmation are temporarily
unavailable. The server rejects these operations until provider-authoritative
verification is implemented. There is no environment switch that restores the
old client-success behavior.

## API boundary

The existing authenticated POST routes remain mounted under `/api/order`:

- `/Stripe` (also the existing case-insensitive `/stripe`)
- `/Paypal` (also `/paypal`)
- `/verifyStripe`
- `/verifyPaypal`

All four controller exports use one unconditional handler. After existing
authentication, it returns HTTP 503 with `{ success: false, message }` explaining
that online payments are temporarily unavailable and existing online payments
require PAMO review. It performs no database or payment-provider operations.
Direct handler calls are contained too.

Creation is rejected before order creation or stock reservation, including
retries. Verification rejects every browser success/failure flag without
marking an order paid, changing payment metadata, clearing carts, cancelling
orders, or releasing stock. No provider SDK is initialized by this controller.
There is no order lookup or disclosure in the rejection response.

COD `/place`, Cashier confirmation, order history, approval/status rules, and
explicit owner/admin cancellation retain their existing behavior. Cashier
confirmation still only accepts eligible unpaid COD orders. Core inventory and
authentication utilities are unchanged.

## Customer interface

Checkout keeps Pay as you claim available. Stripe/PayPal cards remain visible
but disabled with unavailable wording; footer badges disclose that status.
The payment-return page shows a terminal review notice and links to My Orders
and Contact PAMO. It does not interpret query flags, call verification APIs,
redirect, clear a cart, or remove a saved checkout request.

## Existing and in-flight payments

No historical order or reservation is automatically changed. An existing
`payment: true` or `paidAt` value is not independent settlement evidence.
Likewise, a browser failure flag or provider timeout does not prove nonpayment.
Keep ambiguous attempts for separately authorized reconciliation with provider
records. Do not automatically cancel, release stock, refund, or rewrite history.
Existing explicit cancellation remains governed by its original conditions.

Before re-enabling either provider, implement persisted provider/order bindings,
canonical amount/currency checks, verified settlement/capture and authentic
webhooks, idempotent local payment transitions, and settlement/cancellation
reconciliation. Preserve old timestamps and resolve records with missing
provider IDs without fabricating evidence. Currency and late-settlement policy
require explicit approval. Rollback should retain containment rather than restore
client-flag acceptance.

## Safe verification

From `backend`, run `node --test tests/*.test.js` only after disabling all seven
integration flags using the [root verification checklist](../../README.md#verification-commands-and-ownership).
The containment tests use synthetic tokens, model/provider mocks and loopback
HTTP; they create no real provider transactions or database records.

The existing opt-in inventory suite now expects containment and unchanged
pending/paid online snapshots. It still exercises COD and explicit cancellation
when separately authorized against its isolated database. Do not enable it
against production resources.

From `frontend`, `node --test tests/paymentContainment.test.js` uses installed
React SSR/esbuild with in-memory output and synthetic image URLs. It verifies
COD availability, disabled online controls, truthful return-page behavior and
footer messaging. Also run the existing lint and build commands.
