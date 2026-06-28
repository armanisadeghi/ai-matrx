# DB Changeover — Live Progress Tracker

> **The single source of truth for the rebuild's execution.** Updated continuously by the lead **and** delegated subagents. Goal: carry **every** table to *done* — additive retrofit → org-first RLS → litter cleanup → schema reorg — however long it takes (a day or a month). A table is *done* only when it meets the standard, is **verified live**, and is recorded here **and** in `public._schema_migrations`.
>
> **Process + per-table recipe:** the **`db-table-retrofit` skill** (`.claude/skills/db-table-retrofit/`). **Standard:** `db-core-standards-and-automation.md`. **RLS:** `db-canonical-rls.md` (+ sweep `db-canonical-rls-sweep-todo.md`). **Cutover safety:** `db-staging-and-cutover-plan.md`. **Live docs index:** `README.md` → `official/` + `CUTOVER_HANDOFF.md`.

**Last updated:** 2026-06-28 (sms ×5, dm_conversation_participants, user_email_preferences, user_preferences, user_feedback, agent_user_kv, app_settings, window_sessions — 12 tables; reg schema: kg_* ×6 + scope_*_suggestions ×3 + context_item_suggestions + ner_canonicalizer_shadow — 11 tables) · **DB:** `txzxabzwovsujtloxrus` (Matrx Main) · **Scope:** 434 public base tables.

---

## Dashboard

