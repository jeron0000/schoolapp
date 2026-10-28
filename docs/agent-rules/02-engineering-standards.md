# Code Quality, Architecture and System-Wide Consistency

**Load when:** changing code, refactoring modules, formatting, restructuring files, reviewing architecture or evaluating maintainability.

## Principles

- **KISS:** simplest correct design; **YAGNI:** no speculative infrastructure; **DRY:** eliminate meaningful duplication, not every repeated line.
- Apply **SOLID** pragmatically. Prefer clear responsibilities, high cohesion, low coupling, stable interfaces, explicit dependencies and testability over decorative layers.
- **Reuse before create.** Investigate nearby components/hooks/utilities and existing conventions before adding a new abstraction.
- Optimize for readability, maintainability, correctness, realistic scalability and predictable error handling. Avoid general service/repository layers when existing controllers and domain utilities are cohesive.
- Preserve security boundaries and transactionally coupled execution; similar code can express important domain differences.

## Professional formatting and execution flow

- Use established formatter/linter rules and readable indentation, whitespace, multiline JSX/objects/conditions, meaningful names, logical groupings and restrained comments.
- Favor clear validation → authentication/authorization → domain operations → response/error propagation. Preserve original evaluation order, asynchronous sequencing and side effects unless explicitly authorized to fix behavior.
- Functions need coherent responsibilities, not arbitrary line limits. Extract only when it demonstrably helps cohesion, reuse or testing. Prefer clear early returns where equivalent and appropriate.
- Avoid dense nesting, obscure ternaries, hidden side effects, unnecessary parameters, repeated error branches and unrelated formatting churn.
- For readability-only missions, compare behavior/AST or generated output when feasible; do not mix formatting with functional fixes.

## Mandatory project-wide clean-code standards

- Prefer readable, conventional code over clever, compressed or unnecessarily short syntax.
- Do not use nested ternary operators. Use `if`/`else`, `switch` statements, early returns or clearly named intermediate values.
- Avoid complicated JSX, dense one-line handlers and deeply nested control flow. Keep functions cohesive and give state, events and domain values clear names.
- Apply KISS, YAGNI, pragmatic DRY and separation of concerns. Remove verified dead code and redundant implementations without creating speculative abstractions.
- Follow familiar React, Express and Mongoose patterns. Keep backend structure within the existing lightweight MVC approach; do not add generic service, repository or wrapper layers without a demonstrated need.
- Use Tailwind utilities as the primary component styling approach where they fit the existing implementation. Preserve established CSS files, shared tokens and cascade behavior when they remain the clearer or safer choice.
- Keep imports consistent and consolidate named imports from the same module when that improves readability. Preserve understandable relative paths and avoid unnecessary barrel files or circular dependencies.
- Apply these standards to all new and modified application-owned code in `frontend/`, `admin/`, `backend/`, `shared/`, tests and configuration.

## React and styling standards

- Keep presentation and business behavior appropriately separated. Manage state ownership, effects, stale responses, cleanup, loading/error/empty states and consumer contracts carefully.
- Preserve existing context identities, session/cart coordination and component public interfaces. Do not introduce blanket memoization, new state libraries or generic hooks without evidence.
- Keep the established **CSS + JSX** architecture: readable CSS declarations, logical selector grouping, stable cascade/design tokens, restrained specificity and no override stacking. No Tailwind/CSS Modules migration without authorization.

## File, folder and module architecture

- Discoverable names; related logic together; separate unrelated responsibilities without needless fragmentation or deep hierarchies.
- Maintain import/export compatibility, predictable dependency direction and avoid circular imports or cross-app dependency ownership.
- Before file moves: identify verified need → map consumers/imports/routes/assets → baseline tests → smallest reviewable change → verify references and affected flows → inspect diff.
- Do not reorganize the directory merely to make it look more sophisticated. No blanket extraction of large files.

## System-wide consistency

- Keep appropriate conventions consistent across customer, PAMO Admin, Cashier and shared modules: naming, validation, API/error contracts, accessibility, testing and execution flow.
- Consistency does not mean identical UIs or merged role-specific workflows. Preserve design and behavior outside authorized changes; prior approval does not freeze PAMO Legacy features or visuals. Don't make incidental changes to unrelated areas.

## Engineering Excellence mission

For each authorized CQ phase: **inspect → understand → identify verified concern → prioritize → minimal scoped change → appropriate tests/benchmarks → scope and regression audit → user review**. An audit that finds no justified change is a valid outcome. Do not automatically begin the next phase.
