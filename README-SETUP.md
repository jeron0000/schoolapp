# Install the split PAMO / SmartStock agent instructions

## Folder layout

```text
MERN/
├── AGENTS.md                        # Short always-on rules + routing
└── docs/
    └── agent-rules/
        ├── 01-project-protections.md
        ├── 02-engineering-standards.md
        ├── 03-ui-figma.md
        ├── 04-testing-workflow.md
        ├── 05-orchestration-models.md
        ├── 06-opencode.md
        └── 07-context-continuity.md
```

1. **Back up** your current root `AGENTS.md` (e.g., copy to a safe location outside the repository before replacing it).
2. Extract the ZIP contents into `C:\Users\Jeron\Documents\Projects\MERN\` while retaining the relative folders. The extracted `AGENTS.md` should be at the **repo root**.
3. Use the short root file for every Codex task. Codex ordinarily reads applicable `AGENTS.md` files automatically; **the referenced ordinary `.md` topic files are NOT automatically loaded** just because they are linked. The root directs the agent to open them only when relevant.
4. Keep task prompts short. Example: `Follow AGENTS.md. CQ-9B5B: resume from current changes, verify assets/build evidence, report gaps and stop. No new phase.`
5. Don't instruct Codex to open every topic document unconditionally; doing that would recreate the original token burden.

## Source coverage

This split reorganizes the supplied ~1,937-line document, consolidating recurring rules without intentionally relaxing its major requirements. Content areas are mapped as follows:

| Original topics | New location |
| --- | --- |
| Purpose; priority order; mandatory Git/scope | Root `AGENTS.md` |
| §1, §4, §5 project context/frozen features/business & security | `01-project-protections.md` |
| §6–9 and §19 code quality/architecture/system-wide consistency/CQ mission | `02-engineering-standards.md` |
| §10 Figma/responsive; visual requirements from §9 | `03-ui-figma.md` |
| §18, §20 testing, verification, final workflow/report | `04-testing-workflow.md` |
| §11–17 orchestration, Gemini/Claude, Antigravity CLI, models, budget | `05-orchestration-models.md` |
| OpenCode V2 bridge appendix | `06-opencode.md` |
| Model switching/compaction/handoff appendix | `07-context-continuity.md` |

## Practical notes

- **Important:** Splitting documents is useful only if the agent does not eagerly read them all. The root holds always-on high-risk guardrails even when specialized topic files have not yet been opened.
- For broad audits, several topic documents may properly be loaded. For simple formatting fixes, root + engineering standards may be sufficient.
- This reorganized package adds context from completed security/architecture phases (e.g., refund obligations, PHP pricing, opt-in DB suites) already discussed in your project reports. Check these details against the current repo during implementation.
- No change to your application source, history or original upload was made by generating this package. You must decide when to apply it in your local checkout.
