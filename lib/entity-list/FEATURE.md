# lib/entity-list — the canonical feature-entry list shell

One `<EntityListPage config={...} />` per feature list page. The feature
supplies a config (service triple, column registry, declared scopes, a
row-actions hook, optional card/row renderers); the shell owns everything
else: scope tabs with true server counts, search (+ optional deep toggle),
Filters & Sort panel, column picker, the controlled MatrxDataTable, view/
density persistence, inline edit commit, and the error banner.

**Consumers:** `/agents/all` (`features/agents/browse/listConfig.tsx` — the
proving ground) · `/transcripts` (`features/transcripts/browse/listConfig.tsx`
— the heterogeneous-rows test: five source shapes collapsed to one row type
with a `kind` column). CRM consumes `EntityScopeTabs` directly.

## The split that runs through everything

- **QUERY** (scope, search, filters, page) — `useEntityList`, never persisted.
- **STYLE** (view, density, sort, page size, columns) — `useListViewPrefs`
  (lib/list-views), persisted per user via `config.surfaceKey`.

## Files

| File | What it is |
|---|---|
| `types.ts` | Query/filter/facet/count vocabulary (`EntityListQuery`, `EntityFilters`, `EntityFacets`, `EntityScopeCounts`) |
| `config.tsx` | `EntityListConfig<TRow>` — THE contract. Read its doc comments before adding a knob; a knob earns its place only when a second surface needs it |
| `columns.tsx` | `EntityColumnSpec<TRow>` + shared cell helpers (`relativeTime`, `timeCell`, `DATE_FILTER_OPTIONS`) |
| `useEntityList.ts` | The query hook — generation-guarded fetches, debounced search, counts/facets with deliberate dependency keys |
| `components/EntityListPage.tsx` | The shell. Slots: `notice`, `headerActions`, `emptyAction`; feature modals come back from `config.useRowActions` |
| `components/EntityScopeTabs.tsx` | THE VIEW LAW tabs — fixed five vocabulary (lib/list-scope), narrowing options from the counts RPC, never Redux |
| `components/EntityListToolbar.tsx` / `EntityFilterPanel.tsx` / `EntityColumnPicker.tsx` / `EntityListTable.tsx` | The lifted surface pieces |

## Rules

1. **The config is generic.** A feature-specific field in `EntityListConfig` is
   a defect — bespoke behaviour goes through the render props
   (`views.cards/rows`), the `useRowActions` hook (which also returns the
   feature's modals), or the per-feature service/columns.
2. **`useRowActions` is a hook called by the shell** — must be unconditional
   and stable (it is config, fixed per surface).
3. **Every declared column sorts AND filters server-side** — the RPC template
   and invariants live in `lib/list-scope/FEATURE.md`; worked SQL:
   `migrations/agx_list_scoped_v3_all_columns.sql` (+ relevance
   `agx_search_score.sql`) and `migrations/trx_list_scoped.sql` (relevance
   built in, numeric bucket filters, UNION over heterogeneous sources).
4. **Search is relevance-ranked from day one.** Port the scorer tiers
   (`agx_search_score` / `trx_search_score`), never ship a flat `ILIKE OR`
   ordered by `updated_at` — that mistake is documented in
   `docs/handoffs/canonical-entity-list-extraction.md` §0.
5. **Bump `prefsVersion`** in the same change that adds/removes a column.
6. Surfaces without an axis switch it off (`supportsArchived: false`, omit
   `favorite`/`deepSearch`/`views`) — the shell hides the affordance rather
   than rendering a lie.
7. **`sourceFeature` is required and `getRowEntity` should be supplied.** They
   feed the row's right-click menu: `sourceFeature` attributes every shortcut
   and agent launched from it (a closed registry — no generic member to hide
   behind), and the entity is what turns **Attach To** (and, with a
   `resourceType`, **Share**) on. Both were dark on every list row until the
   config carried them. A heterogeneous hub returns `undefined` for rows that
   are not registered entities — never a fabricated token, which would offer to
   attach a record that does not exist. Keep the entity identical to what the
   name column's `entityToken` resolves and what the kebab's share action uses:
   one record, one identity, three entry points.

## Change log

- 2026-08-09 — Rows carry a SURFACE to the right-click menu: `sourceFeature`
  (required) + optional `getRowEntity`. `ItemContextMenu` had hardcoded
  `sourceFeature="files"` for every consumer and never forwarded an `entity` at
  all, so Attach To and Share were unreachable from any list row while the slot
  sat unused in `MenuContent`. `/agents/all` passes the same `resourceType:
  "agent"` its ShareModal uses; `/transcripts` returns an entity only for the
  `transcript` kind.
- 2026-08-08 — Extracted from features/agents/browse (steps 2–5 of the
  handoff); /transcripts migrated as the second consumer (step 6).
