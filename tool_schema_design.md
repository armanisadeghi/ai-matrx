# AI Matrx Tool System — Schema Design

**Prefix:** `tool_`
**Status:** Final design, ready for DDL
**Replaces:** The `tl_*` table family

---

## Why this exists

The previous `tl_*` schema accumulated five different inputs to a single routing decision:
`tl_executor.delegated`, `tl_executor_kind.is_client_side`, `tl_executor_kind.client_name`,
`tl_def_surface`, and runtime string-parsing of `server:` / `client:` name prefixes.

This redesign reduces that to two inputs:

1. **Is this executor active for this request?**
2. **Does it have a binding to this tool?**

Everything else falls out of that.

---

## Core concepts and their meanings

These definitions are normative. If code or documentation drifts from them, the code or documentation is wrong.

### Tool
A named, versioned **contract** — input schema, output schema, policy. A tool knows nothing about who runs it. It is pure definition.

### Executor
An **addressable capability provider** — a process, a package, a browser context, an MCP server — that can run tools.
Executors are equal citizens. There is no special "server" category. `matrx-ai-core`, `aidream`, `aidream-light`, `chrome-extension`, `matrx-user`, `mcp.notion` are all executors.

### Binding
The M2M relationship asserting **"this executor can run this tool."** That's its entire job. It carries no routing flags, no priority, no delegation hint. Presence means capability; absence means inability.

### Surface (owned by `ui_*`, consumed by us)
A **page or panel in a client application** — `chrome-extension/assistant`, `matrx-user/chat`. Surfaces are where tools appear and where context values get bound to tool arguments. Each surface has an owning executor; surfaces form their own parent chain independent of executors.

### Client (owned by `ui_*`, consumed by us)
The **application or runtime environment** that hosts surfaces. Chrome extension, Next.js web app, etc. Our schema does not reference `ui_client` directly — the root executor's name conventionally matches the client name, but they are not formally linked.

### Surface defaults
**Per-surface include/exclude rules and argument defaults.** When a request arrives on a surface, surface defaults shape which tools are included by default and which arguments come pre-populated.

### Bundle
A **labeled collection of tools** for convenient batch inclusion in surface defaults. A bundle is not a tool, not an executor, and not part of routing. It's a syntactic shortcut.

### Inheritance — executors
An executor can declare a `parent_executor_name`. The child **unions** the parent's bindings with its own. Used for granular sub-executors (e.g., a chat-page-specific executor that inherits all of `matrx-user`'s tools and adds chat-only tools).

### Inheritance — surfaces
A surface can declare a `parent_surface_name`. Surface defaults walk the chain root → leaf, with each level applying its rules in order. This is owned by `ui_surface` and consumed by us.

---

## Routing decision, end to end

A request arrives carrying: `user_id`, `client_executor_name`, `surface_name`.

```
1. Walk executor inheritance for client_executor_name → client_chain
2. Add server executors active in this deployment → server_set
   (Active-status is a RUNTIME concept — servers register on startup.
    Not a DB column.)
3. Add MCP executors where user has connected status → mcp_set
4. applicable_executors = client_chain ∪ server_set ∪ mcp_set

5. universe = all tools bound to any applicable executor (with both
   tool and binding active)

6. Walk surface inheritance chain root → leaf:
   For each surface with a tool_surface_defaults row:
     a. Remove tools in never_include_tools
     b. Remove tools in members of never_include_bundles
     c. Add tools in always_include_tools (force-include, even if not
        in the executor universe — this is intentional override)
     d. Add members of always_include_bundles (force-include)
     e. Merge arg_defaults into the response

7. Pass to agent layer (out of scope for this schema)
8. Pass to user layer (out of scope for this schema)
```

### Routing when multiple executors can run the same tool

When the agent picks a tool and multiple applicable executors have bindings:

- **Code-level policy decides**, not DB rows. Recommended default policy: client > MCP > server, falling back to server if no client/MCP is available.
- This is intentional. Per-binding `priority` and `delegated` flags were the original mess. Keep policy in one place: the dispatcher.

---

## Tables

### Common columns

All tables we own include these standard columns. They are not repeated in the per-table specs below.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK where applicable (some tables use composite or natural PKs as noted) |
| `created_at` | timestamptz | `default now()`, not null |
| `updated_at` | timestamptz | `default now()`, touched by trigger on update |
| `created_by` | uuid | nullable, references `auth.users(id)` |
| `updated_by` | uuid | nullable |
| `is_active` | boolean | `default true`, not null — soft-disable without delete |
| `version` | integer | `default 1`, not null — incremented on update by trigger |
| `metadata` | jsonb | `default '{}'`, not null — escape hatch for unforeseen extras |

For tables with version-tracking siblings (`tool_def`, `tool_ui`), version snapshots are written to companion `*_version` tables out of scope for this redesign.

