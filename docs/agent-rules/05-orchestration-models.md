# Agent Orchestration & Model Efficiency

> Load for delegation, model selection, external research, or agent switching.
> Root AGENTS.md safeguards always apply.

## Agent Roles & Ownership

- **Codex:** Preferred primary developer, coordinator, and verifier.
- **OpenCode:** Research, QA, or fallback developer when authorized.
- **Antigravity (Gemini):** Research, debugging, architecture analysis,
  or fallback developer when authorized.
- **Claude via Antigravity:** Optional specialist reviews or development
  when available and explicitly authorized.

### Single-Editor Policy

- Only ONE agent may actively modify application source code at a time.
- Codex is the default active editor.
- OpenCode or Antigravity may take over when explicitly assigned by the user.
- During handoff, the previous agent must stop editing.
- Non-active agents remain read-only.
- The active editor owns implementation, verification, and final reporting.
- All agents operate on the current LOCAL repository as source of truth.

A delegated research task does not grant source-code editing permission.

## Model Selection

| Model | Recommended Use |
|---|---|
| Gemini 3.8 Flash Medium/High | Research, routine debugging, investigation |
| Gemini 4 Argon | Complex debugging, architecture, security |
| Claude Sonnet 5.5 | Specialist reviews, complex analysis |
| Claude Opus 5.5 | Exceptional reasoning or difficult second opinions |
| GPT 6.1 Sol Medium | Routine implementation |
| GPT 6.1 Sol High | Complex engineering |
| GPT 6.1 Sol Extra High | Critical integrity and high-risk tasks |

- Prefer the least expensive capable model.
- Escalate only when task complexity or failed verification justifies it.
- Verify actual model availability and IDs before selection.
- Use `agy models` when applicable.
- Model recommendations never automatically change the runtime.

## Delegation Protocol

1. Delegate only when meaningful benefit justifies the overhead.
2. Assign bounded objectives, relevant context, and stopping conditions.
3. Default delegated agents to read-only unless explicitly authorized.
4. Require concise findings supported by files, lines, or reliable sources.
5. The active editor validates findings before implementation.
6. Avoid duplicate investigations and unnecessary parallel agents.
7. Retry failed delegation at most once when justified.

Never expose secrets, bypass permissions, or modify external
services without authorization. Read-only instructions are not
security sandboxes.

## Agent Failover & Handoff

When switching from Codex to OpenCode or Antigravity:

1. Confirm the user's authorization and assigned development scope.
2. Stop the previous agent's editing activity.
3. Follow `07-context-continuity.md`.
4. Inspect current local Git changes and relevant implementation.
5. Read only task-relevant modular rules.
6. Inspect approved Figma frames through the available MCP connection
   when implementing UI.
7. Continue existing work without overwriting unrelated changes.
8. Verify changes and provide a concise handoff report.

Never assume another agent's work was committed, completed, or approved.

## Token Efficiency

- Load only relevant instructions, files, and design nodes.
- Use focused prompts and targeted tool calls.
- Reuse verified findings instead of repeating research.
- Avoid unnecessary agents, repository scans, and repeated tests.
- Keep investigation results and handoffs concise.
- Stop after completing the authorized scope.
- Never sacrifice correctness, security, or necessary verification.

**Principle:** One active developer. Selective delegation.
Safe handoffs. Minimal redundant work.