# Home palette comparison — revised

Temporary customer Home-only comparison, awaiting visual approval. The previous STI Blue and supporting-color experiment has been removed. No global palette adoption or Figma change.

## Baseline and scope

`baseline/frontend/src/components/HomePage.css` remains the original exact working-tree backup, including pre-existing uncommitted work. It has not been overwritten. The current file's original CSS prefix matched this backup before revision; only the bounded previous experiment block was replaced. Any content outside that block is preserved.

Application changes remain limited to `frontend/src/components/HomePage.css`. The current comparison block starts with `Home palette comparison: Admin dark neutrals and yellow`. Layout, spacing, typography, breakpoints, photographs, animation and interactions are unchanged.

Selectors are restricted to `.home-page`, `.home-footer.storefront-home`, `.storefront-navbar.storefront-home`, and descendants. Dark overrides require `.dark`. Admin, Cashier, other customer routes, shared theme files, JSX, and Figma are unchanged.

## Theme evidence and final palette

Inspected `shared/Foundation.css` and `admin/src/pages/Dashboard.css`. Admin's `.pamo-dashboard-layout` consumes Foundation's dark navy #020617, surface #0F172A, subtle surface #1E293B, and input border #334155. Foundation currently uses #F1F5F9 primary text, #CBD5E1 secondary text and #1E293B default borders. This Home comparison explicitly uses the user's requested #FFFFFF / #94A3B8 text and #334155 borders; it does not change Admin's actual tokens.

| Role | Final light | Final dark |
| --- | --- | --- |
| Home canvas | Original transparent over #F8FAFC body | #020617 |
| Cards/panels, footer, desktop navbar | Original #FFFFFF | #0F172A |
| Secondary surfaces | Original #F8FAFC | #1E293B |
| Default borders | Original #E2E8F0 | #334155 |
| Input/hover borders | Original #CBD5E1 | #334155 |
| Primary text token | Original #0F172A | #FFFFFF |
| Secondary text token | Original #475569 | #94A3B8 |
| Primary yellow | #FFD100 | #FFD100 |
| Yellow hover / pressed | #FFE04D / #D9B200 | #FFE04D / #D9B200 |
| Yellow button text | Original dark #020617 | Original dark #020617 |
| Small accent text on light surfaces | Original accessible #B45309 | #FFD100 |
| Lower CTA navy panel | Original #0F172A | Original #020617 |

The original light treatment is restored, with primary yellow changed from #FBBF24 to #FFD100. Small light-surface accent text retains the original darker amber for contrast; bright yellow is not used as body text on white.

Home's static hero copy keeps its original panel and geometry; its yellow headline accent, kicker, primary CTA and focus color now use #FFD100. The photograph carousel's source, arrows, dots, Pause/Resume, timing, animation and interactions are unchanged. Its existing control colors remain protected. Policy icons return to the original uniform yellow treatment; the experimental emerald/crimson/cyan motifs are removed.

No #003DA5 blue, experimental navy #001233 / #002255, or supporting-color variables remain in the active comparison block.

## Exact rollback to the original Home design

From `C:\Users\Jeron\Documents\Projects\MERN`:

```powershell
Copy-Item -LiteralPath 'docs/design-experiments/home-sti-palette/baseline/frontend/src/components/HomePage.css' -Destination 'frontend/src/components/HomePage.css' -Force
```

This restores the original **working-tree** baseline, not Git HEAD. Preserve any later edits first. To retain later edits, remove only the final marked comparison block instead. No other application file needs restoration; retain this README and baseline for comparison evidence.

## Verification and limitations

Focused verification checks baseline integrity, preservation of all CSS outside the replaced block, Home-only selectors, color-only declarations, removed experimental colors, and calculated text contrast. These static checks do not prove complete WCAG conformance or live layout behavior.

Executed for this revision: baseline SHA-256 unchanged; original CSS prefix identical to the backup; all 16 new declarations restricted to Home colors; previous experiment absent; calculated text pairs passed 4.5:1 (minimum 4.80:1); frontend production build and scoped whitespace check passed. Final Git status retained all pre-existing entries.

No connected browser was available for this revision; live light/dark, mobile/tablet/desktop comparisons and navigation checks could not be performed. Other pages are excluded by the selector scope, rather than claimed as browser-verified. No JavaScript or business behavior changed. Prior lint evidence records two unrelated unused-variable errors in `frontend/tests/cashierDashboardV2.test.js:37` and `frontend/tests/heroImagesAdmin.test.js:56`; lint is not repeated for this CSS-only revision.
