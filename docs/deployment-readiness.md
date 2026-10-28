# PAMO Legacy release readiness

Status: PARTIAL. Local builds and isolated regressions are evidence for engineering review, not deployed or real-provider verification. No deployment, live database writes, payments, refunds, commits or pushes were performed.

## Vercel setup

- Create three projects using Root Directories `frontend`, `admin` and `backend`.
- Enable **Include source files outside of the Root Directory in the Build Step** for all three projects. Both UI apps import `shared/`; the backend imports shared data contracts.
- Use Node.js 22 (at least 22.12). The UI configurations install the root dependencies and each app's own locked dependencies, build with `npm run build`, and serve `dist`. This matters because Storefront imports Axios from the existing root package.
- Keep existing SPA rewrites for Student and Admin deep links. Backend exports the Express app; its API middleware initializes Cloudinary and awaits a shared MongoDB connection before handlers execute. CLI startup still awaits readiness before listening.
- Configure exact HTTPS UI origins in `CORS_ALLOWED_ORIGINS`; production startup rejects missing, wildcard, path-bearing or HTTP origins. No-origin API clients still require normal authentication.
- Use the intended Atlas deployment with transaction support. The existing database name remains `e-commerce`; no database identity or records were changed. Verify account permissions, network access and required uniqueness indexes before release.
- Cloudinary uploads remain validated in memory with existing compensation behavior. Verify real delivery/upload permissions during authorized preview QA. Vercel's request-body limit must be considered for larger multipart uploads; this run did not change upload limits or introduce a direct-upload flow.
- Scheduled stock remains request-driven. Due adjustments run atomically on relevant requests; no traffic means execution waits. No Cron configuration was introduced.

## Environment checklist (names only)

Backend required: `MONGODB_URI`, `CLOUDINARY_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_SECRET_KEY`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `CORS_ALLOWED_ORIGINS`, `NODE_ENV`.

Local CLI optional: `PORT`.

Storefront build: `VITE_BACKEND_URL`, `VITE_ADMIN_URL`.

Admin build: `VITE_BACKEND_URL`, `VITE_CUSTOMER_URL`.

Future Stripe sandbox integration: `STRIPE_SECRET_KEY`, `STRIPE_ACCOUNT_ID`, `STRIPE_WEBHOOK_SECRET`.

