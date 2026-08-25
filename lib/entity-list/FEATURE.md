# lib/entity-list — the canonical feature-entry list shell

One `<EntityListPage config={...} />` per feature list page. The feature
supplies a config (service triple, column registry, declared scopes, a
row-actions hook, optional alternate views or phone-card renderer); the shell owns everything
else: scope tabs with true server counts, search (+ optional deep toggle),
Filters & Sort panel, column picker, the controlled MatrxDataTable, view/
density persistence, inline edit commit, and the error banner.

**Consumers:** `/agents/all` (`features/agents/browse/listConfig.tsx` — the
proving ground) · `/workflows/all`
(`features/workflow-runtime/browse/listConfig.tsx` — first consumer to need a
GENERIC relevance scorer, `public.mtx_search_score`, instead of a fourth copy) · `/transcripts` (`features/transcripts/browse/listConfig.tsx`
— the heterogeneous-rows test: five source shapes collapsed to one row type
with a `kind` column) · `/work/conversations`
(`features/ai-work/conversations/listConfig.tsx` — the URL-state + honest-default
test) · `features/masterwork/browse/` · marketing cross-site ranks ·
`features/canvas/maps/`. CRM consumes `EntityScopeTabs` directly.

## The URL is the query (`config.urlState`)

Opt-in per surface. On, `useEntityList` holds NO query state of its own: scope,
search, filters, archived, deep and page are parsed from the query string on
every render (via `lib/url-state`'s `useUrlSearchParams`, a
`useSyncExternalStore`), and every setter commits back through
`commitUrlParams`. Back/Forward therefore work with no effect and no mirror
state, and a pasted link reproduces the list exactly.

- Encoding lives in `urlQuery.ts` — one param per axis, `filters` as one JSON
  blob (the filter bag is already the one vocabulary headers and the panel
  share; splitting it here would be a second encoding to drift).
- **A value equal to the surface default is ABSENT.** A clean page has a clean
  address bar. `?filters={}` present-but-empty is a real, deliberate state
  (show everything, including what the surface hides by default) and must not
  collapse back to the default.
- **Sort is the one STYLE axis the URL carries.** "Look at this list, newest
  first" is worthless if the recipient's stored preference re-sorts it, so the
  URL wins when present and a sort change writes BOTH the URL and the
  preference. Everything else (view, density, page size, columns) stays
  prefs-only.
- Typing in search commits with `replace`, so one search is one history entry,
  not forty.

## Honest defaults (`config.defaultFilters`)

A corpus is not always the list. `/work/conversations` holds ~4,613
`conversation_type='subagent'` internal machine runs; showing them by default
buries every conversation a person had. The surface declares its default
narrowing as a REAL entry in the filter bag, so the rows are one click away
with their true count in the facet — where a hidden SQL predicate would be a
silent lie. `resetFilters` returns to the surface default, not to the empty
query: "Clear filters" meaning "now show me 4,613 machine runs" is a trap.

## Naming raw facet values

`EntityColumnSpec.formatFacetValue` (column headers) and
`EntityFacetSection.formatValue` (the Filters panel) turn a stored value into
the words a person reads — `subagent` → "Subagent run" — without costing the
option its count. Pass the SAME function to both so one value never has two
names on one page.

## Ratified decisions — do not re-litigate

| Decision                 | Ruling                                                                                                                                                                                                                                                                |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Extraction shape         | Config-driven shell + escape hatches: `<EntityListPage config={...} />`; render props for the bespoke parts                                                                                                                                                           |
| Scope vocabulary         | Fixed five: mine · my orgs · shared · industry · public. A surface declares its subset, never a sixth                                                                                                                                                                 |
| Industry semantics       | Opt-in both ends (`iam.industry_curators` publish / `iam.org_industries` attach); records attach by grant row, never a column or association edge. Documented, still unwired — the first feature that needs it builds the grant table per `lib/list-scope/FEATURE.md` |
| Per-feature RPCs         | Hand-written from the template in `lib/list-scope/FEATURE.md`, never generated                                                                                                                                                                                        |
| Column policy            | Every column sorts AND filters, server-side, no exceptions; finite sets get options with counts; dates + numerics get buckets                                                                                                                                         |
| Heterogeneous rows       | ONE row type with a `kind` column (proven on transcripts); never special-cased inside the shell                                                                                                                                                                       |
| Default sort / page size | Favorites first, most recent; relevance overrides both while searching. 25/page                                                                                                                                                                                       |

