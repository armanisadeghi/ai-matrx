# Tool Registry — Gap Analysis & Roadmap

> **Historical gap snapshot (2026-05-05).** Retired names below describe the
> pre–June registry and must not be used for live queries. Current tables are
> `tool.definition`, `tool.binding`, and `tool.surface_defaults`.

**Author**: 2026-05-05 emergency-restoration follow-up
**Scope**: every gap I can identify in the post-0023 Tool Registry system relative to "complete and production-grade"
**Status of bedrock**: app boots, every legacy table reference (frontend + server-side RPCs) repointed, 5 admin pages shipped (`/admin/lookups`, `/administration/agents/mcp-tools`, `/admin/bundles`, `/admin/mcp-servers`, `/admin/surfaces`)

---

## 0. What just happened (so this doc has context)

While preparing this gap analysis I uncovered and fixed a hidden production bug the user reported:

> *"Failed to fetch MCP catalog. Relation 'mcp_servers' does not exist."*

Phase 0 of the migration sprint repointed every **frontend** call from legacy table names to the new ones. What I missed at the time: **14 server-side Postgres RPCs and triggers** still had legacy names baked into their SQL bodies. Because the frontend calls `supabase.rpc('get_mcp_catalog_for_user')` rather than reading the table directly, the failure wasn't visible in any Phase-0 grep — the function name was correct, the body was broken.

Three migrations today:

| Migration | Fixed |
|---|---|
| `repoint_legacy_rpcs_to_new_tables` | `get_mcp_catalog_for_user`, `get_mcp_credentials`, `disconnect_mcp_server`, `upsert_mcp_connection`, `cx_fork_conversation`, `cx_soft_delete_conversation`, `get_cx_conversation_bundle` |
| `repoint_promote_version_tool_branches` | `promote_version` (tool + tool_ui_component branches) |
| `repoint_legacy_version_rpcs_and_triggers` | `get_version_history`, `get_version_snapshot`, `purge_old_versions`, `trg_tool_ui_comp_create_v1`, `trg_tool_ui_comp_snapshot_version` |
| `repoint_tool_list_rpcs_to_tl_def` | `get_tool_detail`, `get_tools_list`, `get_tools_metadata` |

A particularly insidious one: the two `trg_tool_ui_comp_*` triggers fire on every `tl_ui` insert/update. Their bodies wrote to `tool_ui_component_versions` (renamed to `tl_ui_version`). Every UI-component admin save had been silently failing since 0023 shipped — the route wrapper caught the error in `error.details` and surfaced "Failed to create" in the toast, but tracing it back required reading the trigger body.

**Final sweep** of `pg_proc` for legacy table targets in any function body: **zero hits.** Every consumer (frontend, RPC, trigger) now points at the post-0023 schema.

---

## 1. Severity scale

I tag every gap with one of:

