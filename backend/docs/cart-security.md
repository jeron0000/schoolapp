# SR-4 — cart security and persistence

## Verified defects and boundary

Previous cart handlers indexed client-controlled product/size keys before
validation, mutated ordinary nested objects, and persisted whole-cart snapshots.
This enabled unsafe prototype keys and lost concurrent writes. ShopContext ignored
`success:false`, swallowed transport errors, and kept rejected optimistic changes;
Cart's removal dialog could therefore report success after persistence failure.

This phase changes cart validation/persistence and necessary consumer feedback
only. Cart operations never reserve/deduct stock, modify prices/orders/payments,
or change administrative approval. Canonical checkout remains the final stock
reservation and pricing authority. SR-1 HTTP 503 containment, SR-2 authentication,
SR-3A Stripe and SR-3B PayPal infrastructure remain unchanged and disabled.

## API and validation contract

Routes and authentication are unchanged: POST `/api/cart/get`, `/add`, `/update`.
SR-2 middleware overwrites `userId` with the signed customer subject. Staff tokens
cannot call customer cart routes. Controllers return safe structured failures,
without logging or returning raw database exceptions.

- `get`: unchanged empty client body; returns `{success:true,cartData,cartVersions}`.
- `add`: existing `itemId,size`, with modern frontend adding `expectedVersion` and
  `expectedQuantity`. Unversioned legacy additions remain atomic increments;
  repeated legacy calls mean separate additions and are not retry-idempotent.
- `update`: existing `itemId,size,quantity`, now **requires** `expectedVersion` and
  `expectedQuantity`. Unversioned absolute writes return HTTP 409 instructing the
  caller to refresh; silently accepting stale clients would preserve the defect.
- Successful mutations retain `success/message` and add the canonical snapshot.
  Revision/quantity conflicts return HTTP 409 and the owning user's current snapshot.

Validate a plain/null-prototype request object, own supported properties, 24-hex
product/account IDs, existing inventory-safe size syntax and non-negative safe
integer quantities/revisions before model access or dynamic path construction.
Reject arrays, inherited/custom records, extra/dangerous keys, Mongo operators,
dot paths, coercible numbers, fractions, negative/unsafe numbers and malformed IDs.
Product ID spelling is preserved so old valid upper-case entries remain removable.

Positive quantities must refer to an existing product and an actual supported
size and fit its current per-size stock snapshot. No arbitrary quantity cap is
added. Zero removes the entry, including deleted products/obsolete safe sizes;
it requires no product or stock write. Persisted malformed carts fail closed for
review rather than being silently migrated, truncated or used as trusted data.
Shared snapshot helpers copy validated own keys and never traverse inherited keys.

## Targeted atomic updates and revision tombstones

Existing numeric `cartData[productId][size]` representation remains intact. One
optional `cartVersions` object records per-entry monotonic revisions. Missing
historical revision means zero; no migration/default backfill is performed.

One MongoDB `findOneAndUpdate` conditionally applies validated dotted-path `$inc`
for additions, `$set` for absolute quantities or `$unset` for removal, together
with a revision increment. It returns the post-update cart snapshot. It never
replaces the entire cart. Independent products/sizes therefore do not conflict.
Modern requests match both observed quantity and entry revision, including absent
zero fields. Same-entry contention, stale/repeated operations and ABA changes
produce an explicit conflict. Even same-quantity and empty-removal intentions
use the conditional write; a stale read cannot be acknowledged as a successful
no-op. Removed entries retain revision tombstones so old requests cannot revive
them. Versions and additions fail before unsafe integer overflow.

Legacy unversioned additions use atomic `$inc` and stock/numeric predicates, so
simultaneous increments survive; consumers requiring safe retries must use the
modern revision contract. All current storefront requests do. Mixed schema
update validation is not treated as sufficient: service validation and guarded
paths provide the trust boundary. No new indexes, locks or multi-document
transaction infrastructure are required.

Stock can change after cart validation; cart quantities are not reservations.
The unchanged canonical order transaction remains the overselling safeguard.

## Frontend synchronization and checkout

The focused `cartSync` utility owns confirmed cart data/revisions, pending
intentions and one sequential persistence chain. Presentation is the confirmed
cart with ordered optimistic intentions applied. Request expectations come from
the latest confirmed snapshot, not a stale render closure. Failed intentions
are removed independently; newer queued intentions are preserved. Guest carts
remain memory-only; authentication restores the server cart without inventing
a guest-cart merge policy.

