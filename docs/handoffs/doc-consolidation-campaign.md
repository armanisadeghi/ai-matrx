# Handoff — Documentation Consolidation Campaign (Single Source of Truth)

**Owner:** the common-docs structure session (took over 2026-07-22; integrating with the docs-architecture redesign). Originated by the access-campaign session. **Created 2026-07-22** from a four-agent full inventory: ai-matrx (794 docs), aidream (774 docs), matrx-common-docs (~30 docs, healthy), skills (68 ai-matrx + 24 aidream + 29 legacy Cursor-era). Raw tables: ai-matrx sortable artifact at https://claude.ai/code/artifact/68e68a6b-882f-4c1e-a621-cbfff074f8b6 ; aidream per-file table (774 rows: path | mtime | title) at [`doc-inventory-aidream-full-table.txt`](doc-inventory-aidream-full-table.txt) beside this doc. NOT covered by the inventory: matrx-extend, matrx-local, my-matrx, matrx-ship, matrx-sandbox, matrx-package-template.

**Goal:** one source of truth per system; everything else is a pointer, an archive, or deleted. Arman signs off on every deletion wave.

**Classification scheme** (identical across all four inventory agents): **SOR** (claims canonical status) · **FEATURE** (living doc beside code — one per feature/service/package is the intended pattern, not duplication) · **GUIDE** (how-to/reference) · **HISTORY** (finished work: handoffs, migration sagas, investigations — archival candidates) · **VISION** (Arman-authored aspirational — never junk; gap-analysis input only) · **JUNK** (superseded, self-declared dead, or exact duplicate; every JUNK verdict names its superseder). Caveat: the ai-matrx pass was largely path/title-heuristic with spot-checks (aidream got deeper per-file reads) — treat classes as a strong first pass and verify before deleting anything not self-declared dead.

## The verdict in one paragraph

The common-docs layer is sound (pointer contract verified intact across all repos — zero competing copies). The rot is one layer down: ~480 HISTORY-class docs (finished handoffs, migration sagas, investigations) sitting in live paths where agents read them as current, ~30 genuine duplicate clusters, a dozen self-declared-superseded files still in place, and two parallel legacy Cursor skill systems never retired. The single worst cluster: the **tool system** (~17 docs across 4 directories all claiming authority). The most dangerous pattern: **confidently-named stale docs** ("Official Truth", "CANONICAL_REFERENCE", "Final Architecture") that lost their authority to newer docs but kept their titles.

## Wave 1 — Mechanical kills (no judgment needed; Arman approves the list, an agent executes)

- Self-declared junk/superseded: `.arman/junk/*` (3), `docs/database/HANDWRITTEN_SQL_INVENTORY.md`, `docs/packages/ORM_RAWSQL_ERADICATION.md`, `docs/scraper/SCRAPER_CONSOLIDATION_PLAN.md` (merged into master), `.pytest_cache/README.md` ×3 (gitignore), `common/utils/code_from_markdown/*` (3 scratch), common-docs `AGENTS.md` (correction 2026-07-22: it is a *symlink* to the workspace-root `../CLAUDE.md`, not a frozen copy — still remove it, because the symlink dangles in clones/cloud sandboxes; verified nothing references it).
- Exact duplicate tree: `aidream/utils/code_context/**` (8 files byte-identical to `packages/matrx-utils/matrx_utils/code_context/**`) — delete after confirming the whole root `utils/` tree is dead post-package-extraction.
- ai-matrx root strays: `TEMP-CLEANUP.md`, duplicate `.cursor/plans/agents_route_implementation_*.plan.md` (verbatim copy of `app/(core)/agents/docs/plan.md`).
- common-docs lint fixes: frontmatter on `media-capture/FEATURE.md` + `access-architecture/DECISION_BRIEFS.md`, index the former, fix the malformed index bullet.

## Wave 2 — Archive sweep (move, don't delete: `docs/archive/<year>/` per repo)

All HISTORY-class: ai-matrx `docs/type-drift/` (34), `docs/SWEEP_*` + `docs/IMPACT_INVENTORY_*` (11), `docs/db_changes/` + `docs/db_rebuild/`, file-handling plan/gap/investigation trio, overlay OVERHAUL/ROADMAP pair; aidream `.agent/` (11), `docs/tasks-from-outside/`, completed `docs/handoffs/*` (run /handoff-cleanup first), tool-migration saga docs, socket/socketio pair, phase/lessons-learned docs whose campaigns shipped; ai-matrx **handoff strays living outside `docs/handoffs/`** (8+: `features/podcasts/docs/HANDOFF_2026-06-12.md`, `features/rag/docs/SEARCH_SYSTEM_HANDOFF.md`, `features/research/docs/MEDIA_GALLERY_HANDOFF.md`, `docs/tool_visualization_handoff.md`, `docs/structured-lists-rename-handoff.md`, `docs/HANDOFF-matrx-actions-prompt-preview-windowpanel.md`, `docs/dedup_phase_2_0_frontend_handoff.md`, `docs/tasks/MATRX_FRONTEND_HANDOFF.md`) — completed ones archive, live ones move into the governed system. Rule: an archived doc gets one `> ARCHIVED <date> — superseded by <pointer>` line at top.

