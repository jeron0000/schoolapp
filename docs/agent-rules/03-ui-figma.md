# Figma, UI/UX, Accessibility and Responsiveness

**Load when:** task changes a rendered UI, CSS, visual component, shared design token, responsive layout or Figma-derived implementation.

## Visual authority

- Approved Figma file: https://www.figma.com/design/syRAO060QPqFSw0VGGbXBi/Untitled
- Inspect **exact relevant frames** and, where applicable, variants, interactions, responsive versions, light/dark themes and asset handoffs using the connected Figma integration.
- Figma governs authorized visual specifications; the **local repo** governs working functionality and data contracts. Do not derive backend/API requirements from Figma placeholder content.
- When access/specifications are missing, report the limitation; do not invent pixels, interaction requirements or new designs.
- Only modify frozen/approved visuals when the current task explicitly authorizes it. Add Product V2 requires explicit visual acceptance before treating as approved.

## Design system

Use existing STI yellow/amber, deep navy, white/off-white, slate/neutral palette; preserve **IBM Plex Sans**, **Lucide** icons and host-specific component conventions. An explicit newer approved spec overrides older conflicting font/icon references.

Keep typography, spacing, controls, icons, borders, radii, shadows, visual feedback, focus indicators, navigation, loading/error states and light/dark modes consistent with each page's approved purpose. Don't homogenize unrelated pages.

## Responsive and accessible implementation

- Fluid **280–4096px** design: Grid/Flexbox, adaptive forms/tables/charts, content-based breakpoints, sensible width caps, natural scrolling and readable typography.
- Representative widths **280, 360, 390, 820, 1280, 1440, 1920, 2560, 3440, 4096px**. Also consider viewport height, zoom, touch devices and DPR where relevant.
- Check clipping, overflow, hit targets, keyboard focus/order, labels, reduced motion, navigation and theme contrast.
- Test proportionately to changed UI rather than browser-sweeping the entire application for each task.
- Preserve image source/fallback behavior, responsive sizing and loading priority where image delivery changes. Never replace protected image assets without authorization.

## Verification

- Use relevant component regressions, builds, visual and browser checks, and Figma comparisons when available.
- Distinguish SSR/modelled render checks from interactive authenticated browser verification. If the browser redirects to Shared Login, report blocked checks instead of claiming protected screens were inspected.
- Never modify unrelated UI/CSS to solve a scoped issue or to create visual uniformity.
