# SR-5B — dormant payment recovery foundation

## Disabled by design

This phase adds optional order metadata and an internal metadata-only utility.
No production server/controller/router/job imports it. There is no executor,
activation flag, provider client, scheduler, public recovery API, inventory import,
stock-restoration function, cancellation or capture/refund operation. Every
evaluation returns `releaseEligible:false`, and persisted decisions validate that
it remains false. Even terminal observations cannot authorize stock release.

SR-1 HTTP 503 containment and disabled online selections remain unchanged.
COD, Cashier, canonical reservation/pricing, cancellation, SR-2, SR-3A/B, SR-4/4F
and approved UI are untouched. Existing paid pre-approval cancellation still
preserves paid evidence and may restore stock without a refund; its financial
reconciliation risk is not silently repaired by this phase.

## Metadata and internal contract

`order.paymentRecovery` is optional, with no default, migration, index or checkout
attachment. Historical/COD orders remain unchanged. Metadata functions scope reads
by local order ID and owning user ID; future wiring must supply authoritative
authorization, never treat this internal utility as a public endpoint.

- `revision`: safe non-negative integer, advanced on each metadata write.
- `phase`: `hold` or sticky `review`; neither permits execution or restoration.
- `historyComplete`: initialization on an existing order always sets **false**.
  No helper upgrades it. Future canonical creation/binding integration must
  establish complete coverage explicitly; a populated journal is not proof.
- `operations`: immutable IDs, server-generated UUID provider request keys,
  caller-supplied canonical payload hashes, observed binding/order hashes and timestamps.
  One identity per supported operation kind (`create`, `capture`, `close`) matches
  the current one-provider-attempt-per-order contract. A different same-kind
  identity/payload/binding conflicts; no replacement or automatic retry.
- Journal transitions: `planned → in_flight → unknown/resolved`, or
  `unknown → resolved`. `resolved` requires a result hash and is immutable.
  These states describe recorded operation outcomes; they do not execute a call,
  authenticate its response, authorize dispatch or establish terminal nonpayment.
- `decisions`: evaluation identity, normalized input/order/history hashes,
  classification, safe reason, reconciliation obligation, timestamp and the
  permanently false release eligibility. No raw provider payloads, credentials,
  client secrets or customer records are added to the journal.

`registerRecoveryOperation` records intent only. `recordRecoveryOperationState`
records progress only. `recordRecoveryDecision` records classification only.
Changed provider bindings require review; these helpers cannot bind/rebind a
provider or repair a creation-before-binding crash automatically.
Changed canonical order fields also invalidate a registered operation, even when
its provider binding has not changed. Such outcomes require reconciliation.

## Classification and evidence boundary

`evaluatePaymentRecovery` is pure. It reuses SR-3 exact minor-unit conversion and
checks canonical stored amounts, supported PHP context, provider identity syntax,
merchant/environment consistency and persisted paid evidence.

Classifications: `excluded`, `verified_paid`, `already_released`, `pending`,
`processing`, `retryable`, `terminal_nonpayment`, `manual_review`.
COD/non-online orders are excluded. Local unpaid flags, checkout age, browser
closure, timeouts and missing callbacks/metadata cannot establish release eligibility.
Incomplete histories, in-flight/unknown operations, changed bindings, partial paid
evidence and invalid/unsupported observations require reconciliation/review.

Observations are **internal classification inputs, not authenticated settlement
proof**. Future adapters must retrieve/validate authoritative provider resources.
They must match the stored resource ID, provider, merchant/account, environment,
amount and currency. Unknown keys/statuses fail closed. The current envelope
supports Stripe Session/PaymentIntent and PayPal Order/Capture states; it does
not invent a PayPal Order `EXPIRED` status or implement refund processing.

An expired Session, canceled Intent or voided PayPal Order is labeled only as a
terminal observation requiring reconciliation. This neither closes every possible
attempt nor proves that an outstanding external call stopped. PayPal order
completion alone remains pending; failed captures do not prove the order cannot
be retried. New observed success requires the existing settlement verifier;
it cannot set `payment:true`. Existing verified paid evidence remains historical
evidence, not proof of current payout/refund/dispute state. Released-plus-paid or
refund observations require financial review without re-reserving stock.

## Concurrency, retries and audit

One conditional MongoDB update writes only `paymentRecovery`. Its predicate
matches owner, entire previous metadata and observed status/payment/inventory,
items/amount/currency, checkout ID, paid timestamp and provider bindings. Revision
conflicts return a safe 409; unknown DB outcomes return a generic 503. No blind
retry. Duplicate identical operations/evaluations are no-ops; changed snapshots
conflict. Normalized hashing accepts equivalent property order while retaining
array order. Different worker decisions cannot overwrite one another.

No worker lease is introduced. Old timestamps never resolve an in-flight call.
Future leases cannot prove provider quiescence. Reconciliation flags and prior
decisions remain auditable; there is no automatic acknowledgement/clearing of
obligations. Audit retention and document sizing must be approved before activation.

## Verification and future work

Run `node --test tests/paymentRecovery.test.js` and existing backend regressions
with integration flags disabled. Tests use synthetic model/atomic-predicate
fixtures, deny product/user writes, inventory transactions and provider calls,
and inspect dormant exports/production imports. They are not real MongoDB proof.

Opt-in integration retains `PAMO_RECOVERY_INTEGRATION=1` and now requires the
[shared isolated test configuration](../../README.md#seven-opt-in-mongodb-integration-suites).
The former `PAMO_RECOVERY_TEST_URI` setting is no longer used.
It creates a fresh `pamo_recovery_test_*` database, verifies
actual concurrent metadata CAS/idempotency and unchanged order business fields,
then drops only that database. It never loads application `.env`. No safe local
server/test URI was available in this task; integration is skipped.

Before activation: explicit user approval, approved eligibility/cancellation/paid
and late-payment/refund policies, provider-specific authenticated closure proof,
complete operation coverage and creation/binding crash reconciliation, coordinated
payment/progression guards, existing transactional once-only stock restoration,
durable callback/reconciliation processing and operator ownership/cadence,
retention/index review, isolated replica-set and provider sandbox/end-to-end tests,
approved currency/fee policy, merchant configuration and separately authorized
credential rotation. Recovery and online-payment activation are separate approvals.

SR-5A research was reused; no repeated external documentation research was needed.
An optional Claude source review through Antigravity was rejected by automatic
approval review because it would export private implementation code. No usable
Claude review or successful model invocation is claimed; local verification continued.

Final verification: targeted recovery tests 20 passed/one opt-in integration skip;
full backend suite 338 passed/seven opt-in integration skips/zero failures.
Targeted backend ESLint reported zero errors/warnings; source syntax checks passed.
There is no backend build/lint package script. Frontend tests/build/lint were not
repeated because no frontend files or frontend contracts changed. No live browser,
provider or database verification is claimed. File-hash audit preserved every
pre-existing file except the authorized optional order schema addition; only this
document, the metadata utility and its focused test file were created. No commit,
push, activation, credential operation or subsequent phase occurred.