## Wave 3 — Cluster arbitrations (each needs Arman's one-word ruling: who wins)

| # | Cluster | Claimants | Proposed winner |
|---|---|---|---|
| 1 | Tool system (~17 docs) | `docs/official/tool_system_rules.md` vs `docs/cx_chat/TOOL_*` (7) vs `matrx-ai/tools/docs/*` (7) vs 3 per-consumer migration guides | `docs/official/tool_system_rules.md` absorbs; rest archive |
| 2 | Request system | `api/REQUEST_SYSTEM_OVERHAUL.md` vs `docs/runtime/REQUEST_MANAGEMENT_LAYER.md` vs handoff | `docs/runtime/REQUEST_MANAGEMENT_LAYER.md` |
| 3 | Agent system truth | `docs/agents_service/00_truth.md` ("Official Truth") vs `services/agent_service/FEATURE.md` | FEATURE.md; 00-04 marked historical |
| 4 | Scope/context sprawl | `features/scopes/FEATURE.md` (in-progress canonical) vs `scope-system/*` vs `agent-context/` vs `docs/ctx/*` vs aidream `docs/ctx_context/*` + `docs/knowledge/scope-*` | common-docs/systems/scope-context-system (model) + features/scopes (FE impl); rest pointered/archived |
| 5 | CMS truth | `docs/cms_agent_authoring/README.md` ("MASTER") vs `matrx_cms/FEATURE.md` vs FE `features/cms/FEATURE.md` vs common-docs/systems/cms-system | common-docs/systems/cms-system arbitrates |
| 6 | Web schema | FE `docs/WEB_SCHEMA_CANONICAL_REFERENCE.md` + `_REVIEW.md` vs common-docs/systems/db-rules reference model | db-rules; FE docs archive |
| 7 | Chat standards | FE root `agent-chat-standards.md` ("Single Source of Truth") vs `features/agents/components/chat/FEATURE.md` | chat FEATURE.md |
| 8 | Secrets (4 claimants) | matrx-orm `secrets_battery` vs services `organization_secrets`/`user_secrets`/`secret_refs` FEATURE.mds | needs Arman — unclear |
| 9 | Cloud files | `docs/cld_files/*` (14) vs matrx-files package + common-docs/systems/matrx-files-service | package + common-docs; cld_files archive |
| 10 | Scraper | `docs/scraper/*` vs matrx-scraper package vs `.arman` scraper notes | package; .arman notes stay VISION |
| 11 | Workflow (3 homes) | `docs/workflow/*` (20) vs matrx-graph docs vs 7 skills | keep hub README + skills; specs consolidate under matrx-graph |
| 12 | Package doctrine | `docs/packages/` trio vs per-package INDEPENDENCE.md vs matrx-package-template | matrx-package-template |
| 13 | Testing standards | `.arman/rules/python_testing_guidelines.md` vs `common/code_standards/docs/TESTING_GUIDELINES.md` | needs Arman (one is his) |
| 14 | Context engine spec | matrx-ai `ai_matrx_context_engine_complete.md` vs `_v2.md` | needs Arman |
| 15 | DB canon satellite | aidream `db/canonical_db.md` (named "canonical") | demote to pointer at common-docs/systems/db-rules |
| 16 | Versioning rules (added on takeover review) | FE `docs/official/VERSIONING_RULES.md` (full 73-line canon, NOT a stub) vs `features/agents/docs/AGENT_VERSIONING.md` vs the three common-docs versioning docs | common-docs versioning set; FE doc becomes a stub, AGENT_VERSIONING merges or points |

## Wave 4 — Skills consolidation

- Kill/merge overlap clusters: Next.js/SSR (5 surfaces → 1 + pointers), `surface-authoring`↔`surface-registration` (merge), `message-actions-overlay-system` (fold into `overlay-system`), `ui-dense`↔`data-dense-panels`, `modern-web-design-expert`↔`ui-sharp`, `notes-actions` boundary note.
- Retire or explicitly mark the two legacy `.cursor/skills` systems (10 aidream + 1 ai-matrx) + audit 11 `.cursor/rules/*.mdc` against current conventions.
- Create the missing `task-hygiene` skill (CLAUDE.md references it; no directory exists) or remove the reference.
- Groom the `ctx_scope_assignments` contradiction: the skills inventory found it named in 33 live ai-matrx files, but the access campaign established the table is dead (zero DB functions reference it; FE services cut over 2026-06). Likely stale type/comment references; the context-assignment skill description still names the table.
- FIXED 2026-07-22: `canonical-associations` (told agents to KEEP retired `check_resource_access`), `db-canonicalize-table` (prescribed a blanket lowest-tier visibility default; now forces the db-rules §6a decision).

## Wave 5 — Prevention (so the jungle doesn't regrow)

