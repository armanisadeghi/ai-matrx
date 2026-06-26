# AI Matrx — Database Changelog (for the team)

**Project:** `txzxabzwovsujtloxrus` (automation-matrx)
All changes are live, applied via migrations, PITR-backed. Service role bypasses RLS, so backend writers are unaffected unless stated.

---

## 0. RLS is now generated — `iam.apply_rls` v2 (2026-06-26)

There is now **one canonical RLS generator** — `iam.apply_rls(schema, table, token, variant)` — and one resolver, `iam.has_access`. **Stop hand-writing table policies.** To govern a table: `SELECT iam.apply_rls(...)` (it drops all existing policies and recreates the canonical set). Full mechanism + policy SQL: [`db-canonical-rls.md`](./db-canonical-rls.md); per-table sweep: [`db-canonical-rls-sweep-todo.md`](./db-canonical-rls-sweep-todo.md).

**Bug it fixed:** any policy of the form `iam.has_access(token, id, 'viewer')` as the *only* SELECT branch broke `INSERT … RETURNING` (i.e. supabase-js `.insert().select()`) with `42501` — the resolver re-reads the row by id and can't see the in-flight row. v2 leads with `created_by = (select auth.uid())` (read off the NEW row) so owner creates pass. **Applied to `wr_sessions` + `wr_threads`** (War Room create was failing). If you hand-wrote `has_access`-only policies on any table, regenerate it via `apply_rls`.

**Action:** if you're about to write a `CREATE POLICY`, don't — call `iam.apply_rls` instead.

---

## 1. Access resolver: org-admin oversight (cross-cutting)
`iam.has_access(type, id, level)` now grants **org owners/admins read-only (`viewer`) access to any row in their org, regardless of visibility**.
- Owners → unchanged (full access to their own rows).
- Regular members → unchanged (cannot see others' private rows).
- Org owners/admins → can now **read** (not edit) any row in their organization, for oversight.
- This is in the resolver, so it applies to **every** governed entity (War Room, runtime, and anything later put on `has_access`). No per-table change.

**Action:** none required. Be aware admins can now read private rows in their org.

---

## 2. `runtime` schema — canonical build (the request/execution layer)
The matrx-runtime tables were brought fully onto the canonical contract. **All tree tables were empty**, so no data migrated; only `global_origin` had its 11 seeded rows. This layer supersedes the `cx_user_request` path.

**Breaking column changes — update package code:**
- `global_request.org_id` → **`organization_id`** (now NOT NULL, FK→organizations CASCADE).
- `global_request.user_id` **removed** — ownership is **`created_by`**.
- `global_execution.request_id` → **NOT NULL**, FK now **CASCADE** (was SET NULL); every execution must carry its request id.
- Timestamps normalized to `created_at`: `global_execution_event.at`, `global_execution_checkpoint.at`, `global_meter_entry.occurred_at`.

**Added (trigger-managed — do NOT set by hand):** `created_by/updated_by/updated_at/version/visibility('private')/deleted_at` on `global_request`; `updated_at/version` on `global_execution`; `created_at/updated_at/version` on `global_execution_control`; `updated_at/version` on `global_origin`. Triggers: `_touch_row` on request/execution/control/origin; `_stamp_actor` on request.

**Access:** RLS is ON for all 7 tables. `global_request` is the private root; executions + control/event/checkpoint/meter inherit its access by composition (registered in `entity_types`/`entity_relationships`). Reads = owner OR org-admin OR explicit grant. Writes = service-role only.

**Engine contract — three musts:**
1. Set **`created_by`** = the initiating user on each request (else the user can't see their own data).
2. Always provide **`organization_id`** on the request (personal-org fallback for system/user-less requests).
3. Set **`request_id`** on **every** execution in the tree.

---

## 3. RLS Wave 1 — closed 14 tables that had RLS switched OFF on real data
These were readable by any authenticated (some by anon) user.

- **User-owned (owner CRUD + public read):** `custom_app_configs`, `custom_applet_configs`, `applet`, `field_components`, `component_groups`, `scrape_parsed_page`. Read = `user_id = auth.uid() OR is_public`; writes = owner. **FE must set `user_id` on insert** (already the norm).
- **Backend ops/audit logs → service-role only:** `api_request_log` (~5.9M rows), `system_error`, `system_write_failure`, `api_field_warnings`, `pdf_consolidation_log`, `dev_login_audit`. Frontend can no longer read these. **If any dashboard read them via an authenticated client, move it to a service-role path or an admin RPC.**
- **Sensitive capture (reads locked, public-form inserts preserved):** `emails`, `invitation_requests`.

---

## 4. RLS Wave 2 — closed 5 sensitive tables with cross-tenant exposure
- `organization_preferences` — org members read; org admins write.
- `prompt_templates` — owner + org-mate read; owner writes.
- `study_structured_section` — owner + org-mate read; owner writes.
- `study_source_chunk` — owner read/write.
- `dict_provider_publication` — owner read/write.

**Action:** if any of these were expected to be shared more broadly (e.g., a shared study library), tell me — sharing should go through `visibility`/`permissions`, not an open table. Reversible.

---

## Not changed
Table names, all functional columns, status CHECKs, idempotency uniqueness, self-nesting FKs. cx_/wf_ behavior is unchanged (audited: no leak, nothing broken). `ai_runs`, `ai_model`, `ai_provider` untouched (slated for removal/overhaul).
