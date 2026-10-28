# PAMO / SmartStock — Agent Instructions

This is the small, always-on rulebook for Codex, OpenCode,
Antigravity, and other authorized development agents.

Specialized rules are in `docs/agent-rules/`.
Load ONLY task-relevant files and necessary sections.
The user's prompt defines the authorized mission and scope.
These rules never authorize additional work.

## Authority & Priorities

- **LOCAL working tree:** Functional source of truth.
  Never overwrite newer local work with older remote copies.
- **Figma:** Visual source of truth for approved UI/UX.
  Backend behavior and API contracts remain authoritative.
- **User authorization:** Defines scope, active developer,
  and whether source-code or Figma modifications are allowed.
- **Approval:** Completion does not imply visual approval,
  feature freezing, or authorization for another phase.
- **Engineering:** Favor practical MERN school-project
  solutions over unnecessary production-scale complexity.

Conflict priority:
Security/data integrity > User scope > Functionality/UI outside authorized changes
→ Existing contracts → Maintainability → Verified evidence → Efficiency.

Report unresolved conflicts rather than guessing.

## PAMO Legacy - Global Unfreeze

All feature and design freezes in this PAMO Legacy repository are lifted.
This includes Storefront, PAMO Admin, Cashier, Authentication, shared UI,
and all previously approved V1/V2/V3 features and designs. Prior approval
or a historical freeze does not require a separate unfreeze decision.
Authorized redesigns, refactoring, optimization and feature changes may
proceed within the current task's scope.

Security, data integrity, engineering standards and normal task-specific
source-code, Figma and operational authorization still apply. This status
supersedes older freeze instructions in checkpoints and documentation;
it does not authorize automatic implementation or a new freeze.
This applies only to PAMO-Legacy, not PAMO Campus (MERN).

## Mandatory Safeguards

### Git & Existing Work

- Before editing, check `git status --short`,
  `git diff --stat`, relevant diffs, and untracked files.
- Inspect dependencies and surrounding code when relevant.
- Preserve existing, uncommitted, and concurrent work.
- Recheck modified files and Git scope after implementation.
- Never reset, clean, destructively checkout, stash,
  switch branches, commit, push, or deploy without authorization.

### Scope & Engineering

- Inspect and reuse existing code before creating new code.
- Make the smallest justified change within authorized scope.
- Follow KISS, YAGNI, restrained DRY, pragmatic SOLID,
  separation of concerns, and existing architecture.
- No unsolicited refactoring, dependency changes, file moves,
  UI redesign, or phase advancement.

### Agent Ownership & Switching

- Codex is the preferred primary developer.
- OpenCode or Antigravity may become the active developer
  when explicitly authorized by the user.
- Only ONE authorized agent may modify project files at a time.
  Previous editors must stop before handoff.
- Delegated research is strictly read-only; editing requires
  explicit development authorization.
- Never bypass restricted delegation bridges or permissions.
- Manual provider/conversation switching is supported.
- New agents must verify actual LOCAL progress before editing.
- Follow `docs/agent-rules/05-orchestration-models.md`
  for coordination and `docs/agent-rules/07-context-continuity.md`
  for handoffs.
- Tool permissions do not guarantee OS-level isolation.
  Never expose secrets or private code without authorization.

### Security & Functional Safeguards

Preserve existing authentication/roles, backend-authoritative
per-size inventory, exactly-once order reservation,
at-most-once restoration, cart concurrency,
checkout idempotency, Philippine-peso (PHP) monetary rules,
Cashier/COD payments and refund obligations. Preserve working themes
and UI outside changes authorized by the current task. Prior visual
approval does not freeze their implementation.

- Stripe/PayPal remain disabled.
- Payment recovery remains dormant.
- Changes remain limited to the current task; preserve security and data integrity.
- Consult `docs/agent-rules/01-project-protections.md`
  when relevant.

### Figma & UI

- Follow the current task's authorized design requirements and relevant Figma references.
- Inspect relevant frames before UI implementation.
- Use available Figma MCP tools; prefer targeted node inspection.
- Preserve designs, tokens, components, themes and responsive behavior
  outside authorized changes; prior approval is not a design freeze.
- Never modify Figma without explicit authorization.
- Report inaccessible or missing designs; never invent specifications.
- Follow `docs/agent-rules/03-ui-figma.md`.

### Verification & Completion

- Run targeted checks proportional to task risk.
- Never run integration tests against application Atlas data.
- Do not present mocked tests as proof of real database,
  provider, or browser behavior.
