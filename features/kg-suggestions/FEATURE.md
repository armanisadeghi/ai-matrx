# FEATURE.md — `kg-suggestions` (local mechanics)

> Cross-repo system-of-record: `/Users/armanisadeghi/code/common-docs/systems/knowledge/knowledge-graph/STATE.md`
> — read it before touching this feature in ANY repo. What the suggestion pipeline is, which
> producers write the ledgers, the rulings, and the roadmap live there. This file is the file map
> and the traps.

The KG suggestion UI: chips, popovers, panels, a global inbox drawer, and the `/suggestions`
manager. A suggestion proposes filling one scope-item slot, or — for `heavy_hitter` — promoting a
recurring entity to a brand-new scope.

## Files

**Components** — `KgSuggestionsChip` · `KgSuggestionsPopover` · `ScopeItemSuggestionsPanel` ·
`GlobalSuggestionsDrawer` · `HeavyHitterSuggestionsInbox` · `KgSuggestionsNavButton` ·
**`KgSuggestionRowItem`** (the ONE shared decision card every surface renders) ·
`components/source-preview/` (`SuggestionSourcePreview`, `useSourcePreviewController`,
`useOpenSourcePreview`, `PreviewSourceButton`) · `SuggestionsManager` (`/suggestions`).

**Hooks / state** — `useKgSuggestions(filter)` (slice cache, the three inbox views) ·
`useSuggestionsQuery` (server-side query over the enriched view, manager only) ·
`useHeavyHitterAccept` · `useOpenKgSuggestionsDrawer`.

**Service** — `sourcePreviewService` + `useSourcePreviewDoc` (the ONE source read layer);
decisions write to Supabase directly.

## Tables and views

`rag.scope_association_suggestions` (Stage A — "this document belongs to scope X"; `match_kind`
`exact` | `fuzzy` | `semantic` | `heavy_hitter` | `agent.orienter.association` |
`agent.orienter.uncertain`; `target_scope_id` NULL for heavy_hitter) ·
`rag.scope_item_value_suggestions` (Stage B — "scope X's slot K should hold V"; `match_kind`
`agent.slot_filler.fill_empty` | `…improve` | `…flag_conflict` | `agent.deep_extractor.extracted`) ·
`rag.kg_suggestion_ack` (per-user permanent dismissals) · `public.user_preferences.auto_rag_enabled`.
Migration `kg_014` added `decision_note`, `viewed_at`, `is_starred` to both ledgers plus
`public.v_scope_suggestions` and `public.v_scope_suggestion_stats` (both `security_invoker`).

> **The two raw rows have DIFFERENT column names** (Stage A: `target_scope_item_id` /
> `target_slot_name`, both NULL for links; Stage B: `target_context_item_id` / `target_slot_key`).
> The service NORMALIZES both into one `KgSuggestionRow` discriminated by `stage`, so every surface
> consumes a single shape. Never consume a raw row.

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
  `EntityType`.** A suggestion's source (transcript, scraped,
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
- **The queue is personal, even when a row references an organization.**
  `user_id` is the sole authenticated access owner. Every read/mutation must
  keep its explicit user filter, and every accept flow must assert ownership
  before creating a scope, tagging a source, or writing a context value. Never
  rely on platform-admin access or organization membership for this feature.
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
