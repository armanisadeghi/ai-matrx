# DB Rebuild — Document Index & Status (read this first)

**Live state right now (applied to prod, all additive):** the unified relationship table is **`platform.associations`** (in the `platform` schema), coexisting with the old FK columns and M2M tables — nothing renamed or dropped except the empty `user_files`. Project/task FK writes auto-sync into it via 33 mirror triggers. War-room/thread relationships are consolidated into it. `history.row_versions` + shared triggers + `entity_types` registry + the six schemas are in place. Canonical file table is **`cld_files`** (`file`→`cld_files`).

**Implementation approach actually used:** coexistence + mirror triggers (old → new), NOT the earlier `public.ctx_associations` + compat-view-rename plan. Where older docs say `ctx_associations`, read `platform.associations`.

---

## ✅ SHARE WITH THE TEAM — current & authoritative
1. **`db-handover-notes.md`** — the FE/BE contract + exactly what's live. The team's primary doc.
2. **`db-first-cut-execution-plan.md`** — the three movements and the accurate "what's live" record (incl. the update log).
3. **`db-core-standards-and-automation.md`** — base columns, RLS, versioning/history, triggers/cron. The standard to build to.
4. **`ctx-association-architecture.md`** — the model & decisions (bible). Current in substance; read `ctx_associations` as `platform.associations` (banner at top).
5. **`warroom-thread-integration-and-standards.md`** — war-room/thread spec, file standard, layered-fetch RPC design.

## 🟡 USEFUL — context, light caveats (share if helpful)
6. **`db-base-standards-review-and-integration.md`** — rationale for the standards.
7. **`db-staging-and-cutover-plan.md`** — staging approach; applies to the **destructive** waves still to come.

## ⚠️ HISTORICAL — DO NOT BUILD FROM (bannered superseded; keep for trail only)
8. `ctx-association-migration-phase1.sql` — old rename/compat-view plan; would create a conflicting duplicate if run.
9. `ctx-association-migration-phase2-drops.sql` — old drop plan; the cleanup concept survives but names/approach are stale.
10. `ctx-association-post-migration-plan.md` — old runbook (superseded by #2).
11. `ctx-supabase-internals-audit-brief.md` — audit concept still valid; naming/approach stale.
12. `ctx-association-migration-analysis-brief.md` — early IDE-agent inventory brief; stale naming.
13. `ctx-association-removed-fk-ledger.md` — pre-dates user_files drop, mirror triggers, war-room work.

---

## Two contracts the team must never get wrong
- **Relationships → `platform.associations`** (read/write). Not scattered FKs, not old M2M tables. Mirror triggers keep old→new in sync during transition.
- **Files → `cld_files` id, never a path.** External URLs and CDN assets go in separate, clearly-named columns checked against our own domains.

## Still-open decisions (none block sharing)
`war_room` vs `room` token · reference cardinality + required-slot enforcement · history retention/opt-outs · `entity_types` FK enforcement · the 15 null-`org_id` legacy task edges + text-typed litter FKs (handled per-table).
