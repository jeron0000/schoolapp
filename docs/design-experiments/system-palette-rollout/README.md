# System palette rollout — visual comparison

Color-only rollout across the customer storefront, PAMO Admin, Cashier, and Shared Login. Awaiting user visual approval; no Figma change or palette freeze.

## Baseline and affected files

`baseline/` contains exact pre-rollout **working-tree** bytes for all 23 affected application files, including pre-existing uncommitted changes. `baseline-manifest.json` lists every path, original byte length, and SHA-256. No baseline file was overwritten. The earlier `home-sti-palette/baseline/` and its documentation remain untouched.

The rollout baseline includes the revised Home-only palette as it existed before this task. Rolling back this rollout restores that state. The older Home baseline separately restores the original pre-experiment Home design.

Modified application files:

- `shared/Foundation.css`, `shared/LoginFlow.css`
- `frontend/tailwind.config.js`, `admin/tailwind.config.js`
- `frontend/src/index.css`, `admin/src/index.css`
- `frontend/src/components/HomePage.css`, `StorefrontFoundation.css`, `HeroCarousel.css`
- `frontend/src/pages/Cart.css`, `Orders.css`, `PlaceOrder.css`, `Product.css`
- `admin/src/components/StockManagementDrawer.css`
- `admin/src/pages/Add.css`, `Dashboard.css`, `List.css`, `Orders.css`, `HeroImages.css`, `CashierDashboard.css`, `CashierPayments.css`
- `admin/src/components/SalesOverviewChart.jsx`, `CollectionOverviewChart.jsx` (color literals only)

Other approved pages inherit the existing Foundation or utility colors; their source files do not need editing. JSX interfaces, status mappings/labels, routes, state, effects, financial calculations and backend files are unchanged. No dependencies changed.

## Palette and replacements

| Role | Previous | Rollout |
| --- | --- | --- |
| Primary amber/yellow | #FBBF24 | #FFD100 |
| Primary hover | #FCD34D | #FFE04D |
| Primary pressed | #F59E0B | #D9B200 |
| Dark canvas | #020617 | retained |
| Navy panels | #0F172A | retained |
| Secondary dark surfaces | #1E293B | retained |
| Dark borders/dividers | #1E293B where used for borders | #334155 |
| Dark primary text | #F1F5F9 | #FFFFFF |
| Dark secondary text | #CBD5E1 | #94A3B8 |
| Light canvas | #F8FAFC / legacy #F9FAFB | #F8FAFC |
| Light panels | #FFFFFF | retained |
| Muted neutral | #64748B | retained |
| Success base | emerald-family accents | #22C55E |
| Error/destructive base | rose/red-family accents | #EF4444 |
| Information base | blue/violet information utilities | #0EA5E9 |

Semantic base accents are defined centrally in Foundation. To preserve AA text contrast, light success/error/info text uses #15803D / #B91C1C / #0369A1; dark text uses #22C55E / #F87171 / #0EA5E9. Error surfaces use #FEF2F2 light and #450A0A dark. Small gold text and focus rings on light surfaces retain accessible #B45309 rather than bright yellow on white. These are readability variants, not new meanings or states.

Tailwind's existing amber/emerald/blue/violet/orange color names remain public styling contracts; both apps now resolve them to the corresponding yellow/success/information palette or readable shades. No class names or status assignments were changed. Outline utility colors resolve to the existing light/dark semantic focus token. Shared `.btn-primary` uses yellow with #020617 text; geometry and transitions are retained.

Toastify variables are scoped to its container so the library's later root defaults cannot overwrite them. Status icons use readable foreground variants; colored-toast text uses #020617. Chart data, axes and execution are untouched: dark chart accents become #FFD100 and grid colors #334155. Light chart accents retain #D97706, whose contrast is suitable for chart graphics on white; bright yellow alone would not be.

The obsolete Home-only comparison block was removed. Home now inherits the shared direction. Original Hero/Carousel composition, photographs, controls, loading, transitions, timing and interactions remain intact; only accent colors changed. No product images, logos or other raster/vector branding assets were recolored.

## Exact rollback

Preserve any edits made **after** this rollout before restoring whole files. From `C:\Users\Jeron\Documents\Projects\MERN`, run the following PowerShell commands. They validate all backups before copying and do not use Git reset/checkout:

```powershell
$paletteRollout = Join-Path (Get-Location) 'docs/design-experiments/system-palette-rollout'
$paletteFiles = Get-Content -LiteralPath (Join-Path $paletteRollout 'baseline-manifest.json') -Raw | ConvertFrom-Json
foreach ($paletteFile in $paletteFiles) {
  $paletteBackup = Join-Path (Join-Path $paletteRollout 'baseline') $paletteFile.path
  if ((Get-FileHash -LiteralPath $paletteBackup -Algorithm SHA256).Hash.ToLowerInvariant() -ne $paletteFile.sha256) {
    throw "Backup verification failed: $($paletteFile.path)"
  }
}
foreach ($paletteFile in $paletteFiles) {
  Copy-Item -LiteralPath (Join-Path (Join-Path $paletteRollout 'baseline') $paletteFile.path) -Destination $paletteFile.path -Force
}
```

Keep the baseline and manifest; do not overwrite them for a later experiment. Rebuild Frontend and Admin after rollback if using production output.

## Verification and limitations

Focused checks verify backup hashes, unchanged non-color CSS syntax trees (including media queries, fonts, dimensions and animations), chart source equivalence after masking color literals, and unchanged non-color Tailwind settings. Calculated representative text pairs meet 4.5:1, including dark secondary text (5.71:1 on #1E293B), readable light success text (4.79:1 on #F8FAFC), and yellow-button default/hover/pressed text (13.81:1 / 15.39:1 / 9.91:1). This is not a claim of complete WCAG conformance.

The 96 focused tests passed across theme lifecycle, shared login image delivery/rendering, Cashier dashboard/payments, stock drawer, refunds, cart consumers and order-status presentation. Admin lint passed. Frontend lint reports the same pre-existing unused variables in `frontend/tests/cashierDashboardV2.test.js:37` and `frontend/tests/heroImagesAdmin.test.js:56`; these tests were not edited. Final Frontend and Admin production builds passed, including the corrected Toastify scope. Both compiled stylesheets contain the intended container-level status and icon tokens. All 23 baseline hashes, unchanged CSS geometry, original Home backup integrity and scoped whitespace checks passed. Final Git status retained all 656 pre-existing entries with no entries lost.

No browser is connected. Interactive light/dark, navigation, responsive 280–4096px, zoom, screenshots and visual contrast checks could not be performed. Unchanged CSS geometry/media queries provide static preservation evidence only. No real database, payment/provider or Cloudinary mutations were performed. No delegation used. No commits, pushes, Git cleanup or feature freezing.
