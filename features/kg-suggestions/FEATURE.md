# FEATURE.md — `kg-suggestions`

**Status:** `active`
**Tier:** `1`
**Last updated:** `2026-06-08`

---

## Purpose

The Knowledge-Graph suggestion UI. Surfaces the backend's KG → scope-item
association proposals as lightweight, non-blocking chips, popovers, panels, and
a global inbox drawer. A suggestion proposes filling one scope-item slot (or —
for `heavy_hitter` — promoting a recurring entity to a brand-new scope).
**Suggestions are never auto-applied:** accept is explicit; reject and defer are
one click and never destructive. Phase F of the Knowledge-Graph plan.

---

## Entry points

**Components**
- `KgSuggestionsChip` (`components/KgSuggestionsChip.tsx`) — compact "N pending"
  badge for a source surface (note/task/…); opens a popover; hidden at count 0.
- `KgSuggestionsPopover` (`components/KgSuggestionsPopover.tsx`) — the list body
  for one filter (source or scope-item).
- `ScopeItemSuggestionsPanel` (`components/ScopeItemSuggestionsPanel.tsx`) —
  embedded under a scope-item slot editor ("N suggested fills for <slot>").
- `GlobalSuggestionsDrawer` (`components/GlobalSuggestionsDrawer.tsx`) — the
  global inbox; Drawer on mobile, right Sheet on desktop; grouped by source +
  a heavy-hitter section, all CONFIDENCE-RANKED (strongest first). Low-confidence
  (<50%) rows are excluded from the list and folded into a single "review in the
  manager" banner at the bottom; the header count reflects only shown rows.
  Rendered (gated) by the overlay system.
- `HeavyHitterSuggestionsInbox` (`components/HeavyHitterSuggestionsInbox.tsx`) —
  the "Suggest a scope" card on the `/scopes` hub (Phase F.4).
- `KgSuggestionsNavButton` (`components/KgSuggestionsNavButton.tsx`) — a
  button-with-count-badge that opens the global drawer; dropped into `/scopes`.
- `KgSuggestionRowItem` (`components/KgSuggestionRowItem.tsx`) — the ONE shared
  DECISION CARD used by every surface above. For a slot-fill it resolves and
  shows: the SOURCE (resolved title for any kind + a kind-agnostic **"Preview
  source"** action — `PreviewSourceButton`), the TARGET path in plain words
  (org › scope-type › scope › item, + "View" link), the CHANGE (current value →
  suggested, with a loud overwrite warning + destructive ConfirmDialog when a
  value already exists), every field on the target scope (targeted one
  highlighted), confidence, match-kind, and a "Detected …" timestamp.
  Heavy-hitter rows keep the lightweight "promote to a scope" treatment but now
  also surface the source line + snippet + "Preview source". Accept/reject/defer
  come from the hook. The value card also exposes a DEFER-WITH-NOTE popover (the
  small note icon beside "Defer") and renders any existing `decision_note` so
  deferred rows explain themselves when they resurface. The snippet block is a
  one-click preview trigger when a host provides a preview controller.

**Source preview** (`components/source-preview/`) — review the document a
suggestion came from, with its `context_snippet` highlighted, in a non-blocking
panel that NEVER dismisses the inbox.
- `SuggestionSourcePreview` (`source-preview/SuggestionSourcePreview.tsx`) — the
  read surface: header (kind icon + title + meta + "Open" link-out), the
  verbatim snippet callout (the guaranteed evidence, always shown), and the
  source body with the snippet highlighted + scrolled into view. Degrades to
  snippet-only + link-out when no body is loadable.
- `SourcePreviewPanel` (`source-preview/SourcePreviewPanel.tsx`) — wraps the
  preview in the reusable `MatrxDynamicPanel` ("flexible panel" — fixed,
  resizable, repositionable, no backdrop). Mounted only while a target is
  active; the outer wrapper carries `data-source-preview-panel`. Lazy-loads the
  panel via `next/dynamic` (`ssr:false`).
- `SourcePreviewContext` (`source-preview/SourcePreviewContext.tsx`) — the host
  owns the active target via `useSourcePreviewController`, exposes only
  `openPreview` to descendant cards via `SourcePreviewProvider`, and renders the
  panel itself. A card calls `useOpenSourcePreview()`; absent a provider (compact
  popover/chip), the card falls back to a window open / new-tab link-out.

**Management surface** (`components/manager/`, route `/suggestions`) — a
dedicated power-user table for triaging EVERY suggestion (any status), distinct
from the three cache-keyed inbox views.
- `SuggestionsManager` (`components/manager/SuggestionsManager.tsx`) — the
  orchestrator: a stats summary strip, the filter bar, a bulk-action bar
  (accept/defer/reject/star across the selection), the table (desktop) or
  stacked decision cards (mobile — tables are banned on phones), and server-side
  pagination. Stamps rows `viewed_at` as they load. Low-confidence (<50%) rows
  are pulled out of the main table into a collapsed, muted footer section with a
  "Dismiss all" action (skipped when the user explicitly filters by confidence).
- `SuggestionsFilterBar` (`components/manager/SuggestionsFilterBar.tsx`) —
  multi-status chips + stage / org / scope-type / scope / field / source /
  confidence selects + starred-only / unseen-only toggles + free-text search.
  Dimension option lists are derived from the loaded rows (search covers the
  rest). Every change flows up via `patchQuery` (resets to page 0).
- `SuggestionsTable` (`components/manager/SuggestionsTable.tsx`) — the dense,
  sortable desktop table. Leads with a prominent **Source file** column (file/
  note icon + resolved filename + a one-click snippet preview that opens the
  floating source panel) because the file a suggestion came from is the most
  important triage signal. Then scope / field / org / confidence / status /
  detected (sort SERVER-SIDE), a per-row star, unseen dot, inline quick
  accept/defer/reject (pending) or restore (decided), row select for bulk, and
  an expand row that renders the canonical `KgSuggestionRowItem` decision card.
  Filenames come from `useSuggestionsQuery`'s batch-resolved `sourceTitles` map
  (keyed by `sourceRefKey`), so the column fills without per-row reads.

**Enrichment layer** (resolves opaque ids → human-readable decision context)
- `service/kgEnrichmentService.ts` (`enrichSuggestion`) — combines the scopes
  chokepoint's `resolveSuggestionTarget` (org/type/scope/item path, all items,
  current values) with a source-title lookup. Title resolution is delegated to
  `sourcePreviewService.resolveSourceTitle` (multi-kind: note/task/project/
  transcript/conversation/file/code_file + ingested-doc fallback) — no longer
  notes-only.
