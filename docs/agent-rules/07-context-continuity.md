# Context Preservation & Agent Handoffs

> Load only for model switches, context compaction,
> interrupted sessions, or cross-agent handoffs.
> Root AGENTS.md safeguards always apply.

## Checkpoint Before Interruption

When feasible, provide a concise checkpoint containing:

1. Mission ID and exact authorized scope.
2. Completed work and verified findings.
3. Important decisions, contracts, and invariants.
4. Modified files and existing uncommitted changes.
5. Tests performed: passed, failed, skipped, or blocked.
6. Remaining tasks, defects, blockers, and next action.
7. Relevant Figma node IDs or research references.

Prefer existing summaries. Do not generate persistent
checkpoint files unless authorized or already required.

## Recovery & Agent Switching

Applies to Codex, OpenCode, and Antigravity.

Before resuming development:

1. Read root AGENTS.md, relevant modular rules,
   task requirements, and available checkpoint.
2. Inspect the current LOCAL working tree:
   - `git status --short`
   - `git diff --stat`
   - Relevant diffs, untracked files, and dependencies.
3. Verify completed versus unfinished work.
4. Check whether previous test results remain valid.
5. Inspect relevant approved Figma frames when
   continuing UI implementation.
6. Resume from verified progress without restarting
   completed work or overwriting existing changes.

The actual local repository overrides remembered context,
previous agent reports, and older remote copies.

PAMO Legacy is globally unfrozen: do not restore historical feature or
design freezes from older checkpoints, approvals or agent reports.
Normal task authorization, security and data-integrity safeguards remain.
This status does not apply to PAMO Campus (MERN).

If essential context is missing, report the gap.
Never fabricate progress or assume unverified completion.

## Cross-Agent Handoff

- Codex is the preferred primary developer.
- OpenCode or Antigravity may take over only when
  explicitly authorized by the user.
- Only ONE agent may actively edit source code at a time.
- Stop the previous editor before transferring ownership.
- Other agents remain read-only during development.
- A handoff does not expand the authorized task scope.
- Follow 05-orchestration-models.md for ownership rules.
- Follow 06-opencode.md when using OpenCode.

## Context & Token Efficiency

- Recover only context relevant to the active task.
- Reuse verified findings and existing checkpoints.
- Avoid rereading unchanged files or repeating research.
- Run missing or risk-sensitive verification as needed.
- Keep checkpoints and reports concise.
- Do not create unnecessary handoff documentation.

Never sacrifice correctness to reduce token consumption.

## Invariants Across Transitions

Preserve security, data integrity, designs/features outside authorized
changes, backend contracts, Git changes,
scope restrictions, and verification honesty.

Never automatically:
- Commit, push, deploy, or discard existing work.
- Modify functionality/UI outside the authorized task or edit Figma without authorization.
- Enable disabled payment integrations.
- Freeze features or advance to another phase.
- Expand permissions or bypass agent restrictions.

**Principle:** Verify local state, preserve existing work,
transfer ownership safely, and continue without restarting.