| Metric | Count / 434 |
|---|---|
| **Retrofitted** (standard base cols + `_stamp_actor`) | **107** (cx ×10, rs ×10, udt ×7, skl ×5, agx ×4, prompt ×5, studio ×4, note ×5, canvas ×7, flashcard ×5, aga ×1, ctx-wr ×2, app/content/ui-components ×9, kg ×5, scope ×3, ui-surface ×2, dict ×1, context_item_suggestions ×1, ner_shadow ×1, quiz_sessions ×1, dashboard_saved_views ×1, shortcut_categories ×1, user_achievements ×1, user_stats ×1, heatmap_saves ×1, microservice_project ×1, industry_curators ×1, sms ×5, dm_conversation_participants ×1, user_email_preferences ×1, user_preferences ×1, user_feedback ×1, agent_user_kv ×1, app_settings ×1, window_sessions ×1) — 105 also have `_touch_row` (skl_definitions: varchar-semver `version`; user_preferences + agent_user_kv: no uuid id, `_stamp_actor`+own updated_at trigger only, see #10) |
| Org-first RLS applied (`std_*` policies) | 0 |
| Litter columns (`project_id`/`task_id`) dropped | 0 |
| Drop-consumer repoints done | 1 (conversation favorites) |
| Registered in `platform.entity_types` | 68 |

**Wave status:** 0 Entity registry ✅ · 1 Scaffolding/RLS engine ✅ · 2 Associations + categories + user_entity_state ✅ · **3 Base retrofit — 87 tables done, continuing** (see [compat-view-drop-repoint-list.md](./compat-view-drop-repoint-list.md)) · **4 Renames — file→cld + ctx_war_room→wr ✅** · 5 Org-first RLS + litter drops ⏳ (PITR-gated)

---

## `scheduler` schema — scheduling tables (2026-06-27) ✅ MOVED + CANONICALIZED

Schema `scheduler` already existed. Moved 4 `sch_*` tables and applied full canonicalization. Migrations: `scheduler_tables_prep.sql` + `scheduler_tables_schema_move.sql` + `scheduler_tables_rls_and_registry.sql` (applied + verified live, ledgered).

**Hierarchy:** `sch_task` (root entity) → `sch_trigger` (component, task_id FK) + `sch_run` (component, task_id FK, 12k rows) + `sch_agent_task` (1:1 subtype, PK=FK). Business triggers kept intact (`sch_task_validate_tag_lengths`, `sch_task_wake_trigger`, `sch_trigger_cascade_next_due_at`, `stamp_run_org`, `emit_run_lifecycle`).

| Table | Token | Variant | Notes |
|---|---|---|---|
| scheduler.sch_task | sch_task | entity | retrofit_entity; +visibility/metadata; legacy sch_task_updated_at→_touch_row |
| scheduler.sch_trigger | sch_trigger | component→sch_task | +org/created_by/version/metadata/deleted_at; legacy sch_trigger_updated_at→_touch_row |
| scheduler.sch_run | sch_run | component→sch_task | +created_by/updated_at/metadata; 12,345 rows preserved; stamp_run_org kept |
| scheduler.sch_agent_task | sch_agent_task | component→sch_task | 1:1 subtype (PK=FK); no base cols needed for component RLS |

**Status:** All 4 → zero FAIL. `legacy_owner_col` WARN on `sch_task` (permanent). `sharing_token SKIP` on all (correct — not user-shareable). `scheduler` schema not PostgREST-exposed; aidream accesses via service_role.

---

## `reg` schema — KG/suggestion pipeline tables (2026-06-27) ✅ MOVED + CANONICALIZED

New domain schema **`reg`** created for knowledge-graph sweep, NER, and scope/context suggestion pipeline tables. **11 tables moved, all verified zero-FAIL.** Migrations: `reg_tables_prep.sql` + `reg_tables_schema_move.sql` + `reg_tables_rls_and_registry.sql` + `reg_tables_fix_fails.sql` (applied + verified live, ledgered).

**Pre-move prep:** Added `id uuid` to `kg_suggestion_ack` (had composite PK only), added `visibility` column to all 10 entity tables, backfilled `created_by` from `user_id`, dropped legacy `set_updated_at` double-fire triggers, dropped non-canonical `trg_kg_sweep_state_touch`. Fixed `kg_sweep_queue` missing `created_at` (was using `enqueued_at`), fixed `shareable_resource_registry` token mismatch (plural→singular) for two tables.

| Table | Token | Variant | Notes |
|---|---|---|---|
| reg.kg_alerts | kg_alert | entity | +visibility; legacy user_id WARN (permanent til drop) |
| reg.kg_suggestion_ack | kg_suggestion_ack | entity | Added id uuid; composite PK (user_id,suggestion_id) retained |
| reg.kg_value_matches | kg_value_match | entity | +visibility |
| reg.ner_canonicalizer_shadow | ner_shadow | entity | +visibility |
| reg.kg_sweep_queue | kg_sweep_queue | entity | +created_at (was using enqueued_at); +visibility |
| reg.kg_sweep_run | kg_sweep_run | entity | +visibility; stamp_run_org + emit_run_lifecycle triggers kept |
| reg.kg_sweep_state | kg_sweep_state | ledger | Registered in entity_types (was missing); ledger variant (no created_by/user writes) |
| reg.scope_suggestions | scope_suggestion | entity | +visibility |
| reg.scope_association_suggestions | scope_association_suggestion | entity | +visibility; registry token fixed (plural→singular) |
| reg.scope_item_value_suggestions | scope_item_value_suggestion | entity | +visibility; registry token fixed (plural→singular) |
| reg.context_item_suggestions | context_item_suggestion | entity | +visibility |

**Status:** All 11 → `verify_canonical_ok=true`. Only permanent WARNs: `legacy_owner_col` (user_id present, drops after soak). `sharing_token SKIP` on KG infra tables (not user-shareable — correct). `reg` schema **not yet PostgREST-exposed** — aidream backend accesses via service_role (no supabase-js direct reads from FE for these tables). PostgREST exposure needed only if FE adds direct reads.

---

## `communication` schema reorg — messaging tables (2026-06-28)

New domain schema **`communication`** created for messaging tables (sms_*, dm_*, emails). **Two-phase** because the FE reads several of these directly via supabase-js + `postgres_changes` realtime, so the SET SCHEMA move is gated on PostgREST exposing `communication` (dashboard/mgmt-API; not MCP-reachable).

**Phase 1 — canonicalize IN PLACE in public ✅ (applied + verified live, ledgered):** `migrations/communication_schema.sql` + `migrations/communication_canonicalize_phase1.sql`.

| Table | Token | Variant | Notes |
|---|---|---|---|
| dm_conversations | dm_conversation | entity | +org(personal)/visibility/version/metadata/deleted_at; `trg_default_org` fills org for FE inserts |
| dm_messages | dm_message | component | parent dm_conversation(conversation_id); created_by←sender_id |
| dm_conversation_participants | dm_participant | component | switched entity→component; legacy `set_updated_at` dropped |
| sms_conversations | sms_conversation | entity | +visibility |
| sms_messages | sms_message | component | parent sms_conversation(conversation_id); legacy updated-at trigger→trio; business triggers kept |
| sms_media | sms_message_media | component | parent sms_message(message_id) |
| sms_consent / sms_phone_numbers / sms_notification_preferences / sms_notifications | (existing) | entity | +visibility; notifications got updated_at/version/touch trigger |
| sms_rate_limits / sms_webhook_logs / emails | — | infra/log | service-role/form RLS; not base entities |

- **Multi-party DM access preserved:** 13 active participants mirrored into `public.permissions` (resource_type=`dm_conversation`, editor). Self-maintaining via trigger **`dm_participant_sync_grant`** (add/leave participant ⇄ grant) so canonical `has_access` resolves for any surface. `dm_conversation` registered in `shareable_resource_registry`. Verified live: non-creator participant → can_view+can_send=true, sees all messages.
- All 10 entity/component tables: `verify_canonical_ok = true` (only the permanent `legacy_owner_col` WARN on tables still carrying `user_id`). Phase 1 is **non-breaking** — tables remain in `public`, columns additive, RLS canonical; system can return to service on Phase 1.

**Phase 2 — SET SCHEMA move ✅ DONE (applied + verified live, ledgered):** `migrations/communication_move_phase2.sql`. `communication` exposed to PostgREST; all 13 tables moved (counts unchanged pre/post — emails 10, dm_conversations 7, dm_messages 183, participants 13, sms_* all matched; old names error = clean cut; policies/triggers/realtime publication followed). Registry `schema_name` updated. Repointed 5 functions (`get_ssr_shell_data`, `get_ssr_agent_shell_data`, `get_user_dashboard_metrics`, `sms_handle_opt_out_keywords`, `sms_update_conversation_on_message`) — also fixed pre-existing `public.user_preferences`→`users.user_preferences` drift in the two SSR fns. `--schema communication` added to `pnpm db-types`. **FE:** 100 `.from()` callsites → `.schema('communication').from()` + 7 realtime `postgres_changes` schema filters, across ~20 files (single-line per the dead-relations guard); `scripts/dead-relations.json` + `platform.deprecated_relations` registered (guard clean for communication). **aidream:** already pre-aligned — `db/models/communication.py` carries the canonical columns + `_db_schema='communication'`, models load clean; no changes needed. (`dm_default_org`/`dm_participant_sync_grant` touch only stable `public` tables — no repoint.)

---

## `extend` schema — Chrome-extension tables (2026-06-27) ✅ MOVED

Moved the 8 matrx-extend (Chrome extension) tables out of `public` into the pre-planned **`extend`**
schema and canonicalized them. **A single clean cut, no shim. Zero data loss — verified live:** counts
(capture 28 · seo 20 · highlight 14 · recipe 12 · screenshot 11 · pattern 8 · guidance/auth_codes 0)
unchanged across the move, and **0 null `created_by`** after the `user_id` drop (owner preserved — `created_by`
was already backfilled). (The initial "empty" read trusted stale `pg_stat_user_tables` stats.)
Migrations: `migrations/canonicalize_wbx_entities_pre_move.sql` + `migrations/move_extension_tables_to_extend_schema.sql` (applied + verified live, ledgered). Proposal: [proposals/extend-schema-cutover.md](./proposals/extend-schema-cutover.md).

| Table | Token | Variant | Notes |
|---|---|---|---|
| extend.wbx_capture | wbx_capture | entity | `apply_rls` entity; +visibility; user_id→created_by; `verify_canonical_ok=true`, zero FAIL/WARN |
| extend.wbx_seo_audit | wbx_seo_audit | entity | same |
| extend.wbx_screenshot | wbx_screenshot | entity | same |
| extend.wbx_pattern | wbx_pattern | entity | same; UNIQUE→`(created_by,domain,name)` |
| extend.wbx_highlight | wbx_highlight | entity (owner RLS) | +visibility/created_by; **keeps `is_deleted`** (app soft-delete); owner-by-created_by RLS |
| extend.wbx_guidance | wbx_guidance | entity (owner RLS) | +visibility/created_by; **keeps `is_deleted`** (cross-machine **tombstone** must stay readable — canonical `deleted_at` RLS would break guidance sync); owner-by-created_by RLS |
| extend.wbx_recipe | — | reference | global read-all catalog (no owner); move only |
| extend.extension_auth_codes | — | auth plumbing | ephemeral OAuth handshake; keeps `user_id` owner RLS; move only |

- **Excluded** (not primarily the extension): `extractor` (generic PDF/scraper config), `user_bookmarks` (canvas bookmarks, FK→`shared_canvas_items`, registered entity `user_bookmark`).
- **Consumers repointed:** matrx-extend `src/lib/supabase/queries.ts`, `src/lib/highlights/queries.ts`(+`types.ts`), `src/lib/data-pattern/recipes.ts`; matrx-frontend `app/api/auth/extension/{exchange,generate-code}/route.ts` → `.schema('extend')`. aidream: no logic consumers; `db/models/extend.py` in sync. `scripts/dead-relations.json` + `platform.deprecated_relations` registered; `pnpm check:dead-relations` green.
- **⛔ One external step to bring the extension back online (NOT MCP-reachable, like `communication` Phase 2):** add **`extend`** to the project's PostgREST **Exposed Schemas** (dashboard → Settings → API → *append*, don't replace) — `--schema extend` is already in `pnpm db-types`. Until exposed, every supabase-js read of these tables 404s. Acceptable: the extension is down with the rest of the system.