- `service/sourcePreviewService.ts` — the SOURCE read layer. `resolveSourceTitle`
  (lightweight, per-kind, used by the always-on card line), `resolveSourceTitles`
  (BATCH — one query per kind across a whole page, used by the manager table),
  and `loadSourcePreview` (full body — direct-Supabase per kind: notes/ctx_tasks/
  ctx_projects/transcripts/cx_conversation/user_files/code_files; bodies for
  files/scraped/unknown kinds come from the ingested
  `processed_documents.clean_content`/`content`). Never throws — degrades to a
  `notFound` doc. `sourceLinkFor` is the chunk-less link-out router (sibling of
  `rag/api/search.ts#citationHrefFor`).
  - **`cld_file` titles come from `processed_documents.name`, NOT `user_files`.**
    A `cld_file` suggestion's `source_id` is the ingested doc's `source_id` (the
    cloud-file id), which is **not** a `user_files.id` — resolving against
    `user_files` returns null (the old "Untitled file" bug). Resolution reads
    `processed_documents` keyed by `(source_kind, source_id)`, preferring the
    ROOT doc (`parent_processed_id is null`) so the title is the clean original
    filename, not a derived "… (agent extract run …)" name.
- `hooks/useKgSuggestionEnrichment.ts` — per-card resolver with a module-level
  promise cache keyed by suggestion id (dedupes repeat/concurrent resolves).
