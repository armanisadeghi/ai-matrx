# DB Changeover — Live Progress Tracker

> **The single source of truth for the rebuild's execution.** Updated continuously by the lead **and** delegated subagents. Goal: carry **every** table to *done* — additive retrofit → org-first RLS → litter cleanup → schema reorg — however long it takes (a day or a month). A table is *done* only when it meets the standard, is **verified live**, and is recorded here **and** in `public._schema_migrations`.
>
> **Process + per-table recipe:** the **`db-table-retrofit` skill** (`.claude/skills/db-table-retrofit/`). **Standard:** `db-core-standards-and-automation.md`. **RLS/safety:** `db-rls-safety-fields-categorization.md`. **Cutover safety:** `db-staging-and-cutover-plan.md`. **Index:** `README-ctx-association (1).md`.

**Last updated:** 2026-06-24 · **DB:** `txzxabzwovsujtloxrus` (Matrx Main) · **Scope:** 434 public base tables.

---

## Dashboard

| Metric | Count / 434 |
|---|---|
| **Retrofitted** (standard base cols + `_touch_row`/`_stamp_actor`) | **19** (cx ×10, agx ×4, prompt ×5) |
| Org-first RLS applied (`std_*` policies) | 0 |
| Litter columns (`project_id`/`task_id`) dropped | 0 |
| Drop-consumer repoints done | 1 (conversation favorites) |
| Registered in `platform.entity_types` | 18 |

**Wave status:** 0 Entity registry ✅ · 1 Scaffolding/RLS engine ✅ · 2 Associations + categories + user_entity_state ✅ · **3 Base retrofit — IN PROGRESS (cx)** · 4 Schema reorg/rename ⏳ · 5 Litter drops ⏳

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

---

## Per-group progress (all groups ≥3 tables)

Legend: **R**=retrofitted · **O**=has org column · **L**=has litter (`project_id`/`task_id`).

| Group | Tables | R | O | L | | Group | Tables | R | O | L |
|---|---|---|---|---|---|---|---|---|---|---|
| **cx** | 21 | **10** | 4 | 3 | | ui | 6 | 0 | 2 | 0 |
| ctx | 24 | 0 | 6 | 10 | | kg | 6 | 0 | 5 | 0 |
| scrape | 25 | 0 | 0 | 0 | | app | 6 | 0 | 1 | 1 |
| cld | 18 | 0 | 7 | 0 | | ai | 6 | 0 | 1 | 1 |
| user | 16 | 0 | 0 | 0 | | **aga** | 6 | 0 | 1 | 2 |
| tool | 14 | 0 | 0 | 0 | | pc | 5 | 0 | 0 | 0 |
| rs | 12 | 0 | 0 | 1 | | flashcard | 5 | 0 | 2 | 2 |
| wf | 12 | 0 | 3 | 3 | | sch | 4 | 0 | 0 | 2* |
| prompt | 12 | **5** | 2 | 3 | | wc | 4 | 0 | 1 | 1* |
| udt | 10 | 0 | 3 | 3 | | page | 4 | 0 | 1 | 1 |
| studio | 9 | 0 | 1 | 1 | | audio | 4 | 0 | 0 | 0 |
| system | 9 | 0 | 1 | 0 | | code | 4 | 0 | 3 | 3* |
| sms | 9 | 0 | 0 | 0 | | organization | 3 | 0 | 3 | 0 |
| file | 7 | 0 | 0 | 0 | | agent | 3 | 0 | 0 | 0 |
| wbx | 7 | 0 | 0 | 0 | | cmp | 3 | 0 | 1 | 1 |
| **agx** | 7 | **4** | 4 | 4 | | dict | 3 | 0 | 2 | 0 |
| canvas | 7 | 0 | 1 | 1 | | dm | 3 | 0 | 0 | 0 |
| note | 6 | 0 | 0 | 0 | | feedback | 3 | 0 | 0 | 0 |
| skl | 6 | 0 | 3 | 4 | | admin | 3 | 0 | 0 | 0 |
| | | | | | | pdf | 3 | 0 | 1 | 0 |
| | | | | | | scope | 3 | 0 | 3 | 0 |

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

- **2026-06-24** — Tracker created. Waves 0–2 complete. `cx_conversation` / `cx_message` / `cx_artifact` retrofitted (additive). Conversation-favorites repoint landed. Enterprise-grade decisions logged. Schema exported (434 tables / ~40 groups).
- **2026-06-24 (later)** — `platform.retrofit_entity` routine built + validated. `cx_agent_memory` retrofitted. **`agx` group fully delegated + done (4/4 Base-1)** via the routine. Established the **system tenant** (decision #9) — hardened the routine through two real edge cases (ownerless rows → system org; `created_by` NULL = system). **8 tables retrofitted.**
  - **Open follow-up:** `agx_agent` / `agx_agent_templates` carry bespoke `version`-snapshot triggers (`trg_agx_*` → `agx_version`); `_touch_row` also bumps `version` on UPDATE → reconcile the double-bump when `agx_version` gets its Base-3 treatment.
  - **Files to reconcile (lead bookkeeping):** routine file → final v3; `platform_system_org_tenant.sql`; `agx_entities_retrofit.sql` (uncomment the 3 now-applied calls); ledger each.
- **2026-06-24 (cont.2)** — **`prompt` group delegated + done** (5 Base-1: `prompt_actions`/`apps`/`builtins`/`shortcuts`/`templates`; 6 logs + 1 lookup skipped) via a subagent + the routine. **19 tables retrofitted.** Delegation-brief lesson: point subagents at the `SKILL.md` **file**, not "invoke the skill" (the latter no-op'd once). The bespoke version-snapshot double-bump (`_touch_row` + a feature trigger) now spans `agx_agent`/`templates` + `prompt_apps`/`builtins` — reconcile in the Base-3 `*_versions` pass.
- **2026-06-24 (cont.)** — Routine + system-org files reconciled + ledgered. **cx batch 2** retrofitted via the routine (`cx_agent_plan` / `cx_observational_memory` / `cx_tool_call` / `cx_user_request` / `cx_user_todo` / `cx_working_documents`). **14 tables retrofitted.** Remaining cx: Base-3 logs (`cx_request`/`_snapshot`/`cx_tool_trace`/`_observational_memory_event`/`cx_pending_injection` → ledger pass), `cx_conversation_documents` (join), `cx_user_usage_summary` (special), `cx_agent_task` (**deferred** — `created_by` enum needs a consumer audit before rename), + 3 planned-empty (keep). Remaining file debt: agx system-row uncomment + `cx_agent_memory` file.
