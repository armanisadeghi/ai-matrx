# Canonical DB Cutover — Handoff & Playbook

**Purpose:** the one doc for someone stepping into the canonical-DB cutover cold. Canonical *rules* live in `official/db-rulebook.md`; *DB backlog* in `official/db-status.md`; *FE done-log* in `official/app-cutover-done.md`. **Read those three first.** This doc adds the cross-repo execution state, the repeatable playbook, and the hard-won gotchas. Keep it current.

## What we're doing
Migrating the platform to a canonical DB model: **one subsystem = one schema** (readable nouns: `platform, iam, runtime, history, files, workflow, …`), canonical homes for cross-cutting concerns (no duplicates), and a uniform access model (`visibility` enum + `created_by` + `iam.has_access`). The app is intentionally **down** during the push — speed over polish, temporary breakage is fine.

## Repos & lanes (we move together)
| Repo | What | Owner |
|---|---|---|
| **matrx-frontend** (this) | React app code | this agent (app lane) |
| **aidream** `/Users/armanisadeghi/code/aidream` | Python server + `packages/matrx-utils` (file handling) + matrx-orm models + the **Vite** workflow UI | this agent (app lane), DB-layer regen by DB owner |
| **DB** (Supabase `txzxabzwovsujtloxrus`) | schema, RLS, functions, registries | Arman + DB agent, via Supabase MCP |

- **Architecture decisions are Arman's** — encode them in `official/db-rulebook.md`, don't decide ad hoc.
- The React **`workflow` UI is the OLD, disconnected system** (being replaced by the Vite app in aidream) — do NOT update it. `wf_` has **0 live FE refs**.

## Canonical homes (never re-implement — full table in db-rulebook)
grants→`public.permissions` (`has_permission`/`iam.has_access`, `expires_at` NULL=never) · members→`iam.memberships` · invitations→`iam.invitations` · activity→`platform.activity_log` (`log_activity`) · links→`platform.associations` (`assoc_*`) · per-user state→`platform.user_entity_state` · comments→`platform.comments` · registries→`platform.entity_types`+`platform.entity_relationships`.

## The repeatable cutover PLAYBOOK (per schema/table move)
**FE (matrx-frontend):**
1. **Types:** `pnpm db-types` (the script pulls `public,files,workflow` — add new schemas to it). Types are the contract; regen BEFORE migrating consumers.
2. **Table refs:** `supabase.from('cld_X')` → `supabase.schema('<schema>').from('<X>')`. Realtime `postgres_changes`: set `schema:` + new table name. Use a typed helper (pattern: `features/files/filesDb.ts`).
3. **Column renames:** `owner_id`→`created_by`; `is_public`→`visibility` enum (`private<internal<link<public`; legacy `'shared'`→`'link'`).
4. **Sharing token:** `utils/permissions/registry.ts` MUST mirror `public.shareable_resource_registry` exactly (parity test, 40/40). FE-only routing fields (`schemaName`/`physicalTable`) are tolerated. After a DB registry change: `pnpm tsx scripts/regen-shareable-registry-snapshot.ts` + sync the TS entries.
5. **Verify:** `pnpm type-check` (only the pre-existing `MapBlock.tsx` error is allowed) · `pnpm test:unit utils/permissions` · live preview with **real** data.

**Server (aidream):**
- matrx-orm models auto-update via `db/generate.py` — **the DB owner runs it in lockstep with every rename** (skipping it caused a 2026-06-24 outage; compat views do NOT save the Python import graph).
- `packages/matrx-utils/.../cloud_sync/**` uses the **raw supabase-py client** (bypasses the ORM) → hardcoded `public.cld_*` names break on a move. Centralize in `cloud_sync/db.py`; `.schema("files").table(...)`.
- Graveyarded canonical-duplicates → canonical homes: `cld_events`→`platform.activity_log`; `cld_file_permissions`→`public.permissions`; `cld_get_effective_permission`→`iam.has_access`.

## Hard-won GOTCHAS
- **Concurrent main:** ~10 agents rewrite `main` constantly. **Commit with explicit paths** (`git add -A` sweeps concurrent files). **After pushing, confirm HEAD is YOUR commit** (`git log -1`).
- **ENOBUFS pre-commit hook (now FIXED):** `scripts/check-doctrine.ts` `execSync` lacked `maxBuffer` → the huge generated-types diff overflowed and `exit(2)` **silently aborted commits**, so `git push` pushed concurrent HEADs and your work sat staged. Fixed (256MB). If a commit seems to vanish, this was why.
- **MCP RLS-test limit:** `set local role authenticated` in the MCP harness lacks `USAGE` on `iam`/`files` schemas → you **cannot** verify those RLS via MCP; use the browser. A **403 (not 404/PGRST106) proves a schema IS exposed**.
- **`platform.associations` direction:** `target_type` CHECK = container types only → **content = SOURCE, container = TARGET** (a note on a task = `source=note → target=task`).
- **Two registries, keep aligned:** `entity_types` (token→schema.table, drives `has_access`) vs `shareable_resource_registry` (sharing RPCs; `resolve_shareable_resource` matches `resource_type` OR `table_name`). Canonical token is `file`, not `cld_files`.
- **`has_access` order:** owner(`created_by`) → org-admin oversight (viewer, any visibility) → public+viewer → explicit grant → internal+org-member → containment cascade → deny. Components have no own visibility (inherit via composition).
- **Runtime needs PostgREST schema exposure** for non-public schemas (`.schema('files')`) — DB-config side; code+types are correct regardless.
- **`cx_agent_task.created_by` is a custom enum** (creator *type*, not an actor uuid) — excluded from the standard owner model.
- **`db-generate` lockstep** (server) — see above; the #1 server-outage cause.

## Status snapshot (authoritative lists in db-status.md / app-cutover-done.md)
- **Done:** ctx_ junctions (FE off + graveyarded), files (`cld_`→`files`, FE **and** server), notes visibility, cx_conversation (FE visibility/created_by + canonical RLS), `permissions.expires_at`, file-token reconciliation, registry parity 40/40, ENOBUFS hook.
- **Remains:** cx_ children cascade + `is_public`/`user_id` drop (DB; then FE strips deprecated mirrors), AI subsystem schemas (planned — same playbook), non-`official` doc consolidation.
- **Open flags:** D18 RLS on `files.share_links`/`file_versions` (DB reported done; browser spot-check pending); registry data nits (`folder` url template vs live route; `wf_trigger` double-`{id}`).

## Verification toolkit
- DB facts → Supabase MCP `execute_sql`.
- RLS for **public-schema** entities → impersonate: `set local role authenticated` + `set_config('request.jwt.claims', '{"sub":"<uid>","role":"authenticated"}', true)`. (iam/files schemas: browser only.)
- FE → `pnpm type-check` + `pnpm test:unit utils/permissions` + live preview (`next-dev-cutover-qa`, port 3007; landing-page "admin" quick-login).
- Server → `pytest` in `packages/matrx-utils`.
