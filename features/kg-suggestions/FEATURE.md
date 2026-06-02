# FEATURE.md — `kg-suggestions`

**Status:** `active`
**Tier:** `1`
**Last updated:** `2026-06-02`

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
  a heavy-hitter section. Rendered (gated) by the overlay system.
- `HeavyHitterSuggestionsInbox` (`components/HeavyHitterSuggestionsInbox.tsx`) —
  the "Suggest a scope" card on the `/scopes` hub (Phase F.4).
- `KgSuggestionsNavButton` (`components/KgSuggestionsNavButton.tsx`) — a
  button-with-count-badge that opens the global drawer; dropped into `/scopes`.
- `KgSuggestionRowItem` (`components/KgSuggestionRowItem.tsx`) — the ONE shared
  row UX (entity → slot, value, confidence bar, match-kind chip, accept/reject/
  defer) used by every surface above.

**Hooks**
- `useKgSuggestions(filter, { autoFetch })` (`hooks/useKgSuggestions.ts`) — the
  single read+write hook. Filter is one of `{ sourceKind, sourceId }` |
  `{ scopeItemId }` | `{ global: true }`. Returns
  `{ items, count, status, error, accept, reject, defer, refresh }`.
- `useAutoRagPreference()` (`hooks/useAutoRagPreference.ts`) — reads/writes the
  per-user `user_preferences.auto_rag_enabled` opt-out (React → Supabase).

**Services**
- `service/kgSuggestionsService.ts` — typed client for the aidream
  `/kg-suggestions` router (React → Python directly via `@/lib/python-client`).
  `listKgSuggestions`, `acceptKgSuggestion(id, body?)`, `rejectKgSuggestion`,
  `deferKgSuggestion`.

**API endpoints** (aidream, public URL `/api/kg-suggestions/*`, bare prefix
`/kg-suggestions`; user-scoped via `ctx.user_id`)
- `GET  /kg-suggestions` — paginated `SuggestionsPage`.
- `POST /kg-suggestions/{id}/accept` — writes value into the scope-item slot.
- `POST /kg-suggestions/{id}/reject` — 30-day suppression.
- `POST /kg-suggestions/{id}/defer` — 7-day suppression.

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

---

## Data model

**Database tables** (Supabase / aidream)
- `public.scope_association_suggestions` — owned by the backend (Phase D).
  Read/written only through the `/kg-suggestions` API. The FE never queries it
  directly.
- `public.user_preferences.auto_rag_enabled` — per-user opt-out (Phase A).

**Key types** (`types.ts` — mirror the Python Pydantic models)
- `KgSuggestionRow`, `KgSuggestionsPage`, `KgAcceptResponse`,
  `KgDecisionResponse`, `KgMatchKind`, `KgSuggestionStatus`.
- `KgSuggestionsFilter` (`KgSourceFilter | KgScopeItemFilter | KgGlobalFilter`)
  + `kgFilterKey` / `kgFilterToParams` helpers.

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

---

## Invariants & gotchas

- **Suggestions are SUGGESTIONS.** Accept is the only mutation that fills a
  slot, and it's explicit. Reject/defer are non-destructive → NO `ConfirmDialog`
  (per CLAUDE.md, confirms are only for destructive paths). Results are toasts.
- **One shared row.** Every surface renders `KgSuggestionRowItem` — never fork
  the row UX. Accept/reject/defer come from the hook, not the component.
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
- **Heavy-hitter accept returns a plan, the FE creates the scope.** The accept
  endpoint never creates the scope itself (scopes are a frontend-owned write
  path). `service.acceptKgSuggestion` returns the `KgAcceptResult` union; narrow
  on `isHeavyHitterPlan(res)`. Scope creation goes through the canonical
  `createScope` thunk — never hand-roll a `ctx_scopes` insert (the scopes
  service chokepoint forbids it and `scopesService.createScope` is still a stub).

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
- Services: `@/lib/python-client` (`getJson` / `postJson` — JWT auth).

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

Phase F of the Knowledge-Graph plan. Backend Phases A–E are shipped. The
heavy-hitter accept → create-scope → tag-sources flow is now wired end to end
(consumes the Phase E `HeavyHitterAcceptPlan`). Cannot be end-to-end runtime
tested until NER runs live and produces heavy-hitter suggestion rows; built and
compile-verified against the typed contract.

---

## Change log

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