- Report actual passed, failed, skipped, and blocked checks.
- Avoid broad repository scans/hashes, unnecessary subagents,
  rereading unchanged files, redundant tests/builds,
  and excessive reports.
- Never sacrifice correctness or security to save tokens.
- Report changes, verification evidence, remaining issues,
  and Git scope.
- Stop after the authorized task; await user review.

## Conditional Rule Loading

| Trigger | Required File |
|---|---|
| Business logic, security, auth, inventory, orders, payments, protected features | `docs/agent-rules/01-project-protections.md` |
| Code quality, architecture, formatting, refactoring | `docs/agent-rules/02-engineering-standards.md` |
| Figma, UI/UX, CSS, accessibility, responsive design | `docs/agent-rules/03-ui-figma.md` |
| Testing, QA, database isolation, verification workflow | `docs/agent-rules/04-testing-workflow.md` |
| Delegation, agent ownership, model selection, external research | `docs/agent-rules/05-orchestration-models.md` |
| OpenCode usage, delegation, or fallback development | `docs/agent-rules/06-opencode.md` |
| Context recovery, model/provider switching, interruptions, handoffs | `docs/agent-rules/07-context-continuity.md` |

Read multiple files only when the task requires them.

If a referenced rule file is missing, report it without
inventing its contents. Applicable nested `AGENTS.md`
instructions also apply.

## Context & Token Efficiency

- Keep prompts, tool calls, findings, and reports focused.
- Reuse verified context instead of repeating investigations.
- Do not load every rule file or inspect the entire repository
  unless justified.
- For new conversations, recover relevant context from
  the user's prompt, local repository, applicable rules,
  and available checkpoints.
- Never assume another agent's report overrides local evidence.

**Principle:** One active developer, one authoritative local
codebase, Figma-informed UI, security/data integrity, selective
rule loading, and safe cross-agent continuation.

## Mandatory Project-Wide Coding Style

Applies to ALL application-owned code across frontend/,
admin/, backend/, shared/, tests, and configuration files.

### Core Principles
- Write simple, clean, professional, human-readable code.
- Prioritize readability over cleverness or shorter syntax.
- Follow conventional JavaScript, React, Express, and Mongoose patterns.
- Use clear responsibilities, descriptive naming, and logical execution flow.
- Apply KISS, YAGNI, pragmatic DRY, and separation of concerns.
- Avoid unnecessary abstractions, wrappers, helpers, and architectural layers.

### JavaScript & Control Flow
- Strictly avoid nested ternary operators (`? :`).
- Prefer explicit `if`/`else`, switch statements, and early returns.
- Avoid deeply nested conditions and complicated one-liners.
- Avoid excessively chained expressions that obscure behavior.
- Keep functions cohesive, understandable, and consistently formatted.
- Use optional chaining (`?.`) and nullish coalescing (`??`)
  when they genuinely improve readability.

### React & Frontend
- Keep JSX clean, readable, and logically structured.
- Avoid complicated conditional rendering and excessive component nesting.
- Use `&&` for simple conditional rendering when appropriate.
- Prefer clear state management and descriptive event handlers.
- Avoid redundant hooks, state variables, and unnecessary effects.
- Use Tailwind CSS as the primary component styling approach.

### Express & Backend
- Prefer early-return guard clauses for invalid requests and denied access.
- Keep controllers straightforward and focused on HTTP responsibilities.
- Keep business logic in appropriate feature-owned functions or services.
- Avoid unnecessarily complicated validation and error handling.
- Preserve security checks, transaction boundaries, and API contracts.
- Use familiar, lightweight layered MVC conventions.

### MongoDB & Mongoose
- Keep schemas, queries, and database operations readable.
- Use descriptive model and field names.
- Avoid unnecessarily complicated query construction.
- Preserve indexes, transactions, validation, and data integrity.
- Do not introduce unnecessary database abstraction layers.

### Imports & File Organization
- Organize imports logically and remove unused dependencies.
- Avoid excessive, repetitive, and unnecessary imports.
- Group related assets when doing so genuinely improves readability.
- Keep related code together under its appropriate feature or role.
- Avoid circular dependencies and confusing cross-folder imports.
- Do not create additional files merely to hide complicated code.

### Refactoring & Formatting
- Simplify implementations rather than merely relocating complexity.
- Maintain consistent naming, indentation, spacing, and formatting.
- Remove verified dead code and redundant implementations.
- Do not sacrifice clarity to minimize line counts.
- Preserve functionality, security, and existing contracts.
- Apply these standards to every new or modified source file.
- During authorized code-cleaning missions, enforce them across
  the entire approved scope, not just selected examples.