- `hooks/useSourcePreviewDoc.ts` — on-demand source-body loader, promise-cached
  by `kind:id` (mirrors the enrichment hook's caching).
- `scopesService.resolveSuggestionTarget({ scopeId, contextItemId })` — the
  read RPC-shaped method (in the ctx_* chokepoint) returning
  `ResolvedSuggestionTarget` (`features/scopes/types.ts`).

**Hooks**
- `useKgSuggestions(filter, { autoFetch })` (`hooks/useKgSuggestions.ts`) — the
  single read+write hook. Filter is one of `{ sourceKind, sourceId }` |
  `{ scopeItemId }` | `{ global: true }`. Returns
  `{ items, count, status, error, accept, reject, defer, refresh }`.
- `useSuggestionsQuery(initial?)` (`hooks/useSuggestionsQuery.ts`) — the
  manager's data layer: owns `KgSuggestionsQuery` state, reads the enriched
  `v_scope_suggestions` view (server-side filter/sort/paginate, NOT the slice
  cache), loads `v_scope_suggestion_stats`, and exposes
  accept/reject/defer/star/restore. Decisions reuse the SAME accept branching
  and mirror busy state through the kgSuggestions slice mutation map (so the
  shared row spinner works), then optimistically drop + reconcile.
- `useAutoRagPreference()` (`hooks/useAutoRagPreference.ts`) — reads/writes the
  per-user `user_preferences.auto_rag_enabled` opt-out (React → Supabase).

**Services**
- `service/kgSuggestionsService.ts` — **direct-Supabase** data layer (the
  aidream `/kg-suggestions` HTTP API was DELETED 2026-06-07; aidream is a pure
  producer of rows). Reads/decides straight against the two RLS-scoped ledgers:
  `listKgSuggestions(filter)` (normalizes both tables → `KgSuggestionRow[]`),
  `rejectKgSuggestion(row)` / `deferKgSuggestion(row)` (direct status +
  `suppressed_until` update), `acceptValueSuggestion(row)` (Stage B →
  `set_context_value` RPC + mark accepted), `acceptAssociationSuggestion(row)`
  (Stage A link → tag source via `setEntityScopes` + mark accepted),
  `markKgSuggestionAccepted(row)`. Reject/defer take an optional `note`
  (persisted to `decision_note`). Manager-only reads/writes:
  `queryScopeSuggestions(query)` (server-side filter/sort/paginate over
  `v_scope_suggestions` → `KgEnrichedSuggestionRow[]` + total),
  `fetchScopeSuggestionStats()` (`v_scope_suggestion_stats`),
  `restoreKgSuggestion(row)` (back to `pending`), `setKgSuggestionStarred(row,
  starred)`, `markKgSuggestionsViewed(rows)` (best-effort `viewed_at` stamp).

**Data source** (no API — React → Supabase directly, RLS-scoped to `auth.uid()`)
- Read both ledgers with `supabase.from(...).select(...)`.
- Reject/defer: a direct `update` (30-day / 7-day suppression window).
- Accept a Stage-B value: the `set_context_value` SECURITY DEFINER RPC (via the
  scopes chokepoint `scopesService.setContextValue`), then mark `accepted`.
- Accept a Stage-A link: tag the source to the scope (`ctx_scope_assignments`
  chokepoint), then mark `accepted`. Heavy-hitter: create a scope + tag source.

**Redux slice**
- `lib/redux/slices/kgSuggestionsSlice.ts` — `kgSuggestions`. Normalized
  `byId` + per-filter-key list entries + per-row mutation flag.

**Drop-in surfaces** (where the chip / nav button / panels are mounted)
- `features/notes/components/NoteContextPicker.tsx` — chip (`sourceKind: note`).
- `features/tasks/components/TaskScopeTags.tsx` — chip (`sourceKind: task`).
- `features/scopes/components/management/ScopesHub.tsx` — nav button + heavy-
  hitter inbox.
- `features/settings/tabs/PrivacyTab.tsx` — auto knowledge-graph toggle.
- `features/overlays/*` — global drawer registered as `kgSuggestionsDrawer`.
- `app/(core)/suggestions/page.tsx` — the dedicated manager route (SSR auth
  shell + `<SuggestionsManager>` client island). Linked from the `/scopes` hub
  quick-links and the global drawer header ("Open full manager").

---

## Data model

**Database tables** (Supabase — RLS-scoped to `auth.uid() = user_id`; produced
by the aidream auto-ingest NER orchestrator, read/decided by the FE directly)
- `public.scope_association_suggestions` (**Stage A**) — "this document belongs
  to scope X". `match_kind`: `exact` | `fuzzy` | `semantic` | `heavy_hitter` |
  `agent.orienter.association` | `agent.orienter.uncertain`. `target_scope_id`
  null for heavy_hitter (no scope yet — `suggested_value` is the proposed name).
- `public.scope_item_value_suggestions` (**Stage B**) — "scope X's slot K should
  hold value V". `target_scope_id` / `target_context_item_id` / `target_slot_key`
  / `suggested_value` NOT NULL; `current_value_snapshot` for improve/conflict.
  `match_kind`: `agent.slot_filler.fill_empty` | `…improve` | `…flag_conflict` |
  `agent.deep_extractor.extracted`.
- `public.kg_suggestion_ack` — per-user "permanently dismissed" set for the
  global notifier toast.
- `public.user_preferences.auto_rag_enabled` — per-user opt-out.

**Manager columns + views** (migration `kg_014`)
- Both ledgers gained `decision_note text`, `viewed_at timestamptz`, and
  `is_starred boolean not null default false`, plus org/scope/item indexes for
  the manager's filter/sort dimensions.
- `public.v_scope_suggestions` (`security_invoker`) — a denormalized UNION of
  both ledgers with org / scope-type / scope / item names JOINED in, so the
  manager filters/sorts/paginates by human-readable values SERVER-SIDE while RLS
  on the base tables still scopes every row to `auth.uid()`.
- `public.v_scope_suggestion_stats` (`security_invoker`) — per-(org, status,
  starred) counts for the manager's summary strip.

> The two raw rows have DIFFERENT column names (Stage A: `target_scope_item_id`/
> `target_slot_name`, both null for links; Stage B: `target_context_item_id`/
> `target_slot_key`). The service NORMALIZES both into one `KgSuggestionRow`
> discriminated by `stage`, so every surface consumes a single shape.

**Key types** (`types.ts`)
- `KgSuggestionRow` (normalized, `stage: "association" | "value"`),
  `KgMatchKind` (`KgAssociationMatchKind | KgValueMatchKind`),
  `KgSuggestionStatus`, predicates `isHeavyHitter` / `isAssociationLink` /
  `isValueSuggestion`.
- `KgSuggestionsFilter` (`KgSourceFilter | KgScopeItemFilter | KgGlobalFilter`)
  + `kgFilterKey` (the three cache-keyed inbox views).
- `KgEnrichedSuggestionRow` (extends `KgSuggestionRow` with the view's
  org/scope-type/scope/item labels — so the shared card accepts it unchanged),
  `KgSuggestionsQuery` (the manager's free-form, server-side query params), and
  `KgSuggestionSortField`. `KgSuggestionRow` now carries `decision_note`,
  `is_starred`, `viewed_at`.
- `set_context_value` payload/result types live in `features/scopes/types.ts`
  (`SetContextValuePayload`, `SetContextValueResult`, `ContextSourceType`).

---

## Key flows

**1. Chip on a note → accept a slot fill**
- Trigger: `NoteContextPicker` renders `<KgSuggestionsChip filter={{ sourceKind:
  "note", sourceId }} />`.
- `useKgSuggestions` derives `kgFilterKey`, dispatches a list thunk →
  `listKgSuggestions` → `GET /kg-suggestions?status=pending&source_kind=note&
  source_id=…`. Rows land in the slice; the chip shows the count (hidden if 0).
- Click → `KgSuggestionsPopover` lists rows. Accept → `acceptKgSuggestion(id)` →
  `POST /{id}/accept`. On success the row is removed from EVERY list that held
  it (`removeFromLists`), so the chip count and the global drawer both drop in
  one tick; a `toast.success` shows the filled value.
- Exit: chip count decremented (or chip hidden at 0).

**2. Global drawer**
- Trigger: `KgSuggestionsNavButton` (in `/scopes`) → `useOpenKgSuggestionsDrawer`
  → `dispatch(openOverlay({ overlayId: "kgSuggestionsDrawer" }))`.
- `OverlayController` renders `<GlobalSuggestionsDrawer>` gated on the overlay
  open flag. It fetches the global pending list, groups by `source_kind`, and
  splits out `heavy_hitter` rows into a "Suggest a scope" section.
- Accept/reject/defer behave exactly as in flow 1 (shared row + hook).

**3. Heavy-hitter → create scope (wired 2026-06-02)**
- `HeavyHitterSuggestionsInbox` filters the global list to
  `match_kind === "heavy_hitter"`.
- The LIVE accept contract (read 2026-06-02,
  `aidream/api/routers/kg_suggestions.py`): `POST /kg-suggestions/{id}/accept`
  on a heavy_hitter row takes NO request body. It flips the suggestion to
  `accepted` server-side and returns a `KgHeavyHitterAcceptPlan` — the entity,
  a suggested scope name, and the owner-scoped source mentions to tag. Scope
  creation is a frontend-owned write path (React → Supabase, per the scopes
  invariant), so the backend hands back a plan rather than creating the scope.
- The row's "Create scope" button opens `HeavyHitterAcceptDialog` (Dialog
  desktop / Drawer mobile): the user confirms/edits the scope name and picks a
  scope type from their org's existing types (loaded via the agent-context
  `fetchScopeTypes` / `list_scope_types` RPC, default pre-selected by matching
  the KG entity kind to a type label). Confirm runs `useHeavyHitterAccept`:
  accept → create scope (`createScope` thunk → `create_scope` RPC) → tag each
  mappable source via `scopesService.getEntityScopes` + `setEntityScopes`
  (additive — preserves a source's existing tags).
- **Reused primitives, no forks.** Scope creation uses the SAME `createScope`
  thunk as `NewScopeInline` / `HierarchyCascade`. Tagging uses the canonical
  `ctx_scope_assignments` chokepoint. No parallel scope-create or tagging path
  was introduced.
- **Source-kind mapping.** `kgSourceKindToEntityType` maps RAG source kinds to
  taggable `ScopeAssignmentEntityType`s (`note`→note, `task`→task,
  `project`→project, `conversation`→conversation, `cld_file`→file). Untaggable
  kinds (`transcript`, `scraped`, `code_file`, `repository`, `library_doc`) are
  counted and reported in the toast — never silently dropped.
- **Accept-succeeded-but-create-failed edge.** `accept` flips status
  server-side BEFORE scope creation. If creation then fails,
  `useHeavyHitterAccept` returns `failedStage: "create"` and the dialog surfaces
  a recoverable error ("Suggestion accepted, but scope creation failed — create
  the scope manually from /scopes") rather than a confusing silent failure.

**4. Auto-RAG opt-out**
- `PrivacyTab` → "Auto knowledge-graph" switch → `useAutoRagPreference.setEnabled`
  upserts `user_preferences.auto_rag_enabled`. Optimistic; rolls back + toasts
  on error.

**5. Preview a source (non-blocking review)**
- A host (`GlobalSuggestionsDrawer`, `SuggestionsManager`) calls
  `useSourcePreviewController`, wraps its cards in `SourcePreviewProvider`, and
  renders `<SourcePreviewPanel>`.
- A card's "Preview source" button / snippet → `useOpenSourcePreview()` sets the
  host's local target → `SourcePreviewPanel` mounts a `MatrxDynamicPanel` and
  `SuggestionSourcePreview` loads the body (`useSourcePreviewDoc`) and highlights
  the snippet. The inbox surface never unmounts.
- In the drawer, the Sheet/Drawer guards `onInteractOutside` /
  `onPointerDownOutside` / `onEscapeKeyDown` while previewing, so reviewing the
  source can't dismiss the inbox; Escape closes the preview first.

---

## Invariants & gotchas

- **Suggestions are SUGGESTIONS.** Accept is the only mutation that fills a
  slot, and it's explicit. Reject/defer are non-destructive → NO `ConfirmDialog`
  (per CLAUDE.md, confirms are only for destructive paths). Results are toasts.
- **One shared row.** Every surface renders `KgSuggestionRowItem` — never fork
  the row UX. Accept/reject/defer come from the hook, not the component.
- **Source preview is non-blocking, host-owned, and never dismisses the inbox.**
  The preview target lives in the HOST's local state (`useSourcePreviewController`),
  not Redux — opening it must not touch the suggestion cache or close the drawer.
  Reuse `MatrxDynamicPanel` for the surface; don't add a new panel primitive. A
  card requests a preview via `useOpenSourcePreview()` and MUST tolerate a `null`
  controller (compact surfaces) by falling back to a link-out, never crashing.
- **One source read layer.** Source titles + bodies + link-outs come from
  `sourcePreviewService` (and `useSourcePreviewDoc` for bodies). Don't re-query
  source tables ad hoc from a card or fork a second title resolver — extend the
  per-kind switch there.
- **Cross-surface sync via normalized cache.** A decision removes the row from
  every list key, so a note chip and the global drawer update together. Don't
  add a parallel per-surface cache.
- **The chip `filter` is keyed on `source_kind`/`source_id`, NOT
  `ScopeAssignmentEntityType`.** A suggestion's source (transcript, scraped,
  cld_file, …) is broader than the set of taggable entities; coupling to the
  narrower union would wrongly exclude sources.
- **Global drawer is overlay-system, not a parallel render tree.** It is
  registered as `kgSuggestionsDrawer` (overlay-id + catalogue entry + opener +
  gated block in `OverlayController.tsx`). Open it only via
  `useOpenKgSuggestionsDrawer` — never dispatch `openOverlay` directly.
- **`auto_rag_enabled` is not in generated `database.types` yet** (Phase A
  applied the column to the DB; FE types regen is pending). The hook bridges the
  gap with a localized cast and a TODO. Regenerate Supabase types to remove it.
- **No API — decisions write to Supabase directly.** The `/api/kg-suggestions`
  routes are gone. Reads, reject/defer, and accept all go React → Supabase
  (RLS-scoped). Don't reintroduce a Python hop for reading or deciding.
- **`set_context_value` is the ONLY ctx-value write path.** Accepting a Stage-B
  value goes through `scopesService.setContextValue` (the SECURITY DEFINER RPC).
  Never insert/update `ctx_context_item_values` directly.
- **Heavy-hitter accept is fully FE-owned, source-tagging is degraded in v1.**
  There's no server "plan" anymore. `useHeavyHitterAccept` creates the scope
  (`createScope` thunk → `create_scope` RPC) and tags ONLY the suggestion's own
  source document — the old plan listed every doc mentioning the entity from
  `rag.kg_chunk_entities`, which is not exposed to PostgREST. The scope is still
  created and useful; further docs are tagged from normal scope-tagging UIs.
  This is the documented v1 boundary (handoff §5 open question).
- **Accept branches on `stage`.** `useKgSuggestions.accept(id)` resolves the row
  from the normalized store and routes: `value` → `acceptValueSuggestion`,
  link → `acceptAssociationSuggestion`, `heavy_hitter` → throws (use the
  create-scope dialog). Reject/defer are stage-agnostic table updates.
- **Two read paths, one decision UX.** The three inbox views read the slice
  cache via `useKgSuggestions(filter)`; the manager reads the enriched view via
  `useSuggestionsQuery` (NOT the slice). Both feed the SAME
  `KgSuggestionRowItem`. Don't merge the read paths (the manager needs
  server-side sort/paginate over every status; the inbox needs the shared
  normalized cross-surface cache) and don't fork the decision card.