- **P0** — actively broken, missing functionality the user can't ship without, or a known bug
- **P1** — admin productivity at scale (we have 102 surfaces, 380 tools, 38 MCP servers, 52 bundles — UIs that handled "1 or 2 of each" don't cut it)
- **P2** — operational excellence: telemetry, audit, recovery, debuggability
- **P3** — quality-of-life polish

Effort (rough): **S** = afternoon, **M** = day, **L** = multi-day, **XL** = needs design + backend coordination.

---

## 2. MCP server administration (user's #1 concern)

> *"we don't have a full administration system in place for managing all of our available MCP servers."*

Current state ([/admin/mcp-servers](../app/(authenticated)/admin/mcp-servers/page.tsx)): list view, sync-freshness chips, "Refresh sync" button, 4 tabs (Tools, Configs, Connected Users, Metadata). Read-mostly.

| # | Gap | Severity | Effort | Backend? |
|---|---|---|---|---|
| 1 | **No "Add new MCP server" flow.** Admins must currently `INSERT INTO tl_mcp_server …` by hand and remember to also create the paired `tl_executor_kind('mcp.<slug>')` row, the system bundle, and the lister tool. The plan called this out as a 5-step provisioning chain that should be one click. | **P0** | XL | Yes — RPC `provision_mcp_server(args)` to do all 5 inserts in one transaction |
| 2 | **No connection testing.** See §3 — the user's other top concern, called out separately because it's a feature in itself. | **P0** | L | Yes — backend test endpoint |
| 3 | **No config CRUD.** The "Configs" tab displays `tl_mcp_config` rows but is read-only. Admins can't add a new transport variant (e.g. "stdio config for local dev") without SQL. | **P1** | M | No |
| 4 | **No "test config before save"** when adding/editing a config. A stdio config with the wrong npm package name silently breaks downstream tool dispatch. | **P1** | L | Yes — same test endpoint as #2, scoped per-config |
| 5 | **No tool-sync diff preview.** When `Refresh sync` runs, admins can't see *what* changed (tools added / removed / signature-changed). Today they get success/error only. | **P1** | M | Yes — RPC returns diff |
| 6 | **No detailed sync history.** `last_synced_at` and `last_sync_error` are scalars on the server row — no log of past attempts. If syncs are flapping, there's no way to see it. | **P2** | M | Yes — new `tl_mcp_sync_log` table |
| 7 | **Connected users tab shows aggregate count only.** Admin can't see *which* users are connected, when their last successful auth was, or how many errors each has. (Admin-visible by design — privacy is preserved by RLS / scoped queries.) | **P1** | M | No (RPC exists; UI just needs to display) |
| 8 | **No force-disconnect.** If a server's OAuth scopes change and existing tokens are insufficient, admins can't proactively expire user sessions. | **P1** | S | No |
| 9 | **Bulk operations** — activate/deactivate, refresh-sync, delete — across selected servers. With 38 servers and growing, this scales poorly. | **P2** | S | No |
| 10 | **No server templates.** Adding a new server roughly fits 4 patterns (HTTP+OAuth, HTTP+API key, SSE+OAuth, stdio+env). Templates would prefill the create form. | **P2** | S | No |
| 11 | **Soft-delete server.** Setting `status='deprecated'` exists; UI doesn't expose it cleanly with a "what will break?" preview (count of dependent connections + bundle members). | **P1** | S | No |
| 12 | **OAuth client management.** `oauth_client_id` + `oauth_scopes` on the server row are editable today, but there's no flow to *register* a new OAuth app with the upstream provider from inside the admin. (Probably stays a manual step — flagging for completeness.) | **P3** | XL | N/A |

---

## 3. MCP connection testing (user's #2 concern, broken out)

> *"MCP servers require specific connections, and these need to be testable. It would be great to include testing capabilities within the admin system so administrators can verify connections directly."*

Current state: zero. There is no way to test a connection from the admin UI. The only signal is the `last_sync_error` text from whatever scheduled sync the backend runs.

What "testing" should mean — three orthogonal levels:

### 3a. Per-server test (does this server's *catalog* work?)

- Spawn a connection per the default config (or a chosen config)
- Call MCP `tools/list`
- Return: success, latency, tool count, raw response, structured error if any

UI: a "Test connection" button on the server detail page that opens a result drawer showing the response, with the option to "Save these tools as the new catalog" (effectively force-sync).

**Effort**: L (frontend) + L (backend RPC `test_mcp_server(p_server_id, p_config_id)` + dispatcher invocation).

### 3b. Per-config test (does this *transport variant* work?)

Same as 3a but scoped to a specific `tl_mcp_config` row. Useful when an admin is editing a config and wants to verify before saving. The "Test config" button goes inline in the config form.

**Effort**: S on top of 3a (same endpoint, different parameters).

### 3c. Per-user-connection test (does *this user's auth* still work?)

- Pull the user's `tl_mcp_user_conn` row
- Decrypt token via `get_mcp_credentials`
- Try a no-op request (e.g. `tools/list`)
- If 401: trigger refresh-token flow
- Update `error_count` / `last_error` accordingly

UI: per-user-connection page (Phase 6 = `/settings/integrations`) gets a "Test connection" button next to each connected server. On the admin side, the per-server detail's "Connected users" tab gets a column "Last verified".

**Effort**: M (frontend, both surfaces) + M (backend, similar to 3a but with token-refresh fallback).

### 3d. Health dashboard

A separate top-level admin page summarizing: which servers haven't been tested in N days; which have current errors; latency trends. Optional but high-value for ops.

**Effort**: M, depends on 3a + a `tl_mcp_test_result` table to persist test outcomes.

**Recommended sequencing**: 3a ships first (single-server test), then 3b (free with the RPC), then 3c (per-user), then 3d (only if ops actually wants the dashboard — could replace it with a simple "stale > 24h" filter on the existing list view).

---

## 4. Tool admin (the central management interface the user mentioned)

Current state ([/administration/agents/mcp-tools](../app/(authenticated)/(admin-auth)/administration/agents/mcp-tools/)): list (`McpToolsManager`), detail with the new Registry tab covering Executors / Surfaces / Bundles / Gating, edit form, UI-component editor, incidents page.

| # | Gap | Severity | Effort | Backend? |
|---|---|---|---|---|
| 1 | **No tool execution preview.** Admins can't run a tool with sample inputs from inside the admin to verify the dispatcher actually works. (`ToolTestSamplesViewer` shows historical samples but doesn't let you run new ones.) | **P1** | L | Maybe — backend endpoint to dispatch a test call |
| 2 | **No "where used" view per tool.** The Registry tab shows surfaces and bundles but doesn't list the *agents* whose `agx_agent.tools[]` contains this tool's id, nor recent `cx_tl_call` invocations. | **P1** | M | No (joins exist; just need the RPC) |
| 3 | **No bulk operations on the list view.** Activate/deactivate, change tier, retag — currently one row at a time. With 380 tools that's painful. | **P1** | S | No |
| 4 | **No tool deprecation lifecycle.** Soft-delete via `is_active=false` is the only flag. There's no "this tool is deprecated, use `<replacement>` instead" link, no automatic agent migration, no rollout-to-deactivation timeline. | **P2** | L | Yes — add `deprecation_replacement_tool_id`, `deprecation_message`, `deprecation_at` columns |
| 5 | **No tool catalog import.** When matrx-extend ships 20 new tools, an admin has to wait for the backend sync to pick them up, or insert manually. Direct import from a JSON catalog file would close the loop. | **P2** | L | Yes — `import_tool_catalog(jsonb)` RPC |
| 6 | **No performance metrics per tool.** Aggregate `cx_tl_call` data — avg duration, error rate, cost, P95 — should be a tab on the tool detail. | **P2** | M | Maybe — could be done in JS or as an RPC for performance |
| 7 | **No tool examples gallery.** Test samples exist as a tab but aren't curated for "show me one good call" — admins navigating new tools want to see canonical examples. | **P3** | S | No |
| 8 | **List filters incomplete.** The McpToolsManager has category/source_app/tags filters from the legacy era; the Registry-tier filters (tier, executor, surface, bundle) aren't on the list view. | **P1** | M | No |
| 9 | **No global search across tools.** Admin must navigate to the right page first. A `/admin/search` would help, scoped to tools / agents / bundles / surfaces / mcp-servers. | **P2** | M | No |
| 10 | **Tool list virtualization.** 380 rows render fine; at 1000+ the page will get slow. Worth flagging now. | **P3** | M | No |