---

## Path to the DROP phase — what's left (2026-06-25 live inventory)

Live DB: **394 base tables · 57 retrofitted · 0 org-first RLS on public · 57 tables carry `project_id`/`task_id` litter · 13 rename compat-views · 62 empty tables · `pg_stat_statements` ON.**

**Blocking gate (still open):** **PITR confirmation** — nothing drops / goes `NOT NULL` until the user confirms it.

**Five tracks to finish:**
1. **Finish Wave-3 retrofit** (sweep PAUSED). ~12–15 in-scope Base-1 tables still un-retrofitted: `transcripts`, `prompts`, `content_blocks`, `sandbox_instances`, `quiz_sessions`, `ai_runs`, `page_extraction_jobs`, `app_instances`, `cmp_comparison_sets`, `shortcut_categories`, `study_structured_section`, `content_template`, `guest_execution_log`. (Other un-retrofitted litter tables are out-of-scope `sch_*`/`wf_*`/`code_*`/`wc_*` or the `ctx_*` spine.)
2. **Litter-column drops** (`project_id`/`task_id` → `platform.associations`). 57 tables carry them; ~21 are retrofitted + mirror-triggered to associations. Drop a column only after (a) association backfill verified complete, (b) consumers read associations not the column, (c) PITR. Out-of-scope litter stays.
3. **Compat-view drops** (13: 7 `file_*`, 6 `ctx_war_room_*`). **NOT SAFE YET** — drop-watch shows ALL 13 still heavily called by old names (`file_pages` 1.28M, `file_analysis` 210K, `file_analysis_result` 33K, `ctx_war_room_tiles` 1.3K…). Repoint aidream + War Room FE first ([compat-view-drop-repoint-list.md](./compat-view-drop-repoint-list.md)), watch `platform.v_deprecated_table_access` → 0, then drop.
4. **Empty / unused tables** (62 empty). Review against `platform.v_table_access_stats` (reads/writes/last_read) + consumer audit → graveyard the truly-dead. Many empties are planned-but-unused (keep).
5. **ctx Group-B transition** (USER-LED): `ctx_project_members`→`iam.memberships`, `ctx_task_comments`→`platform.comments`, `ctx_project_invitations`→`iam.invitations` (generic targets now exist).