- **`decision_note` is written ONLY when provided.** `markDecided` skips the
  column when no note is passed, so a plain accept never clears a note left at
  defer time.
- **Manager filter option lists come from loaded rows.** Org/scope-type/scope/
  field dropdowns reflect the current result page; free-text `search` (ilike on
  item label / scope name / suggested value) covers anything off-page. If a
  full distinct-values list is ever needed, add a dedicated read — don't widen
  the page size.

---

## Related features

- Depends on: `features/scopes` (target slots, `/scopes` hub, EntityScopeTagger
  drop-in points), `features/overlays` (global drawer), `features/settings`
  (auto-RAG toggle host), `lib/python-client` (aidream transport).
- Depended on by: none (leaf UI feature).
- Cross-links: `features/administration/kg-inspector/` (sibling read-only KG
  data viewer, Phase C.5 — same React→Python convention),
  `features/scopes/FEATURE.md`, `features/overlays/FEATURE.md`.

---

## Doctrine compliance

**Primitives reused**
- Types: aidream wire shapes are mirrored (the kg-inspector sibling does the
  same — there is no generated OpenAPI types file for this surface).
- Components: `components/ui/{popover,drawer,sheet,badge,skeleton,scroll-area,
  tooltip,button,card}`, `components/official/settings/*` (PrivacyTab),
  `lucide-react` icons, `sonner` toasts.
