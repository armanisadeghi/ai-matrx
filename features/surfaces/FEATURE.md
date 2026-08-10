# Tool Registry · UI Surfaces (v2)

**Status**: shipped
**Owner**: tool-registry
**Routes**: `/administration/ui/surfaces` (admin) · `/surfaces` (user hub) · `/agents/[id]/surfaces` (per-agent bindings)

## What this is

The dedicated admin UI for the `ui_surface` table. Built to scale to the
~100+ surfaces this system has (vs. the typical 1–2 most apps need), with
grouping, bulk operations, usage stats, and inline editing.

The simpler per-row CRUD on `/admin/lookups` (UI Surfaces tab) still exists
and is fine for one-off edits, but a callout banner there directs admins to
the v2 page for serious management.

## Why a dedicated page

The original `UiSurfaceCrud` (under `/admin/lookups`) is a flat table. With
~100 surfaces across 4 clients, that becomes unusable:

- No grouping → an admin can't tell which surfaces are "pages" vs "overlays"
  vs "debug" without reading every row.
- No bulk ops → activating an entire tier of debug overlays would take 10
  individual clicks.
- No usage info → an admin can't tell which surfaces actually have tools or
  agents pointing at them, so dead surfaces accumulate silently.
- No inline edit → changing a description means opening a modal per row.

The v2 page solves all four.

## One name, two systems — "surface manifest" is overloaded

- **Value manifest (this feature, code-first).** The runtime VALUES a surface promises to supply — plus agent roles, config namespaces, evidence sources. Declared in `manifests/*.manifest.ts`; **code is truth, `ui.ui_surface_value` is the synced mirror.**
- **Registered-tool defaults (aidream).** Which Registered tools a surface
  offers and which Executors can run them — `tool.surface_defaults` +
  `tool.definition` / `tool.binding` / `tool.executor`. The DB is authoritative
  for Registered-tool contracts and defaults; Inline tools remain a permanent,
  first-class request-time path for tools authored at runtime. Durability decides
  which path applies. Rules: `docs/official/tool_system_rules.md`.

Both hang off the same `ui.ui_surface` spine and resolve server-side in aidream `tool_merge.py` from the request's `client.surface`. When a doc says "surface manifest", identify which system before acting.

## Agent↔surface bindings — canonical model (associations-only, 2026-07-12)

**A binding is an edge in `platform.associations`** (source `agent` → target `surface`), written ONLY through `bindAgentToSurface` / `upsertAgentSurfaceBinding` in [`services/bind-agent-to-surface.service.ts`](./services/bind-agent-to-surface.service.ts) (which is the sole surface-side caller of `associationsService`). The condemned bespoke `agent_surface` junction (P1–P4: single project/task FKs, single-scope cardinality, passive-context binding, bespoke M2M) is **gone** — data migrated count-verified, table retired to `graveyard`, its service + `console.error` beacons deleted (`migrations/agent_surface_to_associations.sql`).