- Root-level .md ban outside a sanctioned list (advisory check).
- "Confident title" rule: no doc may claim SOURCE OF TRUTH/CANONICAL/OFFICIAL in title or body unless listed in the repo CLAUDE.md's canonical set (advisory check greps for the phrases).
- HISTORY docs get archived in the same PR that completes their campaign (add to `finalize-and-ship` skill).
- **Pointer-path standardization** (added on takeover review): stubs and CLAUDE.md lines hardcode three spellings of the common-docs path (`/Users/armanisadeghi/code/common-docs/`, `/Volumes/Samsung2TB/code/common-docs/`, `.../matrx-common-docs/`). All resolve on this machine via symlinks, but cloud/sandbox sessions get silent dead pointers. Pick one canonical form, rewrite all pointers, and lint for the others.
- Guard implementation intent: confident-title check = advisory script in the `pnpm check:*` family grepping tracked .md for /source of truth|canonical|official truth|SSOT/i in title/first 10 lines against a per-repo allowlist (additions only via PR); root-.md ban = fail on tracked root *.md outside a sanctioned list (ai-matrx: CLAUDE.md, PRINCIPLES.md, TYPESCRIPT_STANDARDS.md, FOUND_DEFECTS.md, CURRENT_ERRORS.md, README.md; aidream analog).
- The access-guard check (visibility defaults, active-org reads, hand-rolled ladders, `using (true)` SELECT policies) is owned by the security session, not this campaign — still awaiting Arman's go; coordinate so both land in the same check family without collision.

## Open items from the takeover review (verify before acting)

- **Deliberate non-clusters (leave alone):** aidream `internal_agents/` (38 files — agent *definitions*, not knowledge docs); ~90 auto-generated `MODULE_README.md` files (regenerated by the `code_context` tool — never hand-edit; note the generator itself is the duplicated `utils/code_context` tree in Wave 1); ai-matrx `.agents/` and `.arman` non-pending notes (owner territory, unaudited); FEATURE.md+skill pairs (e.g. tts-audio-system skill + `features/audio/FEATURE.md`) are legitimate pairings, not duplicates.
- **Unsure classifications — read before touching:** aidream `db/schema_analysis/{activity,current_schema}.md` (may be consumed by the schema-drift orchestrator); aidream `docs/knowledge/` vs `docs/rag_and_ner/` (proposed merge, but knowledge/ may be partly Arman-vision — check authorship); ai-matrx root `ITEM-REGISTRY.md` / `CORE_TASKS.md` / `ARMAN_SMS_TASKS.md` (flagged as parallel task tracking but may be Arman's own — ask, don't kill).
- **Skill fixes already done (don't re-litigate):** ai-matrx commit `a9ad0130f` — `canonical-associations` (removed retired `check_resource_access` from KEEP list; now names the `has_access`/`has_access_for` kernel) and `db-canonicalize-table` (removed the blanket `default 'private'`; now a `<TIER>` placeholder with the db-rules §6a decision rule inline).

## Status

- [x] Full inventory (4 agents, 2026-07-22)
- [x] Skill stale-fixes (canonical-associations, db-canonicalize-table)
- [x] Arman sign-off on Wave 1 (2026-07-22, this chat)
- [x] Wave 1 executed (2026-07-22): aidream `d46106df7`, ai-matrx `cee3e5494`, common-docs `84160a8`. Two deviations: `utils/code_context` NOT deleted (inventory wrong — files differ from package copy AND live imports exist, e.g. `aidream/graph_actions/admin/dev.py`; needs real dedup); `.arman/junk` deferred (Arman: `.arman`/`.matrx` are not the problem — stay out for now).
- [x] Core structure created (2026-07-22): common-docs restructured by lifecycle (`systems/` `projects/` `policies/` `meta/`), new `policies/document-types.md` taxonomy + authority ladder, all ~65 cross-repo pointer paths rewritten (aidream `e263b9b2a`, ai-matrx `e4b1288e9`).
- [ ] Wave 2 (archive sweep) — next; start with the in-your-face targets (loose `docs/` root files, repo-root strays), per Arman's priority
- [x] Cluster 13 RESOLVED (2026-07-22): not a real conflict — `common/code_standards/docs/TESTING_GUIDELINES.md` was a pasted LLM chat response about a hypothetical app-test-suite (deleted); `.arman/rules/python_testing_guidelines.md` is Arman's personal "trail tests" doc (manual, not automated standards) — stays as VISION-class, untouched. Automated-testing standards doc: does not exist yet.
- [x] Cluster 14 RESOLVED (2026-07-22): `_v2.md` wins (it opens by declaring v1's tables `ai_runs`/`ai_tasks`/`broker_values` dead); `ai_matrx_context_engine_complete.md` got an ARCHIVED banner pointing at v2.
- [x] Root task files folded (2026-07-22, Arman-approved): `CORE_TASKS.md` deleted (empty stub), `ARMAN_SMS_TASKS.md` → `.matrx/arman-sms-setup.md` (+ Active entry in `.matrx/ARMAN_TASKS.md`), `ITEM-REGISTRY.md` → `docs/ITEM-REGISTRY.md` (reference map, subordinate to CLAUDE.md).
- [ ] Wave 3 rulings (12 proposed winners remain; secrets cluster reassigned to the security session)
- [ ] Waves 4-5
