# Tool Registry · Bundles

**Status**: shipped — admin management + agent picker
**Owner**: tool-registry
**Routes**: `/administration/bundles` (admin)

## What this is

A bundle is a labeled group of tools (`tool_bundle` + `tool_bundle_member`)
with an optional **lister tool** (`bundle:list_<name>` — a real `tool_def` row
referenced by `tool_bundle.lister_tool_id`). Adding a bundle to an agent costs
**one tool slot**: the model sees the lister, calls it, and the backend swaps
in the members on the next turn — far less context than N raw tools.

Two shapes, and callers must handle both:

- **Lister bundle** (`lister_tool_id` set) — adding it adds the single lister
  UUID. MCP-server bundles (`metadata.server_slug`, auto-managed) discover
  their members at runtime, so `tool_bundle_member` is empty until first sync.
- **Static bundle** (`lister_tool_id` null, e.g. `agent-core`) — adding it adds
  every member `tool_def` UUID directly.

System bundles (`is_system=true`, no owner) and personal bundles
(`is_system=false`, `created_by=auth.uid()`) share every view; a badge
distinguishes them.

## Entry points

- Admin page: [app/(admin)/administration/bundles/page.tsx](../../../app/(admin)/administration/bundles/page.tsx) → [BundlesAdminPage.tsx](./components/BundlesAdminPage.tsx)
- Service — the one primitive, reads + writes: [services/bundles.service.ts](./services/bundles.service.ts)
- Agent picker — the "Bundles" category in the agent tools manager: [AgentBundlesPanel.tsx](../../agents/components/tools-management/AgentBundlesPanel.tsx) via [useAgentBundleOptions.ts](../../agents/components/tools-management/useAgentBundleOptions.ts)

## Agent / surface consumption

`listAgentBundleOptions()` (in the service) is the canonical read for any bundle
picker. Each addable bundle carries its `members` (names for the included-tools
list), `memberCount`, `isMcp`/`serverSlug`, and **`contributedToolIds`** — the
exact `tool_def` UUID(s) to toggle on the target (`[lister]` for lister
bundles, the member ids for static). Callers never branch on shape; they add or
remove `contributedToolIds`.

- **Excluded from the picker**: shared-lister bundles (>1 bundle on one lister —
  today the 14 browser bundles sharing `load_browser_tools`). They're facets of
  one runtime loader, not independently addable; `load_browser_tools` itself
  still appears in normal tool browsing.
- **Overlap flagged**: the agent picker marks member tools the agent already
  added individually — fine to do, but surfaced so it isn't an accident.
- **No agent-side special-casing**: persistence is identical to any tool — the
  UUID lands in `agx_agent.tools`, and the backend's `canonical_tool_names`
  resolves a lister to `bundle:list_<name>`. At runtime the model calls the
  lister → `tool_resolve_bundle` RPC expands it → members swap in.

## Reads vs writes

- **Reads stay client-side** — `tool_bundle` / `tool_bundle_member` have a
  public SELECT policy (`qual=true`). `listBundles`, `listBundleMembers`, and
  `listAgentBundleOptions` use the browser client.
- **Writes go through admin-gated API routes** (service client) — both tables
  are RLS read-only for users. See `app/api/admin/bundles/**`.
- **Bundle creation**: `create_bundle_with_lister` RPC (via
  `createBundleWithLister`) — atomic insert of bundle + lister link + members,
  keyed by tool *name*. Personal bundles require an authed user; system bundles
  use service_role.

## Admin page scope

- List with filter (active / all) + search.
- Edit identity (name, description, active toggle), metadata jsonb.
- Add/remove members; inline `local_alias` edit (Save surfaces only when dirty).

## NOT here yet

- **Hard-delete**: bundles are FK targets via `tool_bundle_member`; soft-delete
  via the active toggle is the safe path.
- **Standalone personal-bundle manager** under `/bundles`: users consume
  bundles in the agent picker today; a dedicated management surface is pending.

## Conventions

- `confirm()` from `@/components/dialogs/confirm/ConfirmDialogHost` for
  destructive flows (member removal).
- No barrel files; direct imports.
- `tool_bundle.name` is UNIQUE backend-side; duplicates fail at save with a
  Postgres error surfaced via toast.

## Change Log

- **2026-06-21** — Agent tools manager gains a **Bundles** category
  (`AgentBundlesPanel` + `useAgentBundleOptions`), split into **Internal / MCP /
  All** tabs (Internal default; classified by `isMcp` = `metadata.server_slug`)
  so our own toolkits aren't buried under MCP servers. Bundle listers
  (`bundle:list_*`) pulled out of raw tool browsing — they were masquerading as
  an "mcp" category — into their own category; each card lists its included
  tools and flags overlap with individually-added tools. New
  `listAgentBundleOptions()` service primitive (shape-agnostic
  `contributedToolIds`). Verified end-to-end: lister UUID persists to
  `agx_agent.tools`, agent runs, `tool_resolve_bundle` expands the members.
- **2026-05-05** — Phase 3 shipped. Initial admin bundle page + service.
