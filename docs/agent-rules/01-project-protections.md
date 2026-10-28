# Project Context, Protected Features and Business Contracts

**Load when:** changing or reviewing behavior, security, orders, inventory, payments, authentication, cart or shared functionality.

## Project and sources of truth

- **PAMO / SmartStock:** STI College Carmona merchandise ordering, inventory management and administration. Stack: MongoDB, Express, React, Node.js. Includes storefront, PAMO Admin, Cashier and shared authentication.
- The current local working checkout is authoritative for functionality and data contracts. Inspect actual source; preserve current tracked, untracked and concurrent changes. Never overwrite local changes from GitHub.
- Approved Figma frames govern visual requirements, not business logic. File: https://www.figma.com/design/syRAO060QPqFSw0VGGbXBi/Untitled . Mock data are not functional specifications.
- Task-specific user authorization defines the allowed edits. A passing build or implementation does **not** constitute design approval.

## Feature and design change authorization

All PAMO Legacy feature and design freezes are lifted, including Storefront, PAMO Admin Dashboard V1/V2, Cashier Dashboard, Authentication/Shared Login, shared UI, Global Light/Dark Toggle, Hero Carousel, My Orders V2, About Us V2, Contact Us V2, Add Product V2 and all other previously approved features. They may be redesigned, refactored, optimized or functionally modified within an authorized task without a separate unfreeze approval. Previous visual approval is a reference, not an immutable implementation restriction. This does not approve a new design or authorize work outside the current mission. Security, data integrity, operational approvals and the contracts below remain in force. This unfreeze does not apply to PAMO Campus (MERN).

Maintain navigation, interactions, mobile/desktop responsiveness and light/dark behavior outside authorized changes. Inspect affected consumers rather than changing unrelated pages for uniformity.

## Inventory, orders and carts

- Backend stock is authoritative and tracked **per product size**. Adding to cart does not reserve or deduct stock.
- Reservation/deduction occurs exactly once at canonical order creation, with concurrency and oversell guards; cancellation/restoration occurs at most once. Preserve coupled transaction boundaries and operation order.
- Preserve canonical server pricing, order ownership, approval, status transitions, checkout idempotency, revision-aware cart updates and cleanup that does not erase newer changes.
- Preserve defensive validation at trust boundaries, session isolation, optimistic rollback and existing request-generation guards.
- Do not weaken historically compatible data handling or silently backfill/migrate flexible fields.

## Payments, refunds and authentication

- Amounts in application data/APIs follow the existing **PHP peso** contract; use precise centavo calculations, and retain the established ₱10 checkout fee where applicable. Do not reinterpret historical foreign currencies or replace server prices with client-supplied amounts.
- COD and Cashier remain functional. Preserve guarded payment confirmation, unique receipt protections, server-verified payment evidence, and idempotent/atomic status writes.
- For eligible paid cancellations, preserve durable **Refund Required** obligations and coordinated stock restoration. This is not authorization to initiate actual refunds. Keep legacy/historical ambiguity conservative.
- Stripe and PayPal public online-payment routes remain **disabled/contained**. Provider verification foundations do **not** mean live activation. Payment recovery remains **dormant**. No provider activation, webhook mounting, automatic refunds or reconciliation executor without explicit authorization.
- Enforce customer/PAMO Admin/Cashier authorization and ownership; preserve JWT issue/expiry checks, rejection of credential-bearing or expiryless tokens, input validation and sanitized public errors.

## Credentials and externally supplied context

- Historical credentials may have been exposed in Git history. Do not print, forward or embed secrets. Never pass secrets or private customer data to research agents.
- Do not rotate credentials or alter external services without explicit operational authorization. Do not use application/Atlas credentials for experiments.
- Report material security risks proportionately; this is a local-only project, not evidence of production deployment.

## Areas requiring special regression attention

Cart and checkout, authentication/session changes, money formatting, upload signature checks and Cloudinary compensation, provider verifiers, analytics semantics (PAMO 30-day sales and Cashier historic quality counters), receipt-index readiness, Shared Login, and affected UI.
