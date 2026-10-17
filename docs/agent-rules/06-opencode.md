# OpenCode — Delegation & Fallback Development

> Load only when using OpenCode.
> Follow root AGENTS.md and 05-orchestration-models.md.

## Operating Modes

### 1. Delegation (Default)

When Codex is the active developer:

- OpenCode performs bounded, read-only research, debugging,
  architecture analysis, Figma inspection, and QA.
- Codex remains responsible for implementation and verification.
- Use the existing read-only delegation bridge.
- Preserve all bridge restrictions and denied permissions.
- Do not edit application code, databases, or external services.

### 2. Fallback Development (Explicit Authorization)

When the user explicitly assigns development to OpenCode:

- OpenCode becomes the sole active source-code editor.
- Codex and other agents must stop editing the repository.
- Use a separately authorized OpenCode development session,
  not the restricted read-only delegation bridge.
- Follow 07-context-continuity.md before implementation.
- Inspect the current LOCAL working tree and relevant diffs.
- Read applicable modular rules and existing code.
- Continue from verified progress without overwriting work.
- Implement only the assigned scope.
- Run appropriate tests and report actual results.
- Return to read-only delegation when development ownership ends.

Authorization to edit source code does not authorize modifying
Figma designs, unrelated files, protected behavior, or infrastructure.

## Model Selection

Do not maintain a fixed model list.

Before choosing a model:

1. Run `opencode models` to identify currently available models.
2. Prefer free models unless the user authorizes paid usage.
3. Match model capability to task complexity.
4. Verify required tool access before relying on a model.
5. Escalate only when simpler models are insufficient.
6. Never automatically switch to paid models.

Suggested capability tiers:

| Task | Required Capability |
|---|---|
| Simple inspection | Fast, tool-capable model |
| Routine coding | Reliable code editing and tool use |
| Debugging | Strong code reasoning and investigation |
| Architecture | Strong multi-file reasoning |
| Figma/UI | Design-context interpretation; vision if needed |
| Critical changes | Strong reasoning with rigorous verification |

Model availability does not guarantee tool support or quality.
Verify capabilities through actual results.

For bridge delegation, verify the selected model is permitted
by the adapter allowlist. Do not bypass bridge restrictions.

## Figma MCP

Authoritative Figma file:
https://www.figma.com/design/syRAO060QPqFSw0VGGbXBi/Untitled

- Use the configured Figma MCP connection.
- Verify connectivity with `opencode mcp list` when needed.
- Inspect relevant approved frames before UI implementation.
- Retrieve targeted metadata, design context, and tokens.
- Avoid unnecessary full-file traversal.
- Follow 03-ui-figma.md for UI implementation rules.
- Never modify Figma designs without explicit authorization.
- Tool availability alone does not prove editing capability.

## Read-Only Delegation Bridge

Existing adapter:

`C:\Users\Jeron\Codex-Antigravity\scripts\opencode_delegate.py`

Example:

```powershell
python C:\Users\Jeron\Codex-Antigravity\scripts\opencode_delegate.py --dir C:\path\to\project --type review --model <verified-allowed-model> --timeout 180 --task "<focused read-only task>"
```

Delegated tasks must specify:

- Objective and bounded scope.
- Necessary sanitized context.
- Read-only restrictions.
- Required file/line evidence.
- Concise findings and stopping conditions.

The active developer validates delegated findings.

## Security & Reliability

- Preserve existing bridge restrictions.
- Never bypass permissions or expose secrets.
- Do not alter provider settings or authentication automatically.
- Read-only tool permissions are not an OS sandbox.
- Reject empty, malformed, irrelevant, or timed-out responses.
- Retry failed delegation at most once when justified.
- Never use automatic paid-model fallback.
- Do not modify files outside the authorized scope.

For bridge diagnostics, when supported:

```powershell
python C:\Users\Jeron\Codex-Antigravity\scripts\opencode_delegate.py --diagnose --task "Validate reviewer permissions."
```

Reference:
`C:\Users\Jeron\Codex-Antigravity\OPENCODE.md`

## Completion

Report concisely:

- Completed work
- Modified files, if any
- Tests and verification results
- Unresolved issues
- Handoff information when switching agents

Stop after the authorized task.

**Principle:** Read-only when delegated.
Single active editor when explicitly assigned development.