- Redux slices / selectors: registered in `lib/redux/rootReducer.ts`;
  `selectUserId` (`lib/redux/selectors/userSelectors`),
  `selectActiveOrganizationId` (scopes).
- Hooks: `useAppDispatch` / `useAppSelector` (typed), `useIsMobile`.
- Services: `@/utils/supabase/client` (direct RLS-scoped reads/writes),
  `scopesService` chokepoint (`setContextValue` / `getEntityScopes` /
  `setEntityScopes` / `resolveSuggestionTarget`).

**Primitives introduced**
- `kgSuggestionsSlice` (`lib/redux/slices/kgSuggestionsSlice.ts`) — Why a new
  slice: this is the FIRST KG slice; no existing slice models user-scoped,
  long-lived suggestion rows with a per-filter keyed cache. Considered
  extending: `appContextSlice` / scopes slices. Rejected because: suggestions
  are a distinct resource with their own lifecycle (accept/reject/defer +
  suppression) and must NOT touch global context.
- `useKgSuggestions` (`hooks/useKgSuggestions.ts`) — Why a new hook: no existing
  hook reads the `/kg-suggestions` API or the three-view filter union.
  Considered extending: `useEntityScopes`. Rejected because: that hook owns
  scope ASSIGNMENTS (writes `ctx_scope_assignments`), an orthogonal concern.
