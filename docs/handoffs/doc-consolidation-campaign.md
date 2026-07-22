# Handoff — Documentation Consolidation Campaign (Single Source of Truth)

**Owner:** the common-docs structure session (took over 2026-07-22; integrating with the docs-architecture redesign). Originated by the access-campaign session. **Created 2026-07-22** from a four-agent full inventory: ai-matrx (794 docs), aidream (774 docs), matrx-common-docs (~30 docs, healthy), skills (68 ai-matrx + 24 aidream + 29 legacy Cursor-era). Raw tables: ai-matrx sortable artifact at https://claude.ai/code/artifact/68e68a6b-882f-4c1e-a621-cbfff074f8b6 ; aidream per-file table (774 rows: path | mtime | title) at [`doc-inventory-aidream-full-table.txt`](doc-inventory-aidream-full-table.txt) beside this doc. NOT covered by the inventory: matrx-extend, matrx-local, my-matrx, matrx-ship, matrx-sandbox, matrx-package-template.

**Goal:** one source of truth per system; everything else is a pointer, an archive, or deleted. Arman signs off on every deletion wave.

## The verdict in one paragraph

The common-docs layer is sound (pointer contract verified intact across all repos — zero competing copies). The rot is one layer down: ~480 HISTORY-class docs (finished handoffs, migration sagas, investigations) sitting in live paths where agents read them as current, ~30 genuine duplicate clusters, a dozen self-declared-superseded files still in place, and two parallel legacy Cursor skill systems never retired. The single worst cluster: the **tool system** (~17 docs across 4 directories all claiming authority). The most dangerous pattern: **confidently-named stale docs** ("Official Truth", "CANONICAL_REFERENCE", "Final Architecture") that lost their authority to newer docs but kept their titles.

## Wave 1 — Mechanical kills (no judgment needed; Arman approves the list, an agent executes)

- Self-declared junk/superseded: `.arman/junk/*` (3), `docs/database/HANDWRITTEN_SQL_INVENTORY.md`, `docs/packages/ORM_RAWSQL_ERADICATION.md`, `docs/scraper/SCRAPER_CONSOLIDATION_PLAN.md` (merged into master), `.pytest_cache/README.md` ×3 (gitignore), `common/utils/code_from_markdown/*` (3 scratch), common-docs `AGENTS.md` (frozen copy of root CLAUDE.md inside the zero-mirrors repo).
- Exact duplicate tree: `aidream/utils/code_context/**` (8 files byte-identical to `packages/matrx-utils/matrx_utils/code_context/**`) — delete after confirming the whole root `utils/` tree is dead post-package-extraction.
- ai-matrx root strays: `TEMP-CLEANUP.md`, duplicate `.cursor/plans/agents_route_implementation_*.plan.md` (verbatim copy of `app/(core)/agents/docs/plan.md`).
- common-docs lint fixes: frontmatter on `media-capture/FEATURE.md` + `access-architecture/DECISION_BRIEFS.md`, index the former, fix the malformed index bullet.

## Wave 2 — Archive sweep (move, don't delete: `docs/archive/<year>/` per repo)

All HISTORY-class: ai-matrx `docs/type-drift/` (34), `docs/SWEEP_*` + `docs/IMPACT_INVENTORY_*` (11), `docs/db_changes/` + `docs/db_rebuild/`, file-handling plan/gap/investigation trio, overlay OVERHAUL/ROADMAP pair; aidream `.agent/` (11), `docs/tasks-from-outside/`, completed `docs/handoffs/*` (run /handoff-cleanup first), tool-migration saga docs, socket/socketio pair, phase/lessons-learned docs whose campaigns shipped. Rule: an archived doc gets one `> ARCHIVED <date> — superseded by <pointer>` line at top.

## Wave 3 — Cluster arbitrations (each needs Arman's one-word ruling: who wins)

