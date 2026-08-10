# matrx-frontend Migration Guide — Tool Registry Redesign

> **Historical migration narrative (May 2026).** The names in this document
> describe the pre–June schema transition and are not valid live query targets.
> Current tables are `tool.definition`, `tool.binding`, and
> `tool.surface_defaults`.
>
> Audience: matrx-frontend developers (dashboard, admin UIs, future user-facing UIs).
>
> Companion docs: [TOOL_REGISTRY_REDESIGN.md](TOOL_REGISTRY_REDESIGN.md), [CLIENT_REGISTRATION_GUIDE.md](CLIENT_REGISTRATION_GUIDE.md), [MATRX_EXTEND_MIGRATION_GUIDE.md](MATRX_EXTEND_MIGRATION_GUIDE.md), [MATRX_LOCAL_MIGRATION_GUIDE.md](MATRX_LOCAL_MIGRATION_GUIDE.md), [FRONTEND_TOOL_INJECTION_NOTES.md](FRONTEND_TOOL_INJECTION_NOTES.md).

---

## TL;DR

Migration 0022 added 8 new tables and reshaped how tools, executors, surfaces, and bundles relate. **Most of the dashboard's tool-management UI needs to be rebuilt** to match. There are also five entirely new admin pages to build (MCP servers, bundles, clients, surfaces, executor map). User-facing bundle management is new ground.

This isn't a fast follow — it's a substantial dashboard rebuild. Plan for several PRs over weeks. Until each piece lands, the existing screens (which read directly from the old `tools` / `tool_handlers` / `mcp_servers` tables) keep working through the additive 0022 schema. After Migration 0023 ships (the renames + PK swaps), the dashboard must be on the new shape in lockstep.

---

## What's affected at a glance

| Area | File / route | Status | Action |
|---|---|---|---|
| Tool admin UI | [dashboard/src/routes/_authenticated/tools.tsx](dashboard/src/routes/_authenticated/tools.tsx) | **Rebuild** | Show new dimensions: executors, surfaces, bundles, gating |
| Agent definition tool-config | [dashboard/src/features/agx-explorer/](dashboard/src/features/agx-explorer/) | **Adapt** | Switch to text-PK reads after 0023 rename `tools` → `tl_def` |
| Conversation tool-call timeline | [dashboard/src/features/cx-explorer/](dashboard/src/features/cx-explorer/) | **Adapt** | New column `tool_name_as_called`, table rename `cx_tool_call` → `cx_tl_call` |
| Generic table CRUD | [dashboard/src/features/database/](dashboard/src/features/database/) | **Verify** | ORM proxy auto-picks up new tables; spot-check after 0023 |
| API tester | [dashboard/src/features/api-tester/](dashboard/src/features/api-tester/) | **Extend** | Visualize `client.executors`, `client.state` envelope shapes |
| MCP server admin | *(none today)* | **NEW** | Full page — server list, configs, sync status, OAuth user-conn flows |
| Bundle management | *(none today)* | **NEW** | Admin (system bundles) + user (personal bundles) |
| ui_client / ui_surface management | *(none today)* | **NEW** | Lookup table CRUD with FK awareness |
| Tool ↔ Surface assignment matrix | *(none today)* | **NEW** | M2M editor scoped per tool or per surface |
| Executor kind admin | *(none today)* | **NEW** | Lookup CRUD; rare edits, but visible state is critical |
| matrx-local pairing UI | *(none today)* | **NEW** | Pairing token + WebSocket status indicators |

---

## The new tables you wire dashboards for

After 0022 (additive), and after 0023 (renames). All new tables and the three renamed-and-restructured ones:

### Lookup vocabularies (small, mostly-stable)

