# SR-6B5 PHP monetary contract

PHP is the approved application currency; new product amounts and order snapshots
remain major-unit Numbers in MongoDB and APIs. `500` still means 500 pesos.
Display uses en-PH/PHP, the peso symbol, and two decimal places. No FX, migration,
historical amount rewrite, new discount or fee is introduced.

`shared/money.js` parses decimal digits into integer centavos without floating
multiplication or implicit rounding. New prices, line multiplication, addition
and conversion back to major units reject fractional cents, unsafe totals and
values that cannot survive the existing Number storage boundary. Zero prices
remain valid. Canonical order creation uses current server product prices and
the unchanged 10-peso fee; client totals remain non-authoritative. Cart and
checkout use the same arithmetic, including a 10-peso total for zero-priced
items. This corrects the old summary/submission mismatch without changing fees.

Product creation validates before Cloudinary and persistence. The existing
product schema also validates price writes. No product-price editing endpoint
exists; merchandising flag edits do not accept price or rewrite legacy prices.
New COD orders already explicitly record paymentCurrency PHP.

Historical order display uses explicit stored currency. Missing currency is
labelled unverified, including legacy COD; an approved future currency cannot
establish historical currency. Foreign nominal amounts retain their code and
are not relabelled pesos. Fractional-cent historical totals are shown verbatim
with a precision-review label; derived totals are unavailable rather than rounded.
Cashier refuses confirmation of ambiguous currency or precision and never alters
those totals to make them payable. Such records need separately authorized review.

Cashier analytics excludes fractional-cent/unknown/foreign paid amounts with its
existing data-quality counts. Admin merchandise analytics requires explicit PHP
and exact-cent item snapshots; invalid/ambiguous records count as incomplete
snapshots. Its merchandise-only sales basis and cancellation exclusions remain
unchanged. Cashier continues reporting historical collections, not net refunds.
Existing average-transaction display rounding and compact chart-axis presentation
remain statistical/display conventions, not new transaction rounding rules.

Stripe and PayPal converters already enforce exact centavos; compatibility tests
compare them against the shared utility. They retain provider-specific validation
and errors. All online endpoints remain HTTP 503 and recovery stays dormant.
PHP approval does not prove PayPal merchant receiving capability, provider-account
configuration, historical currency or real settlement/refund compatibility.
Existing SR-3A/SR-3B operational/integration prerequisites still block activation.

Tests use synthetic models, transactional fixtures and in-memory React rendering.
They do not mutate application records or perform provider operations. Real
MongoDB aggregation/concurrency and live browser appearance require separate
verification; historical monetary anomalies are not automatically repaired.