---

### `tool_def` — the tool contract

The pure definition. No execution information.

| Column | Type | Notes |
|---|---|---|
| `name` | text NOT NULL UNIQUE | canonical business key, e.g. `web_search`, `mcp.notion.search_pages` |
| `description` | text NOT NULL | LLM-facing |
| `parameters` | jsonb NOT NULL | JSON Schema for arguments |
| `output_schema` | jsonb | JSON Schema for return value |
| `annotations` | jsonb DEFAULT `'[]'` | LLM hints (e.g., examples, anti-patterns) |
| `category` | text | taxonomy bucket |
| `tags` | text[] | search/filter |
| `icon` | text | display |
| `semver` | text DEFAULT `'1.0.0'` | contract version |
| `admin_only` | boolean DEFAULT false | policy |
| `tier` | text | policy (pricing/access) |
| `gating` | jsonb DEFAULT `'[]'` | array of `{gate_name, args}`; gate functions live in code |
| `dedupe_exempt` | boolean DEFAULT false | policy — agent dedup logic skip flag |
| `validation_exempt` | boolean DEFAULT false | policy — schema validation skip flag |
| `source_kind` | text NOT NULL DEFAULT `'native'` | one of: `native`, `mcp_discovered`, `admin_authored`, `agent_authored` |
| `managed_by_server_id` | uuid NULL FK → `tool_mcp_server(id)` | non-null only when `source_kind='mcp_discovered'` |
| `max_client_wait_seconds` | integer | execution timeout hint for clients; null = no hint |
| `tool_group` | text DEFAULT `'core'` | high-level grouping for admin UI |

**Constraints:**
- `source_kind` ∈ {`native`, `mcp_discovered`, `admin_authored`, `agent_authored`} (check constraint)
- When `source_kind = 'mcp_discovered'`, `managed_by_server_id` must be non-null (check constraint)

**Dropped from old `tl_def`:**
- `function_path` — moved out; executors maintain their own internal registries
- `source_app` — replaced by binding to a specific executor
- `privileged` — confirmed dead code
- `deactivated_at` — covered by `is_active` + `updated_at`

---

### `tool_executor` — capability providers

A row per addressable executor. Server executors, client executors, MCP executors — all equal.

| Column | Type | Notes |
|---|---|---|
| `name` | text PK | canonical, e.g. `matrx-ai-core`, `aidream`, `aidream-light`, `chrome-extension`, `matrx-user`, `matrx-user.chat`, `mcp.notion` |
| `description` | text NOT NULL DEFAULT `''` | |
| `parent_executor_name` | text NULL FK → `tool_executor(name)` | enables inheritance |
| `mcp_server_id` | uuid NULL FK → `tool_mcp_server(id)` | non-null iff this executor IS an MCP runtime |
| `config` | jsonb NOT NULL DEFAULT `'{}'` | executor-specific configuration; child overlays parent on resolve |

**Constraints / triggers:**
- Trigger `tool_executor_no_cycle` on INSERT/UPDATE: rejects rows that would create a cycle in `parent_executor_name`.
- Trigger `tool_executor_max_depth` on INSERT/UPDATE: rejects depth > 3 via recursive CTE.

**Inheritance semantics (formal):**
- A child's effective tool set = UNION of (child's `tool_binding` rows, recursively walked parent's `tool_binding` rows).
- Child's effective `config` = parent's `config` deep-merged with child's `config`; child keys win on conflict.
- `mcp_server_id` does NOT inherit. It is an identity attribute.
- Max chain depth: 3.
- Binding conflict (same tool bound to child and parent): child binding wins; parent is shadowed.
- Disabled child binding (`is_active=false`): shadows parent binding. Does NOT fall through to parent.
- Disabled executor (`is_active=false`): excluded from resolution entirely. The chain stops at the disabled node; resolution does NOT skip past it to a grandparent.

**Dropped from old `tl_executor_kind`:**
- `is_client_side` — the existence and nature of the executor row IS the discriminator
- `client_name` — collapsed; root executor name conventionally matches client name
- `payload_schema` — executor code owns its dispatch contract
- `payload_validator_path` — same reason

---

### `tool_binding` — tool ↔ executor M2M

The capability claim. **Pure join.**

| Column | Type | Notes |
|---|---|---|
| `tool_id` | uuid NOT NULL FK → `tool_def(id)` | |
| `executor_name` | text NOT NULL FK → `tool_executor(name)` | |
| PRIMARY KEY | `(tool_id, executor_name)` | |

Plus common fields (`is_active`, `created_at`, `updated_at`, `metadata`, etc.). `is_active=false` is how you temporarily revoke a single binding without losing the row.

**No other columns.** This is intentional. Routing flags do not belong here.