| Table (post-0023) | PK | Purpose | Edit frequency |
|---|---|---|---|
| `ui_client` | `name` (text) | Client app vocabulary | Rarely (one row per app) |
| `ui_surface` | `name` (text) | Sub-surface vocabulary, FK → ui_client | Occasionally (when a client adds a feature) |
| `tl_executor_kind` | `name` (text) | Runtimes that can dispatch tools | Rarely (one row per platform / MCP server) |
| `tl_gate` | `name` (text) | Named gate functions referenced by tool gating jsonb | Very rarely (added when matrx-ai ships a new gate) |

### M2M relationship tables

| Table (post-0023) | PK | Purpose |
|---|---|---|
| `tl_executor` (was `tool_handlers`) | `(tool_id, kind)` composite | Which executors can run a tool, with priority and auto_load |
| `tl_def_surface` | `(tool_id, surface_name)` | Tool ↔ Surface design-time inclusion gate |
| `agx_agent_surface` | `(agent_id, surface_name)` | Agent ↔ Surface visibility gate |
| `tl_bundle_member` | `(bundle_id, tool_id)` | Bundle ↔ Tool with per-membership `local_alias` |

### Entity tables (new and renamed)

| Table (post-0023) | PK | Purpose |
|---|---|---|
| `tl_def` (was `tools`) | `name` text | Master tool definition. New columns: `tier`, `gating`, `deactivated_at`. Drops: `source_app`, `tags`. |
| `tl_bundle` | `id` uuid | Bundle entity. New: `is_system`, `created_by`. UNIQUE on `name`. |
| `tl_mcp_server` (was `mcp_servers`) | `slug` text | MCP marketplace. New: `last_synced_at`, `discovery_ttl_seconds`, `last_sync_error`. |
| `tl_mcp_config` (was `mcp_server_configs`) | `(server_slug, label)` composite | MCP per-config variants |
| `tl_mcp_user_conn` (was `mcp_user_connections`) | `id` uuid | Per-user OAuth/API-key connections. UNIQUE: `(user_id, server_slug, config_label)` |
| `tl_ui` (was `tool_ui_components`) | `id` uuid | Tool UI components. New: `surface_name` FK (nullable in 0022, NOT NULL in 0023). UNIQUE: `(tool_name, surface_name)` |

---

## Tool admin UI — full rebuild specifics

The current tools list ([tools.tsx](dashboard/src/routes/_authenticated/tools.tsx)) is a generic table view. It needs to become tool-specific.

### Tool detail view

Show four orthogonal dimensions plus tool-row scalars:

1. **Identity**: canonical name (text PK, e.g. `matrx-extend:take_screenshot`), description, parameters (JSON Schema editor), category (free-text UI tag), tier, semver, version.
2. **Executors** (M2M to `tl_executor_kind` via `tl_executor`):
   - List of executors that can run this tool, with priority (low = preferred).
   - Per-executor: `auto_load` flag (always-on when this executor is declared), `is_client_side` derived from the executor kind.
   - Edit: add/remove executor; reorder priority.
3. **Surfaces** (M2M to `ui_surface` via `tl_def_surface`):
   - Which UIs may expose this tool to an agent.
   - Edit: multi-select against `ui_surface` rows; add or remove with one click.
4. **Bundles** (reverse via `tl_bundle_member`):
   - Read-only list of bundles this tool belongs to (with the `local_alias` each bundle uses for it).
   - Click-through to bundle detail.
5. **Gating** (`tl_def.gating` jsonb):
   - List of `{gate, args}` entries (e.g. `{gate: "is_admin", args: {}}`).
   - Edit: dropdown of `tl_gate` entries + an args form derived from `tl_gate.arg_schema`.

### Tool list filters

- Namespace (parsed from `name` — `split_part(name, ':', 1)`)
- Executor (via `tl_executor` join)
- Surface (via `tl_def_surface` join)
- Bundle (via `tl_bundle_member` reverse)
- Tier (`tl_def.tier`)
- Active / deactivated (`is_active`, `deactivated_at`)

### Tool create/edit form

