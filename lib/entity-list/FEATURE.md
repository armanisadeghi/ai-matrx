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
| `doors.ts` | THE DOOR LAW — resolves the record's route from `config.door` through `resolveEntityDoors`; `entityListRowHref` is exported for the card/row render props |
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
7. **Every config declares `door`** — THE DOOR LAW is the shell's default, not
   each config's homework (see below).

## THE DOOR LAW — `config.door`

The name cell of every list is a **real anchor**, so cmd-click, middle-click,
"open in new tab" and keyboard focus reach the record. Declaring the entity
token is normally the whole job:

```ts
door: { token: "agent" }                        // route from the registry
door: { hrefFor: primaryRowHref }               // heterogeneous / second shell
door: { token: (row) => row.kind, column: "label" }
```

- The route comes from `resolveEntityDoors` (`components/official/entity-ref/
  doors.ts`) — the ONE resolver. A `hrefFor` in `entityRegistry.ts` lights up
  every list at once; no config hard-codes a path that can rot into a 404.
- The anchor lands on the declared `name` / `title` column unless `door.column`
  says otherwise. A column that sets its own `href` keeps it.
- `onRowOpen` is untouched: the whole-row click keeps doing whatever the surface
  does with it (`/agents/all` opens the Run / Build / View chooser). The anchor
  is an addition, and clicks on it never double-fire the row.
- `hrefFor` is honoured exactly — returning `undefined` means THAT row has no
  door and must not fall through to the registry.
- Alternate views (`views.cards` / `views.rows`) import `entityListRowHref` so a
  card can never be a poorer door than the table.
- **No `door` is a claim that the records have no canonical route.** If that is
  because the token has no `hrefFor`, report the registry gap — don't ship the
  dead end.

## Change log

- 2026-08-09 — `config.door` + `doors.ts`: THE DOOR LAW is now a shell default.
  Every list built here gets a real anchor on its name column, resolved from the
  entity registry. `/agents/all` (`token: "agent"`) and `/transcripts`
  (`hrefFor: primaryRowHref`) wired as the first consumers.
- 2026-08-08 — Extracted from features/agents/browse (steps 2–5 of the
  handoff); /transcripts migrated as the second consumer (step 6).