Application failures and transport failures reject the consumer promise and
retain useful toast/inline feedback. Unknown transport outcomes trigger a GET
before further writes, never a blind replay of an additive request. A committed
write followed by a lost response is displayed from canonical recovery without
being falsely reported as successful. Failed restoration/recovery keeps checkout
unavailable. GET establishes a snapshot, not proof that every outstanding server
request has finished; modern CAS prevents duplicate effects from the same revision.
Failed restoration has a persistent accessible error and queued reload action;
the empty state does not claim the saved cart is empty while load/recovery fails.

Session/generation guards invalidate late loads, responses and queued work during
logout, session replacement, unmount and explicit cart clearing. Successful
checkout clearing preserves server revision tombstones. A short checkout guard
requires synchronized cart state, blocks same-client cart mutations during
submission, and checks ownership/generation after fingerprinting and the order
response. Old checkouts cannot clear a replacement customer's cart or unlock a
newer checkout. Cart's existing checkout link reflects readiness. No layout,
CSS, themes, typography, routes or payment request amounts were redesigned.

## SR-4F — COD checkout consumption

The separately authorized SR-4F fixes the remaining COD whole-cart replacement
in both the controller and browser. A checkout lease copies confirmed quantities
and revisions before asynchronous fingerprinting. Submission uses that copy,
includes optional `checkoutCart` evidence, and fingerprints revisions so a newly
modified/re-added cart does not reuse an earlier checkout ID merely because its
quantities are equal. Existing authentication, request IDs and order routes remain.

`prepareCheckoutCart` reuses cart validation and canonical item aggregation. It
requires exact order coverage, rejects unrelated items, malformed keys, quantities
and revisions, and rejects duplicate product-ID case aliases. Only positive order
entries and their observed revisions are retained. The first canonical order
transaction saves this evidence in optional `order.checkoutCart`; retries use
that persisted evidence, never a retry's newer snapshot. Historical orders and
older clients without evidence clear nothing. No migration or inferred backfill.

After canonical order creation commits, each entry is removed with a targeted
atomic user-document update matching **both quantity and revision**, with safe
parent-object guards. The same update increments its revision tombstone. Missing
historical revisions match zero; maximum-safe revisions preserve the entry.
Independent products/sizes survive. Any same-entry addition, changed quantity,
newer revision, or remove/re-add preserves the whole changed entry: this policy
does not subtract quantities from a newer cart. Repeated/concurrent cleanup cannot
match a completed entry again. A partial failure can retry unfinished entries
using the original order evidence without touching re-added entries.

Cleanup intentionally remains separate from the existing reservation transaction.
It neither changes inventory nor creates/cancels/approves orders. A cleanup DB
failure after commit returns the existing successful order with
`cartCleanupPending:true`, rather than falsely reporting a failed order. The
browser refreshes the authenticated canonical cart through the existing GET,
preserving newer entries and revisions; it no longer clears `{}`. Failed refresh
retains displayed data, sets an error and blocks checkout until reload. Partial
cleanup warnings ask the user to review the saved cart. Recovery is not automatic;
the same original checkout request can retry cleanup, and retained entries need
review before placing another order. Session/generation checks cover the refresh
and redirect as well as the order response. No CSS or visual layout changes.

