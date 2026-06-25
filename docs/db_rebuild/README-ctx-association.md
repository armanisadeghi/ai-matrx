# DB Rebuild — Document Index, Live State & Standards Reconciliation (read first)

**Live DB state (applied to prod, PITR on):** unified relationships in **`platform.associations`** (coexisting with old FKs/M2M; 33 mirror triggers auto-sync project/task writes). War-room/thread relationships consolidated in. **Canonical RLS system live** (`iam.apply_rls` + helpers; `entity`/`join`/`ledger` variants) — `history.row_versions` secured (org-read-only), `associations` standardized, `entity_types`/`_base_entity` locked. **New tables:** `platform.categories` (dimension-faceted taxonomy, system + org) and `platform.user_entity_state` (per-user favorites/pins/recency). `cld_files` is the canonical file table; `user_files` dropped. Six schemas live: `iam, knowledge, work, platform, history, internal`. `entity_types` registry is the keystone for all polymorphic tokens.

**Implementation approach:** coexistence + mirror triggers (old → new), NOT the earlier `public.ctx_associations` + compat-view-rename plan. Where older docs say `ctx_associations`, read `platform.associations`.

---

## ✅ SHARE WITH THE TEAM — current & authoritative
1. **`db-handover-notes.md`** — FE/BE contract + what's live. Primary doc.
2. **`db-first-cut-execution-plan.md`** — the movements + accurate "what's live" log.
3. **`db-core-standards-and-automation.md`** — base cols, RLS, versioning, triggers/cron. **The canonical standard** (implemented version of the base-standards draft).
4. **`db-rls-safety-fields-categorization.md`** — canonical RLS system, destructive-push safety, common fields, categorization.
5. **`ctx-association-architecture.md`** — model & decisions (bible). Read `ctx_associations` as `platform.associations`.
6. **`warroom-thread-integration-and-standards.md`** — war-room/thread spec, file standard, anchor decision, layered-fetch + RPC design.

## 🟡 USEFUL — context (share if helpful)
7. **`db-base-standards-review-and-integration.md`** — reconciliation of the base-standards draft vs the build (answers "does it still stand").
8. **`db-staging-and-cutover-plan.md`** — staging + destructive-wave cutover order.

## 📜 YOUR SOURCE DOC
- **"Database Base Standards & Architecture Decisions"** (your draft) — the founding north star. Still governs; `db-core-standards-and-automation.md` is its current implemented form. See reconciliation below.

## ⚠️ HISTORICAL — DO NOT BUILD FROM (bannered; trail only)
`ctx-association-migration-phase1.sql`, `…-phase2-drops.sql`, `ctx-association-post-migration-plan.md`, `ctx-supabase-internals-audit-brief.md`, `ctx-association-migration-analysis-brief.md`, `ctx-association-removed-fk-ledger.md`

---

## Base-Standards Reconciliation — what changed vs your draft (it still stands; these are the deltas)
- **`entity_types` registry ADDED** — the keystone for polymorphic tokens (associations, history discriminator, file/category types). Not in the original draft; now central. Fold into the standard.
- **History table:** discriminator is **`entity_type`** (a registry token), not `table_name`. PK is **composite `(id, occurred_at)`** — a partitioned table *must* include the partition key in its PK, so the draft's `id bigint … PRIMARY KEY` DDL would fail as written. Built form is correct.
- **Associations:** **`platform.associations`** (platform schema, coexistence), not `public.ctx_associations` + compat-view rename.
- **`iam.has_org_access`** reads **`public.organization_members`** (the real table), not `iam.memberships`. Membership stays in public for now.
- **`version`:** anchor-now, **optimistic-lock-later** (don't conflate the two roles yet).
- **`metadata`:** universal on every base, with a **strict usage rule** (display/provenance only — never queryable state), not a free escape hatch.
- **Schema map:** matches exactly (iam/knowledge/work/platform/history/internal — all created).

## Still-to-build from the base-standards draft (carried forward, not yet done)
Embedding sidecar (§4), generic `iam.invitations` (§6), traits (`_trait_nameable/searchable/ownable`) as needed, base-column retrofit + per-table `apply_rls`/version-capture rollout on existing tables, UUIDv7 (deferred — stay on `gen_random_uuid()`).

## Two contracts the team must never get wrong
- **Relationships → `platform.associations`** (read/write). Not scattered FKs, not old M2M. Mirror triggers keep old→new synced during transition.
- **Files → `cld_files` id, never a path.** External URLs and CDN assets go in separate, clearly-named columns checked against our own domains.