**Deferred (do before the RLS phase):** register child entity tokens (#11); varchar-`version`→`version_label` repoint (#10); version-double-bump reconcile (agx/prompt/aga/notes).

## Observability — drop-watch (2026-06-25)

`pg_stat_statements` (schema `extensions`) is ON. Two admin views (query via the Supabase MCP), shipped in `migrations/observability_drop_watch.sql`:
- **`platform.v_deprecated_table_access`** — call counts per renamed-away old name. **calls=0 ⇒ safe to drop that compat view; calls>0 ⇒ repoint first.** The gate for compat-view drops. (Right now: all 13 nonzero.)
- **`platform.v_table_access_stats`** — per-table reads/writes/last_read; `reads=0 AND writes=0` over a full cycle ⇒ drop candidate.
- **Real-time per-request:** Supabase MCP `get_logs(service:'api'|'postgres')` (24h) — how the matrx-extend `sch_task.trigger_type` flood was caught.

---

## What "done" means (the standard — see the skill for the exact recipe)

Per **Base-1** table, additive first, then gated: **(1)** standard columns (`org_id`/`organization_id`, `created_by`, `updated_by`, `created_at`, `updated_at`, `deleted_at`, `version`, `metadata`); **(2)** org + actor backfilled (0 nulls verified); **(3)** `_touch_row` + `_stamp_actor` triggers (legacy `*_updated_at` trigger replaced); **(4)** `_version_capture('<token>')` unless extreme-churn opt-out; **(5)** `iam.apply_rls(...,'entity')` + drop legacy policies (gated — verify reads survive); **(6)** `org_id NOT NULL` (after 0-null verify); **(7)** litter/superseded columns dropped (gated — see repoint tracker + PITR). **Base-2** (joins) → `apply_rls(...,'join')`. **Base-3** (logs/events) → `apply_rls(...,'ledger')`, no version/soft-delete.

---

## Decisions log — enterprise-grade defaults

1. **Org column name:** keep legacy `organization_id` for now; shared machinery (`apply_rls`, `_version_capture`) is patched to accept `organization_id` **or** `org_id`. The cosmetic rename → `org_id` is a later, audited schema-cleanup pass (avoids breaking 91 tables + 2 Next.js admin dashboards + the Python admin mid-flight).
2. **Org backfill source:** user-owned rows → the user's **personal org** (coverage verified 100% for cx). Child rows → **denormalize** org from the parent (cheap, keeps the hot read path off join-based RLS — confirmed with the owner).
3. **`created_by` collision:** if a table already uses `created_by` for a non-actor meaning (e.g. `cx_agent_task.created_by` is a `'agent'|'user'` enum), rename it `<x>_kind` and add the standard actor `created_by uuid`.
4. **`version`:** one canonical column maintained by `_touch_row`; reuse an existing `version` anchor rather than adding a second.
5. **History capture:** deferred on extreme-churn tables until their runtime-state columns move out (e.g. cx_conversation/message).
6. **Drops:** every drop gated on (a) consumer audit incl. **both** Next.js admin dashboards **and** the Python admin, (b) **PITR/backup**, (c) **move-to-graveyard** for whole tables (never `DROP TABLE`).
7. **RLS read model:** org-first `has_org_access(org_id)` already returns **every** org the user belongs to → no "active org" required to see data; active-org is an optional UI filter. Writes must stamp `org_id`.
8. **Tracking discipline:** one migration file per table (or per small batch) in `migrations/`, applied via Supabase MCP, self-verifying, recorded in `_schema_migrations`, and reflected here.
9. **System tenant:** ownerless global/builtin/system rows (e.g. builtin agents, system templates) are **owned by the canonical `Matrx System` org** (`organizations.is_system=true`, id `39c38960-…`, no members → invisible in users' org lists) and stay visible to everyone via the `is_public` RLS branch. Keeps `org_id NOT NULL` universal with no special-casing. `retrofit_entity`'s `personal` strategy falls back to it for `user_id IS NULL` rows; `created_by` is left **NULL = system actor** (valid per standard). (A `Matrx Library` tenant also exists for the shared-knowledge corpus.)
10. **VARCHAR-`version` collision:** a table whose existing `version` is a VARCHAR semver (e.g. `skl_definitions`, live-consumed by `features/skills/` + aidream `SkillRowWire.version:str`) keeps its own `*_updated_at` trigger and gets `_stamp_actor` **only** — NOT `_touch_row` (whose `version := OLD.version+1` crashes on varchar). Int-version standardization (rename → `version_label` + add standard int `version`) is deferred to a cross-repo repoint pass. (Analog of the `created_by_kind` collision, #3.) Such tables count as retrofitted but do NOT appear in the `_touch_row` count.
11. **Child entity tokens:** children retrofitted via `retrofit_entity(...,'parent',...)` are passed descriptive tokens that may not be registered in `platform.entity_types` (the routine ignores `p_token` in Step-1, so it's harmless now). **ALL retrofitted child tokens MUST be registered in `entity_types` before the deferred RLS/history pass** (`apply_rls`/`_version_capture` consume the token). Sweep + register in one pass right before that phase.

---

## Per-group progress (all groups ≥3 tables)

Legend: **R**=retrofitted · **O**=has org column · **L**=has litter (`project_id`/`task_id`).

| Group | Tables | R | O | L | | Group | Tables | R | O | L |
|---|---|---|---|---|---|---|---|---|---|---|
| **cx** | 21 | **10** | 4 | 3 | | ui | 6 | **5** | 2 | 0 |
| ctx | 24 | **2** | 7 | 10 | | **kg** | 6 | **5** | 6 | 0 |
| scrape | 25 | 0 | 0 | 0 | | app | 6 | **3** | 1 | 1 |
| cld | 18 | 0 | 7 | 0 | | ai | 6 | 0 | 1 | 1 |
| **user** | 16 | **5** | 5 | 0 | | **aga** | 6 | **1** | 1 | 2 |
| tool | 14 | 0 | 0 | 0 | | pc | 5 | 0 | 0 | 0 |
| rs | 12 | **10** | 0 | 1 | | flashcard | 5 | **5** | 5 | 2 |
| wf | 12 | 0 | 3 | 3 | | sch | 4 | 0 | 0 | 2* |
| prompt | 12 | **5** | 2 | 3 | | wc | 4 | 0 | 1 | 1* |
| udt | 10 | **7** | 3 | 3 | | page | 4 | 0 | 1 | 1 |
| studio | 9 | **4** | 1 | 1 | | audio | 4 | 0 | 0 | 0 |
| system | 9 | 0 | 1 | 0 | | code | 4 | 0 | 3 | 3* |
| **sms** | 9 | **5** | 5 | 0 | | organization | 3 | 0 | 3 | 0 |
| file | 7 | 0 | 0 | 0 | | agent | 3 | 0 | 0 | 0 |
| wbx | 7 | 0 | 0 | 0 | | cmp | 3 | 0 | 1 | 1 |
| **agx** | 7 | **4** | 4 | 4 | | **dict** | 3 | **1** | 2 | 0 |
| canvas | 7 | **7** | 7 | 1 | | **dm** | 3 | **1** | 1 | 0 |
| note | 6 | **5** | 0 | 0 | | **feedback** | 3 | **1** | 1 | 0 |
| skl | 6 | **5** | 3 | 4 | | admin | 3 | 0 | 0 | 0 |
| | | | | | | pdf | 3 | 0 | 1 | 0 |
| | | | | | | **scope** | 3 | **3** | 3 | 0 |

`*` = **out-of-scope litter** to LEAVE (per architecture §8): `sch_*` (scheduler), `wf_*`/`workflow` (workflow), `code_*` (coding-container, keep FK for now), `wc_*` (workers-comp module). Their `project_id`/`task_id` are NOT association litter.

> Remaining small groups (<3 tables) and singletons make up the balance to 434; detailed sections are added as each group is processed.

---

## `cx` — detailed (priority group, in progress)

Legend: ✅ done · ⏳ pending · — n/a · **KEEP** = planned/empty, do not drop.

| Table | Rows | Class | Retrofit | Org | RLS | Litter→assoc | Notes |
|---|---|---|---|---|---|---|---|
| cx_conversation | 6,149 | Base-1 | ✅ | ✅ personal | ⏳ | project/task/is_fav ⏳ | favorites repointed ✅; runtime-state cols deferred (owner-led) |
| cx_message | 18,052 | Base-1 child | ✅ | ✅ denorm | ⏳ | — | |
| cx_artifact | 164 | Base-1 child | ✅ | ✅ | ⏳ | project/task ⏳ | **no mirror** — artifact API must repoint before drop |
| cx_agent_plan | — | Base-1 child | ⏳ | ⏳ from conv | ⏳ | project ⏳ | |
| cx_agent_task | 51 | Base-1 child | ⏳ | ⏳ from conv | ⏳ | — | **collision:** `created_by` enum → rename `created_by_kind` |
| cx_agent_memory | 2 | Base-1 user | ⏳ | ⏳ personal | ⏳ | — | |
| cx_user_todo | — | Base-1 user | ⏳ | ⏳ personal | ⏳ | — | has `ctx_task_id` FK (spine, keep) |
| cx_working_documents | 419 | Base-1 user | ⏳ | ⏳ from conv | ⏳ | — | **has `version`** already — reuse, don't re-add |
| cx_observational_memory | 12 | Base-1 user | ⏳ | ⏳ personal | ⏳ | — | 27 cols; review for trash |
| cx_tool_call | 4,596 | Base-1 | ⏳ | ⏳ from conv | ⏳ | — | 40 cols; churny → history opt-out |
| cx_user_request | 4,586 | Base-1 | ⏳ | ⏳ personal | ⏳ | — | |
| cx_request | 8,665 | Base-3 log | ⏳ | ⏳ from conv | ⏳ ledger | — | telemetry — ledger RLS, no version |
| cx_request_snapshot | 1,958 | Base-3 log | ⏳ | ⏳ from conv | ⏳ ledger | — | |
| cx_tool_trace | 1,704 | Base-3 log | ⏳ | ⏳ from conv | ⏳ ledger | — | |
| cx_observational_memory_event | 6 | Base-3 log | ⏳ | ⏳ from conv | ⏳ ledger | — | |
| cx_pending_injection | — | Base-3 queue | ⏳ | ⏳ from conv | ⏳ ledger | — | ephemeral |
| cx_conversation_documents | 407 | Base-2 join | ⏳ | ⏳ from conv | ⏳ join | — | |
| cx_user_usage_summary | 6 | special | ⏳ | ⏳ personal | ⏳ user | — | PK `user_id`, no `id` — per-user summary |
| cx_media | 0 | Base-1 child | KEEP | — | — | — | **planned/empty** — do not drop |
| cx_code_edit | 0 | Base-3 | KEEP | — | — | — | **planned/empty** |
| cx_code_message_file | 0 | Base-1 child | KEEP | ✅ | — | — | **planned/empty** |

---

## `agx` / `aga` — next priority (detail)

| Table | Rows | Class | Notes |
|---|---|---|---|
| agx_agent | 569 | Base-1 | has org + litter |
| agx_shortcut | 205 | Base-1 | has org + litter |
| agx_agent_surface | 9 | Base-1 | registered token `agent_surface_binding`; has org+litter |
| agx_agent_templates | 10 | Base-1 | has org+litter |
| agx_version | 2,026 | Base-3 log | version history — ledger |
| agx_usage_registry | 48 | Base-3 log | |
| agx_drift_alert | 36 | Base-3 log | |
| aga_apps | 70 | Base-1 | registered `agent_app`; has org+litter |
| aga_versions | 61 | Base-3 log | |
| aga_categories | 10 | Base-1/lookup | consolidate → `platform.categories` later |
| aga_executions | 1 | Base-3 log | litter |
| aga_errors / aga_rate_limits | 1 / 1 | Base-3 | |

---

## Drop-consumer repoint tracker (gates the litter/superseded drops)

| Column(s) | Status | Consumers to repoint |
|---|---|---|
| cx_conversation.is_favorite | ✅ **done** (`a3d4026f3`) | conversation-list/history thunks → `favoritesService` (user_entity_state) |
| cx_conversation.project_id/task_id | ⏳ | `load-conversation`/`fork-conversation` thunks → `assoc_for_entity` |
| cx_artifact.project_id/task_id | ⏳ | `app/api/artifacts/route.ts` (create+filter) → associations |
| cx_agent_plan.project_id | ⏳ | `agent-plan.service.ts` → associations |

Admin dashboards (both Next.js) audited: **do not read** these columns. Python admin (aidream): **to audit**.

---

## Open items / blockers

- **PITR confirmation** — gates ALL drops + `NOT NULL` enforcement. (Lead cannot read the Supabase dashboard.)
- **Staging branch** for Waves 4–5 (schema reorg + final drops) — not yet stood up.
- `platform.retrofit_entity` routine — to build (registry-driven; encodes this standard).
- `get_ssr_shell_data_rpc.sql` migration drift — unrelated, owner TBD.

---

## Change log

- **2026-06-28** — **Research cluster fully canonicalized (13 `rs_*` relations)** via `db-canonicalize-table`. **`rs_topic`** → entity (token `research_topic`, registered + sharing registry + `apply_rls entity`; added `visibility`+`deleted_at`; 13 existing topics set `visibility='internal'` to preserve project-collaborator access; **zero FAIL / zero WARN**). **`rs_template`** → entity (token `research_template`; 5 system templates set `visibility='public'`; **zero WARN**). **8 content tables** (`rs_keyword`/`rs_source`/`rs_tag`/`rs_synthesis`/`rs_document`/`rs_content`/`rs_analysis`/`rs_media`) → **components** of `research_topic` (single-level composition via `topic_id` — every child carries it; `created_by` is null on all of them because they're service-role/backend writes, which the `component` variant is built for). **2 junctions** (`rs_source_tag`→`research_source`, `rs_keyword_source`→`research_keyword`) → components. `rs_source_keywords` is a VIEW (untouched). Replaced the non-canonical project-cascade RLS everywhere; dropped the legacy `set_updated_at` double-fire trigger on all 10 trigger-bearing tables (kept `_stamp_actor`/`_touch_row`, `rs_keyword` position trigger, `rs_topic._mirror_proj`). **All 12 tables zero FAIL + zero WARN.** Owner-impersonation verified: a real topic owner reads all their topics/sources/content/analysis/media/junctions/templates, with the one other-org topic correctly excluded — no data hidden. `is_versioned=false` on all (no `_history` attached — high-volume; deferred, not silently added). 4 migration files written + ledgered (`research_canon_01..04`). **Schema MOVE → `research` DONE** (after the user exposed `research` to PostgREST): `research_canon_05` moved 12 tables + the `rs_source_keywords` view `public`→`research`; registry `schema_name` updated; **8** functions repointed (4 hardcoded `public.rs_*` + 4 with BARE refs the first pass missed — `get_topic_overview`, `get_user_hierarchy`, `agx_usage_history_counts`, `container_resource_counts`). FE: 55 `.from()` + 3 `Database["public"]…["rs_*"]` type refs → `.schema('research')`/`["research"]` across 4 files; `research` added to `db-types --schema`; types regenerated; dead-relations.json + `platform.deprecated_relations` (13 entries). aidream was already modeled on `research` (`_db_schema='research'`); only `matrx-rag/sources.py` raw SQL needed repointing. **Verified live:** PostgREST `research.rs_topic`=200, `public.rs_topic`=404 (clean cut), counts preserved (13/2474/3204/3023), `get_topic_overview` correct, FE tsc research-clean. 5 migrations ledgered. **99 tables in entity_types.**
- **2026-06-27** — **Social/event/entity batch (8 tables)**: `canvas_likes` (1r, Base-3 ledger, personal org), `canvas_scores` (0r, Base-3, personal), `canvas_views` (120r, Base-3, personal — user_id nullable for anon; all 120 got org via system org fallback), `canvas_comment_likes` (0r, Base-3, parent=`canvas_comments` via `comment_id`), `heatmap_saves` (0r, Base-1, manual — user_id is TEXT not UUID so retrofit_entity skipped; legacy trigger dropped, visibility col added alongside is_public), `kg_suggestion_ack` (78r, Base-3, composite PK user_id+suggestion_id), `microservice_project` (1r, Base-1 — is_system row has NULL user_id/created_by = system actor, valid per Decision #9), `industry_curators` (1r, Base-2 join, personal org — parent `industries` has no org col). `note_versions` SKIPPED — already in `graveyard` schema. Legacy `set_updated_at` triggers dropped on all tables; `trigger_update_heatmap_saves_updated_at` dropped on heatmap_saves. 0 null_org on all 8, 8 entity_type tokens registered, 8 migration files written + ledgered. canvas group: 3→7 ✅; kg group: 4→5. **95 tables retrofitted total, 56 in entity_types.**
- **2026-06-28** — **kg / scope / ui-surface / dict / ner / context-item batch (12 tables)**: `kg_alerts` (18r), `kg_sweep_queue` (66r, org already NOT NULL, 7 system-row null creators), `kg_sweep_run` (62r, Base-3 log, org already NOT NULL, 3 system-row null creators, kept `stamp_run_org`+`emit_run_lifecycle`, replaced `_fn_kg_sweep_touch_updated_at` with `_touch_row`), `kg_value_matches` (3r), `scope_suggestions` (8r), `scope_association_suggestions` (109r), `scope_item_value_suggestions` (30r), `context_item_suggestions` (3r, added `deleted_at`), `ner_canonicalizer_shadow` (49r, added `deleted_at`), `dict_settings` (0r, replaced `dict_touch_updated_at`), `ui_surface_config` (0r), `ui_surface_agent_pref` (3r). **`one_scope` CHECK constraint** on both `ui_surface_*` tables prevents org backfill for user-scoped rows — null org when `user_id` is set is intentional. All 12: 0 null_org for user-owned rows, `_touch_row`+`_stamp_actor` attached, 12 entity_type tokens registered, 12 migration files written + ledgered. **78 tables retrofitted total, 39 in entity_types.**
- **2026-06-26** — **Canonical-RLS lane opened** (owner: dedicated agent; fence: [`CANONICAL_RLS_LANE.md`](./CANONICAL_RLS_LANE.md)). Built **`iam.apply_rls` v2** (single RLS generator, owner short-circuit + `has_access` delegation — fixes the `INSERT…RETURNING` `42501` that broke War Room create) and fixed **`platform._stamp_actor`** to fall back to `auth.uid()` over PostgREST. **Org-first RLS now applied (`std_*`) on: `wr_sessions`, `wr_threads`, `notes`.** `notes` slice = added `visibility` (`is_public`→`visibility`, 0 public), `apply_rls`, verified live (create + isolation), **0 code changes needed** (access preserved exactly). Decisions: assignment→`public.permissions` grant; assignee/sharing/versions/associations tackled when their groups are claimed. Mechanism: [`db-canonical-rls.md`](./db-canonical-rls.md); sweep: [`db-canonical-rls-sweep-todo.md`](./db-canonical-rls-sweep-todo.md). **Owned by this lane — other agents stay clear of `notes` + the shared RLS primitives.**
- **2026-06-24** — Tracker created. Waves 0–2 complete. `cx_conversation` / `cx_message` / `cx_artifact` retrofitted (additive). Conversation-favorites repoint landed. Enterprise-grade decisions logged. Schema exported (434 tables / ~40 groups).
- **2026-06-24 (later)** — `platform.retrofit_entity` routine built + validated. `cx_agent_memory` retrofitted. **`agx` group fully delegated + done (4/4 Base-1)** via the routine. Established the **system tenant** (decision #9) — hardened the routine through two real edge cases (ownerless rows → system org; `created_by` NULL = system). **8 tables retrofitted.**
  - **Open follow-up:** `agx_agent` / `agx_agent_templates` carry bespoke `version`-snapshot triggers (`trg_agx_*` → `agx_version`); `_touch_row` also bumps `version` on UPDATE → reconcile the double-bump when `agx_version` gets its Base-3 treatment.
  - **Files to reconcile (lead bookkeeping):** routine file → final v3; `platform_system_org_tenant.sql`; `agx_entities_retrofit.sql` (uncomment the 3 now-applied calls); ledger each.
- **2026-06-24 (cont.2)** — **`prompt` group delegated + done** (5 Base-1: `prompt_actions`/`apps`/`builtins`/`shortcuts`/`templates`; 6 logs + 1 lookup skipped) via a subagent + the routine. **19 tables retrofitted.** Delegation-brief lesson: point subagents at the `SKILL.md` **file**, not "invoke the skill" (the latter no-op'd once). The bespoke version-snapshot double-bump (`_touch_row` + a feature trigger) now spans `agx_agent`/`templates` + `prompt_apps`/`builtins` — reconcile in the Base-3 `*_versions` pass.
- **2026-06-24 (cont.)** — Routine + system-org files reconciled + ledgered. **cx batch 2** retrofitted via the routine (`cx_agent_plan` / `cx_observational_memory` / `cx_tool_call` / `cx_user_request` / `cx_user_todo` / `cx_working_documents`). **14 tables retrofitted.** Remaining cx: Base-3 logs (`cx_request`/`_snapshot`/`cx_tool_trace`/`_observational_memory_event`/`cx_pending_injection` → ledger pass), `cx_conversation_documents` (join), `cx_user_usage_summary` (special), `cx_agent_task` (**deferred** — `created_by` enum needs a consumer audit before rename), + 3 planned-empty (keep). Remaining file debt: agx system-row uncomment + `cx_agent_memory` file.
- **2026-06-28** — **Mixed-group retrofit (9 tables)**: `quiz_sessions`, `user_flashcard_sets`, `user_flashcard_reviews`, `flashcard_history`, `canvas_item_state`, `dashboard_saved_views`, `shortcut_categories`, `user_achievements`, `user_stats` — additive base cols, org/actor backfill (**0 null_org verified live** on all 9), `_touch_row`/`_stamp_actor`/`_version_capture` attached, 9 tokens registered in `platform.entity_types`. Notes: `quiz_sessions` already had `organization_id` (64 rows, personal backfill) + has `is_public` → added `visibility` + backfilled; `canvas_item_state` composite PK (canvas_id,user_id) — added `id uuid` col, org denormalized from parent `canvas_items`; `user_stats` singleton PK `user_id` — added `id uuid` col; `shortcut_categories` 57/62 rows system-owned (null `user_id`) → assigned system org; `user_flashcard_reviews` high-churn append → `_version_capture` deferred; `user_achievements`/`user_stats` had no `created_at`/`updated_at` — added both. Redundant `set_updated_at` triggers on `shortcut_categories`/`user_achievements`/`user_flashcard_reviews` left in place (DROP boundary — schedule for legacy-trigger sweep pass). 9 migration files written + ledgered. **87 tables now retrofitted total.** flashcard group: 2→5 ✅; canvas group: 2→3 ✅.
- **2026-06-27** — **App/UI/content group retrofit (9 tables)**: `app_instances`, `content_blocks`, `content_template`, `custom_app_configs`, `custom_applet_configs`, `component_groups`, `field_components`, `applet`, `sandbox_instances` — additive base cols + org/actor backfill (all 0 null_org, 0 null_creator) + `_touch_row`/`_stamp_actor`/`_version_capture` + entity_types registered (9 new tokens). Notes: `content_blocks` all 101 rows system-owned (null user → system org); `applet` had 4/6 orphaned user_ids (auth.users deleted, FK `NOT VALID` + `ON DELETE SET NULL`) — nulled before retrofit; `sandbox_instances` already had `deleted_at`; all `is_public` tables got `visibility` col synced. `app` group: 3/6 retrofitted; `ui` group: 3+4=7 but those are in separate entries above. **66 tables now retrofitted total.** 9 migration files written + ledgered.
- **2026-06-25** — **`ctx` group opened: War Room retrofitted** (first `ctx` table) via `platform.retrofit_entity`. `ctx_war_room_sessions` (token `war_room`, `personal` org) + `ctx_war_room_tiles` (token `thread`, org denormalized from the parent session via `session_id`) — additive base cols + actor/org backfill (7 sessions, 53 tiles; **0 null-org, 0 null-creator** verified live), legacy `*_updated_at` → `_touch_row`/`_stamp_actor`, ledgered (`ctx_war_room_base_retrofit.sql`, `matrx-frontend`). **16 tables retrofitted.** DEFERRED (gated, post-deploy): `_version_capture`, org-first RLS flip, `organization_id NOT NULL`, `is_deleted`→`deleted_at` + `metadata`, and ALL litter drops (`task_id`/`note_id`/`project_id`/`context_organization_id`/`context_scope_ids`/`session_id` + the legacy `ctx_war_room_assignments` / `_tile_notes` / `_tile_audio_sessions` / `_tile_attachments` tables) — pending the War Room frontend repoint onto the `assoc_*` RPCs + branch deploy. Work is on branch `claude/inspiring-ride-6ufddz` (NOT main).