Focused model-fixture tests cover normal COD, canonical pricing/once-only
reservation, same-entry and independent updates, stale revisions, ABA/re-add,
simultaneous/repeated and partial cleanup, failed checkout, ownership/roles,
legacy evidence, corrupt carts and safe-integer limits. Frontend tests cover lease
snapshot submission, canonical refresh, persistent failure/reload and late-session
responses. Existing payment-containment test now expects zero legacy whole-cart
clears. An opt-in real MongoDB test uses `PAMO_COD_CART_INTEGRATION=1` and the
[shared isolated test configuration](../../README.md#seven-opt-in-mongodb-integration-suites), a fresh `pamo_cod_cart_test_*` database,
and a transaction-capable isolated replica set. It verifies concurrent COD retries,
cart persistence, re-add replay safety and unchanged once-only reservations.
No such server was available; this test is skipped, not claimed as database proof.
Corrupt historical records still require review; no production data was modified.

SR-4F verification: all backend tests passed (318 passes, six opt-in integration
skips, zero failures); all frontend tests passed (35 passes, zero failures).
Frontend lint/build and targeted backend ESLint passed. Independent read-only
GPT-6.1 Sol High QA found no confirmed in-scope defect. Main alone edited source;
existing primary-source research was reused, with no new external research call.
No authenticated browser checkout or real database test was executed. CSS,
inventory utilities, Cashier and SR-1/2/3A/3B infrastructure remain unchanged.

## Research, tests and limits

Installed Antigravity 1.3.5 and `agy models` verified the requested
`gemini-3.8-flash-medium`. One self-contained research call used `--mode plan`,
`--sandbox`, JSON output and a 90-second limit in an isolated temporary directory,
with no project source/credentials provided and explicit read-only instructions.
It timed out with an empty response despite CLI status SUCCESS. No usable research
or live-browsing evidence was returned; sandbox/plan flags are not proof of OS-level
isolation. No repeat authentication or reconfiguration was performed.

Main-agent fallback verified primary sources on 2026-10-14:
[MongoDB single-document atomicity](https://www.mongodb.com/docs/manual/core/write-operations-atomicity/),
[Mongoose findOneAndUpdate](https://mongoosejs.com/docs/tutorials/findoneandupdate.html),
and [MDN prototype-pollution prevention](https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/Prototype_pollution).
Installed Mongoose is 9.2.4; current online Mongoose documentation identifies 9.11.1.
No dependency upgrade occurred. Independent native QA was read-only; main alone edited.

Run backend `node --test tests/cartSecurity.test.js` and all backend tests with
all `PAMO_*_INTEGRATION` flags disabled. Deterministic model/atomic-predicate fixtures
cover unsafe input, product/stock validation, independent/concurrent updates,
repeated requests, ABA/removal tombstones, DB failures, signed ownership and no
stock/cart-replacement/order side effects. They do **not** prove MongoDB atomicity.

Real database coverage is an opt-in test, with **no application .env use**:
`PAMO_CART_INTEGRATION=1` plus the
[shared isolated test configuration](../../README.md#seven-opt-in-mongodb-integration-suites).
The former `PAMO_CART_TEST_URI` setting is no longer used.
It creates only a fresh random `pamo_cart_test_*` database on that expressly
configured isolated local server, verifies actual concurrent `$inc`/CAS/removal
and unchanged stock, then drops only that database. No local MongoDB binary,
listener or test URI was available, so this integration was skipped. No production
records were changed by verification. Existing four opt-in DB integrations also remain skipped.

Frontend `node --test tests/*.test.js` covers serialization, optimistic rollback,
unknown-outcome recovery, reload, session races, checkout locks and actual
checkout component guards/COD request compatibility. Both-theme rendered Cart
checks preserve accessibility labels and disabled checkout behavior. Frontend
lint/build run through existing scripts. Targeted backend lint reports the
pre-existing unused `mongo` import in userModel; no backend lint/build script exists.

Read-only browser navigation to local `/cart` redirected to the existing login
screen; no authenticated test account was supplied, and no real cart/order was
mutated. Browser errors were empty on that observed page. Authenticated cart and
end-to-end cart interaction verification remains unperformed. A separate loopback
preview rendered the actual Cart component and compiled CSS using synthetic data,
without application APIs. Error and pending layouts in both themes were checked
at 280, 360, 390, 820, 1280, 1440, 1920, 2560, 3440 and 4096px: all 40 cases had
no page horizontal overflow. The reload button was 44px high, keyboard reachable
with a 2px amber focus outline; the cart used IBM Plex Sans. These static browser
renders do not establish authenticated persistence or real database behavior.
Viewport overrides were reset and the preview server/tab closed after checks.

Final checks: backend `node --test tests/*.test.js` with integration flags off
reported 304 passes, five skips and zero failures; targeted cart tests reported
11 passes and one skip. Frontend `node --test tests/*.test.js` reported 31 passes;
`npm run lint` and `npm run build` passed. Targeted cart/shared backend ESLint
reported no issues; userModel retains its pre-existing unused `mongo` import.
No backend package lint/build scripts were available. Git whitespace checks passed.

Task files: existing `backend/controllers/cartController.js`,
`backend/models/userModel.js`, `frontend/src/context/ShopContext.jsx`,
`frontend/src/pages/Cart.jsx`, `frontend/src/pages/PlaceOrder.jsx`; new
`shared/cart.js`, `backend/utils/cart.js`, `frontend/src/utils/cartSync.js`,
`backend/tests/cartSecurity.test.js`, `frontend/tests/cartSync.test.js`,
`frontend/tests/cartConsumers.test.js`, and this document. Unrelated application
files, payment/security infrastructure, design styles and Git HEAD/index were
preserved. A concurrent update to `AGENTS.md` was detected, reread and left intact;
this task did not edit it. No commit, push, dependency change or subsequent phase occurred.