**Dropped from old `tl_executor`:**
- `function_path` — executor maintains its own registry; mismatches between DB and executor code should fail loudly at executor startup
- `source_app` — redundant with executor identity
- `surface` — was misnamed; really meant executor_name, now correctly named
- `priority` — routing rule, not data
- `delegated` — routing rule, not data
- `auto_load` — implicit; if a binding exists, the executor loads it

---

### `tool_surface_defaults` — per-surface include/exclude

One row per surface that has opinions. Surfaces without a row inherit purely from the parent chain.

| Column | Type | Notes |
|---|---|---|
| `surface_name` | text PK FK → `ui_surface(name)` | |
| `always_include_tools` | text[] DEFAULT `'{}'` | tool names — force-include even if not in executor universe |
| `always_include_bundles` | text[] DEFAULT `'{}'` | bundle names |
| `never_include_tools` | text[] DEFAULT `'{}'` | tool names — remove from universe |
| `never_include_bundles` | text[] DEFAULT `'{}'` | bundle names — remove all members |
| `arg_defaults` | jsonb DEFAULT `'{}'` | `{tool_name: {arg_name: value}}` — static defaults |
| `arg_injection` | jsonb DEFAULT `'{}'` | **reserved** for future dynamic binding from `ui_surface_value` |
| `notes` | text | admin notes |

**Why arrays not a row-per-rule table:** This table will have at most ~100 rows total, lists per row are short (single digits), and atomic surface configuration is easier to reason about and version as one document.

**Inheritance walk:** Caller walks `ui_surface.parent_surface_name` chain from root to leaf, applying each level's defaults in order. Child cannot un-do parent's `never_include` — exclusions accumulate. Child can shadow parent's `arg_defaults` per-key.

**Reserved field — `arg_injection`:** Will eventually hold bindings from `ui_surface_value` names into tool argument slots. Example future shape: `{"web_search": {"location": {"$from_surface_value": "current_location"}}}`. Reserved now so we don't have to migrate the column in later. Empty by default; ignored by current resolvers.

---

### `tool_bundle` — labeled tool group

| Column | Type | Notes |
|---|---|---|
| `name` | text NOT NULL UNIQUE | canonical |
| `description` | text NOT NULL DEFAULT `''` | |
| `lister_tool_id` | uuid NULL FK → `tool_def(id)` | optional meta-tool that enumerates this bundle |
| `is_system` | boolean NOT NULL DEFAULT false | system-owned vs user-authored |

PK: `id` (uuid).

---

### `tool_bundle_member` — bundle ↔ tool M2M

| Column | Type | Notes |
|---|---|---|
| `bundle_id` | uuid NOT NULL FK → `tool_bundle(id)` | |
| `tool_id` | uuid NOT NULL FK → `tool_def(id)` | UUID, not name — survives renames |
| PRIMARY KEY | `(bundle_id, tool_id)` | |
| `local_alias` | text | optional rename within this bundle's context |
| `sort_order` | int NOT NULL DEFAULT 1000 | display order |
| UNIQUE | `(bundle_id, local_alias)` where local_alias is not null | |

---

### `tool_mcp_server` — MCP server registry

Carried forward from `tl_mcp_server`. Structurally unchanged; renamed only.

Key columns: `slug` (unique), `name`, `vendor`, `description`, `category` (enum), `endpoint_url`, `transport` (enum), `auth_strategy` (enum), `oauth_scopes`, `oauth_client_id`, `is_official`, `is_featured`, `has_remote`, `has_local`, `supports_mcp_apps`, `status` (enum), `sort_order`, `discovery_ttl_seconds`, sync/test status fields.

Linked from `tool_executor.mcp_server_id` and `tool_def.managed_by_server_id`.

---

### `tool_mcp_config` — install/launch recipes

Carried forward from `tl_mcp_config`. Structurally unchanged.

Key columns: `server_id` FK, `label`, `config_type`, `is_default`, `command`, `args`, `env_schema`, `requires_docker`, `npm_package`, `pip_package`, `min_node_version`, `notes`. UNIQUE `(server_id, config_type)`.

---

### `tool_mcp_user_conn` — user MCP connections

Carried forward from `tl_mcp_user_conn`. Structurally unchanged.

Key columns: `user_id` FK to auth.users, `server_id` FK, `config_id` FK nullable, `provider`, `display_name`, `is_default`, `status` (enum), tokens (encrypted bytea), OAuth fields, error tracking. UNIQUE `(user_id, server_id)` and UNIQUE `(user_id, provider, server_id, display_name)`.

---

## Out-of-scope tables (carried forward, renamed only)

These are real concerns that the redesign does not address. They get the `tool_` prefix to match but their internals are unchanged.