---

## 5. Bundle admin

Current state ([/admin/bundles](../app/(authenticated)/admin/bundles/page.tsx)): list, detail with identity edit + member CRUD + alias edit + metadata jsonb editor. Members are searchable.

| # | Gap | Severity | Effort | Backend? |
|---|---|---|---|---|
| 1 | **Bundle creation is missing entirely.** Plan Phase 3 deferred this because it requires the lister auto-create. Without it, admins have to insert bundle + lister tool in SQL. | **P0** | L | Yes — RPC `create_bundle_with_lister(name, description, member_tool_ids[])` |
| 2 | **Lister auto-create doesn't exist.** Even existing 52 bundles often have `lister_tool_id = NULL`. Either listers are dynamic at runtime (no issue) or they're snapshot-based and currently broken. Worth confirming with backend. | **P1** | M | Backend |
| 3 | **Lister source code preview.** Admin can't see the SQL/code the lister tool runs — they have to navigate to the tool admin and read it. Embed the lister body inline on the bundle detail. | **P2** | S | No |
| 4 | **Bundle templates.** Common bundle shapes (one per category: "Search tools", "Browser DOM tools", "AI tools", "Code editing tools") could be one-click templates that prefill members. | **P2** | M | No |
| 5 | **Bulk member operations.** "Add the entire `category=ai` set" or "Remove all deactivated members." | **P2** | S | No |
| 6 | **Personal bundle sharing.** Plan Phase 4 mentioned `tl_bundle_share` table; doesn't exist yet. Personal bundles can't be shared with other users. | **P2** | M | Yes — new table or `is_public` flag |
| 7 | **Bundle execution preview.** Show what tools an agent gets when loading this bundle — combining local aliases, surface restrictions, and executor availability. | **P2** | M | No |
| 8 | **`tl_bundle_member` lacks `is_active`** so removal is hard delete. Verifier flagged this; backend would need to add the column. | **P3** | S | Yes |