- Canonical name input: namespace dropdown (admin-only sees all; users only see their own namespace) + local-name text. Validate against the canonical pattern `^[a-z][a-z0-9-]*:[a-zA-Z][a-zA-Z0-9_]*$`.
- Schema editor (JSON Schema for `parameters`).
- Surface multi-select (required: at least one).
- Executor selection (required: at least one).
- Initial bundle membership (optional).

### Strict UX rules

- **Don't expose UUID anywhere users can edit.** Names are PKs now. Show UUIDs only in technical-debug toggles.
- **Renaming a tool is a rare, deliberate action.** Build it in, but behind a confirmation modal — the rename cascades through `tl_executor`, `tl_def_surface`, `tl_bundle_member`, `tl_def_version`, `tl_ui` via `ON UPDATE CASCADE`.
- **Soft-delete by default.** "Delete" sets `is_active=false` + `deactivated_at=now()`. Hard-DELETE is admin-only and shows an "are you sure" with the count of `cx_tl_call` rows that reference the name (which would dangle).

---

## Bundle management UI

This is entirely new ground. Two audiences:

### Admin: system bundles

Admin can:
- Create a `tl_bundle` row with `is_system=true` and `created_by=NULL`.
- Pick a lister tool (`bundle:list_<bundle_name>` per the convention) — auto-create one if it doesn't exist.
- Add / remove members from any namespace (admin's privilege).
- Set per-membership `local_alias` to disambiguate when two members share a local name.
- Manage `metadata` jsonb (admin-only flag, surface-restriction hints, etc.).

### User: personal bundles

User can:
- Create `tl_bundle` row with `is_system=false`, `created_by=<user_id>`.
- Add tools from any namespace they're allowed to read (read access is ungated per decision 41).
- Set local aliases.
- Share their bundle (read access) with other users — a separate share table or simple "public" flag, TBD.
- Edit/delete only their own bundles. Admins can edit/delete any.

### Bundle detail view

- Bundle name (UNIQUE globally, post-0022 schema).
- Lister tool (must exist; auto-created or chosen from existing).
- Description, metadata.
- Member list with: canonical name, local alias, source namespace, executor kind, surface assignments. Sortable.
- Member-add UX: search-by-name autocomplete against `tl_def`, then alias defaults to the local part of the canonical.

### Bundle UX rules

- **Bundle names are globally unique** (decision 42). Show a real-time check on the create form.
- **Local aliases must be unique within a bundle.** Show a clash warning before submit.
- **Listers are auto-generated by convention.** When a user creates a bundle, the system creates `bundle:list_<bundle_name>` automatically. Don't expose lister-management to users — it's behind the scenes.
- **System bundles can't be edited by users**, but they CAN be referenced (e.g. a user adds a system bundle's tools to their own bundle via member-pick).

---

## MCP management UI rebuild

Currently no admin UI for MCP servers. Build one:

### Server list

Columns:
- `slug` (PK after 0023, UNIQUE before)
- `name`, `vendor`, `category`
- `status` (active / beta / deprecated)
- `last_synced_at` (relative time: "5 min ago", "23 days ago" — flag stale ones in red)
- `discovery_ttl_seconds` (display as "5h", "1d")
- `last_sync_error` (truncated, expandable)
- Connected user count (via `tl_mcp_user_conn`)
- Tool count (via `tools` join: `WHERE name LIKE '<slug>:%'`)

Actions:
- **Add server** — opens a form. On submit, calls a backend endpoint that:
  1. Inserts the `tl_mcp_server` row.
  2. Inserts paired `tl_executor_kind('mcp.<slug>')`.
  3. Inserts the auto-managed `tl_bundle` row (system).
  4. Inserts the lister `bundle:list_<slug>` tool row.
  5. Fires a fire-and-forget `sync_server(slug)` task (decision 6).
- **Force refresh** — calls `POST /admin/mcp/<slug>/refresh` → triggers `sync_server(slug, force=True)`.
- **Deactivate** — sets `is_active=false`. Tools from this server become unavailable immediately.

### Per-server detail view

