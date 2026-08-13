# Tool Registry · MCP Servers (admin)

**Status**: shipped — admin master/detail console + one-click provisioning
**Owner**: tool-registry
**Routes**: `/administration/agents/mcp-servers` (admin)
**Surface**: `matrx-admin/mcp-servers`
  (`features/surfaces/manifests/admin-mcp-servers.manifest.ts`)

## What this is

The admin console for `tool.mcp_server` rows — the connectable Model Context
Protocol servers the platform provisions tools from. Single page, master/detail:
a searchable server list on the left, and for the selected server its sync and
connection-test freshness plus four tabs — Tools (`tool.definition` rows linked
by `managed_by_server_id`), Configs (`tool.mcp_config`), Connected users
(`tool.mcp_user_conn`), and a read-only Metadata dump.

`AddMcpServerDialog` is the one authoring surface: a three-step wizard
(identity → transport & auth → review) whose Provision button calls the
`provision_mcp_server` RPC, inserting the server, an `mcp.<slug>` executor, a
system bundle and a `bundle:list_<slug>` lister tool in one transaction.

## Reads vs writes

Everything about an EXISTING server is **read-only here**. The detail pane
renders `server.description` as a paragraph and the Metadata tab as a `<pre>`;
`mcpAdmin.service.ts` has no `updateServer`, and its one row-level mutator,
`setServerStatus`, is currently called by nothing. The page's real writes are:
`provisionMcpServer` (create), the `tool.mcp_config` CRUD trio, and the two
side-effecting buttons — `refreshServer` (aidream catalog refresh) and
`testMcpServer` (endpoint probe). Editing a registered server's own fields is
**NOT here yet** — see below.

## Agent / surface consumption

`McpServersAdminPage` mounts the `matrx-admin/mcp-servers`
`SurfaceRuntimeProvider`, publishing the server list, the search text, the
selection, and the new-server draft. The per-tab values the manifest declares
(`server_tools`, `server_configs`, `server_connected_user_count`,
`selected_server_active_tab`, `latest_test_result`) are fetched inside the tab
components and do not travel up yet; all are `alwaysAvailable: false`, so they
read as absent rather than wrong.

**One write target, `new_server_draft`** (`mode: "draft"`,
`applyPolicy: "ask"`): stages `{name?, vendor?, category?, description?}` into
the Add-server wizard and opens it, so the admin sees what was staged. Nothing
is created — the admin supplies the slug, transport, endpoint and auth strategy
and presses Provision server.

Those four fields live in `McpServersAdminPage`, not in the wizard, on purpose:
the wizard is unmounted while closed, and it is a modal (so the header Agents
button is `aria-hidden` whenever it is open) — meaning every agent write
arrives with the dialog shut and would otherwise have nowhere to land. The
wizard's own inputs call the page's `patchNewServerDraft`, so a staged value
and a typed one are indistinguishable and the draft survives Escape + reopen.

Deliberately NOT writable: the slug (it becomes the `mcp.<slug>` executor name
agent definitions reference), the endpoint URL, transport and auth strategy
(connection and credential shape), the docs/website URLs, the `is_official`
badge, provisioning itself, and everything on an existing server — Refresh
sync, Test connection, and the `tool.mcp_config` rows including their env
schemas. A refresh, a test or a config save is the admin's own button click and
an agent must never assume one has run.

## NOT here yet

- **No editor for a registered server.** Adding a description field plus an
  `updateServer` service is the obvious next step, and would make an existing
  server's description / category the natural second write target — the shape
  the sibling Tool Registry console (`/administration/agents/mcp-tools`)
  already ships.
- Per-user connection detail (auth status, last used, error count) lives on the
  per-user Connections page.

## Change Log

- **2026-08-13** — **Surface read half completed (`readiness` `partial` →
  `verified`), and a dead tools fetch fixed.** The five per-tab values the
  entry below left unemitted — `server_tools`, `server_configs`,
  `server_connected_user_count`, `selected_server_active_tab`,
  `latest_test_result` — now reach the provider: each tab reports what it
  loaded UP into a ref `getScope` samples at Run (lifting them into page state
  would remount the detail pane mid-fetch), and `null` "not loaded" stays
  distinct from `[]` "none exist" so an agent can tell the two apart.
  `<Tabs>` is controlled now, because the manifest declares the active tab and
  an uncontrolled `defaultValue` meant nobody held the answer. The row→value
  derivation moved into `mcp-servers-scope.ts`. `selected_server` gained the
  PERSISTED `last_test_*` columns the header badge renders (distinct from this
  session's `latest_test_result`) plus `website_url`; `server_configs` gained
  `env_schema` / `notes` / `min_node_version` — the env SCHEMA only (key,
  label, required, secret), never values. **Bug fixed:** `ToolsTab` passed the
  SLUG to `listServerTools`, which filters the uuid column
  `managed_by_server_id` — a leftover from the pre-2026 `${slug}:%` signature —
  so the Tools tab could only ever error or come back empty.

- **2026-08-13** — **Agent-writable: one `new_server_draft` target, plus this
  surface's first `SurfaceRuntimeProvider`.** The authored half of the
  Add-server wizard (name, vendor, category, description) moved from
  `AddMcpServerDialog` up into `McpServersAdminPage` so a surface write can
  reach it while the modal is closed, along with the `provisioning` flag so the
  handler can refuse a write against an insert already in flight. `category` is
  validated against `MCP_SERVER_CATEGORY_VALUES`, derived from the wizard's own
  `CATEGORY_OPTIONS`, so the list the Select renders and the list the handler
  accepts cannot drift. Verified with real Badass Agent runs: one confirm
  dialog carrying the target description verbatim, Apply filling all four
  fields, the draft surviving Escape and reopen, "Keep as is" declining with
  nothing changed, a request to test a connection and rewrite an endpoint URL
  refused with no dialog, and a bad category returning the handler's throw word
  for word with nothing staged. Surface readiness `stub` → `partial`. This file
  was created by that change — the console had no FEATURE.md before.