- `KgSuggestionRowItem` + surface components — Why new: no existing component
  renders a suggestion. They compose existing UI primitives; the row is the
  single reuse point so the four surfaces don't duplicate the UX.

**State approach (slice vs react-query) — justification:** Redux RTK slice.
The repo has both `@tanstack/react-query` and Redux; react-query is used for
isolated server reads, while cross-surface SHARED state lives in Redux. This
feature needs exactly that: a chip on a note, a panel on a scope slot, and a
global drawer all reflect the same suggestion data, and an accept on one surface
must clear the count on the others. A normalized slice keyed by `kgFilterKey`
gives a shared cache + memoized count selectors any surface can read. The plan
also names `lib/redux/slices/kgSuggestionsSlice.ts` as the canonical home.

---

## Current work / migration state

As of 2026-06-07 the FE talks to Supabase directly — the aidream
`/kg-suggestions` API is deleted (migration `kg_013` split the single ledger
into `scope_association_suggestions` + `scope_item_value_suggestions`). All
reads + decisions are direct, RLS-scoped. Built and compile-verified against the
live table shapes (confirmed via Supabase MCP) and the `set_context_value` RPC;
end-to-end runtime needs NER to produce live rows in both ledgers.

---

## Change log

- `2026-06-18` — **Association-link decision card surfaces the source inline.**
  `KgSuggestionRowItem` (association-link branch) now leads its source section
  with an explicit "Source — where this suggestion came from" label, keeps the
  structured `Item type` / `Item name` rows and adds a matching `Agent comments`
  row (the `context_snippet` reasoning), then renders a real clamped preview of
  the source body via the cached `useSourcePreviewDoc` (new `SourceItemPreview`
  sub-component) that doubles as the link to the full source-preview panel.
  Confidence bar + `%` + match badge moved into the bottom action row to save
  vertical space. Slot-fill and heavy-hitter branches unchanged.
- `2026-06-14` — **Low-confidence (<50%) suggestions are de-emphasized
  everywhere; drawer is confidence-ranked.** New shared floor
  `LOW_CONFIDENCE_THRESHOLD = 0.5` (`constants.ts`, `isLowConfidence`). The
  producer's sub-50% proposals are mostly noise, so: (1) the global notifier
  (`KgNewSuggestionNotifier`) no longer counts them — it only interrupts for
  strong suggestions; (2) the drawer (`GlobalSuggestionsDrawer`) now sorts
  heavy hitters + each source group by confidence DESC (groups ordered by their
  strongest member) and keeps low-confidence rows OUT of the list, folding them
  into one quiet "N more low-confidence suggestions (<50%) hidden — review in
  the manager" banner; the header count reflects only what's shown; (3) the
  manager splits low-confidence rows out of the main table into a collapsed,
  muted footer section (`SuggestionsManager`) with a "Dismiss all" action — they
  stay reviewable but visibly flagged as weak. New plumbing: `maxConfidence` on
  `KgSuggestionsQuery` + `.lt("confidence", …)` in `queryScopeSuggestions`;
  `useSuggestionsQuery` now runs a third (low-quality) fetch (skipped when the
  user explicitly filters by confidence), applies the floor to the main table +
  heavy-hitter fetches, and reconciles decisions/star/source-titles across the
  new `lowQuality` list (`lowQuality`, `lowQualityTotal`).
- `2026-06-14` — **Filenames now resolve everywhere + a prominent Source-file
  column.** Root-cause fix: a `cld_file` suggestion's `source_id` is the ingested
  document's `source_id` (the cloud-file id), NOT a `user_files.id`, so
  `resolveSourceTitle` was querying `user_files` by id, finding nothing, and
  every card/drawer/manager row showed "Untitled file" — even though the
  filename was the single most important triage signal. `resolveSourceTitle`
  (and `loadFile`/`fetchProcessedDocument`) now read
  `processed_documents.name` keyed by `(source_kind, source_id)`, preferring the
  ROOT doc (`parent_processed_id is null`) for the clean filename rather than a
  derived "… (agent extract run …)" name; `user_files` remains a fallback. Added
  `resolveSourceTitles` (batch — one query per kind across a page) + threaded a
  `sourceTitles` map through `useSuggestionsQuery`. The `/suggestions` manager
  table now LEADS with a **Source file** column (icon + filename + inline snippet
  + one-click floating preview), so the file a suggestion came from is visible at
  a glance instead of buried in an expanded card. `loadViaProcessedDocument` also
  surfaces the ingested mime type in the preview meta.
