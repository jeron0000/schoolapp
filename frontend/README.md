# SmartStock student storefront

React/Vite customer application. Start with the root [setup, architecture, and
testing guide](../README.md). Installation includes root, backend, storefront,
and Admin packages because existing shared login and tests cross directories.

## Local commands

From `frontend/`:

```powershell
npm run dev
npm run lint
npm run build
npm run preview
```

Development uses localhost port 5173; preview uses 4173 after a build. The API runs
separately. Local configuration names are `VITE_BACKEND_URL` and `VITE_ADMIN_URL`;
never put private backend values into browser-visible variables.

## Source ownership

- `src/pages/`: routed customer screens.
- `src/components/`: storefront presentation and component styles.
- `src/context/ShopContext.jsx`: public context and session/cart coordination.
- `src/utils/cartSync.js`: cart sequencing, checkout synchronization, optimistic
  updates, rollback, and session isolation.
- `src/hooks/`, `src/context/ThemeContext.jsx`: Hero loading and theme integration.
- `../shared/`: login, session policy/hooks, cart/inventory contracts, PHP money,
  taxonomy, and refund presentation.

`vite.config.js` owns local server access; `tailwind.config.js` scans shared JSX.
Shared login owns its imagery and icons under `../shared/`. Storefront foundation
CSS imports shared font/tokens/typography before its own navigation/Hero rules;
the login adapter preserves that stylesheet order. Shared icons resolve through
the storefront's declared Lucide package.

## Tests

There is no package `test` script. See the [root testing guide](../README.md#verification-commands-and-ownership)
for Node test-runner commands and the Vite worker limitation. `tests/` also owns
staff rendering regressions importing Admin components, so the Admin installation
must remain available. Database integration is separately opt-in; mocked tests
are not proof of live database or browser behavior.