---

## 6. Surface admin

Heavily addressed in v2 + v2.1 ([/admin/surfaces](../app/(authenticated)/admin/surfaces/page.tsx)). What's still missing:

| # | Gap | Severity | Effort | Backend? |
|---|---|---|---|---|
| 1 | **`agx_agent_surface` is empty.** Zero rows. The agent shortcuts feature still uses the legacy `enabled_features` jsonb on `agx_shortcut`. Phase 8 was deferred; until done, "Agents visible here" in the surface drawer always shows zero. | **P1** | L | Hybrid — backend backfill + frontend wiring |
| 2 | **No route validation.** A surface name like `matrx-user/notes` could correspond to a real route or not. The admin has no signal. We could intersect surface names with the static route registry at build time. | **P3** | M | No |
| 3 | **No drag-reorder for sort_order.** Currently editable as a number; drag would be more obvious. | **P3** | M | No |
| 4 | **Surface usage graph.** Visualization of "tools × agents × surfaces" as a sankey would be useful for understanding tool coverage at a glance. | **P3** | L | No |

---

## 7. Cross-cutting infrastructure (the things every admin app eventually needs)

| # | Gap | Severity | Effort | Backend? |
|---|---|---|---|---|
| 1 | **No admin audit log.** Who changed what, when? RLS gives us *current* state but no history. Critical for incident response. | **P2** | L | Yes — new `tl_admin_audit_log` table + triggers on each admin-facing table |
| 2 | **No global search.** `/admin/search?q=…` returning hits across tools, agents, bundles, surfaces, MCP servers. | **P2** | M | No |
| 3 | **No metrics dashboard.** Aggregate telemetry from `cx_tl_call`: most-used tools, slowest, costliest, error-prone. Today there's `/administration/chat/cx-dashboard` but it's general-purpose, not registry-focused. | **P2** | L | No |
| 4 | **No environment switcher.** Admins might want to operate against staging without leaving the admin UI. Today they `git checkout` a different branch. | **P3** | XL | Yes |
| 5 | **No registry export / import.** A JSON dump of `tl_def` + `tl_executor` + `tl_def_surface` + `tl_bundle` + `tl_bundle_member` + `tl_mcp_server` would let admins clone a registry between environments or recover from disaster. | **P2** | M | No (just a big query + JSON) |
| 6 | **No activity feed.** Admin homepage doesn't show recent admin actions — would help when teams collaborate. | **P3** | M | Backend (depends on audit log) |
| 7 | **No documentation embedding.** Concepts like "executor kind", "tier", "gating" deserve inline explanations / doc links — newer admins ask "what's this for?". Could be a tooltip system on the Registry tab. | **P3** | S | No |
| 8 | **RLS policy auditor.** Spot-check tool — pick a row and verify RLS scopes correctly. Likely a backend page since RLS reasoning needs `service_role`. | **P3** | L | Backend |

---

## 8. Phase 8 follow-through (agent shortcut surfaces)

Originally deferred during the migration sprint with the rationale "shortcuts work fine on the legacy `enabled_features` enum." Worth its own row now because the verifier flagged it and `agx_agent_surface` being empty makes the surface admin's "Agents visible" always zero:

- **Backend backfill**: For each `agx_shortcut.enabled_features[]` array element, insert one `agx_agent_surface` row mapping to `matrx-user/<feature>`.
- **Frontend**: `ShortcutContextsPicker` reads from `ui_surface` rows scoped to `matrx-user/*` and writes to `agx_agent_surface`.
- **Migration shim**: dual-read for one release window, then drop the column.

**Severity**: P1. **Effort**: L. **Backend**: yes (backfill).

---