- `2026-06-14` — **Source preview + non-blocking review.** Suggestions now show
  the actual document they came from, with the `context_snippet` highlighted in
  context, in a resizable non-blocking panel that never dismisses the inbox. New
  `service/sourcePreviewService.ts` (multi-kind direct-Supabase source titles +
  bodies + `processed_documents` fallback + `sourceLinkFor` link-out router),
  `hooks/useSourcePreviewDoc.ts` (promise-cached body loader), and
  `components/source-preview/` (`SuggestionSourcePreview` read surface +
  `SourcePreviewPanel` wrapping the reusable `MatrxDynamicPanel` +
  `SourcePreviewContext` host controller / card hook). `kgEnrichmentService`
  delegates title resolution to the new service (was notes-only → now all common
  kinds). `KgSuggestionRowItem` replaces the notes-only "Open" with a
  kind-agnostic `PreviewSourceButton` across the link / slot-fill / heavy-hitter
  variants and makes the snippet a preview trigger; absent a host controller it
  falls back to a window open / new-tab. `GlobalSuggestionsDrawer` and
  `SuggestionsManager` host the controller + panel; the drawer guards
  Sheet/Drawer outside-interaction so previewing can't close the inbox. (The
  manager uses the same floating `MatrxDynamicPanel` rather than an inline split
  — one reused, resizable, repositionable surface across both inboxes.)
- `2026-06-08` — **Suggestions manager + defer-with-note + star/seen.** One
  Supabase migration (`kg_014`) added `decision_note` / `viewed_at` /
  `is_starred` to both ledgers, org/scope/item manager indexes, and two
  `security_invoker` read views — `v_scope_suggestions` (denormalized UNION with
  org/scope/item names joined for server-side filter/sort/paginate) and
  `v_scope_suggestion_stats` (summary counts). New dedicated route
  `/suggestions` (`app/(core)/suggestions/page.tsx`) with a full management UI
  (`components/manager/`: `SuggestionsManager` + `SuggestionsFilterBar` +
  `SuggestionsTable`) and its own data hook `useSuggestionsQuery` (reads the
  enriched view, not the slice cache; reuses the shared accept branching + the
  slice mutation map for busy state). Added service reads/writes
  `queryScopeSuggestions`, `fetchScopeSuggestionStats`, `restoreKgSuggestion`,
  `setKgSuggestionStarred`, `markKgSuggestionsViewed`; threaded an optional
  `note` through reject/defer (persisted to `decision_note`) and gave
  `KgSuggestionRowItem`'s value card a defer-with-note popover + a render of any
  existing note. Entry points: a "Suggestions" quick-link on the `/scopes` hub
  and an "Open full manager" link in the global drawer header. Also fixed
  `scopesService.setContextValue`'s envelope decode (the `set_context_value` RPC
  is now generated as `Returns: Json` → `unknown`; decode via an optional-field
  shape, not a discriminated-union cast that doesn't narrow off `unknown`).
- `2026-06-08` — **Manager: heavy-hitter section + confidence ranking + sticky
  header + split Type/Scope columns.** `useSuggestionsQuery` now runs two reads:
  the main table (heavy hitters excluded via a new `excludeHeavyHitter` option on
  `queryScopeSuggestions`) and a separate confidence-ranked heavy-hitter fetch
  (forced `stage=association` + `match_kind=heavy_hitter`, no pagination), exposed
  as `heavyHitters`. Default sort is now `confidence desc`. Decisions/star/restore
  reconcile across both lists (`dropRow`, dual-list star flip). The manager pins a
  prominent "Suggested scopes" section above a single `overflow-auto` table
  container — heavy hitters lead the page (and carry a note that field fills depend
  on them), and the table's `<thead>` now actually sticks. `SuggestionsTable`
  splits the stacked scope cell into separate `Type` | `Scope` columns.
- `2026-06-07` — **Migrated to direct-Supabase (API deleted).** The aidream
  `/api/kg-suggestions` HTTP API was removed; aidream is now a pure producer.
  Migration `kg_013` split the suggestions into two RLS-scoped ledgers —
  `scope_association_suggestions` (Stage A, doc→scope links) and
  `scope_item_value_suggestions` (Stage B, slot→value fills). Rewrote the FE to
  read/decide directly against Supabase: `kgSuggestionsService` now normalizes
  both raw rows into one `stage`-discriminated `KgSuggestionRow`; reject/defer
  are direct row updates with suppression windows; Stage-B accept calls the new
  `scopesService.setContextValue` (`set_context_value` SECURITY DEFINER RPC) and
  marks the row accepted; Stage-A link accept tags the source via the
  `ctx_scope_assignments` chokepoint. `KgSuggestionRowItem` gained a third card
  variant — the "tag this source to scope X" link card (`agent.orienter.*` /
  `exact`/`fuzzy`/`semantic`) — alongside the value card and heavy-hitter card.
  `useHeavyHitterAccept` no longer consumes a server plan: it creates the scope
  and tags the originating source (rag.kg_chunk_entities isn't exposed, so the
  full source rollup is a documented v1 gap). Implemented `setContextValue` in
  the scopes chokepoint; added both tables to `types/database.types.ts`. Deleted
  the python-client transport + all API-only wire types.