## The split that runs through everything

- **QUERY** (scope, search, filters, page) — `useEntityList`, never persisted.
- **STYLE** (view, density, sort, page size, columns) — `useListViewPrefs`
  (lib/list-views), persisted per user via `config.surfaceKey`.

## Files

| File                                                                                                            | What it is                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`                                                                                                      | Query/filter/facet/count vocabulary (`EntityListQuery`, `EntityFilters`, `EntityFacets`, `EntityScopeCounts`)                                   |
| `config.tsx`                                                                                                    | `EntityListConfig<TRow>` — THE contract. Read its doc comments before adding a knob; a knob earns its place only when a second surface needs it |
| `columns.tsx`                                                                                                   | `EntityColumnSpec<TRow>` + shared cell helpers (`relativeTime`, `timeCell`, `DATE_FILTER_OPTIONS`)                                              |
| `useEntityList.ts`                                                                                              | The query hook — generation-guarded fetches, debounced search, counts/facets with deliberate dependency keys                                    |
| `components/EntityListPage.tsx`                                                                                 | The shell. Slots: `notice`, `headerActions`, `emptyAction`, `surface`; feature modals come back from `config.useRowActions`                     |
| `components/EntityScopeTabs.tsx`                                                                                | THE VIEW LAW tabs — fixed five vocabulary (lib/list-scope), narrowing options from the counts RPC, never Redux                                  |
| `components/EntityListToolbar.tsx` / `EntityFilterPanel.tsx` / `EntityColumnPicker.tsx` / `EntityListTable.tsx` | The lifted surface pieces                                                                                                                       |

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
   ordered by `updated_at`. **This is the mistake that cost this system its
   worst week:** when `/agents/all` first moved to server-side paging its
   search became an unranked `ILIKE OR` ordered by `updated_at`, so a passing
   mention in a description outranked a name match and searching "image"
   returned ten unrelated agents first. The proven scorer already existed
   (`features/agents/search/score.ts` — _"One implementation, every surface.
   Never fork this function."_), had been found during research and cited in
   the notes, and was simply not ported. **When you move something to a new
   layer, PORT the proven implementation first and improve it second.**
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
8. **Phone cards remain the table view.** `config.mobileCards` forwards only a
   feature-owned row summary into `MatrxDataTable.mobileCards`; the canonical
   table still owns query state, pagination, copy controls, and row actions.
   Never fetch a second mobile list or rebuild those actions inside the card.

## Parity contracts (break these and users notice, not CI)

**Search scorer — three implementations, one behaviour.**
`features/agents/search/score.ts` ↔ `public.agx_search_score` ↔
`public.trx_search_score` share the same tiers. Server paging forces the SQL
copies (ranking must happen before `LIMIT`). **Change one, change the others
in the same commit.**

- Fixture: `features/agents/search/__fixtures__/search-score-parity.json`
- TS: `npx jest features/agents/search/score.parity.test.ts --no-coverage`
- SQL: `scripts/search-parity/check-search-score-parity.sql` — every row `MATCH`

**Prefs shape.** Bump the config's `prefsVersion` in the same change that adds
or removes a column, or existing users keep their old `hiddenColumns` forever
and every new column arrives switched ON for them. **When the change also means
the old default SORT was wrong** — not merely a different taste, but a key that
was measuring the wrong thing — declare the new one in `prefsDefaults.sort`:
that is the ONE way a stale blob's stored sort gets retired instead of
outranking the fix. See `lib/list-views/FEATURE.md` § Shape versioning.

## Verifying a list surface

```bash
pnpm type-check
npx jest features/agents/search/score.parity.test.ts --no-coverage
pnpm check:migrations
```

Live DB (Supabase MCP, project `brsgrqvjdzwihsvnfqkf`), after setting the JWT
claim to a real user:

```sql
select kind, count(*) from public.trx_list_scoped('mine',null,null,false,'updated','desc','{}'::jsonb,200,0) group by kind;
select * from public.trx_list_scope_counts();   -- tab totals + org labels
```

**Known cost, not yet a problem:** `trx_list_scoped` evaluates the
transcript-segments `ILIKE` inside the pre-scope `unified` CTE, so a _deep_
search touches all users' transcripts before scoping narrows them. Counting
calls skip per-row scoring (the `LIMIT <= 1` guard); the deep `ILIKE` still
runs. Restructure if it ever shows up in timings.

## The agent surface (`surface`)

A list has exactly one honest set of live values — _what is on screen, in which
scope, out of what total_ — and the shell is the only thing that holds all of
them. So a list page binds its agent surface here rather than wrapping itself in
a `SurfaceRuntimeProvider` around a second copy of state it does not own:

```tsx
<EntityListPage
  config={inboxListConfig}
  surface={{
    surfaceName: CRM_INBOX_SURFACE_NAME,
    getScope: (list) => createCrmInboxScope({ ... }),  // manifest values
  }}
