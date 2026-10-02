# Matrx Versioning Rules

**This doc moved.** The versioning standard (approved architectures, trigger-driven `_versions`
tables, shared RPCs, change notes, pinning) is now maintained in one place, shared with `aidream`:
[`/Users/armanisadeghi/code/common-docs/systems/architecture/versioning/`](/Users/armanisadeghi/code/common-docs/systems/architecture/versioning/)
(also reachable as `common-docs/systems/architecture/versioning/`). Read it before touching any versioned table
or `_versions` history.

- [`matrx-versioning-approved-architectures.md`](/Users/armanisadeghi/code/common-docs/systems/architecture/versioning/matrx-versioning-approved-architectures.md) — the two approved strategies + the new-table template
- [`ai-matrx-versioning-team-guide.md`](/Users/armanisadeghi/code/common-docs/systems/architecture/versioning/ai-matrx-versioning-team-guide.md) — frontend usage (RPCs, entity types, breaking renames)
- [`ai-dream-versioning-api-changes.md`](/Users/armanisadeghi/code/common-docs/systems/architecture/versioning/ai-dream-versioning-api-changes.md) — backend/API side

For the agent (`agx_agent` / `agent_definition`) versioning implementation in this repo, see
[`features/agents/docs/AGENT_VERSIONING.md`](../../features/agents/docs/AGENT_VERSIONING.md)
(subordinate to the common-docs standard).
