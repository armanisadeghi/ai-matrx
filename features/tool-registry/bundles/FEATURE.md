# Tool Registry · Bundles

**Status**: shipped — admin management + agent picker
**Owner**: tool-registry
**Routes**: `/administration/agents/bundles` (admin)

## What this is

A bundle is a labeled group of tools (`tool_bundle` + `tool_bundle_member`)
behind a **lister tool** (`bundle:list_<name>` — a real `tool.definition` row, bound to
the `matrx-ai-core` bundle_lister executor, referenced by
`tool_bundle.lister_tool_id`). Adding a bundle to an agent costs **one tool
slot**: the model sees only the lister, calls it, and the backend swaps in the
members on the next turn — far less context than N raw tools.

**Invariant: every bundle has a lister.** `tool_bundle.lister_tool_id` is
`NOT NULL` and creation auto-wires it (see Reads vs writes), so a bundle ALWAYS
reduces to one tool. Adding any bundle contributes exactly its lister UUID —
never the raw members. The only difference between bundles is where the members
come from:

- **MCP-server bundles** (`metadata.server_slug`, auto-managed) discover their
  members at runtime, so `tool_bundle_member` is empty until first sync.
- **Internal bundles** record their members in `tool_bundle_member`; the lister
  resolves them via `tool_resolve_bundle`.

System bundles (`is_system=true`) and personal bundles (`is_system=false`,
`created_by=auth.uid()`) share every view; a badge distinguishes them.

> The 14 browser bundles (`chrome`, `reading`, `devtools`…) instead share one
> lister, `load_browser_tools` — a permission-aware Chrome-extension discovery
> tool (filters admin-only / ungranted / desktop-gated tools). It's a deliberate
> separate mechanism, NOT a casualty; the agent picker hides shared-lister
> bundles. Reworking them into per-bundle listers is deferred.

## Entry points

- Admin page: [app/(admin)/administration/agents/bundles/page.tsx](../../../app/(admin)/administration/agents/bundles/page.tsx) → [BundlesAdminPage.tsx](./components/BundlesAdminPage.tsx)
- Service — the one primitive, reads + writes: [services/bundles.service.ts](./services/bundles.service.ts)
- Agent picker — the "Bundles" category in the agent tools manager: [AgentBundlesPanel.tsx](../../agents/components/tools-management/AgentBundlesPanel.tsx) via [useAgentBundleOptions.ts](../../agents/components/tools-management/useAgentBundleOptions.ts)

## Agent / surface consumption

`listAgentBundleOptions()` (in the service) is the canonical read for any bundle
picker. Each addable bundle carries its `members` (names for the included-tools
list), `memberCount`, `isMcp`/`serverSlug`, and **`contributedToolIds`** — which
is always just `[lister_tool_id]` (every bundle has a lister). Callers add or
remove `contributedToolIds`; the server expands the lister to the members at
runtime, so the agent never carries the raw member tools.

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
  `createBundleWithLister`) — in one transaction it **auto-creates the lister
  tool** (`bundle:list_<name>`), **binds it** to the `matrx-ai-core`
  bundle_lister executor, links it to the bundle, and adds members (by tool
  *name*). A bundle can never be created without its lister — `lister_tool_id`
  is `NOT NULL`. See `migrations/tool_bundle_lister_enforcement.sql`.

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

- **2026-08-12** — **Second assignment, no new targets: a member-alias target was
  proposed and refused.** Another agent was chipped at this console while the
  entry below was in flight and scouted `{tool_id, alias}` through
  `setBundleMemberAlias` as a second write target. It is deliberately NOT
  adopted, converging on the exclusion already shipped below: a member's
  `local_alias` is the identifier `bundle_lister` hot-swaps the tool in under,
  so renaming one breaks call sites mid-run — the same class as renaming a
  bundle out from under its `bundle:list_<name>` lister, not a copy edit. (The
  surface intro's "draft member aliases" means helping the admin choose one
  while ADDING a tool, not rewriting existing members.) Both shipped targets
  were independently re-verified on `main` against `desktop-web`, an inactive
  non-system bundle: `bundle_description` staged into the inline box with the
  `tool.bundle` row untouched (`updated_at` unchanged), `new_bundle_draft`
  opened the New bundle form pre-filled and Cancel discarded it, and a
  before/after diff of `tool.bundle` shows 63 rows → 63 rows. Also corrected: a
  2026-08-11 note in the surfaces FEATURE.md claimed this console fails to load
  rows — it does not; `tool.bundle` reads fine and the page lists 54 active /
  63 total.

