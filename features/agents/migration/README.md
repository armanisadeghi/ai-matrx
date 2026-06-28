# Prompts → Agents Migration

This directory is the **single source of truth** for the migration from the legacy prompt system (`/ai/prompts`, `features/prompts`, `features/prompt-builtins`, `features/prompt-apps`, `features/prompt-actions`, `features/context-menu`) to the agent system (`/agents`, `features/agents`).

## Goal

Replace every capability built on the prompt system with an agent-native equivalent, **without breaking any feature at any point**. Build replacements first, run both systems in parallel behind a flag, then delete the old code in one continuous campaign.

## Documents in this directory

| File | Purpose |
|---|---|
| `README.md` | This file. Rules of the road. |
| `MASTER-PLAN.md` | The ordered phase plan. Start here. |
| `INVENTORY.md` | Complete inventory of the legacy prompt surface and the agent surface it maps to. |
| `phases/phase-NN-*.md` | Per-phase detailed plans. One per phase. Living documents. |
| `MIGRATE-recipe-to-agent-execution.md` | Reusable playbook: legacy recipe/broker/socket execution → `useRunAgent` / `launchAgentExecution`. |
| `DECISIONS.md` | Decisions log — questions raised during phases and how they were resolved. |

## Non-negotiable rules for every contributor

Any subagent or human editing any file during this migration **must** follow these.

### 1. Keep the docs live

After every turn that changes anything in scope, update the relevant phase document. Specifically:

- Move status forward (`not-started` → `in-progress` → `complete` / `blocked`).
- Append to the phase's **Change Log** with a one-line entry: date, what changed, what file(s).
- If you discover a new prompt-system surface that is not inventoried, add it to `INVENTORY.md` immediately.
- If you make a design decision that affects other phases, add it to `DECISIONS.md`.

Stale docs here will cause cascading failures across parallel agents. Treat the docs as production code.

### 2. RTK for everything

No local state patches, no ad-hoc fetch calls, no side-channels. Every piece of data in scope lives in an RTK slice (or extends an existing one). If the slice you need does not exist, add it — do not work around it. If unsure which slice owns a concern, ask before creating a new one.

### 3. Shared CRUD components live in a feature directory

Shortcuts, content blocks, and categories all need admin + user + org CRUD. **Build each component once** in the appropriate `features/<name>/components/` directory, then mount it from every route that needs it. Never duplicate.

### 4. No destructive action until replacement ships

Legacy code stays until its replacement is ≥ feature-parity **and** has soaked under traffic. Deletion phases (16–19) are explicitly last.

### 5. Deprecation gates

A legacy file can only be removed when:
- Its replacement is referenced from every former call site, and
- The phase that owns its removal is marked `complete` in `MASTER-PLAN.md`, and
- A grep for the legacy symbol returns only the removal diff.

### 6. Dead concepts we explicitly skip

- **Recipes**: all active recipes were long since converted to prompts, and all prompts are already converted to agents. No recipe→agent converter, no prompt→agent converter.
- **`ai_agent` table (legacy)**: handled outside this migration. Do not touch.

### 7. Status legend

```
not-started   — no work has begun
in-progress   — actively being worked on (include owner handle)
blocked       — see the Blocker field; needs resolution from another phase or human
complete      — shipped, verified, and every downstream dependency is updated
```

---

**Start reading:** [`MASTER-PLAN.md`](./MASTER-PLAN.md)