Future PayPal sandbox integration: `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET`, `PAYPAL_MERCHANT_ID`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_ENVIRONMENT`.

These payment variables document missing prerequisites; setting them does not enable payment routes. Keep secrets server-side and out of all `VITE_` variables and Git. Supply production values privately; verify any historically exposed credentials have been replaced before release.

## Payment blockers

- Stripe's supported merchant-country list does not include the Philippines. A supported, authorized merchant entity is required; no alternate entity or account is assumed.
- PayPal lists PHP as supported, but actual merchant eligibility, receiving preferences and sandbox identity still require verification. The local configuration has no explicit sandbox environment, merchant ID or webhook ID. Stripe account identity and webhook signing configuration are also absent.
- Public online creation/verification routes and checkout choices remain disabled. Existing verifier/webhook foundations were tested with synthetic fixtures, including authenticity, replay protection, amount/owner checks and cancellation evidence. No real provider was contacted.
- Create/capture, durable provider binding, paid-order automatic acceptance, pending/failure recovery and full sandbox round trips are not connected as a supported checkout flow. Complete and verify them only against an identified sandbox merchant before enabling the UI or mounting webhooks. Do not treat frontend success or a test-key prefix as payment evidence.
- Pay as You Claim, Cashier receipt confirmation, receipt uniqueness, cancellation review and refund obligations remain the available workflow. No refund completion is inferred.

Sources: [Stripe availability](https://stripe.com/global), [PayPal currencies](https://developer.paypal.com/api/codes/currency/), [Vercel Express](https://vercel.com/docs/frameworks/backend/express), [Vercel shared monorepo sources](https://vercel.com/docs/monorepos/monorepo-faq).

## Changes in this mission

Application code:

- `backend/server.js`, `backend/config/mongodb.js`: serverless API readiness, shared connection and safe retry/failure handling.
- `backend/config/localApiSecurity.js`: environment-based production HTTPS origin allowlist, preserving local development defaults.
- `backend/controllers/orderController.js`, `backend/models/orderModel.js`, `backend/utils/classificationValidation.js`: managed program checkout and safe archived-assignment compatibility while retaining stable codes.
- `backend/vercel.json`, `frontend/vercel.json`, `admin/vercel.json`, `backend/.env.example`: shared-source packaging, locked installs and configuration prerequisites.

Focused test additions or fixture corrections:

- Backend: `startup.test.js`, `localApiSecurity.test.js`, `checkoutCart.test.js`, `authSecurity.test.js`, `authApiHardening.test.js`, `cashier.test.js`, `orderStatus.test.js`, `receiptIndex.test.js`, `productPricing.test.js`, `productSizes.test.js`, `paymentContainment.test.js`, `stripePayment.test.js`, `paypalPayment.test.js` under `backend/tests/`.
- Staff UI: `staffMutationLifecycle.test.js`, `staffFocusLifecycle.test.js`, `cashierPaymentsV2.test.js` under `frontend/tests/`.
- This release guide. Pre-existing changes elsewhere remain owned by the user and were preserved.

## Verification evidence

- Both UI production builds passed; only nonblocking large-chunk notices remained. Focused UI ESLint passed, including the three repaired staff test files. Backend syntax passed for all 19 touched JavaScript files; Vercel JSON and whitespace checks passed.
- UI feature/cart checks: 183 passed. A separate 99-case staff/checkout/payment batch initially exposed 39 outdated fixture failures; its failing files passed after correction (their final rerun was part of the 198-case batch below). Existing successful cases were not repeated.
- Backend integrity/classification/product checks: 278 cases initially yielded 239 passes, 36 outdated fixture failures and 3 intentionally skipped database integration cases. The fixture defects involved required program fields, query-shaped mocks, current cancellation rules and receipt compare-and-set guards; production protections were retained.
- Deployment/provider/checkout batch: 218 cases yielded 211 passes, 6 fixture failures and 1 skipped database case. The new managed-program and serverless concurrency/retry cases passed. This batch overlaps some earlier checkout checks.
- Corrected fixture batch: 198 cases yielded 195 passes and 3 stale assertion failures. All failing/new cases then passed in a narrowed 19/19 rerun; the final error-sanitization fixture also passed after removing its unintended buffered database lookup. These counts overlap earlier checks and must not be added into a unique-test total.
- Additional upload/profile/database-isolation/signature checks: 58/58 passed. No unresolved observed test failure remains. Opt-in database tests were not enabled, and provider tests used synthetic responses. Passing fixtures do not establish live atomicity, merchant settlement or authenticated visual behavior.

## Remaining release steps

1. Review the existing dirty worktree and this task's changes; confirm only intended source/assets are staged when a commit is separately authorized.
2. Configure the three Vercel projects, private environment values and external-source access. Verify clean-install builds in that environment.
3. Authorize preview deployment and verify Atlas transaction/index readiness and Cloudinary permissions without altering real user data for tests.
4. Use an independently verified disposable replica set for the opt-in MongoDB concurrency suites. They were not enabled against application Atlas.
5. Perform authenticated preview QA across Student, PAMO Admin and Cashier, including mobile/light/dark, checkout, cancellation and receipt transitions. Real browser QA was not performed in this run.
6. Resolve payment prerequisites above if online payments are part of release acceptance; otherwise explicitly accept a Pay-as-You-Claim-only release with online routes disabled.
7. Obtain final authorization before GitHub push, production deployment, real payments or refunds. Completion of this report grants none of those actions.