Tabs:
- **Configs** (`tl_mcp_config` rows): list of variants (remote, local-stdio, http) with their auth strategies.
- **Connected users**: anonymized count + pivot table showing user → config → connection-status.
- **Tools**: full list of `tl_def` rows for this server with their bundle membership.
- **Sync log**: chronological list of recent `last_synced_at` updates and any `last_sync_error` events.

### User OAuth flow

For users (not admins), the per-server connection page:
- Shows available configs (`tl_mcp_config` rows for the server).
- For each, "Connect" button:
  - OAuth flow → store encrypted credentials in `tl_mcp_user_conn`.
  - API-key flow → user pastes key → stored encrypted.
- After connection, MCP tools become dispatchable for that user's sessions.

---

## ui_client / ui_surface / executor / gate management

These are lookup tables. Admin-only. Simple CRUD UIs each. Most teams will rarely touch them, but visibility is critical:

- **`ui_client`**: list, create, edit description, deactivate. Show count of surfaces per client.
- **`ui_surface`**: list filtered by client, create with FK to client, edit description, deactivate.
- **`tl_executor_kind`**: list, create, edit description + payload_schema (jsonb editor) + config + is_client_side.
- **`tl_gate`**: list, view function_path + arg_schema. Read-mostly — adding a new gate requires shipping matrx-ai code first.

For all four, a generic table-CRUD view with FK awareness is enough. Reuse [dashboard/src/features/database/](dashboard/src/features/database/) patterns; extend with FK pickers.

---

## matrx-local connection / pairing UI

When matrx-local ships its pairing protocol (PR 4 in [MATRX_LOCAL_MIGRATION_GUIDE.md](MATRX_LOCAL_MIGRATION_GUIDE.md)), the dashboard needs:

### User pairing flow

1. User visits "Connect matrx-local" page.
2. They install / launch matrx-local on their machine.
3. matrx-local displays a pairing token (or accepts one from the dashboard).
4. User enters the token in the dashboard.
5. Dashboard establishes a WebSocket to matrx-local through the platform's relay (or directly if both are local).
6. matrx-local sends executor declarations: `{"executors": ["matrx-local.bridge", "matrx-ai.core"], "state": {...}}`.
7. Dashboard adds these to the user's session executor set.

### Status indicators

- Per-user dashboard banner: "matrx-local connected" / "disconnected".
- Per-tool runtime indicator: when a tool requires `matrx-local.bridge` and the user isn't paired, show "needs matrx-local" badge instead of letting the agent attempt to call it.
- Reachability check: ping the WebSocket every N seconds; reflect last-seen-time on the indicator.

### Reconnection

- On dashboard reload, attempt to re-establish using a stored pairing record.
- On matrx-local restart, the same pairing record is reused (no new token needed).

---

## Conversation tool-call timeline updates

The `cx_tool_call` table (renamed to `cx_tl_call` in 0023) gains a column from 0022:

```sql
ALTER TABLE public.cx_tool_call
  ADD COLUMN tool_name_as_called text;
```

The existing `tool_name` column stores the **canonical** name (`matrx-extend:take_screenshot`); the new `tool_name_as_called` stores what the AI actually called it (`forms:fill_form` if loaded via a bundle, or the canonical if loaded directly).

In [cx-explorer](dashboard/src/features/cx-explorer/):
- Default display: `tool_name_as_called` (what the AI used).
- Tooltip / detail: `tool_name` (canonical).
- Filter / search: by either.
- Aggregation queries (e.g. "most-called tools"): use canonical for grouping.

Backwards-compat note: rows older than 0022 have `tool_name_as_called = NULL`. Treat NULL as "same as canonical" in display logic.

---

## Backwards-compatibility window — between 0022 and 0023

Migration 0022 is **additive**. The old tables (`tools`, `tool_handlers`, `mcp_servers`, `cx_tool_call`, `tool_ui_components`) all still exist with their original names and schemas; new columns + tables ride alongside.

