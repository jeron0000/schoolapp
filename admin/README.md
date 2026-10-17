# SmartStock PAMO and Cashier Admin

One React/Vite staff application with role-authorized PAMO Admin and Cashier
workspaces. Follow the root [setup, architecture, and testing guide](../README.md).
The Admin app consumes shared resources alongside the storefront.

## Local commands

From `admin/`:

```powershell
npm run dev
npm run lint
npm run build
npm run preview
```

Development uses localhost port 5174; preview uses 4174 after a build. Run the API
separately. Local configuration names are `VITE_BACKEND_URL` and
`VITE_CUSTOMER_URL`; browser environment variables must contain no secrets.

## Source ownership

- `src/App.jsx`: staff session/access coordination and PAMO routing.
- `src/components/CashierLayout.jsx`: Cashier workspace navigation and routes.
- `src/pages/`: staff screens; `Orders.jsx` coordinates order actions and
  `Cashier.jsx` coordinates cashier lists/payment confirmation.
- `src/components/OrderDetails.jsx`, `PaymentDetails.jsx`, `CashierTable.jsx`:
  staff presentation, preserving backend eligibility decisions.
- `src/utils/`: API configuration, Hero data access, and order presentation.
- `src/hooks/`, `src/context/`: Hero management and theme integration.

Shared authentication and its image/icon/font resources live in `../shared/`.
The login adapter loads shared foundation styling before login-specific CSS.
Dashboard and shared login icons resolve through Admin's declared Lucide package.
Vite allows the Admin and shared directories, not storefront/backend source;
do not broaden those allowances. Backend authorization remains authoritative
regardless of selected workspace.

## Tests and payment boundaries

There is no Admin package `test` script. Staff rendering tests live in
`../frontend/tests/`; backend authorization/payment tests live in
`../backend/tests/`. See the [root testing guide](../README.md#verification-commands-and-ownership)
for commands, mock coverage, isolated-database requirements, and the Vite worker
limitation.

Cashier confirms eligible PHP COD cash payments with an official receipt.
Stripe/PayPal remain contained; cancellation/refund obligations do not issue
refunds. See the [Cashier contract](../backend/docs/cashier-dashboard.md) and
[refund policy](../backend/docs/cancellation-refunds.md).