/>
```

`getScope` receives the live `EntityListController` and runs at Run time only —
never on mount — so a page that never launches an agent pays nothing. The
surface must exist in `features/surfaces/manifests/registry.ts` and be synced to
`ui.ui_surface`; without a manifest row it can carry neither values nor roles.
🚨 It must ALSO be mapped in `features/surfaces/utils/route-to-surface.ts`
BEFORE any shorter prefix that would swallow its route — the panel discards a
registered runtime whose name disagrees with the route, so a `/crm` row above
`/crm/inbox` silently makes the whole surface unreachable from the header.

## Feature entry pages are LIST views, not forced workspaces

`/[feature]` is the user's first stop — a list of everything they can do
(create / open / fork), like `/agents` (the gold standard): list → click an
item → pick a UI (view / build / run / versions) → back out or jump UIs via
the header row. **Never trap the user in a single record's detail UI as if it
were the home page** (`/transcripts` shows all my/shared transcripts,
recent-first, filters, New button, per-row UI choices — not a forced detail
page). If a feature does this today, the fix is the missing list "savior" page
demoting the detail page — cheap, high value, not a redesign. This shell is
how that savior page gets built.

## Change log

- 2026-08-25 — Added the generic `config.mobileCards` forwarding seam so a
  feature-entry list can expose its essential phone context while retaining the
  canonical controlled table, pagination, copy, and row actions.

- 2026-08-20 — Relocated the "feature entry pages are LIST views" doctrine
  here from CLAUDE.md (charter rewrite); CLAUDE.md now carries a one-liner.

- 2026-08-16 — `surface` prop: any list page can emit its live values to an
  agent surface in two lines, reading the shell's own controller (first
  consumer: `/crm/inbox`, outreach-system WP1).

- 2026-08-16 — Three generic additions, all driven by `/work/conversations`
  (its third consumer): `config.urlState` (the query lives in the URL — see
  above; `urlQuery.ts` + `useEntityList`'s `useQueryState`),
  `config.defaultFilters` (a surface whose honest default is a subset of its
  corpus), and value formatters for raw facet values
  (`EntityColumnSpec.formatFacetValue` / `EntityFacetSection.formatValue`).
  `notice` also accepts a function of the live controller so a surface can put
  a first-class query control above the tabs. **The setters in `useEntityList`
  are no longer `useCallback([])`** — a URL-backed `setQuery` is re-created per
  render, so an empty dep array froze the first commit function.
- 2026-08-15 — Extraction CLOSED; its handoff doc deleted and the durable half
  (ratified decisions, the relevance lesson, parity contracts, verification)
  absorbed here. Remaining follow-ups are independent chips in
  `.matrx/AGENT_TASKS.md` (`TASK-EL-*`).
- 2026-08-09 — Rows carry a SURFACE to the right-click menu: `sourceFeature`
  (required) + optional `getRowEntity`. `ItemContextMenu` had hardcoded
  `sourceFeature="files"` for every consumer and never forwarded an `entity` at
  all, so Attach To and Share were unreachable from any list row while the slot
  sat unused in `MenuContent`. `/agents/all` passes the same `resourceType:
"agent"` its ShareModal uses; `/transcripts` returns an entity only for the
  `transcript` kind.
- 2026-08-08 — Extracted from features/agents/browse (steps 2–5 of the
  handoff); /transcripts migrated as the second consumer (step 6).