| Old | New | Reason it's out of scope |
|---|---|---|
| `tl_ui` | `tool_ui` | UI component rendering — its own subsystem |
| `tl_ui_incident` | `tool_ui_incident` | UI error tracking — operational, not design |
| `tl_test_sample` | `tool_test_sample` | Test fixtures — operational |
| `tl_def_version` | `tool_def_version` | Version snapshots — out of scope for this redesign |
| (any other version tables) | `tool_*_version` | Same |

## Tables that go away entirely

| Old | Fate |
|---|---|
| `tl_def_surface` | **Dropped.** Replaced by `tool_surface_defaults.always_include_tools` arrays. |
| `tl_gate` | **Dropped.** Gates referenced by name in `tool_def.gating` jsonb; gate functions live in code. Crash loudly on missing gate at registration. |

---

## Requested changes to `ui_*` tables (not ours)

These are additive, nullable, and have been confirmed acceptable by the `ui_*` maintainer.

### `ui_surface.executor_name`
New column: `text NULL REFERENCES tool_executor(name)`.
Encodes the owning executor for each surface. Eliminates surface-name string parsing in the resolver.

### `ui_surface.parent_surface_name`
New column: `text NULL REFERENCES ui_surface(name)`.
Self-FK enabling explicit surface inheritance. Mirrors the executor parent pattern. Surfaces walk this chain root → leaf when resolving defaults.

**Note for `ui_*` owners:** `ui_surface_value` may want the same inheritance semantics (child surface inherits values from parent surface). Worth considering when implementing — symmetric semantics across both subsystems keeps the mental model clean.

---

## Stored procedures (RPC layer)

Built on top of these tables to prevent ad-hoc query drift.

### `tool_resolve_for_request(p_user_id uuid, p_client_executor text, p_surface_name text, p_active_server_executors text[]) returns setof tool_def_resolved`
The full resolution flow above. Returns the tool set with merged `arg_defaults`. `p_active_server_executors` is passed by the orchestrator (which knows which servers are live); the function doesn't infer it.

### `tool_register(p_def jsonb, p_executor_names text[]) returns uuid`
Atomic create of a `tool_def` plus all its bindings in one call. Returns the new tool's UUID. Prevents the partial-state bugs that come from multi-step registration.

### `tool_register_mcp_discovered(p_server_id uuid, p_tool_specs jsonb) returns void`
Bulk upsert for MCP discovery sync. Creates `tool_def` rows with `source_kind='mcp_discovered'` and `managed_by_server_id` set, plus bindings to the MCP server's executor.

### `tool_get(p_name_or_id text) returns jsonb`
Returns full tool detail: definition + bindings + bundle memberships. Accepts either UUID or name.

### `tool_executor_walk_parents(p_name text) returns setof tool_executor`
Returns the parent chain root → leaf for a given executor. Depth-capped at 3.

### `tool_executor_check_cycle(p_name text, p_parent_name text) returns boolean`
Used by the cycle-prevention trigger.

### `tool_surface_walk_parents(p_surface_name text) returns setof ui_surface`
Returns the surface parent chain root → leaf.

### `tool_resolve_bundle(p_bundle_name text) returns setof tool_def`
Returns members of a bundle, used internally by the resolver when expanding `always_include_bundles`.

---

## Migration approach

1. Create all `tool_*` tables alongside existing `tl_*`. No drops.
2. Backfill from `tl_*` to `tool_*` via one-time migration script. Map old data to new shapes; reject rows that can't be mapped cleanly (don't silently lose data).
3. Update code to dual-write briefly to verify backfill stays consistent.
4. Cut over reads to `tool_*`.
5. Stop writes to `tl_*`.
6. Drop `tl_*` tables after a soak period.

The `ui_surface.executor_name` and `ui_surface.parent_surface_name` columns are added as part of step 1.

---

## What this design specifically does NOT do

To prevent scope creep:

- Does not address UI component rendering (`tool_ui`).
- Does not address versioning mechanics (those are companion `*_version` tables, out of scope).
- Does not address test samples or incidents.
- Does not implement dynamic surface-value injection into tool arguments. Reserved as `arg_injection` for future work.
- Does not store live executor presence/heartbeat. That's a runtime concern; the DB stores capabilities, not liveness.
- Does not formalize the `ui_client → root executor` correspondence. They share names by convention. A linter or admin warning could flag mismatches but no FK enforces it.

---

## Anti-patterns to watch for after launch

If any of these creep in, the simplification has been undone:

1. **Adding columns to `tool_binding`.** This table is a pure join. Anything more turns it back into a routing rules table.
2. **Adding `kind` or `category` discriminators to `tool_executor`.** The row's existence and its `mcp_server_id` are the discriminators.
3. **Storing live executor health/heartbeat in the DB.** That's runtime registry territory.
4. **Re-introducing per-tool function paths.** Executors own their internal registries.
5. **Using `metadata` jsonb as a covert second schema.** If a field is real, give it a column.