- **2026-08-12** — **The console is agent-writable, and it emits a live surface
  for the first time.** `BundlesAdminPage` now mounts a `SurfaceRuntimeProvider`
  for `matrx-admin/bundles` over a page-scoped store
  (`components/BundlesSurfaceRuntime.tsx`) that the list, the detail panel and
  the New bundle dialog publish into — the surface had been manifest-only, so
  an agent bound here was offered no write tool at all. Two ask-policy DRAFT
  targets: `new_bundle_draft` (`{name?, description?}`, which OPENS the create
  form when it is closed, because that form is a Radix modal and an admin
  cannot open it and then reach the floating chat) and `bundle_description`
  (the selected bundle's description; it refuses rather than picking a row for
  you). Nothing saves — the admin still presses Create / Save.
  A bundle's NAME is refused on an EXISTING row: it is `UNIQUE`, the lister
  tool is named `bundle:list_<name>`, and `updateBundle` patches only the
  bundle row, so a rename leaves every agent calling the old lister name.
  Member aliases, membership, the Active/System toggles and the metadata JSON
  are capability, not copy, and stay human. `NAME_RE` moved out of
  `NewBundleDialog` into `bundlesVocabulary.ts` so the rule a human is
  validated against, the rule an agent's write is checked against, and the rule
  the manifest advertises are one definition. `NewBundleDialog`'s
  `DialogContent` gained `onInteractOutside={preventDefault}` — dismissing the
  surface-write confirm counted as an outside interaction and would have closed
  the form, discarding the value just staged.
- **2026-06-21** — **Lister enforcement** (`migrations/tool_bundle_lister_enforcement.sql`).
  Fixed the root bug: `create_bundle_with_lister` only *linked* a pre-existing
  lister (and the admin UI passed none), so every bundle made in the dashboard
  was born with `lister_tool_id = NULL` (e.g. `agent-core`) and the picker
  bloated agents with raw members. The RPC now **creates + binds + links** the
  lister; backfilled the one null bundle (`agent-core` → `bundle:list_agent-core`);
  added `NOT NULL` on `lister_tool_id` as a permanent backstop. Verified live:
  creation auto-wires the lister, `agent-core` resolves its 6 members, adding it
  contributes 1 tool not 6. (Browser bundles on the shared `load_browser_tools`
  lister left as-is — deferred.)
- **2026-06-21** — Agent tools manager gains a **Bundles** category
  (`AgentBundlesPanel` + `useAgentBundleOptions`), split into **Internal / MCP /
  All** tabs (Internal default; classified by `isMcp` = `metadata.server_slug`)
  so our own toolkits aren't buried under MCP servers. Bundle listers
  (`bundle:list_*`) pulled out of raw tool browsing — they were masquerading as
  an "mcp" category — into their own category; each card lists its included
  tools. Overlap with individually-picked tools is surfaced as a gentle nudge,
  not an error: green **suggestion** (consolidate) on an unselected bundle that
  covers tools you already hold (floated to top), yellow **warning**
  (redundant) once a **lister** bundle is selected while you still hold its
  members individually, and a matching yellow "already in bundle X" reminder on
  the tool in the **Enabled** view. New `listAgentBundleOptions()` service
  primitive (shape-agnostic `contributedToolIds`). Verified end-to-end: lister
  UUID persists to `agx_agent.tools`, agent runs, `tool_resolve_bundle` expands
  the members.
- **2026-05-05** — Phase 3 shipped. Initial admin bundle page + service.
