# Verification, Safe Test Environments, Git Workflow and Reporting

**Load when:** creating/editing tests, modifying risky code, performing QA, preparing final acceptance, or working with database/provider test fixtures.

## Proportional verification

- Establish a baseline when correcting a reproducible defect or comparing formatting-only code.
- Run focused unit/component/regression checks for touched behavior; lint/build relevant apps if required. Expand to full suites for broad or high-risk effects, not out of habit.
- For security, inventory, payments, authentication, database concurrency or refunds: include invalid inputs, role boundaries, stale/duplicate requests, failed/retried operations, atomicity and idempotency cases.
- Check affected shared consumers, error/empty states, light/dark and responsive interactions for UI changes.
- Prefer bounded repeatable fixtures. Distinguish measured performance from modeled scaling or SSR time. Report exactly what was tested.
- Report **passed, failed, skipped, blocked and not run** accurately. Mocks are not proof of real MongoDB atomicity, provider settlement or live browser behavior.

## MongoDB and provider isolation

- The seven existing database integration suites remain **opt-in**; do not run them without independently verified disposable test MongoDB (loopback-only replica set) and explicit authorization.
- The isolated test contract requires `PAMO_TEST_DB_APPROVED=1` and an explicit `PAMO_TEST_MONGODB_URI`; do not substitute the application `MONGODB_URI` or load normal `.env` into integration fixtures.
- URI checks alone cannot prove that a loopback endpoint is disposable or not a forwarded service. Confirm identity and cleanup scope independently.
- Never write to the existing Atlas/application database or perform live Cloudinary/provider transactions solely for verification.
- Keep cleanup scoped to test-owned resources; no unapproved installation of MongoDB/Docker or index/schema migrations.

## Git and scope workflow

1. Capture a **concise** initial Git snapshot: `git status --short`, `git diff --stat` and targeted `git diff -- <relevant paths>`; note untracked and concurrent work. Use wider inspection only when needed.
2. Inspect instructions, related implementation/contracts and relevant tests. Verify the current task's exact authorization.
3. Investigate, optionally delegate focused **read-only** research, choose the smallest correct change, then edit only authorized files.
4. Run scoped verification and broader regressions according to actual risk.
5. Review touched-file diff, compare initial/final Git status, identify unexpected changes. Do not reset, clean, stash, commit, push or modify tracked `node_modules` merely for hygiene without separate permission.
6. Report findings/changes, tests, limitations, delegate evidence (if any) and file scope; stop for user review. No automatic next phase, deployment, payment activation or visual freeze.

## Completion report (brief)

- **Outcome:** what was proved/fixed, or why no change was justified.
- **Files:** exactly what changed.
- **Evidence:** focused tests/benchmarks, actual results, and important regression checks.
- **Limitations:** blocked integration/browser checks and open risk.
- **Safety:** scope/Git preservation, no unauthorized operations.
- **Status:** “Ready for user engineering review.” Never claim deployment-readiness without evidence.
