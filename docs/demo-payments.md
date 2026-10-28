# Thesis demo payments

Stripe (DEMO) and PayPal (DEMO) are local simulations. They never contact a payment provider, charge money, issue official receipts or create real refund obligations. Real Stripe/PayPal routes remain disabled.

## Enable deliberately

In a separate demo backend environment, set:

```dotenv
PAMO_PAYMENT_MODE=demo
PAMO_DEMO_DATABASE=pamo_demo_thesis
```

Restart the backend. The MongoDB connection uses this dedicated database only when demo mode is explicit. The name must start with `pamo_demo_`; all simulation endpoints also verify the actual connected database name. A connection to `e-commerce`, a missing configuration or any other payment mode disables simulation. Do not populate the demo database with real user/payment records. Create demonstration accounts/products using the existing flows; no records are copied or initialized by this feature.

The default database and Pay as You Claim behavior remain unchanged when demo mode is disabled. A deployment built with `NODE_ENV=production` may serve a thesis demo only with the same explicit mode and isolated database. Real-payment production mode must never use `PAMO_PAYMENT_MODE=demo`.

## Demonstrate

1. Sign in with a demo Student and select cart items normally.
2. Choose Stripe (DEMO) or PayPal (DEMO), review the order, and select **Continue to demo payment**.
3. Simulate success, failure or cancellation. Success marks the existing demo order paid and Approved, with a `DEMO-...` transaction ID. Failure/cancellation cancels it and releases its reservation transactionally.
4. Return to My Orders or Cart. Only successful purchased variants are removed, using the original cart revision evidence. Unselected/concurrently changed entries remain. Pending demos can be resumed from My Orders; refresh reads the saved result and never infers payment from URL parameters.

The Admin order list/details label demo payment states and IDs. Demo money is excluded from sales totals and Cashier transaction/receipt records. Cancellation review still applies to accepted demo orders, but it creates no refund obligation. Pending orders cannot enter fulfillment before their simulation resolves.

## Endpoints

All require the existing Student authentication:

- `GET /api/order/demo/options`: server-authoritative availability.
- `POST /api/order/demo/place`: existing reservation/price validation; accepts `demoProvider` (`stripe` or `paypal`) and the usual selected checkout request/evidence.
- `GET /api/order/demo/:orderId`: owner-only resume. Successful records retry only their revision-safe cart cleanup.
- `POST /api/order/demo/:orderId/result`: owner-only result (`succeeded`, `failed`, `cancelled`); terminal decisions are idempotent and conflicting results are rejected.

Order metadata is separate: `demoPayment` contains mode, provider, status and an optional simulated transaction ID. No Stripe/PayPal verification evidence is fabricated.

No runtime environment or database was changed while implementing/testing this feature. Focused automated tests use mocked infrastructure; real MongoDB transaction and authenticated visual checks remain separate.