| # | Cluster | Claimants | Proposed winner |
|---|---|---|---|
| 1 | Tool system (~17 docs) | `docs/official/tool_system_rules.md` vs `docs/cx_chat/TOOL_*` (7) vs `matrx-ai/tools/docs/*` (7) vs 3 per-consumer migration guides | `docs/official/tool_system_rules.md` absorbs; rest archive |
| 2 | Request system | `api/REQUEST_SYSTEM_OVERHAUL.md` vs `docs/runtime/REQUEST_MANAGEMENT_LAYER.md` vs handoff | `docs/runtime/REQUEST_MANAGEMENT_LAYER.md` |
| 3 | Agent system truth | `docs/agents_service/00_truth.md` ("Official Truth") vs `services/agent_service/FEATURE.md` | FEATURE.md; 00-04 marked historical |
| 4 | Scope/context sprawl | `features/scopes/FEATURE.md` (in-progress canonical) vs `scope-system/*` vs `agent-context/` vs `docs/ctx/*` vs aidream `docs/ctx_context/*` + `docs/knowledge/scope-*` | common-docs/scope-context-system (model) + features/scopes (FE impl); rest pointered/archived |
| 5 | CMS truth | `docs/cms_agent_authoring/README.md` ("MASTER") vs `matrx_cms/FEATURE.md` vs FE `features/cms/FEATURE.md` vs common-docs/cms-system | common-docs/cms-system arbitrates |
| 6 | Web schema | FE `docs/WEB_SCHEMA_CANONICAL_REFERENCE.md` + `_REVIEW.md` vs common-docs/db-rules reference model | db-rules; FE docs archive |
| 7 | Chat standards | FE root `agent-chat-standards.md` ("Single Source of Truth") vs `features/agents/components/chat/FEATURE.md` | chat FEATURE.md |
| 8 | Secrets (4 claimants) | matrx-orm `secrets_battery` vs services `organization_secrets`/`user_secrets`/`secret_refs` FEATURE.mds | needs Arman — unclear |
| 9 | Cloud files | `docs/cld_files/*` (14) vs matrx-files package + common-docs/matrx-files-service | package + common-docs; cld_files archive |
| 10 | Scraper | `docs/scraper/*` vs matrx-scraper package vs `.arman` scraper notes | package; .arman notes stay VISION |
| 11 | Workflow (3 homes) | `docs/workflow/*` (20) vs matrx-graph docs vs 7 skills | keep hub README + skills; specs consolidate under matrx-graph |
| 12 | Package doctrine | `docs/packages/` trio vs per-package INDEPENDENCE.md vs matrx-package-template | matrx-package-template |
| 13 | Testing standards | `.arman/rules/python_testing_guidelines.md` vs `common/code_standards/docs/TESTING_GUIDELINES.md` | needs Arman (one is his) |
| 14 | Context engine spec | matrx-ai `ai_matrx_context_engine_complete.md` vs `_v2.md` | needs Arman |
| 15 | DB canon satellite | aidream `db/canonical_db.md` (named "canonical") | demote to pointer at common-docs/db-rules |

## Wave 4 — Skills consolidation

- Kill/merge overlap clusters: Next.js/SSR (5 surfaces → 1 + pointers), `surface-authoring`↔`surface-registration` (merge), `message-actions-overlay-system` (fold into `overlay-system`), `ui-dense`↔`data-dense-panels`, `modern-web-design-expert`↔`ui-sharp`, `notes-actions` boundary note.
- Retire or explicitly mark the two legacy `.cursor/skills` systems (10 aidream + 1 ai-matrx) + audit 11 `.cursor/rules/*.mdc` against current conventions.
- Create the missing `task-hygiene` skill (CLAUDE.md references it; no directory exists) or remove the reference.
- FIXED 2026-07-22: `canonical-associations` (told agents to KEEP retired `check_resource_access`), `db-canonicalize-table` (prescribed a blanket lowest-tier visibility default; now forces the db-rules §6a decision).

## Wave 5 — Prevention (so the jungle doesn't regrow)

- Root-level .md ban outside a sanctioned list (advisory check).
- "Confident title" rule: no doc may claim SOURCE OF TRUTH/CANONICAL/OFFICIAL in title or body unless listed in the repo CLAUDE.md's canonical set (advisory check greps for the phrases).
- HISTORY docs get archived in the same PR that completes their campaign (add to `finalize-and-ship` skill).
- The proposed access-guard check (visibility defaults, active-org reads, hand-rolled ladders) — still awaiting Arman's go.

## Status

- [x] Full inventory (4 agents, 2026-07-22)
- [x] Skill stale-fixes (canonical-associations, db-canonicalize-table)
- [ ] Arman sign-off on Wave 1 kill list
- [ ] Waves 1-2 execution
- [ ] Wave 3 rulings (8 proposed winners + 3 needs-Arman)
- [ ] Waves 4-5
