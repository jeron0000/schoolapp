# PAMO / SmartStock

Local MERN school project with a student storefront and shared PAMO/Cashier staff
application. Read [AGENTS.md](AGENTS.md) before agent-assisted work.

## Repository and setup

| Directory | Responsibility |
| --- | --- |
| `frontend/` | Customer pages, cart/checkout coordination, storefront tests |
| `admin/` | PAMO and Cashier interfaces, staff routing and access checks |
| `backend/` | Express API, Mongoose models, transactions and backend tests |
| `shared/` | Login, session/theme lifecycle, presentation resources and shared contracts |

These are separate npm installations, not an npm workspace. Root packages include
Axios consumed by the storefront. Staff component tests under `frontend/tests/`
also require Admin's dependencies. Shared UI resolves dependencies through its host.

Recent verification used Node **22.17.1** and npm **10.9.2** on Windows. Use a
compatible Node 22 release; installed Vite/Router packages have their own engine
requirements. Existing checkouts do not need reinstalling just to run tests.
For an authorized fresh setup, run `npm install` in the root, then `backend/`,
`frontend/`, and `admin/`. There is no separate shared dependency installation.
Review Git first: root/backend dependencies are historically tracked, so an
installation can change tracked artifacts. Do not reset or clean existing work.

Keep environment values private. Frontend uses `VITE_BACKEND_URL` and
`VITE_ADMIN_URL`; Admin uses `VITE_BACKEND_URL` and `VITE_CUSTOMER_URL`. Never put
secrets into browser-visible Vite variables. Backend configuration includes
`PORT`, `MONGODB_URI`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`,
`CLOUDINARY_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_SECRET_KEY`.
Use existing approved local configuration; this guide does not provision a database.

Run these in separate terminals from the indicated directories:

| Directory | Command | Default loopback port |
| --- | --- | --- |
| `backend/` | `npm run server` (Nodemon) or `npm start` | 4000, overridden by `PORT` |
| `frontend/` | `npm run dev` | 5173 |
| `admin/` | `npm run dev` | 5174 |

Backend startup awaits MongoDB readiness. Do not expose development servers with
public host overrides. Frontend/Admin preview ports are 4173/4174 after a build.
See the [storefront](frontend/README.md) and [staff](admin/README.md) guides.

## Verification commands and ownership

There is no root/backend test script or backend lint/build script. Both UI packages
provide `npm run lint` and `npm run build`. Run commands in their owning directory.
Tests use Node's built-in runner; focused files are preferred for scoped changes.

Before backend test discovery, disable all seven integration flags in the current
PowerShell terminal, even if inherited from another task:

```powershell
$env:PAMO_INVENTORY_INTEGRATION = '0'
$env:PAMO_HERO_INTEGRATION = '0'
$env:PAMO_DASHBOARD_INTEGRATION = '0'
$env:PAMO_CASHIER_DASHBOARD_INTEGRATION = '0'
$env:PAMO_CART_INTEGRATION = '0'
$env:PAMO_COD_CART_INTEGRATION = '0'
$env:PAMO_RECOVERY_INTEGRATION = '0'
```

From the repository root:

```powershell
# Focused examples; these do not require a live database.
node --test backend/tests/databaseIsolation.test.js
node --test frontend/tests/authSession.test.js frontend/tests/cartConsumers.test.js

# Full regression commands, when the task warrants them.
node --test backend/tests/*.test.js
node --test --test-force-exit frontend/tests/*.test.js
```

Backend tests cover authentication, API validation, inventory/cart contracts,
payments/refunds, uploads, analytics and startup using synthetic fixtures/mocks.
Frontend tests cover customer/shared UI and staff components imported from Admin.
Mocked/SSR tests do not prove browser interactions, real MongoDB concurrency or
live provider/Cloudinary behavior. The `.bench.js` file is not part of `*.test.js`.

The full frontend command includes temporary loopback Vite servers. Their fixture
closes the servers, but Vite worker handles have previously kept the process alive;
`--test-force-exit` addresses that runner limitation. Focused tests normally omit
it. A forced exit is not proof of application cleanup or permission to ignore a hang.

## Seven opt-in MongoDB integration suites

Inventory, Hero, PAMO analytics, Cashier analytics, cart, COD cart cleanup and
recovery remain opt-in. They use [the shared isolation helper](backend/tests/helpers/database.js).
They no longer load application `.env` or fall back to application `MONGODB_URI`.

Real execution requires explicit authorization and an independently verified,
disposable numeric-loopback MongoDB replica set. The helper additionally requires
the suite flag, `PAMO_TEST_DB_APPROVED=1`, and `PAMO_TEST_MONGODB_URI` with explicit
port, `pamo_integration_test` URI identity, `replicaSet`, and `directConnection=true`.
It creates a unique suite-owned database and restricts cleanup to that identity.
URI checks alone cannot prove a loopback service is disposable or not forwarded.
Do not use the application Atlas database, install infrastructure, or enable these
suites merely to complete routine checks. No verified isolated server is currently
recorded; real database concurrency remains unverified.

## Known boundaries and review evidence

- Stripe/PayPal remain HTTP 503-contained; provider webhooks are unmounted and
  recovery is dormant. COD/Cashier functionality and refund obligations remain
  protected. See [payment containment](backend/docs/payment-containment.md) and
  [refund policy](backend/docs/cancellation-refunds.md).
- Historical credential exposure/rotation, JWT replay limitations, live provider
  and Cloudinary testing, and interactive browser scenarios remain separate gaps.
  The previously blank Admin login was not reproduced in an authenticated browser;
  a signed-out reproduction remains outstanding.
- CQ-10 dependency patches passed scoped regressions, both UI lint/build checks,
  and byte comparisons of production CSS/JS. Remaining advisory snapshot: backend
  3 high; each UI 5 high/1 moderate, involving braces-dependent tooling and the
  selector parser. These are historical results, not a current clean-audit claim.

No deployment-readiness, live payment verification or visual approval is implied
by a passing unit suite or production build.
