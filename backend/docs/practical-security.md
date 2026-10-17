# SR-6B6 — practical local security defaults

This phase changes configuration only. It does not activate payments, recovery,
refund processing, or production infrastructure.

## Corrected defaults

- Root ignore rules cover local environment variants and generated logs/editor
  scratch files, while allowing `.env.example` and `.env.*.example` templates.
  Ignore rules do not untrack files or erase historical exposure. Already tracked
  environment files and dependency directories remain unchanged; their separate
  repository hygiene work and outstanding credential rotation are still required.
- The backend listens on `localhost`. Browser origins are limited to HTTP
  loopback names (`localhost`, `127.0.0.1`, `[::1]`) on storefront/admin development
  and preview ports 5173/5174/4173/4174. Other supplied origins receive a safe 403
  before parsing or route execution. Requests without Origin still require all
  existing authentication and authorization. CORS is not authentication.
- API responses suppress Express branding and use `nosniff`, `DENY` framing,
  `no-referrer`, and `no-store`. Proxy headers are not trusted.
- Both Vite configurations explicitly bind development/preview to localhost and
  fail on occupied configured ports rather than silently changing origins.
  Filesystem access includes only each UI root and required shared UI sources.
  CQ-4B3 moved shared login resources to `shared/`; Admin no longer allows
  `frontend/src`. The backend directory is excluded. Do not override these defaults with
  `--host 0.0.0.0`, wildcard allowed hosts, or broad filesystem allowances.

## Reviewed and deliberately deferred

- **Already mitigated:** SR-6B1 validates authentication types, limits password
  bytes, throttles login attempts, returns generic login failures, and masks
  internal API errors. Existing role/ownership checks remain authoritative.
- **Authentication disclosure:** registration success versus failure can reveal
  whether an address is available. Staff credential comparison timing is not
  claimed constant-time. Changing registration semantics or credential storage
  requires a separate approved contract; no blanket enumeration resistance is
  claimed. Existing in-process throttling is proportionate to this local project.
- **JWT storage/replay:** existing localStorage tokens remain accessible to script
  running in the UI origin. Logout clears the client copy but does not revoke a
  stolen signed token. Customer/staff expiry and strict JWT claims remain intact.
  Cookie/CSRF migration, revocation, and distributed throttling are separate work
  if deployment or the threat model requires them.
- **COD reservations:** authenticated repeated legitimate orders can hold stock.
  Order caps, expiry and release policy require user decisions; adding a timer or
  reusing dormant online-payment recovery for COD is not authorized.
- **Dependency advisories:** reuse SR-6B3's last audit, not a new clean-audit claim:
  backend 7 (including 1 critical), admin 13, frontend 16. Patched installations
  and lockfiles are preserved. Remaining Express/transitive/dev-tool warnings and
  React Router advisories require individual applicability/compatible-update
  review in a separately scoped phase. The proxy-addr trusted-subnet exposure is
  reduced by leaving `trust proxy` false; this does not clear its audit warning or
  establish that every other advisory is harmless. No packages were upgraded.
- **Deployment only:** TLS, exact deployed origins, proxy trust, UI CSP and hosting
  security headers, multi-instance controls and operational monitoring require a
  deployment-specific plan. These local defaults are not deployment certification.

Stripe/PayPal stay contained and reservation recovery stays dormant. No database,
payment-provider or Cloudinary operations are needed for these checks.

## Verification

`node --test backend/tests/*.test.js` exercises backend regressions.
`node --test --test-force-exit frontend/tests/*.test.js` includes temporary,
loopback-only Vite checks using both installed versions, with dependency discovery
disabled in the fixture. The fixture explicitly closes its HTTP servers and
checks they stopped listening. Force-exit is needed for lingering Vite tool worker
handles after the assertions/cleanup; it is not an application lifecycle test.
No live database authentication or browser visual approval is implied.

Official contracts used: [Vite server options](https://vite.dev/config/server-options.html)
and [Express CORS middleware](https://expressjs.com/en/resources/middleware/cors/).