- `2026-06-06` — **Global new-suggestion notifier.** Added an app-wide,
  route-agnostic nudge so a user learns about suggestions produced by a
  background/overnight RAG-NER batch even when they're elsewhere in the app.
  `KgNewSuggestionNotifier` (mounted in `app/DeferredSingletons.tsx` via
  `next/dynamic`, fires after idle) compares the global pending list against a
  durable per-user ack set and, if anything is genuinely new, shows ONE delayed
  sonner toast (`Review` → opens the drawer · `Don't show again` · close). Two
  dismissal tiers: close is transient (may resurface on reload, nothing
  persisted); "Don't show again" writes an ack row per current suggestion id so
  those never re-trigger — but a brand-new id still pops. New table
  `public.kg_suggestion_ack` (user_id, suggestion_id, PK both; RLS scoped to
  `auth.uid()`, own select/insert/delete) + `kgSuggestionAckService`
  (`fetchAckedSuggestionIds` / `ackSuggestions`, read/write straight to
  Supabase). Added the table to `types/database.types.ts`. This is the only
  durable acknowledgement in the system — deliberately distinct from the inline
  hints, which silence for one load only.
- `2026-06-06` — **Cross-surface hint rollout.** The rich decision card only
  lived on the item-value detail page (low traffic). Added two reusable
  primitives so suggestions surface wherever a user already is:
  `useScopeSuggestions` (reads the ONE shared global-pending list and indexes
  it `byScope` / `byScopeItem`, so a page-level container fetches once and
  hands pre-filtered rows to many hints — no per-hint fetch) and
  `KgSuggestionHint` (one component, three shapes — `dot` next to a field,
  `badge` on a table row, `banner` atop a section — all opening the same
  popover of full `KgSuggestionRowItem` decision cards). `ScopeFieldInput`
  gained a `headerSlot` prop to host the per-field dot. Wired into: scope
  context-items page + scope detail (per-field dots + scope banner), the
  scopes table (per-row badge, per-cell dots, type-wide banner), the org
  scopes hub + org overview (org-wide banner), and the global orgs list
  (per-card badge). All respect `defer`; all hidden at zero count.
- `2026-06-06` — **Decision-UX overhaul.** The shared row was a cramped
  "entity → slot · set value" line that hid everything a user needs (raw ids,
  no source, no current value, no overwrite signal), forcing DB spelunking.
  Rewrote `KgSuggestionRowItem` into a rich decision card backed by a new
  enrichment layer: `scopesService.resolveSuggestionTarget` (new ctx_*
  chokepoint read → `ResolvedSuggestionTarget`), `kgEnrichmentService`
  (target + note-title source), and `useKgSuggestionEnrichment` (per-id
  promise-cached). The card now shows the source note (title + "Open" in a
  notes window panel), the org › type › scope › item path with a "View" link,
  current → suggested with an explicit OVERWRITE warning + destructive
  `ConfirmDialog` (so accepting over a manual value is no longer a silent
  data loss), and a collapsible "all fields on this scope" list with the
  target highlighted. The source "Open" uses the new `useOpenNoteInWindow`
  primitive (`features/notes/actions/`) → canonical `notesWindow` overlay.
  Widened `GlobalSuggestionsDrawer` to
  `sm:max-w-xl` and
  added a framing hint. Made `ScopeItemSuggestionsPanel` scope-aware
  (`scopeId` prop filters out fills meant for other scopes of the same type)
  and wired it onto the scope-item detail page under the value editor.
- `2026-06-03` — Dropped the `as unknown` Insert cast in `useAutoRagPreference` now that `auto_rag_enabled` is in the generated `user_preferences` row type. Rewrote the write path as UPDATE-then-INSERT (instead of `.upsert(..., { onConflict: "user_id" })`) so the `preferences` jsonb column is left untouched on existing rows and seeded with `{}` only when the row didn't yet exist — a `.upsert` would have clobbered live preferences. Behaviour identical for callers.
- `2026-06-02` — Phase F agent: Initial scaffold — types, service, slice, hook,
  chip/popover/panel/drawer/nav-button/heavy-hitter components, drop-ins (notes,
  tasks, scopes hub), global drawer via overlay system, auto-RAG toggle in
  PrivacyTab. Heavy-hitter accept gated pending Phase E.
- `2026-06-02` — Phase F↔E seam: wired heavy-hitter accept → create scope → tag
  sources end to end. Typed the accept response as the `KgAcceptResult` union
  (`KgAcceptResponse` | `KgHeavyHitterAcceptPlan`) + `isHeavyHitterPlan` guard;
  added `useHeavyHitterAccept` (reuses the canonical `createScope` thunk and the
  `ctx_scope_assignments` chokepoint — no forked write paths) and
  `HeavyHitterAcceptDialog` (Dialog/Drawer, scope-name confirm + scope-type
  picker). Replaced the disabled "coming soon" button. Removed the obsolete
  `KgAcceptBody` request shape (live contract takes no body). Handles the
  accept-succeeded-but-create-failed edge with a recoverable error.