- **During this window**, dashboard code should keep reading from the old table names. New admin UIs (bundles, surfaces, executor kinds) read from the new tables. Both coexist.
- **0023 deploy is single-shot**: all tables rename in one transaction; client code switches in lockstep. Schedule a brief maintenance window or coordinate the rollout.
- **After 0023**: remove all references to the old names. They no longer exist.

If the dashboard code uses an ORM proxy that introspects the schema, the rename is automatic for read paths — but write paths and explicit JOINs need code changes.

---

## Suggested PR sequence

1. **PR 1 — Lookup CRUDs**: ui_client, ui_surface, tl_executor_kind, tl_gate. Simple. Useful for admins immediately.
2. **PR 2 — Tool admin rebuild**: detail view + filters + create/edit form. The biggest piece; can be split into tabs.
3. **PR 3 — Bundle management** (admin first): system bundle CRUD + lister auto-create + membership editor.
4. **PR 4 — Bundle management** (user-facing): personal bundle UX, share semantics, alias overrides.
5. **PR 5 — MCP server admin**: server list + add/refresh/deactivate + per-server detail.
6. **PR 6 — MCP user OAuth**: per-user connection flow.
7. **PR 7 — Conversation timeline updates**: `tool_name_as_called` column wiring.
8. **PR 8 — matrx-local pairing UI**: depends on matrx-local PR 4 (pairing protocol).
9. **PR 9 — 0023 cutover**: switch all reads/writes to renamed tables. Single-deploy.

---

## Verification checklist

For the rebuild as a whole:

- [ ] All four orthogonal dimensions (identity, executor, surface, bundle) visible from the tool detail view.
- [ ] Bundle membership round-trips correctly: create bundle → add tool → load tool via lister at runtime → tool fires.
- [ ] MCP server add UX fires `sync_server` background task; tools become dispatchable shortly after.
- [ ] Conversation timeline shows both canonical and as-called names where they differ.
- [ ] No frontend code references `source_app` or `tool_type=EXTERNAL_HANDLER` after 0023.
- [ ] No frontend code references `register_capability` or the bundled JSON catalog files.
- [ ] User bundles can mix tools from multiple namespaces (matrx-extend + matrx-local + supabase MCP) and dispatch correctly.
- [ ] matrx-local pairing flow works end-to-end with at least one matrx-local-only tool dispatched and returning a result.

---

## Reference queries

The dashboard's data-fetching layer can build on these. All assume post-0022, pre-0023 (current state). Adjust table names after 0023.

```sql
-- All tools available on a given surface
SELECT t.name, t.tier, t.admin_only, t.gating
FROM public.tools t
JOIN public.tl_def_surface s ON s.tool_id = t.id
WHERE s.surface_name = 'web-ui/code-editor'
  AND t.is_active = true
ORDER BY t.name;

-- All bundles a tool belongs to (with bundle's lister + the tool's local alias)
SELECT b.name AS bundle, b.is_system, lister.name AS lister, m.local_alias
FROM public.tl_bundle_member m
JOIN public.tl_bundle b ON b.id = m.bundle_id
LEFT JOIN public.tools lister ON lister.id = b.lister_tool_id
WHERE m.tool_id = '<tool_uuid>'
ORDER BY b.name;

-- Tools-by-namespace breakdown for a dashboard summary tile
SELECT
  split_part(name, ':', 1) AS namespace,
  count(*) AS tool_count,
  count(*) FILTER (WHERE is_active) AS active_count
FROM public.tools
WHERE name LIKE '%:%'
GROUP BY namespace
ORDER BY tool_count DESC;

-- MCP servers needing refresh (cache stale)
SELECT slug, name, last_synced_at,
       extract(epoch from (now() - last_synced_at))::int AS staleness_seconds,
       discovery_ttl_seconds
FROM public.mcp_servers
WHERE last_synced_at IS NULL
   OR extract(epoch from (now() - last_synced_at)) > discovery_ttl_seconds
ORDER BY last_synced_at NULLS FIRST;
```