## 9. Things that are broken but invisible

These showed up while writing this doc. Fix list:

1. **`promote_version` for tool / tool_ui_component** was previously failing — fixed today.
2. **`trg_tool_ui_comp_*` triggers** were silently failing every `tl_ui` write — fixed today.
3. **52 existing bundles** mostly have `lister_tool_id = NULL`. Either the lister concept is dynamic (safe) or the migration didn't backfill them. Confirm and fix as part of bundle creation work.
4. **`agx_agent_surface` empty.** Documented above as Phase 8 follow-through.
5. **`tl_bundle_member.is_active` doesn't exist.** Bundle member removal is hard-delete; can't be undone without re-adding. Backend should add the column or accept the constraint.

---

## 10. Recommended sequencing

If we're trying to ship this in the right order to maximize unblocking:

### Wave 1 — unblocks daily admin work (1–2 weeks)
1. **MCP `provision_mcp_server` RPC + add-server wizard** (§2.1) — unblocks adding new MCP servers without SQL
2. **MCP connection testing — server level** (§3a) — closes the visibility gap, lets admins actually verify their work
3. **Bundle creation with auto-lister** (§5.1) — unblocks bundle work that's been frozen
4. **Tool list bulk operations** (§4.3) — scaling pain at 380 rows

### Wave 2 — operational excellence (1–2 weeks)
5. **MCP config CRUD** (§2.3, 2.4) — lets admins manage transport variants
6. **MCP per-config and per-user connection testing** (§3b, 3c)
7. **MCP sync log + diff** (§2.5, 2.6)
8. **Tool "where used" view** (§4.2)
9. **Tool list filter parity with Registry tab** (§4.8)

### Wave 3 — agent shortcut wiring + telemetry (1–2 weeks)
10. **Phase 8 follow-through** (§8) — agx_agent_surface backfill + picker rewire
11. **Admin audit log** (§7.1)
12. **Tool performance metrics tab** (§4.6)

### Wave 4 — polish (ongoing)
13. Templates (server, bundle), import/export, search, health dashboard, documentation embedding.

---

## 11. Backend changes called out

Anything that needs schema or RPC work (i.e. backend coordination, not just frontend):

| Item | Type | What |
|---|---|---|
| `provision_mcp_server` | New RPC | 5-step provisioning in one transaction |
| `test_mcp_server`, `test_mcp_config`, `test_user_mcp_connection` | New RPCs | Live connection testing |
| `tl_mcp_sync_log` | New table | Per-sync history |
| `tl_mcp_test_result` | New table or columns | Persisted test outcomes |
| `create_bundle_with_lister` | New RPC | Bundle + lister in one transaction |
| `tl_bundle_share` | New table | Personal bundle sharing |
| `tl_bundle_member.is_active` | New column | Soft-delete |
| Lister backfill for 52 existing bundles | One-off migration | Optional |
| `agx_agent_surface` backfill from `agx_shortcut.enabled_features` | One-off migration | Phase 8 |
| `tl_def.deprecation_replacement_tool_id`, `deprecation_message`, `deprecation_at` | New columns | Tool deprecation lifecycle |
| `tl_admin_audit_log` | New table + triggers | Audit trail |
| `tool_where_used(p_tool_id)` | New RPC | Returns agents + recent calls |
| `import_tool_catalog(jsonb)` | New RPC | Tool catalog import |

---

## 12. Closing notes

The system is **functionally restored** as of this doc — every legacy reference (frontend or server-side) is gone, every admin page that existed before the rename works again, and 5 new admin pages cover the ground the migration introduced. The bug the user reported (MCP catalog) is fixed and was the visible tip of an iceberg of 14 broken server-side functions that have all been repaired.

What's listed here as "gaps" are **not bugs** — they're the difference between *the system works* and *the system is the right tool for an admin team scaling tools, agents, MCP servers, and surfaces*. Wave 1 (MCP provisioning + connection testing + bundle creation + tool bulk ops) is the highest-leverage next chunk. Everything else is fillable as the team uses what's there and notices specific friction.

I'd recommend the team also confirms the `lister_tool_id` situation on existing bundles before doing bundle work in Wave 1 — that's the single biggest "is the runtime even using listers, or are they snapshot-based and quietly broken" question I can't answer from outside.
