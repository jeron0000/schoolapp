# Publication review ? pending authorization

Prepared from the current local PAMO working tree on top of schoolapp/main at f88b7f0e9e3da7d8e6233c77be96ecadd1f405d4. This is a publication checkout, not the active development workspace.

No local development Git history was imported. Existing destination history, backend environment template, older login image and unchanged PDF asset are preserved. The PDF was already tracked by the destination; it was not newly introduced or recopied, and its contents were not re-audited.

Included: reviewed current application source, assets, tests, manifests/lockfiles, setup/security documentation, modular agent rules and palette rollback documentation. The 387-file source allowlist was copied byte-for-byte except .gitignore, which retains destination rules and adds current local environment/cache safeguards.

Excluded: actual environment files, node_modules, build outputs, caches, logs, temporary files and unrelated tiktok files. Only reviewed blank/loopback environment templates are present. Local credential-bearing history and dependency tracking remain outside this repository. Historical credential rotation remains outstanding; publication cleanup does not invalidate exposed credentials.

The current system palette remains pending final user visual approval; it is not frozen or permanently approved. See docs/design-experiments/system-palette-rollout/README.md for color scope, evidence and rollback.

Verification evidence is reused from development: both production builds and 96 focused regressions passed; Admin lint passed; Frontend lint has two documented existing unused-variable errors. This publication checkout has not installed dependencies or independently rerun builds/tests. No connected-browser verification or real database/provider integration testing is claimed. Stripe/PayPal remain disabled and recovery dormant.

No staging, commit or push is authorized in this preparation task. Re-fetch and verify the destination has not advanced before any separately authorized commit/push.