- **Tier-encoded edge role** is the identity of one scope tier: `binding:global` · `binding:u:<userId>` · `binding:o:<orgId>` · `binding:p:<projectId>` · `binding:t:<taskId>` — so multiple tiers per (agent, surface) coexist under `associations_unique` and each upsert idempotently updates its own tier.
- **The binding's logic is a TYPED edge payload** (Edge Payload System, 2026-07-19): `payload_kind = 'surface_binding'`, `payload = { value_mappings }`, schema-validated on every write by `trg_validate_edge_payload` against `platform.edge_payload_kind` (see "Edge Payload System" below). Edge `metadata` keeps only loose annotations: `{ tier, user_id, project_id, task_id, visibility, version }` + provenance markers.
- **Reads go through `agent.menu_surface`** (pre-joined owner-rights view over associations ⋈ `agent.card` ⋈ `ui_surface` ⋈ orgs; exposes `role` + hoisted tier columns + `value_mappings`). It is **self-scoping by tier role** (`migrations/menu_surface_tier_scoping.sql`): `binding:global` visible to everyone (incl. anon), `binding:u:<uid>` only to that user, `binding:o|p|t:*` only to members of the edge's access org — the associations RLS does NOT apply through the view, so this WHERE is the security boundary. List/stat/drift/usage reads all use it; the browser has NO direct grant on `platform.associations`.
- **`role` is the ONLY tier signal.** `assoc_add` stamps an access `organization_id` on EVERY edge (all tiers), so null-ness of the hoisted columns is meaningless — classify tier by parsing `role` (`tierScopeFromRole` in the binding service), and delete edges with the STORED role, never one recomputed from columns.
- **Binding role and access org cannot diverge.** `trg_surface_binding_scope_integrity` derives org/project/task audience orgs from the tier role at the table edge and validates the caller can use that scope; `agent.menu_surface` independently hides any role/metadata/org mismatch. Org-tier binding also ensures the existing canonical `iam.permissions` viewer grants for both the safe `agent_card` launcher row and the executable `agent` definition, because "available to every member" must include both reads, not only the binding edge.
- **Global-tier writes are super-admin only**, enforced at the DB edge by `trg_guard_global_surface_binding` on `platform.associations` (`migrations/global_surface_binding_write_guard.sql`) — a global edge broadcasts to every viewer, so a normal user's org access must not be able to publish one.
- **Launch resolution**: `fetchSurfaceBindingLayers(agentId, surfaceName)` (same service) returns weakest→strongest `MappingLayer`s for `mergeValueMappingLayers`: inheritance parents first (see below), then per surface `global → org rows by membership (oldest→newest) → user`. Org tiers apply by RLS membership — never an "active org" filter (P3: binding scope comes from the user's EXPLICIT picker selection; `ensureOrgId` supplies only the assoc access org).
- **Binding id = association id** everywhere (Redux slice, shortcut seeding via `create_shortcut_from_agent_surface`, drift remediation — which updates `metadata.value_mappings` on `platform.associations` via the admin client, server-side only).
- Redux stays `agentSurfaceBindingsSlice` + thunks in `redux/thunks.ts` — same shapes, associations-backed.

## Edge Payload System (v1, 2026-07-19 — Arman-approved)

**Real logic on a `platform.associations` edge lives in `payload`, typed by `payload_kind` and schema-validated at the DB edge. `metadata` is for loose annotations only — a payload without a kind is rejected.**

- **Registry**: `platform.edge_payload_kind` — one row per kind: `kind` (PK), `version`, `json_schema` (JSON Schema), optional `source_type`/`target_type` endpoint contract. Readable by all; writes are service/admin-side only. (Distinct from `platform.association_types`, which is one row per (source,target) *pair* — a pair can carry multiple payload kinds, and a kind can span pairs.)
- **Enforcement**: `trg_validate_edge_payload` (BEFORE INSERT/UPDATE of payload/payload_kind, `pg_jsonschema`) hard-fails (`23514`) on: payload without kind, unknown kind, endpoint-type mismatch, kind without payload, schema violation. It fires for ALL writers — client RPC, admin client, server-side SQL.
- **Write path**: `assoc_add(p_payload_kind, p_payload)` (optional params, backward compatible; payload-bearing upsert replaces the payload wholesale, payload-less upsert preserves it) ← `associationsService.add({ payloadKind, payload })`.
- **First adopter**: `surface_binding` v1 — `{ value_mappings }` (the `ValueMapping` union as JSON Schema). All binding edges backfilled; `agent.menu_surface` reads `payload -> 'value_mappings'` (metadata leg is legacy fallback, scheduled for removal).
- **Evolving a kind**: bump `version` + replace `json_schema` in the registry (upsert in a migration). Schema must stay valid for all live payloads — migrate rows in the same migration or widen compatibly.
- **Adding a kind**: registry insert (migration) + writer passes `payloadKind`/`payload`. Adoption backlog + recipe: `.claude/skills/canonical-associations/WORK-QUEUE.md` §Edge-payload adoption.
- **Performance**: reads ride the existing `(source_type, source_id)` / `(target_type, target_id)` btrees — per-slice cost is independent of table size; payload JSONB doesn't affect index traversal (large payloads TOAST). Validation cost is one schema check per write (writes are rare vs reads).

## Surface inheritance (v1, 2026-07-12 — Arman-approved)

`SurfaceManifest.inheritsFrom` declares a parent surface. A child inherits, child-wins-per-key:

| Inherited                       | Resolved in                                                                                                                                                                      |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Values (bindable declarations)  | `registry.ts` `withInheritance` (parent values first, child overrides by `name`; baselines still floored last)                                                                   |
| Agent bindings (value_mappings) | `fetchSurfaceBindingLayers` — parent layers are WEAKER: `parent:global → parent:org → parent:user → child:*`; inherited layers get `binding:parent:<surface>:…` provenance names |
| Agent roles / config namespaces | `registry.ts` union, child overrides by key                                                                                                                                      |
| Document evidence sources       | `registry.ts` union; the universal launcher turns each resolved declaration into a lazy processed-document context source before value mappings run                              |

- Guards are LOUD: unknown parent, cycle, or depth > 3 **throws at module init** (`getSurfaceAncestry`).
- Manifest sync mirrors `inheritsFrom` → `ui_surface.parent_surface_name` (never clears a DB-authored parent when the manifest is silent) and mirrors the MERGED value set into `ui_surface_value`.
- The chain is code-first (registry manifests). The DB's blanket `parent_surface_name = matrx-default/default` rows do NOT cascade bindings — only manifest-declared parents do (deliberate: cascading Default to all ~100 surfaces would be a behavior change).
- Live families: `matrx-user/transcripts` ⊃ `transcripts-cleanup` (60 effective values, 36 own); `matrx-user/pdf-extractor` ⊃ `extractor-chunker` / `analysis-studio` / `scanner`. Bind an agent ONCE on the parent and it applies on every child.

## THE NAMING LAW + canonical groups (2026-07-24)

**`SurfaceManifest.label` is REQUIRED — the ONE canonical display name for a surface**, unique per client (case-insensitive). Every value and group `label` is equally canonical. The `surfaceLabel` runtime override prop is DELETED, banned by ESLint (`surfaceLabelOverrideBan` in `eslint.config.mjs`).

- **Chrome reads labels through one seam**: `getSurfaceDisplayLabel(surfaceName)` in [`utils/surface-display.ts`](./utils/surface-display.ts) (static, synchronous). On-page section titles / field labels for declared values render via `surfaceValueLabels(manifest)` / `surfaceGroupLabels(manifest)` — byte-identical to the manifest. `labelFromName` slug fallback is for manifest-less DB surfaces only.
- **Canonical groups**: `SurfaceValueGroup {key,label,sortOrder}` in `manifest.groups` (curated band 0–899); every `SurfaceValue.group` references a declared key. `general` / `baseline` / `inherited:*` are RESERVED — the registry synthesizes them (declaring one throws at module init). [`manifests/registry.ts`](./manifests/registry.ts) stamps every resolved value with provenance (own/inherited/baseline) + `groupKey` and sorts values by (group order, value sortOrder): curated first, inherited next, baselines LAST.
- **DB mirror**: `ui_surface.label` + `ui_surface.value_groups` (JSONB) + `ui_surface_value.group_key`, written by [`services/manifest-sync.service.ts`](./services/manifest-sync.service.ts) (label/value_groups ALWAYS written) and `scripts/emit-surface-sync-sql.ts`. Drift report gains `surfaceLabelDrifts` / `valueGroupsDrifts`; `scripts/check-surface-drift.ts` enforces label presence + per-client uniqueness and group key/band/label rules.
- **Registry is the hierarchy source for chrome**: `getSurfaceAncestry` / `getSurfaceChildren` via `getRelatedSurfaces` ([`runtime/fetchRelatedSurfaces.ts`](./runtime/fetchRelatedSurfaces.ts), now synchronous); the Agents popover renders the full ancestry breadcrumb. `ui_surface.parent_surface_name` is a mirror only.
- **THE COMPLETENESS LAW**: every piece of data/state a page loads MUST be declared as a surface value — fields AND natural composites (marketing-page's `page_intent` object beside its four fields). Undeclared runtime keys render loudly as "Undeclared (runtime only)" in the Surface Context window — defects. Optional convenience packs are the only discretionary part.
- **Locate-on-page**: pages tag elements `data-surface-value="<value_name>"`; the Surface Context window's Locate button flashes them ([`utils/locate-on-page.ts`](./utils/locate-on-page.ts)). `SectionCard`/`MetricCell` in `features/marketing/components/shared/MarketingUi.tsx` take an `anchor` prop.
- **Agent-feed contract**: aidream's `/surfaces/{client}/{surface}/manifest` carries per-value `{name, group_key, sort_order, auto_context, always_available}` + `groups[{key, sort_order}]` — **machine names only, labels never enter agent feeds** (`aidream surface_resolver.py`; aidream deploy pending).
- **Worked exemplar**: [`manifests/marketing-page.manifest.ts`](./manifests/marketing-page.manifest.ts) (40+ values, 7 curated groups, inherits marketing-site → marketing-brand; scope builder `features/marketing/lib/marketing-page-scope.ts`; emitter `PageWorkspace.tsx`). This REPLACES notes-editor as the reference implementation (notes-editor stays the simple case).

## Agent roles + namespaced config (runtime settings system)

Two per-surface settings primitives, both resolved `manifest/DB default → global → org-by-membership → [ctx scope, reserved] → user` (newest `updated_at` wins ties, with a console.warn):

- **Agent roles** — where a surface PLUGS IN agents (`SurfaceManifest.agentRoles`, mirrored to `ui.ui_surface_agent_role`; user/org selections in `ui_surface_agent_pref`, kinds `selection`/`roster_item`, `single`/`multi`). Reader/writer: [`services/surface-config.service.ts`](./services/surface-config.service.ts); Redux `redux/surfaceConfigSlice.ts`; hook `hooks/useSurfaceConfig.ts`. Stale roles deleted by sync CASCADE their pref rows (reported).
- **Config namespaces** — typed JSONB buckets in `ui.ui_surface_config` (dictionary, session_defaults, …). Each namespace registers a PURE handler (validate / layered merge / empty) in [`config/namespace-registry.ts`](./config/namespace-registry.ts); adding one = handler + a manifest `configNamespaces` line, zero SQL. A malformed row is rejected loudly, never merged.
- Per-session choices are feature-owned and applied ON TOP of the resolved `effective` — never stored in these tables. Per-user surface UI state is the separate `user_surface_state` primitive (`user-state/`).
- **A per-surface agent choice never lives in `userPreferences` / `useSetting`.** The last one (`transcription.scribeAssistantAgentId`) was deleted 2026-07-12 — the Scribe assistant is now the `assistant` role on `matrx-user/transcript-scribe` (`resolveDefaultAssistantAgentId` reads the resolved role; `useStudioAssistant` hydrates it).

## User hub — `/surfaces` (Wave 5)

`app/(core)/surfaces` — the user-facing LIST view of every active `matrx-user` surface with ≥1 agent role or config namespace ([`components/hub/SurfacesHubPage.tsx`](./components/hub/SurfacesHubPage.tsx)). Detail `/surfaces/[...name]` ([`components/hub/SurfaceHubDetailPage.tsx`](./components/hub/SurfaceHubDetailPage.tsx)): Me|Org scope switcher (selects the WRITE tier; reads always show the resolved effective + provenance), per-role agent pickers, dictionary panel (opens the canonical `DictionarySelectorWindow`), per-namespace JSON config editor (handler-validated via `setNamespaceConfig`), read-only tools panel. Persistence is `surface-config.service.ts` only — never `useSetting`. Declaring a role or namespace on a manifest is what puts a surface in this hub. No `FeatureAdminMap` exists for this feature yet (admin surface is `/administration/ui/surfaces`).

**Registering a surface? Invoke the `surface-registration` skill** — the layered recipe (manifest → roles/namespaces → registry + `pnpm check:surface-drift` → DB sync → emitter → Matrx-vs-matrix verification), with transcripts-cleanup as the worked example.

## Full-screen admin editor — `/administration/ui/surfaces/[...name]`

[`admin-detail/SurfaceAdminDetailPage.tsx`](./admin-detail/SurfaceAdminDetailPage.tsx) (Wave 4). Catch-all route (slash-safe via `surfaceAdminHref` in `utils/surface-hierarchy.ts`) and reusable embedded body for `surfaceContextInspector`. Edits identity (active/description/rename/url_pattern/executor/parent), shows the parent/child tree (`buildChildrenByParent` / `getAncestorChain` — reads the DB mirror), authored-vs-resolved manifest provenance, declared values, roles + prefs, config namespaces, bound agents, and tools. Platform-global config namespace JSON is editable here through the namespace handler's canonical validation; manifest declarations and evidence sources remain code-owned. The 5-panel per-agent shell (`/agents/[id]/surfaces`, `admin/`) and the batch editor (`admin/batch/SurfaceBindingsBatchEditor.tsx`) write through the same associations-backed thunks.

## The 360 loop — read, write, policy (2026-07-29)

Surfaces are no longer read-only. Three seams, ONE system shared by user
bindings, shortcuts (the same system, one opinionated layer stronger), and
internal platform use — never a washed-down user variant beside a private one:

- **Write targets** — `SurfaceManifest.writeTargets` declares what may be
  written INTO a surface; the page registers handlers (provider prop or
  `useSurfaceWriteHandlers` from any depth); every caller lands through
  `applySurfaceWrite` (`runtime/surface-writeback.ts`). Mirrored to
  `ui.ui_surface_write_target` by manifest-sync so aidream feeds them to
  surface-bound agents as a `<surface_write_targets>` block. Live adopters:
  `matrx-user/marketing-page` (`page_meta_tags`, `page_target_keyword`,
  `page_supporting_keywords` — handlers in
  `features/marketing/components/pages/MarketingPageWriteTargets.tsx`),
  `matrx-user/marketing-brand` (`brand_profile`, `brand_identity` — handlers
  in `features/marketing/components/brands/MarketingBrandWriteTargets.tsx`)
  and `matrx-user/keyword-intelligence` (`keyword_selection`). The LSI kind
  components (`meta_tag_options` / `keyword_relationship_research` /
  `keyword_search_metrics`, DB components) call
  `runAction("apply_surface_write", …)` — same seam users' agent-authored
  components get.
- **Agent-origin writes (the stream side)** — a run launched on a surface with
  agent-writable targets (declared + handled + resolving to ask/auto) is
  offered ONE inline delegated tool, **`apply_surface_write`**
  (`SURFACE_WRITE_TOOL_NAME` in `runtime/surface-writeback.ts`;
  `listAgentWritableTargets()` builds the per-turn spec in
  `build-tool-injection.ts` — target enum + per-target contract in the
  description). The `tool_delegated` call routes through
  `dispatch-surface-write.thunk.ts` → `applySurfaceWrite(…, {origin:
  "agent", actorLabel: <agent name>})`, so `ask` shows the in-place confirm
  and `manual` refuses loudly. A user DECLINE posts a non-error tool result
  (`{ok:false, declined:true}`) — an error would invite the model to retry
  the write the user just refused. `manual`-only surfaces offer no tool
  (mirrors aidream's `_write_targets_block`: never advertise a write the
  platform refuses). **Making a surface agent-writable? Invoke the
  `surface-write-targets` skill** — judgment bar, declaration + handler
  recipe, mandatory live-agent verification, avalanche contract. Live
  agent-writable adopters: `matrx-user/marketing-page`,
  `matrx-user/tasks` (8 targets — draft fields via `patchTaskEdit` +
  `add_subtasks`/`save_task` entity actions, handlers in
  `TaskEditorBody.tsx`), `matrx-user/marketing-brand` (2 ask-policy entity
  targets through `updateBrand`; confirmed facts/assets/properties have no
  write path by doctrine — human-owned, promoted via discovery review),
  `matrx-user/agent-builder` (6 draft targets — an agent authoring ANOTHER
  agent's prompt: `system_instruction` / `append_system_instruction` (replace
  vs append, both through `withAgentSystemInstruction` + `setAgentMessages`,
  the exact pair the System Prompt textarea dispatches, so non-text blocks
  always round-trip), `agent_description`, `agent_name`, `agent_category`,
  `agent_tags`; handlers in
  `features/agents/hooks/useAgentBuilderWriteHandlers.ts`, registered on the
  builder's own provider — desktop AND mobile — so they stay wired on every
  panel. Model, tools, MCP servers, skills, variables, output schema and all
  governance stay human-only: changing what an agent may REACH is a
  capability change, not a copy edit), and
  `matrx-user/list-manager` (3 ask-policy entity targets — `add_list_items`
  decomposition plus `active_list_name` / `active_list_description`, handlers
  in `features/user-lists/components/ListManagerFloatingWorkspace.tsx` through
  the canonical `addItemAction` / `updateListAction` server actions; that
  surface has NO draft layer, so `auto` is barred on it and delete /
  visibility stay undeclared), and
  `matrx-user/schedules` (8 ask-policy targets across the surface's TWO
  write-capable mounts — 6 `schedule_draft_*` drafts wired by
  `ScheduleForm.tsx`, plus `schedule_title` / `schedule_description` as
  entity targets wired by `ScheduleDetail.tsx` through
  `updateScheduledTask`. THE per-mount-posture reference: one manifest and
  one target list, but `listAgentWritableTargets()` offers a target only
  where a handler is registered, so the read-only detail route gets just the
  two fields that cannot change what a schedule runs or when it fires, while
  everything behavioural stays editor-only for the user to review and save),
  and `matrx-user/marketing-crawls` (3 ask-policy DRAFT targets staging the
  crawl command — `crawl_options` as one partial-patch object for the limits,
  render mode and toggles, plus `crawl_include_patterns` /
  `crawl_exclude_patterns` as full-list replacements, because a crawl's SCOPE
  is the decision a user wants to review on its own rather than buried in a
  settings blob; handlers on `NewCrawlWorkspace`'s own provider, landing
  through the same setters the user's typing uses. The sessions-list mount
  registers NONE on purpose — immutable crawl records behind pure table query
  state. Starting the crawl stays human: it spends real time and budget
  against the client's own server).
- **UI-state reads** — `runtime/surface-ui-state.ts`: the page PUBLISHES
  interaction-state projections (`publishSurfaceUiState`), rendered blocks
  read by key (`useCurrentSurfaceUiState` — stack-walking, same resolution as
  writes). Never a store, never domain data, never callbacks.
- **Apply policy** — per-target `applyPolicy: manual | ask | auto` is the
  SURFACE's default opinion (transient `ui` writes can be `auto`; persisted
  `entity` writes default `ask`; `manual` = user-gesture only). The BINDING is
  where the user controls it: `write_policies` on the `surface_binding`
  payload (v2), merged through the same weakest→strongest layers as value
  mappings, registered at launch (`registerSurfaceWritePolicies`), resolved at
  apply time. A binding may tighten but can NEVER open a `manual` target.
  **Editor UI (built 2026-07-29):** the ONE controlled editor is
  [`components/bind/WritePolicyEditor.tsx`](./components/bind/WritePolicyEditor.tsx)
  (Default/Manual/Ask/Auto per declared target; the `manual` floor is shown
  disabled, never silently ignored). Consumers: the per-agent 5-panel shell's
  **Agent access** column ([`admin/columns/AgentAccessColumn.tsx`](./admin/columns/AgentAccessColumn.tsx),
  converted from the old Playground stub — saves through
  `upsertAgentSurfaceBindingThunk`, creating a personal mapping-less binding
  when none exists), the batch editor's per-surface "Agent write access"
  section, and the shortcut editor (`ShortcutEditorNext`). **Round-trip law:**
  the `surface_binding` payload is replaced WHOLESALE on save, so every save
  path carries the binding's current `value_mappings` + the FULL policy map
  (BindingColumn, the batch editor, and the Agent access column all do).
  **Shortcut storage (no DDL):** the shortcut's overrides live INSIDE
  `agent.shortcut.value_mappings` under the reserved `__write_policies` key —
  serializer pair in `features/agents/redux/agent-shortcuts/converters.ts`
  (`parseShortcutWritePolicies` / `packShortcutValueMappings`;
  `parseValueMappings` strips the key). The launch thunk pushes the
  shortcut's `writePolicies` on the `"shortcut"` layer, so a policy-only
  shortcut still participates in the merge.

## Surface client tools — page actions offered to bound agents (v1, 2026-07-29)

The ACTION tier of the 360 loop: a surface declares client-side TOOLS an agent on that surface can call to do live things on the page. Same registration the platform's internal tool families use (war-room / scribe: inline specs + `tool_delegated` routing) — never a parallel system.

- **Declare** — `SurfaceManifest.clientTools` (`SurfaceClientTool` in [types.ts](./types.ts)): `name` (lower_snake, globally unique per conversation — prefix with the surface domain), `label`, `description` (model-facing prose), `inputSchema` (the generated `CustomToolInputSchema` wire shape), `mode?: ui | draft | entity` (same meanings as write targets). Code-only v1, like `writeTargets` — not yet mirrored to the DB.
- **Register** — `useSurfaceClientTools(surfaceName, handlers)` in [runtime/SurfaceRuntimeContext.tsx](./runtime/SurfaceRuntimeContext.tsx) (exact ref-proxy/module-registry pattern of `useSurfaceWriteHandlers`; any depth; latest closure always wins). A handler `(input: unknown) => Promise<unknown> | unknown` runs the action and returns the tool output the agent receives.
- **Execute** — ONE seam: `executeSurfaceClientTool(name, input, opts?)` in [runtime/surface-client-tools.ts](./runtime/surface-client-tools.ts). Never throws (envelope `{ok} | {ok:false,error}`), deepest declaring mounted surface wins (same stack walk as `applySurfaceWrite`), LOUD on every contract break (toast + `captureError` source `surface-writeback`): tool undeclared, declared-but-unwired, handler threw. `listLiveSurfaceClientTools()` mirrors `listLiveWriteTargets` (declared+mounted+hasHandler).
- **Reach the agent (WIRED)** — `buildToolInjection` (`features/agents/redux/execution-system/utils/build-tool-injection.ts`) reads `listLiveSurfaceClientTools()` fresh every turn and emits each declared+mounted+handled tool as a `ToolSpecInline` (`kind:"inline"` — aidream's supported path for client-delegated tools with no server registry entry; the server schema-validates args and emits `tool_delegated`). No per-conversation arming needed; skipped under the disable-injection brake; declared-but-unwired tools are NOT offered (console.warn). Name collisions with already-present specs are skipped.
- **Resolve the call (WIRED)** — `surfaceDelegatedToolCall` routes any name declared by ANY registered manifest (`isDeclaredSurfaceClientToolName` — manifest-wide so an unmounted page still yields a precise error, not `unsupported_client_tool`) to `dispatchSurfaceClientTool` (`thunks/dispatch-surface-client-tool.thunk.ts`), which runs `executeSurfaceClientTool` and posts through the single `submitToolResult` funnel — the hard-suspended loop always resumes.
- **Policy** — the dispatcher is run-immediately (like scribe). A tool whose effect needs a human gate should route its handler through `applySurfaceWrite` (which carries `applyPolicy`/`write_policies`) or gate itself.
- **Not built yet (honest gaps):** no live adopter surface declares `clientTools` yet; no DB mirror (server-side agents can't see a surface's tools); no `check:surface-drift` validation of `clientTools` (name regex/uniqueness); server tools that write + refresh the page are a later tier.

## Header Surface Context windows

The universal Agents header dropdown exposes two ephemeral WindowPanels for the current route/runtime surface:

- **Surface Context** (`surfaceContextWindow`) is available to every user. It samples the matching `SurfaceRuntimeProvider.getScope()` while open, labels live/snapshot/unavailable state, and presents declared values beside their exact current values plus any undeclared runtime keys.
- **Surface Context Admin** (`surfaceContextInspector`) is gated by Redux `selectIsAdmin` both in the dropdown and inside the window. Its Live Values view uses the same runtime sampling; Manifest & Settings embeds the canonical admin editor and exposes code-owned provenance plus every DB-owned editable surface setting.

Both panels keep the standard thin WindowPanel chrome: friendly manifest-derived surface labels, icon-only header actions, and the canonical compact Copy for AI control. Runtime/manifest status and technical identifiers belong in panel content, footers, or the copied AI payload rather than the user-facing title bar.

Sampling is intentionally view-only and ephemeral: it reads the provider callback every 400 ms while a panel is open and never copies surface data into Redux or changes the agent execution scope.

## Architecture

- **Service**: [features/surfaces/services/surfaces.service.ts](./services/surfaces.service.ts)
  - `listSurfacesWithStats()` — single round-trip that fans out parallel reads
    (`ui.ui_surface` + `tool.surface_defaults` + `tool.bundle` +
    `agent.menu_surface` + `ui.ui_surface_value`) and joins counts in JS.
    Cheaper than sequential queries; cheaper than a server-side RPC for a
    table that admins read at most a few times per session.
  - `bulkSetSurfacesActive(names, active)` — one `UPDATE ... WHERE name IN (...)`.
  - `tierFor(sortOrder)` + `SURFACE_TIERS` — convention-driven grouping (see
    "Sort_order tiers" below).
- **Component**: [features/surfaces/components/SurfacesAdminPage.tsx](./components/SurfacesAdminPage.tsx)
  - Client tabs (matrx-admin / matrx-user / matrx-public / chrome-extension /
    All) drive the primary filter.
  - Status filter (active / inactive / all) and free-text search refine.
  - Body groups by tier (Pages, Specialized, Overlays, Editor variants, Debug).
  - Per-row controls: select checkbox, inline description edit (click to
    expand), tool-count badge, agent-count badge, active toggle, delete with
    FK-cascade-aware confirm.
  - Bulk control bar appears when ≥1 row is selected: activate / deactivate /
    clear selection.
  - "New surface" dialog with client picker, local-name input (validates
    `^[a-z0-9-/]+$` so multi-segment names like `debug/state-analyzer` are
    allowed), tier picker (auto-assigns sort_order = tier.min + 50), and
    description.

## Sort_order tiers (convention)

There's no `kind` or `category` column on `ui_surface`. Tiering is done via
`sort_order` ranges, and the UI groups + labels each band:

| Sort range | Tier label      | What goes here                                             |
| ---------- | --------------- | ---------------------------------------------------------- |
| 0–99       | Reserved        | (intentionally empty — reserved for future / pinned items) |
| 100–299    | Pages           | Top-level routes / primary destinations                    |
| 300–999    | Specialized     | Power-user surfaces, secondary tools                       |
| 1000–1999  | Overlays        | Modals, sheets, popout windows                             |
| 2000–8999  | Editor variants | Editor and authoring surfaces                              |
| 9000+      | Debug           | Admin-only debugging overlays                              |

The "New surface" dialog uses the tier picker to assign `sort_order = tier.min + 50`,
so new surfaces land in the middle of their band and don't collide with seeded rows.

## Seed (current production state)

After migration `seed_matrx_frontend_surfaces_expanded` (2026-05-05):

| Client             | Active | Total   |
| ------------------ | ------ | ------- |
| `matrx-user`       | 46     | 59      |
| `matrx-admin`      | 18     | 33      |
| `matrx-public`     | 5      | 8       |
| `chrome-extension` | 2      | 2       |
| **Total**          | **71** | **102** |

The inactive 31 are placeholders for emerging surfaces (beta UIs, debug
overlays not yet wired, etc.) — they're seeded so tools/agents can opt-in
to gating against them without admin work, but not activated by default.

## Conventions baked in

- `confirm()` from `@/components/dialogs/confirm/ConfirmDialogHost` for
  destructive actions.
- No barrel files; direct imports.
- No `useMemo` / `useCallback` / `React.memo` (per CLAUDE.md, React Compiler
  handles memoization).
- Bulk delete is intentionally NOT supported — single-row delete with
  cascade-warn is enough; bulk delete is a footgun for FK-target tables.
- Hard delete is allowed (no `is_active=false` "soft delete" alternative
  needed since `is_active` already exists). The confirm message warns when
  the surface has tool or agent references.

## v2.1 — full enrichment (2026-05-05 second pass)

After the user-requested "go all in" pass, the page picks up:

- **Per-surface detail drawer** ([SurfaceDetailDrawer.tsx](./components/SurfaceDetailDrawer.tsx)) opens on row name click or chevron. Shows:
  - Identity edit (active toggle, description edit, **rename**)
  - "Tools on this surface" — resolves `tool.surface_defaults` names against `tool.definition`, click-through to the tool admin
  - "Agents visible here" — joined `agx_agent_surface ⋈ agx_agent`
  - "Custom tool UI components" — `tl_ui` rows scoped to this surface
- **Rename support** with cascade-aware writes across `tool.surface_defaults`, agent-surface associations, and `tool.ui`, so a rename propagates to every dependent row.
- **Bulk delete** in the bulk action bar. The confirm aggregates tool/agent reference counts across all selected rows and warns explicitly that DELETE is non-cascading (FK behavior on delete is `NO ACTION`).
- **"Add from candidates" dialog** ([SurfaceCandidatesDialog.tsx](./components/SurfaceCandidatesDialog.tsx)) — a curated catalog ([data/surface-candidates.ts](./data/surface-candidates.ts)) of ~70 plausible-but-unseeded surfaces (window-panel overlays, second-tier admin pages, agent embedding widgets, etc.) discovered via codebase inventory. Filter by client / kind / search, multi-select, optionally force-active on insert, bulk insert in a single round-trip.
- **"New client" dialog** inline (NewClientDialog at the bottom of the page file). Avoids round-tripping to `/admin/lookups` to add a `ui_client`.
- **Keyboard shortcuts**: `/` focuses the search input; `Esc` closes the open drawer / dialog / clears selection (in that priority order).
- The candidate-count badge on the "Candidates" button shows how many catalog rows aren't yet seeded — naturally trends to 0 over time.

## Readiness tracking + overlay surfaces (2026-07-24, Arman-ruled)

- **`SurfaceManifest.readiness`** (`verified | partial | stub`, REQUIRED) + `readinessNote` — the campaign tracker for "verified correct and complete". Mirrored to `ui_surface.readiness`; NULL = unregistered (no manifest). Code-owned; the admin board at `/administration/ui/surfaces` rolls up the four states. `verified` is earned via the full surface-authoring checklist, never aspirational.
- **Overlay surfaces**: every window-panel overlay gets its own surface, identified by `SurfaceManifest.overlayId` → `ui_surface.overlay_id` (the overlay twin of `url_pattern`). Emitters mount `SurfaceRuntimeProvider` inside the window component — nested providers out-depth the page, so the window's scope wins while open.
- 11 zero-reference stale `ui_surface` rows hard-deleted 2026-07-24 (ai-voice, browser-workbench, code-workspace, multi-file-smart-editor, news, notes-beta, prompt-apps, applets, voice-pad-advanced, voice-pad-ai, custom-apps — all had 0 values/roles/bindings/tool-defaults).

## Surface writeback — read/WRITE manifests (v1, 2026-07-29)

Surfaces are no longer read-only. A manifest may declare **`writeTargets`** (`SurfaceWriteTarget` in [types.ts](./types.ts)): named write paths INTO the page, beside the read-only `values`.

- **One apply seam:** every caller goes through `applySurfaceWrite(target, value, opts?)` in [runtime/surface-writeback.ts](./runtime/surface-writeback.ts) — never a bespoke callback. It never throws (envelope `{ok} | {ok:false,error}`), resolves **deepest-first** over the live `SurfaceRuntimeProvider` stack (`getSurfaceRuntimeStack`), validates the target against the resolved manifest, and is LOUD on every contract break (toast + `captureError` source `surface-writeback`): undeclared target, declared-but-unwired handler, handler throw.
- **Pages register handlers on their provider:** `SurfaceRuntimeProvider getWriteHandlers={() => ({ target: (value) => … })}` — fresh closure per call, no stale state. A handler validates its input and throws on bad values; the seam converts that to a safe error envelope.
- **Three modes**, declared per target: `draft` (stages into the page's editor — the USER reviews and saves; the preferred default), `entity` (persists through the page's canonical write path immediately), `ui` (ephemeral state — selection/focus/navigation; no success toast).
- **`updatesValue`** links a target to its read twin (the evidence loop: read the value, write the target).
- **Kind components reach it via the action registry:** `apply_surface_write` in `features/content-ir/react/actions/handlers/apply-surface-write.ts` — a rendered agent-result component's button calls `runAction("apply_surface_write", {target, value})`; the component never touches supabase/redux/page internals.
- **Code-only v1:** `writeTargets` are validated by `check:surface-drift` but NOT yet mirrored to the DB (the follow-up that lets server-side agents see what a surface accepts). First live consumer: the content-plan surface family (`content-plan-node` is the reference — field drafts + `save_node`).

## Change Log

- **2026-08-10 — Marketing Crawls surface agent-writable.** `matrx-user/marketing-crawls` declares 3 `draft`/`ask` targets that stage the crawl COMMAND on the New Crawl workspace: `crawl_options` (ONE partial-patch object — `max_pages`, `concurrency`, `render_mode`, and the four toggles, because they are a single "how hard do we hit this host" decision held in one state object; five micro-targets would make the user confirm one command five times) plus `crawl_include_patterns` / `crawl_exclude_patterns` (full-list replacements — a crawl's SCOPE is what a user most wants to review on its own, the lists are frequently set alone, and they live in separate raw-textarea state). Handlers on `NewCrawlWorkspace`'s own provider land through the same `setOptions` / `setIncludeText` / `setExcludeText` setters the user's typing uses; patterns go through the SAME `invalidCrawlPatterns` regex gate as the form, and every handler refuses while the form is locked mid-run. New `features/marketing/crawler/crawl-options.ts` is now THE crawl-command vocabulary — `CRAWL_RENDER_MODES` (which `CrawlStartOptions["render_mode"]` now DERIVES from), `CRAWL_COMMAND_TOGGLES`, the bounds, and the canonical labels — imported by the launch form's controls, interpolated into the manifest descriptions, and validated against in the handler, so the three cannot drift. **Per-mount posture:** `CrawlsTable` registers no handlers on purpose — pure search/filter/sort/page state over immutable `web.crawl_session` evidence. **Not writable:** starting or canceling a crawl (it spends real time and budget against the client's own server — the human presses Start crawl), and the `CrawlStartOptions` keys this form renders no control for (`max_depth`, `politeness_delay_ms`, `host_rps`, `host_burst`, `seed_urls`, `screenshot_kinds`, `list_mode`) — staging a value the user cannot see or correct is not a draft. Live-verified with a real Badass Agent run on vasaro.com: one message → an ask dialog per target carrying the manifest description, Apply staged all three (250 pages / 4 fetches / browser_always / robots ON / `^/blog/` / `^/tag/`+`^/author/`), "Keep as is" left the form untouched and the agent acknowledged the decline, an undeclared target was refused (`No mounted surface declares write target "crawl_max_depth"`), and a deliberately illegal `{"concurrency": 99}` came back to the agent as the handler's own throw (`crawl_options: concurrency must be an integer between 1 and 32.`) with nothing staged. Zero `surface-writeback` captures. `check:surface-drift` + `type-check` clean.
- **2026-08-10 — Restored the Agent Builder write-target docs a merge dropped.** The 2026-08-09 entry below and the adopter-list clause landed in `68b1c007` and were lost in a later merge resolution while the CODE stayed intact — the docs claimed the campaign's highest-leverage surface was not agent-writable when it is. Nothing changed in the surface itself. **A merge that resolves a `FEATURE.md` conflict by taking one side wholesale silently reverts documentation for shipped code** — reconcile both sides.
- **2026-08-09 — Agent Builder surface agent-writable (third adopter).** `matrx-user/agent-builder` declares 6 draft/`ask` targets — an agent authoring ANOTHER agent's system prompt. `system_instruction` (full replace) and `append_system_instruction` (adds a rule without re-sending the prompt) both go through the new `withAgentSystemInstruction` helper + `setAgentMessages` — the exact pair `SystemMessage.tsx`'s textarea dispatches, so a rewrite and the user's typing are indistinguishable and the system message's non-text blocks always round-trip; `SystemMessage.handleTextChange` was refactored onto the same helper so there is ONE rebuild rule. `agent_description` / `agent_name` / `agent_category` / `agent_tags` go through `setAgentField`. Handlers in `features/agents/hooks/useAgentBuilderWriteHandlers.ts`, registered on `AgentBuilderClient`'s provider (desktop + mobile) so they stay wired whichever panel is open; every handler validates and throws, and refuses on a version snapshot or a view-only agent rather than staging edits the user could never save. Deliberately NOT writable: model/tiers, tools, custom tools, MCP servers, skill config, Matrx actions, context slots, variable definitions, output schema, and all governance/visibility. Live-verified with a real Badass Agent run on the builder: ask dialog per target carrying the manifest description, Apply staged into the editor (header flipped "No unsaved changes" → "Save changes", read twins updated), "Keep as is" returned `{ok:false,declined:true}`, append landed at the end of an untouched prompt, and a model/visibility change was refused with an explanation. Zero `surface-writeback` captures. `check:surface-drift` + `type-check` clean.
- **2026-08-10 — Schedules detail route agent-writable; first surface with a per-MOUNT write posture.** The 2026-08-09 pass made the schedules EDITOR writable (6 `schedule_draft_*` targets on `ScheduleForm`); this completes the surface's other write-capable mount. `ScheduleDetail` (`/schedules/[id]`) now registers `schedule_title` and `schedule_description` as `mode:"entity"`, ask-policy, through the canonical `updateScheduledTask` thunk (invariant 1 intact — no new `.from('sch_*')`). The generalizable bit: a surface with several providers does NOT need one flat posture. One manifest, one target list, and `listAgentWritableTargets()` offering only where a handler is registered is enough for the editor to expose reversible drafts while the read-only detail route exposes just two immediately-persisted fields. The line drawn — and worth copying — is that the detail route gets ONLY fields that cannot change what the entity does or when it does it; prompt and trigger changes stay editor-only so the user reviews the whole schedule before it is armed, and `enabled`/auth-mode/agent-binding/limits remain undeclared everywhere. Live-verified with a real Badass Agent run: both entity targets confirmed per-target with the manifest's own prose, applied, and still correct after a full page reload; an undeclared target (pause) was refused with the agent explaining only two targets exist; zero `surface-writeback` captures.
- **2026-08-09 — Marketing brand cockpit agent-writable (live-verified).** `matrx-user/marketing-brand` declares 2 ask-policy entity targets (`brand_profile` — merge-patch of the full editorial profile, `brand_identity` — industry/description copy), both through `updateBrand` with the version guard; handlers in `features/marketing/components/brands/MarketingBrandWriteTargets.tsx`, pure validation/merge core in `features/marketing/lib/brand-write-targets.ts` (unit-tested). Verified with a real agent run: per-target ask dialogs, applies persisted (v12→v16 on the test brand), decline path clean, undeclared brand-name write refused, zero writeback captures. Mirrored to `ui.ui_surface_write_target`. Confirmed business facts/assets/properties deliberately have NO write path — the surface doctrine keeps confirmed truth human-owned (candidates flow through the discovery review inbox).
- **2026-08-08 — Tasks surface agent-writable (second adopter) + `surface-write-targets` skill.** `matrx-user/tasks` declares 8 ask-policy targets (title/description/status/priority/due date/labels drafts via `patchTaskEdit`; `add_subtasks`/`save_task` entity); handlers in `TaskEditorBody.tsx`; live-verified (4 targets in one run — drafts staged + subtasks persisted + save). New skill `.claude/skills/surface-write-targets/` is the campaign recipe.

- **2026-08-08 — Surface auto-adoption at launch.** `launchAgentExecution` now adopts the mounted `<SurfaceRuntimeProvider>` (deepest wins, via `getSurfaceRuntime()`) when the caller passes NEITHER `runtime.surfaceName` NOR `runtime.applicationScope` — name AND live scope together, so every one of the ~33 surface-blind direct launch call sites picks up binding layers, value mappings, write policies, and document evidence on any page with a provider (127 mounts) with zero per-site wiring. Explicit caller values always win; a scope-only launch is untouched; the route-prefix guess (`detectActiveSurface`) is deliberately NOT used here (a name without a mounted runtime has no scope and would fabricate one — it remains the tool-injection fallback only, `build-tool-injection.ts`). A throwing adopted `getScope()` logs loudly and launches surface-named but scope-less. Verified: type gate + A/B against clean main (identical behavior on the dev session whose chat send was already stalled by HMR churn); live confirmation of an adopted scope on a real launch still owed.

- **2026-08-08 — Agent-origin surface writes live (first real caller of `origin:"agent"`).** `apply_surface_write` inline delegated tool injected per turn when `listAgentWritableTargets()` is non-empty (new export beside `listLiveWriteTargets`; policy-resolved, manual never offered); routed in `surface-delegated-tool-call.thunk.ts` → new `dispatch-surface-write.thunk.ts` → `applySurfaceWrite(origin:"agent")`. Decline = non-error tool result; instance `paused` while an ask-confirm awaits the user.

- **2026-08-07 — Header Agents popover lists role-bound agents (Arman's ruling, over card-promotion).** `SurfaceBoundAgentsList` now renders a "Surface roles" section (`includeRoles`, default true) from `useSurfaceAgentRoles` — role label + agent name, Run + Settings, no detach (roles are surface config, not ad-hoc binds). Definition-tier agents need NO `agent.card` row or `platform.associations` edge to appear; works platform-wide for every surface with `ui.ui_surface_agent_role` rows. Agent names resolve via the new shared `hooks/useAgentNames.ts` (module-cached `agent.definition` id→name read; RLS-hidden ids fall back to the role label), which also replaced `SurfaceRolesSection`'s inline copy of the same fetch. Verified live on `/marketing/content-plan` (base + setup child surface).

- **2026-07-29 — Write-policy editor UI shipped (per-agent shell, batch editor, shortcut editor).** New shared `components/bind/WritePolicyEditor.tsx` (Default/Manual/Ask/Auto segmented control per declared target; `manual` floor shown disabled). Playground stub column CONVERTED to `admin/columns/AgentAccessColumn.tsx` (panel id `playground` → `agent-access`; header toggle now ShieldCheck). Round-trip fixes: `upsertAgentSurfaceBinding` return now carries `writePolicies`; `UpsertBindingArgs`/`BulkUpsertBindingInput` accept `writePolicies`; BindingColumn and the batch editor now preserve stored overrides on every save (previously a mappings save WIPED them — wholesale payload replacement). Shortcut overrides stored in `agent.shortcut.value_mappings` under reserved `__write_policies` (no DDL; converter pair is the one serializer); launch thunk pushes them as the `"shortcut"` layer.

- **2026-07-29 — Surface client tools v1 (declaration → registration → execution → launch injection, all wired; zero adopters yet).** `SurfaceClientTool`/`clientTools` on the manifest, `useSurfaceClientTools` + `getRegisteredSurfaceClientTools` registration (SurfaceRuntimeContext), `executeSurfaceClientTool` / `listLiveSurfaceClientTools` / `isDeclaredSurfaceClientToolName` runtime (`runtime/surface-client-tools.ts`), automatic inline-spec injection in `buildToolInjection` (live mounted tools, per turn), delegation routing branch in `surfaceDelegatedToolCall` → new `dispatchSurfaceClientTool` thunk (single `submitToolResult` funnel). See "Surface client tools" section for the honest gap list (no adopter, no DB mirror, no drift-check coverage).

- **2026-07-29 — Surface writeback v1 + content-plan surface family (5 surfaces).** `SurfaceWriteTarget`/`writeTargets` on the manifest (see section above), `applySurfaceWrite` runtime over the provider stack, `getWriteHandlers` on `SurfaceRuntimeProvider`, `apply_surface_write` kind action, new `surface-writeback` error-capture source, drift-check validation (name regex/unique, mode, updatesValue→declared value, group). Content Plan split into per-view surfaces — the `?view=` param is a different page with different agents: `content-plan-list` (front door, `open_site` ui-target), `content-plan` (plan-editor base tree/table/map, `select_node` ui-target; `brief_writer` role moved off it), `content-plan-setup` (inherits; `select_archetype`/`set_family_counts`/`set_family_names` staged targets, `site_shaper` role), `content-plan-entities` (inherits; `entity_curator` role), `content-plan-node` (the step-inside node panel; 10 draft field targets + `save_node` entity target, `brief_writer` role). Emitters + handlers live in PlanSitesList / ContentPlanWorkbench / SetupView / EntityManager / NodePanel (nested providers, deepest wins). `resolveMarketingSurface` gained the content-plan branch — the flat prefix row was DEAD (the marketing resolver swallowed it into `matrx-user/marketing`). DB synced via the canonical endpoint + verified live (7/21/23/30/40 values, roles mirrored, stale parent `brief_writer` role row deleted). Browser-verified all five views render with providers, zero console errors; an end-to-end `apply_surface_write` from a rendered kind component is NOT yet exercised.

- **2026-07-28 — Admin fleet wave 1: 14 matrx-admin surfaces registered; `/administration` catch-all DELETED.** New manifests (all honest partial/stub): users, feedback, email, agent-review, cx-dashboard, server-logs, sandbox, official-components, applications, scheduling, agent-apps, bundles, mcp-servers, lookups; 5 live emitters (agent-review; cx-dashboard base + nested Overview; applications tab; agent-apps dashboard + apps list). Route resolution: unmapped admin routes now return `null` — the old catch-all mis-attributed every admin route to system-agents; the dead `/admin` prefix and the stale `system-agents → /administration` url-pattern override are gone (tests in `route-to-surface.test.ts`). DB: 5 zero-reference rows deleted (`matrx-user/tools`, duplicate `matrx-admin/mcp-tools`, 3 route-less debug rows), 10 stale flat admin url_patterns corrected, ~180 graveyard→live FKs dropped platform-wide (`migrations/drop_graveyard_to_live_fks.sql` — graveyard tables were blocking live deletes). Sync path used: `emit-surface-sync-sql.ts` output applied as an idempotent migration via aidream's applier. Campaign state: `docs/handoffs/surface-canonical-fleet.md`.

- **2026-07-27 — Agent authoring surfaces to `verified`.** `matrx-user/agent-builder` (25 → 43 values, 7 groups, intro, `urlPattern: /agents/[id]/build`): the emitter `useAgentBuilderSurfaceScope` now also emits the saved system instruction, message templates, model tiers, skill config, Matrx actions, UI gates, full governance/lineage (active/public/archived/favorite, access level, ownership, read-only, version lineage, fork source) and `dirty_fields`; big payloads (`agent_json`, `agent_messages`, `agent_custom_tools`, `variable_json`) are `autoContext: false`; the never-emitted `user_message_draft` was removed. `matrx-user/agent-run` (20 → 27 values, 5 groups, intro, `urlPattern: /agents/[id]/run`) got its FIRST emitter: `features/agents/hooks/useAgentRunSurfaceScope.ts`, mounted by `AgentRunnerPage` via `SurfaceRuntimeProvider` **only** when `sourceFeature === "agent-runner"` (the `/code` workspace embeds the same component under its own surface). Also fixed a registry-init crash: `extractor-chunker` copies `pdf-extractor`'s values as its own, so it must declare the parent's groups (`getPdfExtractorGroups()`) — copied values referencing an undeclared group key throw. DB sync (manifest sync endpoint) still to run.

- **2026-07-27 — Surface binding audience/org integrity restored.** Live evidence found two `binding:o:<Titanium>` edges whose `organization_id` was the agent owner's personal org: the editor decoded Titanium from `role`, while `agent.menu_surface` joined/scoped on `organization_id` and displayed Arman Sadeghi's Workspace. Root cause was aidream's 2026-07-23 generic `assoc_add` endpoint-org hardening: correct for ordinary two-endpoint associations, wrong for agent→surface because the selected binding audience is a third scope. `migrations/surface_binding_scope_integrity.sql` adds a DB-edge tier validator/normalizer (org/project/task access included), repairs existing rows, makes the view fail closed on any future role/metadata/org mismatch, and restores both intended Titanium viewer grants (`agent_card` launcher visibility + `agent` execution) for existing owner/admin-authored private org bindings. The bind service now reuses `ensureSharedWithOrg` so future private custom-agent org bindings make both records readable to the selected org rather than writing a visible-looking but unusable edge.

- **2026-07-24 — Surface readiness tracking board on `/administration/ui/surfaces`.** `ui.ui_surface.readiness` ('verified' | 'partial' | 'stub'; NULL = unregistered, no code manifest) + `readiness_note` now surface in the admin list: a four-tile rollup strip (Verified / Partial / Stub / Unregistered, counts scoped to the client filter, tile click = readiness filter composing with client/status/manifest/parent/search), a sortable Readiness column with per-row badge (`readiness_note` as tooltip), canonical `label` as row display name with the machine name kept in mono beneath, an `overlay` chip when `overlay_id` is set, and a read-only Readiness block in the peek panel stating "Readiness is code-owned — edit the manifest's `readiness` field and re-sync" (deliberately NO DB write path). Shared primitive: `components/SurfaceReadinessBadge.tsx` (+ `READINESS_META`); typed helpers `SURFACE_READINESS_LEVELS` / `readinessBucketOf` in `surfaces.service.ts`. Note: `SurfacesAdminPage.tsx` / `SurfaceDetailDrawer.tsx` are dead code (nothing imports them; the route renders `SurfacesContainer`) — they received the same treatment but should be deleted.

- **2026-07-27** — Four surfaces to `verified`. **War Room**: `matrx-user/war-room` 2 → 24 values / 5 groups and `matrx-user/war-room-thread` 3 → 30 values / 6 groups, both with a `<surface_intro>`, `urlPattern`, and a NEW runtime emitter (`features/war-room/lib/war-room-scope.ts`; `SurfaceRuntimeProvider` in `WarRoomShell` for the room, nested deeper in `ThreadAgentPanel` for the thread). **Conversation documents**: the SHARED value set (`_conversation-document.manifest.ts`) gained canonical `groups` — inherited identically by `matrx-user/working-document` and `matrx-user/scratchpad`, which stay separate by design — plus 8 previously-undeclared editor states now emitted (`binding_id`, `binding_label`, `char_count`, `is_saving`, `is_materialized`, `document_version`, `has_conflict`, `editor_mode`); both surfaces got an intro. DB sync (manifest sync endpoint) still to run.
- **2026-08-09 — Canonical tool vocabulary.** Replaced the false tool-registry
  “DB-only source of truth” claim with the two permanent paths: Registered tool
  and Inline tool. Registered contracts/defaults remain DB-backed; runtime-authored
  Inline tools remain first-class, with durability deciding the path.
- **2026-07-24 (fleet push)** — 53 → **60 manifests / 1,270 values**, all DB-synced. Upgraded to the canonical standard (groups + completeness + emitters): notes (15→30), chat (15→25) + assistant-message, tasks (13→23) + projects (8→22), transcripts family (12 new viewer values + truth fixes), code-editor (diagnostics/open_files/filesystem; dead `current_function_name` removed), scraper (config+results exposed; 2 never-emitted values removed). NEW registered surfaces with emitters: agents-hub, organizations, dashboard, settings, agent-apps, agent-connections, connections-skills (child, inherits). Route fixes activated 8 orphaned manifests (`/cms`, `/war-room`, `/data` prefixes) and corrected fictional prefixes + DB url_patterns (`/agent-apps`, `/agent-connections`, `/agent-connections/skills`, `/sandbox`, `/user-settings`). Remaining rollout: `docs/handoffs/surface-canonical-fleet.md`.

- **2026-07-24 — THE NAMING LAW + canonical groups overhaul (see section above).** Required `SurfaceManifest.label` (unique per client); `surfaceLabel` override prop deleted + ESLint-banned; all chrome via `getSurfaceDisplayLabel` / `surfaceValueLabels` / `surfaceGroupLabels`; `SurfaceValueGroup` groups with registry-resolved provenance + groupKey and curated→inherited→baseline sort; DB columns `ui_surface.label` / `value_groups` / `ui_surface_value.group_key` mirrored by sync + emit script; drift report `surfaceLabelDrifts` / `valueGroupsDrifts` + drift-check enforcement; registry-as-hierarchy-source for chrome (`getRelatedSurfaces` synchronous, breadcrumb popover); locate-on-page `data-surface-value` convention; aidream agent-feed contract extended to `{name, group_key, sort_order, auto_context, always_available}` + groups (deploy pending); marketing-page becomes the reference implementation. THE COMPLETENESS LAW recorded. Both surface skills rewritten.
- **2026-07-24 — Agent↔surface binding restored: catalog entity types now honor the registry's declared visibility.** aidream `0227_enforce_entity_acl_on_all_association_writes.sql` (applied 2026-07-23 19:57 UTC) made `assoc_add` require `iam.has_access(target,'viewer')` on non-conveying edges. `ui.ui_surface` is an ownerless platform catalog — no `visibility` / `created_by` / `organization_id` column — so `platform.entity_row_access_attrs()` resolved it to `personal` with a NULL owner and NULL org, which **no** user can ever satisfy: every bind failed with `42501 assoc_add: viewer access to target required` (last successful bind was 08:11 that morning). `platform.entity_types` already declared `surface.default_visibility = 'public'`; the resolver was ignoring it. Fix: `migrations/entity_access_attrs_honor_registry_default_visibility.sql` makes the no-ownership-columns fallback read the registry's `default_visibility` (still `personal` when undeclared). Applied + browser-verified (bind → "Binding created", edge written). Three other ownerless registered catalogs remain latently unbindable — FOUND_DEFECTS D100.
- **2026-07-22 — Admin surface-details column: bounded, collapsible Agent Roles panel (layout fix).** `SurfaceRolesSection` was `shrink-0` with no height cap or scroll, so a surface with many roles (10 on `marketing-site-pages`) grew past the viewport and pushed the SURFACE header + declared-values list off the bottom of the un-scrollable `flex` column — unreachable. It now renders inside a titled, collapsible (`Agent roles · N`), height-capped (`max-h-[38vh]`) scroll region, guaranteeing the surface values are always reachable below it. Browser-verified expanded + collapsed. Files: `admin/columns/SurfaceRolesSection.tsx`.
- **2026-07-22 — Marketing surface fleet (16 new manifests) + nested-dynamic route resolution + complete SQL sync mirror.** The Marketing system got its full tree — `matrx-user/marketing` (hub) · `marketing-brand` → `marketing-site` → 11 verticals · `marketing-batches`, with `marketing-page` now inheriting from `marketing-site` — using XML parent-context values (`brand_context`/`site_context`, built by `features/marketing/lib/surface-context.ts`) flowing down the inheritance chain. `route-to-surface.ts` gained `resolveMarketingSurface` (first segment after the site id → surface; page/crawl detail subtrees special-cased; unit-tested in `route-to-surface.test.ts`) because plain prefix matching cannot see through nested dynamic ids. `scripts/emit-surface-sync-sql.ts` upgraded from values-only to the complete mirror of the sync service's upsert half: values now carry `auto_context`, plus agent-role upserts and per-surface `url_pattern`/`intro`/`parent_surface_name` updates (declared fields only — never clears DB-authored values; the DELETE/drift half stays with the endpoint).
- **2026-07-22 — VIEW LAW guard comments (no behavior change).** Added `// VIEW LAW:` comments to `surfaces.service.ts`, `manifest-sync.service.ts`, and `surface-config.service.ts` documenting that `ui_surface`/`ui_client`/`tool.ui`/`ui_surface_value`/`agent.menu_surface`/`ui_surface_agent_role` reads are platform-wide admin config (public catalog) or container-scoped by `surface_name`, clearing THE VIEW LAW's bare-RLS guard findings.
- **2026-07-19 — Global-bind lineage guard + system-agents own-agent warning.** New `GlobalBindAgentGuard` (`components/bind/`) gates every GLOBAL-tier bind of a personal agent: resolves the Linked Agent Sync twin first (offer "use system version" — surface-first panel binds it; the per-agent admin shell ROUTES to the twin's surfaces page), offers the `agentConvertSystemWindow` create-synced-dup/promote flow when no twin exists, screams on non-public card visibility, and always allows "continue with mine" (awareness, not a block; builtins pass through silently). Wired into `SurfaceAgentBindPanel` + admin `BindingColumn`. The system-agents `[id]` layout now renders an unmissable amber banner + tinted background whenever a non-builtin agent is open there (browser-verified).
- **2026-07-19 — Edge Payload System v1 shipped (Arman-approved).** Typed, schema-validated payloads on `platform.associations`: `edge_payload_kind` registry + `payload_kind`/`payload` columns + `pg_jsonschema` trigger + `assoc_add` v2. `surface_binding` is the first kind; all binding edges backfilled off metadata; FE writers (bind service, drift remediation) moved to payload. Applying the migration also RESTORED the `menu_surface` tier-scoping WHERE, which a post-2026-07-13 view replacement had silently dropped (security regression — other users' tier bindings were readable). Adoption backlog from a 2-agent scout sweep recorded in `.claude/skills/canonical-associations/WORK-QUEUE.md`.
- **2026-07-19 — Restored vision: `SurfaceValue.autoContext` + `SurfaceManifest.intro` (declaration layer).** New manifest fields, live DB columns (`ui_surface_value.auto_context` default true; `ui_surface.intro`), sync mirroring, drift diff coverage. `autoContext:false` = bindable-only (offered in mapping UIs, never auto-shipped to context); `intro` = the surface's XML-ish self-introduction block, the first surface-context item an agent sees. Server-side consumption is NOT wired yet — aidream reads only value NAMES today (`surface_resolver.py` `_load_catalog`; `always_available` is consumed nowhere server-side) — handoff prompt issued for aidream plumbing. Same pass: orphaned agent→surface edges deleted (30 of 38 pointed at deleted agents; polymorphic edges have no FK — `migrations/cleanup_orphaned_agent_surface_binding_edges.sql`), `check:surface-drift` added to `check:release-gates`, and the "alwaysAvailable is earned by routing" doctrine recorded in the `surface-authoring` skill.
- **2026-07-19 — Knowledge-consolidation pass (docs corrected against live code + DB).** Added the "One name, two systems" values-vs-tools manifest disambiguation; fixed the stale routes header (`/admin/surfaces` → `/administration/ui/surfaces`) and the Architecture stats read (retired `tl_def_surface`/`agx_agent_surface` → `tool.surface_defaults`/`agent.menu_surface`). Same pass corrected `surface-authoring` SKILL.md (associations-only bindings, `RAW_MANIFESTS`, baseline auto-injection, `ui.` schema, `document` valueType) and `manifests/README.md`. Live-DB finding recorded: 30 of 38 agent→surface association edges point at agents no longer in `agent.card` (deleted test agents; polymorphic edges have no FK) — invisible through `menu_surface`, cleanup pending a decision on binding architecture.
- **2026-07-19 — Live Surface Context windows in universal Agents chrome.** Added the user-facing `surfaceContextWindow` for searchable, exact live values and upgraded the Redux-admin-gated `surfaceContextInspector` with live runtime sampling plus embedded manifest/settings administration. Admins can now see authored vs resolved manifest provenance/evidence and edit handler-validated global namespace config without leaving the surface. Follow-up polish keeps both headers thin with icon-only actions, canonical Copy for AI, friendly display labels, and no raw slash-delimited surface key in user chrome.
- **2026-07-17 — Document Evidence System surface contract.**
  `SurfaceManifest.evidenceSources` now declares when a surface already knows a
  `processed_document_id`. `launchAgentExecution` resolves those declarations
  into the canonical source-only `request.context` shape before any
  agent↔surface mappings, so document context and the automatic
  `document_content` / `document_search` / `knowledge_search` / `verify` toolset
  no longer depend on an agent author wiring an ID. PDF Extractor declares the
  source once; extractor-chunker / analysis-studio / scanner inherit it.

- **2026-07-13 (waves 5–7 adversarial review)** — Hub drift made LOUD (console.warn when a configurable manifest has no active `ui_surface` row; in-page destructive notice when a manifest declares roles the DB doesn't mirror); org scope pills in `/surfaces/[...name]` now offered only where the user is org owner/admin (RLS `is_org_admin` gates org-tier writes — a member pill 42501'd on every save); `setNamespaceConfig` refuses (throws) on an unregistered namespace instead of silently persisting unvalidated config.
- **2026-07-12 (waves 5–7)** — **User hub + transcript-scribe + registration skill; `docs/handoffs/surfaces-bindings.md` completed and deleted.** (1) `/surfaces` user hub shipped (list + detail, see section above). (2) `matrx-user/transcript-scribe` manifest registered (`assistant` role, default = the seeded audio assistant; `dictionary` + `session_defaults` namespaces; deliberately no `inheritsFrom` — the transcripts viewer vocabulary isn't emitted by the live studio); DB synced + verified live (5 values, 1 role, url_pattern). `userPreferences.transcription.scribeAssistantAgentId` DELETED end-to-end (zero live rows held a value — no data migration needed); `resolveDefaultAssistantAgentId` reads the surface role, the Scribe settings picker writes user-tier `ui_surface_agent_pref`. (3) `.claude/skills/surface-registration/SKILL.md` — the layered registration recipe unblocking the all-surfaces sweep.

- **2026-07-13** — **Adversarial review of the cutover: tier scoping + role-authoritative classification.** (1) `agent.menu_surface` gained a tier-role WHERE (`menu_surface_tier_scoping.sql`) — the owner-rights view was leaking (and `fetchSurfaceBindingLayers` was APPLYING) other users' user-tier and foreign orgs' org-tier bindings; now global→everyone, user→self, org/project/task→org members (probed live as authenticated + anon). (2) Global-tier binding writes gated to super admins by `trg_guard_global_surface_binding` (`global_surface_binding_write_guard.sql`; probed: normal user 42501, user-tier bind + super-admin global bind OK). (3) FE tier classification now parses `role` (`tierScopeFromRole`) instead of column null-ness — `assoc_add` stamps an access org on every edge, so column-based classification turned global binds into org layers and made them undeletable (recomputed wrong role); `surface-bound-agents` bucketing fixed the same way. Data parity re-verified live: 35/35 graveyard rows have their tier-role edge.
- **2026-07-12** — **Bindings replaced by canonical associations + surface inheritance v1.** (1) Condemned `agent_surface` junction DELETED end-to-end: rows migrated count-verified into `platform.associations` (tier-encoded `role`), table → `graveyard`, `agent-surface-bindings.service.ts` + its beacons removed by deletion, `create_shortcut_from_agent_surface` / `agx_usage_scan_core` repointed, `menu_surface` exposes `role`, drift-scan/remediate/stat reads moved to the view/edge, Diagram Editor (`bdaf5ee0`) ↔ `matrx-user/mermaid-editor` global edge seeded (`migrations/agent_surface_to_associations.sql`, applied + ledgered; aidream models regenerated). (2) `SurfaceManifest.inheritsFrom` + registry merge (values/roles/config, loud cycle/depth guards) + binding cascade in `fetchSurfaceBindingLayers` + manifest-sync mirrors of `parent_surface_name` and merged values. First families wired: transcripts ⊃ cleanup; pdf-extractor ⊃ extractor-chunker/analysis-studio/scanner. DB value mirror re-synced (649 rows). (3) Roles / config namespaces / full-screen admin editor documented above.

- **2026-07-11** — **Agents list: hide empty sections + detach.** Sections only render when they have agents. Unlink control on detachable binds calls `unbindAgentFromSurface` (associations remove); platform default-contract agents stay non-detachable here.
- **2026-07-11** — **Agents chrome polish.** Panel title is the pretty surface label only (manifest `label` or acronym-aware slug — no `matrx-user/…`, no "Surface agents"). `SurfaceBoundAgentsList` drops the filler heading; sections are Public + Mine (always), org names (when present), Shared with me; compact single-line rows. Default-contract agents fold into Public.
- **2026-07-11** — **PDF surface family rename + siblings.** `matrx-user/pdf-widgets` → `matrx-user/pdf-extractor`; `matrx-user/content-extractor` → `matrx-user/extractor-chunker` (parent = pdf-extractor). Live rename via `ON UPDATE CASCADE` (values, agent binds, shortcuts). Added `matrx-user/analysis-studio` + `matrx-user/scanner` (manifests + seeded values). Route map + FE call sites updated; legacy `/pdf-widgets` and `/content-extractor` prefixes alias to the new names.
- **2026-07-11** — **SurfaceRuntimeProvider rolled out to top surfaces.** Live Run scope now mounts on Chat (`ChatRoomClient`), Files (`PageShell`), Code Editor (`CodeWorkspaceContextMenu`), Agent Builder (`AgentBuilderClient`), Projects (`ProjectWorkspace`), Research (`ResearchTopicShell`), Scraper (`ScraperFloatingWorkspace`), Messages (list + thread). Manifests gained pretty `label` fields for Agents chrome titles. Prior pilots (Notes / Tasks / PDF Extractor / Transcripts) unchanged.
- **2026-07-10** — **SurfaceRuntimeProvider wired on pilot routes + registry bridge.** Header Agents chrome and page content are AppShell siblings, so React Context alone never reached the button — registration is now a module stack (`registerSurfaceRuntime` / `useSyncExternalStore`) that `<SurfaceRuntimeProvider>` writes into. Live scope pilots: Notes (`NoteContentEditor` → `matrx-user/notes`), Tasks (`TaskEditorBody` → `matrx-user/tasks`), PDF Studio (`PdfStudioShell` → `matrx-user/pdf-extractor`), Transcripts (`TranscriptViewer` → `matrx-user/transcripts`). Nested providers stack (split-pane notes: topmost wins).
- **2026-07-10** — **Universal Surface Agents chrome (header).** Every authenticated `(core)` page gets a thin `RobotTapButton` in the shell header (`SurfaceAgentsHeaderButton`). Idle cost is the icon only — no fetches. On open, `next/dynamic({ ssr: false })` loads `SurfaceAgentsPanelImpl`, which then resolves the route surface, lists bound agents (via `SurfaceBoundAgentsList`), shows parent/child related surfaces, and supports Add/Run/Settings. Live Run context is opt-in via `SurfaceRuntimeProvider` (`runtime/SurfaceRuntimeContext.tsx`); pages without a provider still list/bind. New `SourceFeature` literal `surface-chrome`.
- **2026-07-10** — **`SurfaceBoundAgentsList` extracted + floating PDF workspace migrated.** The PDF Widgets inspector's inline list/add UI is now the reusable `components/bind/SurfaceBoundAgentsList` (list + Run/Settings + Add custom agent). `PdfStudioInspector` consumes it; the floating `PdfExtractorWorkspace` no longer uses hardcoded shortcut UUIDs — same surface bind/run path as the studio. Route map: `/tools/pdf-extractor` → `matrx-user/pdf-extractor` (was only `/pdf-widgets`).
- **2026-07-10** — **Agent Settings + optional `surfaceName` → Surface tab.** Opening `agentSettingsWindow` with `surfaceName` (and optional `surfaceLabel`) adds Info | Surface panes; Surface embeds locked `SurfaceAgentBindPanel` for that agent↔surface. Defaults to the Surface pane. `SurfaceBoundAgentsList` gear passes the list's `surfaceName` so every surface that uses the list gets in-context binding edits for free.
- **2026-07-10** — **Surface-first bind is associations-only.** `SurfaceAgentBindPanel` now writes via `bindAgentToSurface` (`platform.associations` + `value_mappings` in metadata) — no more condemned `agent_surface` write / console.error beacon from that UI. Launch mapping resolution (`fetchSurfaceBindingLayers`) prefers `agent.menu_surface` and only falls back to `agent_surface` for legacy undual-written rows.
- **2026-07-10** — **Surface-first agent bind primitive.** New reusable `SurfaceAgentBindPanel` (`components/bind/`) + `surfaceAgentBindWindow` overlay: while standing on any surface, pick an agent → pick scope (Personal/Org/…) → map surface values via `SurfaceVariableBindingList` → save. Same write path as BindingColumn (`upsertAgentSurfaceBindingThunk` + associations dual-write) so launch mappings still resolve. Opener: `useOpenSurfaceAgentBindWindow({ surfaceName, onBound })`. PDF Widgets inspector (`/tools/pdf-extractor`) now lists agents from `useSurfaceBoundAgents("matrx-user/pdf-extractor")` and opens this window for "Add custom agent" — hardcoded shortcut UUIDs + dead `/agents/shortcuts` link removed. `buildBindingTargets` moved to `utils/buildBindingTargets.ts`.
- **2026-07-10** — **Context-menu bound agents were invisible after bind.** Root cause: admin bind UI writes condemned `agent.agent_surface`, but the menu reads `agent.menu_surface` (built from `platform.associations`). Dual-write/remove bridge added on upsert/delete; backfilled Flashcard Generator (K) edges for `matrx-user/notes`, `matrx-user/pdf-widgets`, `matrx-user/tools`, and `matrx-default/default`. Added `surface` to `AssociationTargetType`. Loud `console.error`/`warn` on menu_surface fetch failure and empty surface results (errors were previously swallowed by the hook).
- **2026-07-04** — Registered the orphan **`matrx-user/assistant-message`** surface (the read side of chat: the rendered, read-only conversation thread `AgentConversationDisplay` and `MarkdownContextMenuProvider` mount their right-click menu on). It was used in code but had **no manifest and no `ui_surface` row**, so the v3 menu's `auditSurfaceScope` diagnostic screamed `VALUE MAPPING GAP … has no registered manifest` on every `/chat` menu open (mistaken for a DB-reorg error — it was neither; all requests were 200). New `assistant-message.manifest.ts` (baselines + `conversation_id`/`message_id`/`block_type`/`tool_name`/`diagram_source`, all `alwaysAvailable:false` since they resolve from _where_ the user right-clicked); registered in `registry.ts`; 10 `ui_surface_value` rows + the `ui_surface` row (`parent_surface_name = matrx-user/chat`, `url_pattern = /chat`) seeded direct-SQL to match what manifest-sync would write. Made the declarations truthful: `resolveMarkdownContext` now emits snake_case aliases (`conversation_id`/`message_id`/`block_type`/`tool_name`; `diagram_source` already was) **alongside** the camelCase keys the menu's own action handlers read (`ctx.messageId`), so surface-value bindings and internal wiring both resolve. Nothing was bound to the surface (0 shortcut/agent/pref rows), so no migration.
- **2026-07-02** — Wired `ui_surface.url_pattern` into manifest sync: `SurfaceManifest.urlPattern` optional field, `surface-url-pattern.ts` resolver (manifest → route map → client/local heuristic), drift report section, and sync backfill for manifest surfaces plus any row still empty when a default exists. Root cause: column landed in schema/admin UI but the code-first registration pipeline only mirrored `ui_surface_value` / `ui_surface_agent_role`. — **Condemned the `agent_surface` agent↔surface binding mechanism (see "⛔️ CONDEMNED" section).** Annotated `agent-surface-bindings.service.ts` with `P1`–`P4` (project/task single-FK → M2M; single-scope → M2M; passive active-context vs explicit user selection; bespoke M2M → canonical `platform.associations`). Write paths (`upsertAgentSurfaceBinding`, `bulkUpsertAgentSurfaceBindings`) now fire a `console.error` beacon (Error-Inspector captured) so a silently-successful mis-binding is impossible to miss; read path warns. Added a TEMPORARY compile bridge on the NOT-NULL `organization_id` insert (cast, not a fix — runtime unchanged) so the build stays green while the association-backed replacement is built. No behavior change; module slated for deletion. Also corrected the stale "one scope per scope_type" header in `lib/redux/slices/appContextSlice.ts` (multi-select since 2026-06-12) and documented the active-vs-user-selected context distinction there.
- **2026-06-27** — **Killed the cross-schema embed `PGRST200` in the context-menu agent hydration.** `fetchMenuAgentsFromDb` (`services/surface-bound-agents.service.ts`) was selecting `agent.agent_surface` with embeds `agent:definition!inner(...)` + `organization:organizations(...)` — but once `agent_surface` moved into the `agent` schema, the embed to public `organizations` is cross-schema and PostgREST cannot resolve it (`Could not find a relationship between 'agent_surface' and 'organizations'`). Repointed to the new pre-joined, RLS-safe view **`agent.menu_surface`** (`.select("*")`, same `.in("surface_name", …)` filter); a thin `toBindingRow()` maps the view's hoisted scalars + `agent`/`organizations` jsonb into the existing internal `BindingRow` shape, so the bucketing/dedup logic is untouched. Agent ownership now reads `agent.created_by` (the column the old `definition.user_id` embed exposed — verified identical). The view inner-joins the safe `agent.card`, so only agents whose card is visible to the caller appear (builtins are public → global menu unaffected). Verified live against PostgREST (200, embeds resolve). Same-class cleanups in the same change: deleted the **dead, broken** `getSurfacesForAgent` (`lib/agents/data.ts` — zero callers, carried the identical `ui_surface` cross-schema embed), and fixed the **live** `getSurfaceUsage` tool-bundle embed (`services/surfaces.service.ts`) whose relation names (`tool_bundle_member`/`tool_def`) didn't exist → corrected to `bundle_member`/`definition`.
- **2026-06-25** — **Fixed the cross-surface binding leak + added a batch editor.** _Leak:_ in the 5-panel shell (`columns/BindingColumn.tsx`) the center form derived its target binding **only** from `?binding=<id>`, so selecting an already-bound surface from the left list (which clears `?binding=`) opened a blank "new" form seeded from the `matrx-default/default` binding — showing the wrong mappings and, on Save, **silently overwriting that surface's real binding** (upsert matches by `(agent, surface, scope)`). Fix: (1) **auto-adopt** — when a surface is selected with no `?binding=`, edit its existing binding (prefer the user's scope row) instead of a seeded new form; (2) **gate the Default seed** to surfaces with _no_ binding at all (`!surfaceHasBinding`) so it stays a pure UI starting point; (3) **deep-clone** mappings (`structuredClone`) so a seeded form can never mutate the Redux-held Default binding. Each Save still writes exactly one row. _Batch:_ new `SurfaceBindingsBatchEditor` (`admin/batch/`) at `/agents/[id]/surfaces/batch` (+ admin twin) — copy an existing binding as a template (or blank), pick one scope tier, and stamp the same value-mappings onto many surfaces at once. Reuses `BatchSurfaceSelector`, `ShortcutScopePicker`, `SurfaceVariableBindingList`, and `buildBindingTargets`. Writes via `bulkUpsertAgentSurfaceBindings` (service) / `bulkUpsertAgentSurfaceBindingsThunk` — **N independent single-row upserts** (reusing `upsertAgentSurfaceBinding`/`findBinding`, no `onConflict` since uniqueness is 5 per-tier partial indexes) with per-surface success/failure reporting. Entry point: a **Batch** button in `SurfacesListColumn` (threaded `basePath`).
- **2026-06-24** — Fixed the **collapse/reopen bug** on the resizable columns (left "surfaces" panel "moved, then closed, then wouldn't reopen / opened backwards"). Root cause was in the shared panel infra `PanelControlProvider` (`app/(dev)/demos/resizables/_lib/`): `notifyResize` captured `lastOpenSize` on _every_ drag tick, so a **drag-to-collapse** (which passes through ~minSize before snapping to 0) left `lastOpenSize` at a sliver — the toggle then "reopened" to a few pixels. Fix: don't capture the live drag size (the toggle already captures the accurate pre-collapse size from `getLayout()`), plus a defensive floor on expand (fall back to the panel's default size). Repairs every consumer of the infra (surfaces shell, mac-mail demo, tasks).
- **2026-06-24** — Fixed **resizable column layout** on `/agents/[id]/surfaces`: panel toggles moved back into the shell header (`SurfacesAgentHeaderControls` = `AgentHeader` + four column toggles) and the in-body `SurfacesPanelToggleBar` removed. The body wrapper is again `h-full overflow-hidden` + full-height `ClientGroup`, matching `/tasks` and `/demos/resizables/04-mac-mail` — toggles in the header, columns with `pt-[var(--shell-header-h)]` only.
- **2026-06-24** — Surfaces tab now renders the **common `AgentHeader`** (agent selector, mode tabs Build/Run/Surfaces/…, save status, options) like every other agent sub-route — previously it only showed surface-specific panel toggles, so you couldn't navigate to other modes from it. `SurfacesAdminShell` injects header chrome via `PageSpecificHeader` (works under both `(core)` and `(admin)`) and takes a `basePath` prop (`/agents` vs the admin base) for the mode-tab links.
- **2026-06-23** — Route parity: the per-agent surfaces shell now mounts under the system-agents admin family too (`/administration/agents/system-agents/agents/[id]/surfaces`), mirroring `/agents/[id]/surfaces` with an admin-scoped `backHref`. Required making **`SurfacesAdminShell` layout-agnostic** — it injected its header via the shell-only `PageHeader` (target `#shell-header-center`), which the `(admin)` new-layout group does not render, so its back button vanished there. Swapped to `PageSpecificHeader`, the primitive that targets `#shell-header-center` _then_ falls back to the new-layout's `#page-specific-header-content`, so the same shell now renders correctly under both `(core)` and `(admin)` layouts. (Sibling fix: the `system-agents/agents/[id]/shortcuts/batch` route was also missing — the "Batch" button in `AgentShortcutsPanel` 404'd; `BatchShortcutsEditor` gained an optional `basePath` so its in-component nav stays in the admin shell.)
- **2026-06-23** — Registered **two** conversation-document surfaces: `matrx-user/working-document` (cloud agent reads + writes) and `matrx-user/scratchpad` (cloud agent reads only; surface agents edit). They **share one value set + scope helper** (`manifests/_conversation-document.manifest.ts`, 14 values + 5 baselines) but stay separate because their bound agents differ — the canonical "same shape, different purpose → two surfaces" case. Manifests `working-document.manifest.ts` / `scratchpad.manifest.ts`; `ui_surface` + 19 `ui_surface_value` rows each, synced direct-SQL + verified live. Scope emitted at trigger time by `useWorkingDocumentSurfaceScope` and wired into the editor's `UnifiedAgentContextMenu` in `WorkingDocumentEditor` (mirrors the canonical `/notes` mount; the document's PARTS are the context, the conversation enters as `conversation_id` + `conversation_context`). New `working-document` / `scratchpad` literals in `SourceFeature`. **The surface-recursion model this exercises — a context item becoming its own surface — is documented in `.claude/skills/surface-authoring/SKILL.md` → "What a surface is".**
- **2026-06-23** — `matrx-user/agent-builder` manifest expanded with focused-variable values for the Edit Variable modal: `variable_name`, `variable_help_text`, `variable_default_value`, `variable_required`, `variable_custom_component`, `variable_binding`, and `variable_json`. The Help Text `ProTextarea` emits these alongside the live full-agent scope so bound agents can operate on the exact variable being edited.
- **2026-06-22** — Fixed context-menu launch scope: `buildApplicationScopeFromMenuContext` no longer lets `undefined` keys from stale `contextData` clobber live captured `selection`/`text_before`/`text_after`; falls back `selection` ← `active_text` when nothing is highlighted (notes convention). `UnifiedAgentContextMenu` accepts optional `getApplicationScope` (same contract as ProTextarea) for live ref-based scope at launch.
- **2026-06-23** — Context menu **Bound Agents** submenu: when `UnifiedAgentContextMenu` receives `surfaceName`, it queries `agx_agent_surface` (RLS-filtered) and lists agents grouped as My agents / System / Shared with me / per-org. Launches via `useAgentLauncher().launchAgent` with `runtime.surfaceName` so binding value mappings resolve. **`ProTextarea`** now accepts the same `surfaceName` + `getApplicationScope` props — its "…" menu shows an identical grouped bound-agents section and runs via `useAiPostProcess` with the host surface's bindings. Service: `features/surfaces/services/surface-bound-agents.service.ts`; hook: `features/surfaces/hooks/useSurfaceBoundAgents.ts`.
- **2026-06-22** — Agent surfaces admin (`/agents/[id]/surfaces`, `SurfacesListColumn`): added set-up / not-set-up counts (surfaces with `ui_surface_value` rows via `surfaceValueCount`) and a second filter pill row; composes with the existing bound / unbound filter.
- **2026-06-22** — Registered `matrx-user/rag-search` (the `/rag/search` Search Lab's Agent Chat tab). 11 values: baseline `selection`/`content`/`context` + retrieval scope (`query`, `data_store_id`, `data_store_name`, `source_kinds`, `admin_bypass_acl`, `rerank`, `multi_query`, `use_hyde`). Manifest `rag-search.manifest.ts` + `createRagSearchScope`; `ui_surface` + `ui_surface_value` rows seeded. The Agent Chat tab launches the canonical agent via `useAgentLauncher` with `runtime.surfaceName = "matrx-user/rag-search"` + `applicationScope`, arming the RAG tool family on the run. New `rag-search` value added to the `SourceFeature` union.
- **2026-06-13** — Two reusable primitives added for the Custom Dictionary feature: (1) `ui_surface.supports_dictionary` flag → surfaces so flagged get the user's dictionary auto-injected server-side (resolved into `SurfaceManifest.supports_dictionary`); seeded true for the transcription/TTS surfaces. (2) `user_surface_state` — a generic per-user, per-surface state store (`features/surfaces/user-state/` + `features/surfaces/redux/userStateSlice.ts`, hook `useSurfaceUserState`), the "Level 3" preferences primitive that replaces cookies for surface-scoped state. See `features/dictionary/FEATURE.md`.
- **2026-06-10 (later)** — `matrx-user/transcripts-cleanup` expanded to the
  reference "expose everything" standard: 8 → 36 values (active pane,
  session identity, all container texts incl. `all_custom_outputs`,
  word/char counts, mic/recording/lock state, queued inserts, clean + slot
  agent wiring with run phases, `custom_slots_summary`, `context_items`).
  `CleanupPad.buildScope()` emits all of them (selection family stays with
  the menu). DB synced direct-SQL, verified zero-drift by field-level diff.
  Reference mapping example: agent `Cleanup Surface Demo Reporter`
  (`42971fe0`) + GLOBAL `agx_agent_surface` binding with deliberately
  non-matching names (`working_text` ← `raw_transcript_text`,
  context slots ← arrays) + shortcut `Surface Demo: Session Report`
  (Transcription ai-action category, admin-user-scoped). Use this trio as
  the template when wiring other surfaces.
- **2026-06-10** — Registered `matrx-user/transcripts-cleanup` (the
  `/transcripts/cleanup` page): baseline `selection`/`content`/`context` +
  `session_id`, `session_title`, `raw_transcript_text`,
  `cleaned_transcript_text`, `custom_output_text`. Route prefix added ABOVE
  `/transcripts` in `route-to-surface.ts`. DB rows synced directly
  (`ui_surface` + 8 `ui_surface_value` rows). First consumer of bindings at
  launch-time outside the context menu: the cleanup page's
  `useAiPostProcess` resolves `agx_agent_surface.value_mappings` (most
  specific scope wins) via `resolveValueMappings` before falling back to
  name heuristics / `user_input` — so binding any agent to this surface
  controls exactly which variable/slot receives the transcript.
- **2026-05-15 (bulk push)** — Registered 11 more surface manifests +
  made agent-builder fully functional. New: `matrx-user/documents`,
  `research`, `tasks`, `data-tables`, `files`, `projects`, `messages`,
  `lists`, `canvas`, `ai-results`, `agent-advanced-editor`. The
  agent-builder surface now emits its full scope at runtime via
  `features/agents/hooks/useAgentBuilderSurfaceScope.ts` — the existing
  `UnifiedAgentContextMenu` mounts in `SystemMessage.tsx` /
  `MessageItem.tsx` pass the agent definition (incl. `agent_json`,
  `system_instruction`, model/tools/slots) as `contextData`. **DB synced
  directly** (anon key can't write, service endpoint unreachable from the
  agent shell) via `scripts/emit-surface-sync-sql.ts` → MCP `execute_sql`
  upsert; `ui_surface_value` now mirrors all 20 registered manifests
  (337 values). Emitter wiring still pending for the read-only/list
  surfaces (documents, research, tasks, data-tables, files, projects,
  messages, lists, canvas, ai-results) — manifests + DB are live so
  bindings work; runtime scope emission lands when actions are built.
- **2026-05-05** — v2 page shipped at `/admin/surfaces`. Backend seed
  expanded to 102 surfaces. Banner added to `/admin/lookups` UI Surfaces
  tab pointing at v2.
- **2026-05-05 (later)** — v2.1: drawer, rename via FK cascade, bulk
  delete, candidate inventory dialog, inline client creation, keyboard
  shortcuts.
- **2026-05-15** — `matrx-user/notes` manifest expanded from the Phase 1
  stub (4 surface-specific values) to a full 19 surface-specific + 5
  baseline declaration covering selection / scope mirror, active-note
  metadata, workspace context (open tabs, folder tree), and editor / pane
  state. Renamed `current_note_category` → `current_note_folder`
  (existing name was misleading; zero downstream bindings to migrate).
  Notes editor context menu now emits the surface scope and tags
  `runtime.surfaceName = "matrx-user/notes"` so `agx_agent_surface`
  bindings resolve at launch. See `features/notes/hooks/useNotesSurfaceScope.ts`.
- **2026-05-15 (third pass)** — Bulk manifest publication: 4 new
  surfaces + 1 expanded.
  - `matrx-user/agent-builder` (new) — 18 surface-specific values covering
    agent identity, system_instruction, user_message_draft, model,
    tools, custom_tools, mcp_servers, context_slots,
    variable_definitions, output_schema, settings, plus `agent_json`
    for full-agent inputs and editor focus state. Existing
    `UnifiedAgentContextMenu` mounts in `SystemMessage.tsx` and
    `MessageItem.tsx` updated with `surfaceName="matrx-user/agent-builder"`.
  - `matrx-user/chat` (new) — 16 values: active conversation, targeted
    message (`current_message_*`), last user/assistant, full thread,
    composer draft, streaming state.
  - `matrx-user/agent-run` (new) — 20 values supporting "judge an
    agent" use case: agent_definition + agent_json + user_request +
    variable_values + agent_response + all_messages + tool_calls +
    completion_stats.
  - `matrx-user/scraper` (new) — 14 values: URL + title + content (text
    / markdown / html) + metadata + main_image + links + status +
    execution time.
  - `matrx-user/code-editor` (expanded) — 6 → 12 values:
    `current_file_modified`, `current_column_number`, `selection_range`,
    `current_function_name`, `open_file_count`, `modified_file_paths`.
    Existing `UnifiedAgentContextMenu` mounts in
    `CodeEditorContextMenu.tsx` and `CodeWorkspaceContextMenu.tsx`
    updated with `surfaceName="matrx-user/code-editor"`.

  Total: 9 surfaces, 195 values registered (was 5 / 106). Drift check
  passes. Emitter wiring deferred for chat / agent-run / scraper —
  manifests publishable as-is; runtime emitters land when concrete
  actions are built against each surface.

- **2026-05-15 (later)** — `matrx-user/transcripts` manifest landed —
  24 surface-specific + 3 baseline values covering segment / playback
  mirror (`active_text`, `current_segment_*`, `current_playback_time`),
  transcript identity, the speaker dimension (`speaker_list`,
  `per_speaker_text`), full segments dimension (`all_segments`,
  `all_segments_text`), and media/editor state. Viewer
  (`features/transcripts/components/TranscriptViewer.tsx`) now wraps the
  segment area in `UnifiedAgentContextMenu` with `surfaceName =
"matrx-user/transcripts"`, emitting scope via
  `features/transcripts/hooks/useTranscriptsSurfaceScope.ts`. Audio
  playback state is read live from the `<audio>` ref at trigger time so
  the emitted `current_playback_time` / `current_segment_*` are
  click-accurate. New `transcripts` value added to the `SourceFeature`
  union. Sister surface `matrx-user/transcript-studio` (live recording
  with 3 agent pipelines) is intentionally NOT bundled — it has existing
  hand-coded scope vocabulary to preserve and warrants its own PR.
