# lib/entity-list — the canonical feature-entry list shell

One `<EntityListPage config={...} />` per feature list page. The feature
supplies a config (service triple, column registry, declared scopes, a
row-actions hook, optional alternate views or phone-card renderer); the shell owns everything
else: lane tabs with true server counts, the organization filter, search (+ optional deep toggle),
Filters & Sort panel, column picker, the controlled MatrxDataTable, view/
density persistence, inline edit commit, and the error banner.

Inline edits retain a bounded source-row snapshot across server refreshes and
query/page changes, so saving still reaches the feature writer with the row's
identity and kind after that row moves off the rendered page.

**Consumers:** `/agents/all` (`features/agents/browse/listConfig.tsx` — the
proving ground) · `/workflows/all`
(`features/workflow-runtime/browse/listConfig.tsx` — first consumer to need a
GENERIC relevance scorer, `public.mtx_search_score`, instead of a fourth copy) · `/transcripts` (`features/transcripts/browse/listConfig.tsx`
— the heterogeneous-rows test: five source shapes collapsed to one row type
with a `kind` column) · `/work/conversations`
(`features/ai-work/conversations/listConfig.tsx` — the URL-state + honest-default
test) · `features/masterwork/browse/` · marketing cross-site ranks ·
`features/canvas/maps/`. CRM consumes `EntityScopeTabs` directly.

## Two controls, two axes: the lane and the organization filter

```
All | Mine | My team | My Orgs | Shared | Public | System          [ All organizations v ]
```

Law: `common-docs/policies/access-ladder.md`. Vocabulary and the RPC contract:
`lib/list-scope/FEATURE.md` § Two axes.

- **`query.scope`** is the lane (`?scope=`, default **All**). **`query.orgId`** is the organization
  filter (`?org_filter=`, null = **All organizations**, the default on every load). They are separate
  fields; a lane carries no organization id.
- **The filter narrows every lane, the counts and the facets.** `useEntityList` hands `orgId` to all
  three service calls; a service passes `p_org_id: listOrgParam(query)` to each RPC.
- **It is never the active organization** — not its initial value, not synced, not written. No file
  in this folder reads `selectOrganizationId` / `selectActiveOrganizationId` / `useActiveOrganization*`
  (guard `pnpm check:no-active-org-in-reads`; test
  `__tests__/org-filter-is-its-own-axis.test.tsx`).
- **The shell renders both.** `EntityScopeTabs` (left) and `EntityOrgFilter` (right end of the same
  row, before `headerActions`). The filter shows on a list with a personal lane when the knob
  `lists.org_filter/<registryToken>` is not false and the person belongs to two or more
  organizations; a `?org_filter=` the address carries always shows, so a narrowing is never invisible.
  An admin page has no personal lane and never offers it.
- **The default lane is a knob:** `lists.landing_tab/<registryToken>` (key `default` with no token),
  then the host's `defaultScope`. A default the surface has no tab for lands on All, else its first lane
  (`supportedScopes`).
- **"Clear filters" clears the organization filter** back to All organizations.
- **Outside the shell:** `<EntityScopeTabs scope scopes counts onChange />` and
  `<EntityOrgFilter orgId onChange counts? />` are plain value/onChange controls;
  `useOrgFilterParam()` (`orgFilterUrl.ts`) is the filter's URL state. `exact` on the tabs renders
  exactly the lanes given.
- **A panel "Organization" section** (`config.scopeSections` on `orgs` / `team`) writes `orgId` — the
  same state as the filter, never a second one.

## The URL is the query (`config.urlState`)

**On for every `EntityListPage` since 2026-09-26; `urlState: false` is the
opt-out** for a list that is not its page's own query. It was opt-in, and
`/agents/all` and `/workflows/all` never opted in: `?scope=mine&q=…` was
ignored, the late registry default (`registryToken`) flipped the untouched scope
to My Orgs, and Back restored nothing. Guard:
`__tests__/list-page-url-is-the-query.test.tsx`. On, `useEntityList` holds NO
query state of its own: scope, the organization filter,
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
- **The first render reads the URL.** The kit's `useUrlSearchParams` has a server
  snapshot of "", so the server and hydration passes painted the default lane
  (Mine) before flipping. `useListSearchParams.ts` reads Next's request
  `useSearchParams()` until hydration, the kit's live snapshot after. Guard:
  `__tests__/first-render-reads-the-url.test.tsx` (RED "Mine" on the kit hook).

## The archive axis is a LAW, and its default is a knob

THE ARCHIVED-ITEMS LAW (`../../../common-docs/policies/archived-items.md`,
Arman 2026-09-09): every list over an entity that can be archived carries an
archive control, the default HIDES archived rows, and revealing them is one or
two clicks. This shell's Archived section renders `<ArchiveFilter>` from
`@ai-matrx/design-system` (Active only / Archived only / Active + archived, in
the Filters & Sort panel) — this shell owns the URL and preference plumbing and
`query.archived` is still a real server-side RPC parameter, but the CONTROL and
its words are the package's, so this panel, workflow-studio, the dashboard and
the desktop cannot drift apart. `ArchivedFilter` here is an alias of the
package's `ArchiveFilterValue`. It is one of exactly TWO allowed implementations
platform-wide; the other is `ArchivedDisclosure` from the same package — an
"Archived (N)" disclosure for card lists that are not entity-list shaped (it
lived at `components/official/ArchivedDisclosure` until 2026-09-10, when the
package took it and the local file was deleted). There is never a third, and
never a local copy: `pnpm check:package-twins` fails on one.

The INITIAL value of the axis is a user knob, not code taste (law §6):
`userPreferences.lists.archivedDefault` (`"active"` platform default, Settings →
General → Lists) seeds `defaultQuery.archived`. Two consequences worth knowing:

- **A non-URL surface holds its query in `useState(defaults)`, seeded once, and
  preferences are a warm cache that rehydrates AFTER that.** So an UNTOUCHED
  archive axis follows the knob whenever it lands; the first time the user picks
  a value on the surface, their choice owns the axis for the session (and
  "Clear filters" hands it back to the knob). Wired without that, the setting
  said one thing and every non-URL list did another — found in browser
  verification, not by a test.
- **A shared link that carries no `archived` param reproduces the RECIPIENT's
  default**, because the URL omits a value equal to the default — the same way
  `defaultFilters` already behaves. A list the sender deliberately switched
  carries the param and travels exactly.

Guard: `pnpm check:archived-items-law` (+ `:self-test`), in CI.

### 🚨 A LIST MAY NOT SAY "NONE" WHILE ITS OWN DEFAULT IS HIDING ROWS

The archive filter's default HIDES archived rows, so **"the live half is empty"
and "there is nothing here" are different facts** — and until 2026-09-10 this
shell printed the second knowing only the first, straight out of the config's
STATIC `emptyState`. Measured on `/maps` with all 46 of a user's maps archived:
_"No maps yet — A map is a picture of how something works … Make one"_, beside a
**New map** button, two clicks from that page's own Archived filter holding all 46. A screen telling an Expert to rebuild work they already had.

It was a CLASS, not an instance: `EntityListConfig` gave a surface no way to
name an archived count at all, so every archive-aware config inherited it
verbatim (`/maps`, `/agents/all`, `/workflows/all`, `/work/conversations` — the
four configs that do not set `supportsArchived: false`). So the fix is here, and
no listConfig changed.

- **`EntityListController.archivedProbe`** (`./types.ts` § `ArchivedProbe`) —
  `off` | `loading` | `known` | `failed`. It is its OWN read, because the
  facets and the scope counts are both fetched with the query's CURRENT
  `archived` value and therefore describe the live half too.
- It is `service.fetchPage` with `archived: "archived"` and `pageSize: 1`,
  fired **only when the live half came back empty** — so a list that has rows
  pays nothing. `total` from the surface's own page reader is exactly what the
  door will reveal, under the same scope/search/filters, with no second query
  authority to drift from it. Every service already implements it.
- The shell renders **"All N ⟨plural⟩ are archived"** plus a one-click door that
  sets `archived: "archived"`; a NARROWED page that hid archived matches says so
  too. The static `emptyState` is reached only when the probe answers `0` (or
  the surface has no archive axis) — i.e. live + archived really is zero. A
  FAILED probe says it cannot tell; it never falls back to "none yet".
- **`countActiveFilters(query, defaultArchived)`** compares the archive axis
  against the SURFACE's default, not the literal `"active"`. Law §6 made that
  value a user knob, so a user whose knob is "Active + archived" met an
  untouched page whose Filters badge read "1" and whose empty state blamed
  filters nobody had applied.

Guard: `__tests__/all-archived-empty-state.test.tsx` drives the real
`EntityListPage` through the real `useEntityList` — **8 of its 12 RED against
the pre-fix shell at `41fb3da018`**, 12 GREEN after.

## Bulk selection (`config.bulkActions`) — opt-in, and silent until it is taken

Declaring `bulkActions` is the whole switch. **Absent or empty = nothing
changes**: no `selection` prop reaches `MatrxDataTable`, so there is no checkbox
column, no header select-all, no bulk bar, no banner and no keyboard handler —
the exact list the other surfaces render today. Acting on many rows at once is a
capability a surface has to be ready for, never something the shell turns on for
eighteen pages at once. Guard: `__tests__/bulk-selection.test.tsx`
§ _"a surface that declares no bulk actions"_.

```ts
bulkActions?: EntityBulkAction<TRow>[];      // the opt-in
bulkSelection?: {
  noun?: string;                              // default: entityLabel.singular
  isRowSelectable?: (row: TRow) => boolean;   // a refused row renders NO checkbox
  selectAllMatching?: boolean;                // default false — see below
};

interface EntityBulkAction<TRow> {
  id: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;   // Lucide, never an emoji
  variant?: "default" | "outline" | "destructive";
  confirm?: (s: EntityBulkSelection<TRow>) => EntityBulkActionConfirm | null;
  run: (s: EntityBulkSelection<TRow>) =>
    | Promise<EntityBulkActionResult | void>
    | EntityBulkActionResult
    | void;
}

interface EntityBulkSelection<TRow> {
  mode: "ids" | "matching";   // what the PERSON meant
  ids: string[];              // every selected id
  rows: TRow[];               // the selected rows the list HOLDS (see below)
  count: number;              // ids.length — the number to name in a confirm
  filter: EntityBulkFilter;   // scope, search, deep, archived, filters — no page
}

interface EntityBulkActionResult {
  message?: string;      // success sentence
  removedIds?: string[]; // dropped locally, no refetch flash
  refresh?: boolean;     // re-ask rows, counts and facets
  keepSelection?: boolean; // default: the shell clears it, the work is done
}
```

**THE TWO MEANINGS OF "ALL", AND WHY BOTH ARE SAID OUT LOUD.** A header checkbox
over a server-paged list can only truthfully tick the rows on this page. A person
looking at 3 of 4,613 reads it as everything, and a list that quietly serves the
first meaning is one click from a disaster it invited. So the banner under the
toolbar (Gmail's) states which is true:

- `ids` — what is ticked. **Survives sort, search, filter, scope and paging**; it
  is cleared only deliberately (the bar's Clear, Escape, or a finished action).
- `matching` — offered only where the surface set `selectAllMatching`, because it
  is a promise: the shell resolves it by paging **the surface's own service**
  with the same filters and no page, announcing progress and offering Cancel
  while it runs. There is no invented ceiling — it stops at the server's own
  total. A surface that does NOT declare it gets a banner naming the larger
  number anyway ("Only the 3 on this page are selected — this view matches 7"),
  because silence there is what the header checkbox gets mistaken for.
- `matching` decays to `ids` the moment the live query stops matching the one the
  claim was made against, and the moment the person unticks a row. The membership
  never changes on its own; only the sentence about it does.

`rows` is the selected rows **the list holds**: in `ids` mode a selection outlives
a page change, so it can be a strict subset of `ids` (a surface whose action needs
row objects must say so — `/transcripts`' export names the shortfall in its
confirm). In `matching` mode it is every resolved row.

**Anything destructive or expensive returns a `confirm` that NAMES the
consequence** — what is lost, duplicated, spent or sent, and how many times
(`common-docs/policies/no-dead-ends.md`). The shell owns the
stop, the pending state, the toast and the lifecycle; the surface owns only what
the verb does. On failure the selection is KEPT, so nobody re-ticks 40 rows.

**Where the chrome lives.** The buttons render inside `MatrxDataTable`'s own bulk
bar (its `selection.actions` seam), which already owns the count, Clear and
copy-of-selection — a second bar beside it would be a fork whose count would
eventually disagree. The cards and dense-rows views have no bar, so there the
banner carries the buttons instead (a selection you cannot act on is a dead end).

**The phone has its own select-all.** Below `sm` the canonical table swaps its
grid for stacked cards and the header row — with the select-all in it — goes
with it, so `<EntityCardsSelectAll>` renders there instead (`sm:hidden`, one
control at any width). It is the SAME verb (`toggleLoaded`) the table header
uses, so the two widths cannot come to mean different things, it shows a
half-ticked page as indeterminate, and it is what makes the "all N matching this
filter" offer reachable on a phone at all — that offer only appears once every
row on screen is ticked, and nobody taps 25 boxes to discover an option exists.
Its label is a verb ("Select all 25 on this page" / "Deselect all 25 on this
page"), never a restatement of the banner above it, and it carries no Clear
because the bar directly below has one.

**Touch, keyboard, phone.** The table's checkbox column gets its 44px hit area
from `@ai-matrx/design-system/tap-target.css` under `pointer: coarse`; the phone
card's checkbox is this primitive's and carries `.matrx-tap-area` on its
`<label>` (the one documented ring for a control whose size IS the control —
`app/globals.css`). Shift-click selects a range (the table's). `x` toggles the row
under the caret or the pointer, `cmd/ctrl-A` selects everything on screen, `Escape`
clears — each only while this list pane holds the focus or the pointer, never in a
text field, never over an open dialog.

**Selection state is local to the list shell** (`useEntityListSelection`), beside
the query, not in Redux: it belongs to this mount of this page, and restoring one
would arm a bulk action against rows nobody has in mind any more.

**Left behind, deliberately:** `EntityAltViewProps` carries no selection, so a
feature-owned cards/rows VIEW (the `views.cards` render prop — not the table's
own phone cards, which are fully wired) renders no checkboxes of its own — a selection made
in the table stays actionable there through the banner, but cannot be STARTED
there. Wire it the day a surface needs it.

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

| File                                                                                                            | What it is                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`                                                                                                      | Query/filter/facet/count vocabulary (`EntityListQuery`, `EntityFilters`, `EntityFacets`, `EntityScopeCounts`)                                                                                                                                                                      |
| `config.tsx`                                                                                                    | `EntityListConfig<TRow>` — THE contract. Read its doc comments before adding a knob; a knob earns its place only when a second surface needs it                                                                                                                                    |
| `columns.tsx`                                                                                                   | `EntityColumnSpec<TRow>` + shared cell helpers (`relativeTime`, `timeCell`, `DATE_FILTER_OPTIONS`)                                                                                                                                                                                 |
| `useEntityList.ts`                                                                                              | The query hook — generation-guarded fetches, debounced search, counts/facets with deliberate dependency keys                                                                                                                                                                       |
| `components/EntityListPage.tsx`                                                                                 | The shell. Slots: `notice`, `headerActions`, `emptyAction`, `surface`; feature modals come back from `config.useRowActions`                                                                                                                                                        |
| `components/EntityScopeTabs.tsx`                                                                                | THE VIEW LAW tabs — the shared vocabulary (lib/list-scope); All and My team are added here. Only a lane's own axis (industry, admin support lanes) narrows inside a tab, from the counts RPC; organizations are `EntityOrgFilter`'s. WHICH tabs render can be overridden per page (`scopes`) — a scope conditional on who is looking, like admin-only `system`, cannot live in a module-constant config |
| `components/EntityOrgFilter.tsx` | THE ORGANIZATION FILTER — "All organizations" + the person's memberships (`useUserOrganizations`), counts from `counts.narrow.all` when the RPC gives them, a name search past eight organizations. Standalone: `orgId` / `onChange` |
| `orgFilterUrl.ts` | The filter's URL codec for pages outside the shell: `useOrgFilterParam()`, `readOrgFilter`, `orgFilterPatch` (`?org_filter=`) |
| `readListRpc.ts` | THE ONE READER of a list's facet/count RPCs (`*_facets`, `*_scope_counts`, `*_list_counts`): one request when the answer fits a page; past the API's 1,000-row cap it re-reads every page under a caller-named stable order; a read it cannot prove complete is an `incomplete_read` error, never a short list. Guard `__tests__/list-rpc-reads-never-truncate.test.ts` (also fails on any facet/count RPC called around it). Mock double: `testing/pagedRpcDouble.ts` |
| `laneRows.ts` | The client half of a small list's lane reader (`public.<type>_list_lanes(p_org_id)`, SECURITY INVOKER, one row per lane and record): `laneIds` (what a lane shows under the organization filter) and `laneCounts` (every lane's tab count + per-organization counts, from the same rows). Users: /files/webhooks, the /code sandbox list, the CRM views bar |
| `useLaneParam.ts` | The lane as `?scope=` URL state for a list outside the shell: a named lane wins, else the `lists.landing_tab/<token>` knob, else All; a picked lane is always written. Pair with `useOrgFilterParam` |
| `components/EntityListToolbar.tsx` / `EntityFilterPanel.tsx` / `EntityColumnPicker.tsx` / `EntityListTable.tsx` | The lifted surface pieces                                                                                                                                                                                                                                                          |
| `selection.ts`                                                                                                  | Bulk-selection vocabulary — `EntityBulkAction`, `EntityBulkSelection`, `EntityBulkFilter`, and the pure `bulkSelectionMode` that decides which meaning of "all" is currently true                                                                                                   |
| `useEntityListSelection.ts`                                                                                     | The selection state — local beside the query, never Redux; resolves "everything matching" by paging the surface's own service, cancellably                                                                                                                                          |
| `components/EntityBulkBar.tsx`                                                                                  | The declared buttons (rendered inside the table's own bulk bar) and the one banner that says which meaning of "all" is true                                                                                                                                                         |
| `memoryService.ts` | `createMemoryListService` — the service triple over a small, bounded, read-only corpus loaded ONCE in full (scanner findings, drift reports). Search, filter, sort (`sortValue` for a rank behind a word), paging and facet counts run over the WHOLE loaded set; a failed load is retried, never cached empty. Never for user-owned lists that grow without bound — those need a `<feature>_list_scoped` RPC. Guard: `__tests__/memory-service.test.ts` |

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
8. **Phone cards remain the table view, and the SHELL supplies them.** Below
   `sm` the shell renders a stacked record card per row instead of the
   horizontal grid — name, the one or two fields that decide what the row is,
   status, the row's actions, everything else behind one tap. It is derived
   from the columns the surface already declared (`./phoneCards.tsx`,
   `resolvePhoneCardLayout`), so a surface inherits a phone layout without
   writing one; declare `EntityColumnSpec.phone`
   (`title`/`primary`/`meta`/`rest`/`off`) only where the derivation promotes
   the wrong field. `config.mobileCards` still wins when a surface hand-writes
   its own. The canonical table owns query state, pagination, copy controls and
   row actions either way; a card's every value goes through
   `controls.renderCell`, so it is a LAYOUT, never a second renderer. Never
   fetch a second mobile list or rebuild those actions inside the card.
   `config.phoneCardDensity: "line"` is the same card at Linear's mobile-list
   density for a list scanned by NAME: two lines (title; `primary` then `meta`
   values joined by " · ", no labels), `rest` not drawn, the title's door
   stretched over the card, the value line plain text (2026-10-01, DATA-HOME-3F:
   the data home went from ~215 px cards, three a screen, to 50 px, twelve).
   Guard: `__tests__/phone-cards.test.tsx`; line density
   `features/unified-data/home/__tests__/the-phone-cards-and-the-archive-tell-the-truth.test.tsx`.
9. **One context menu per pane.** The shell wraps the list once and resolves
   the clicked `data-row-id` at open time. Every view must stamp that anchor;
   the table already does. The resolver reuses `actions.menuFor(row)`, supplies
   `getRowEntity(row)`, and passes the same live surface scope as
   `SurfaceRuntimeProvider`, so right-click and phone long-press cannot drift
   from the kebab or silently lose declared values.
10. **Header controls are 28px at every width; touch gets a 44px ring, never a 44px box.**
    The lane row and the toolbar carry `.matrx-tap-ring` (app/globals.css): on a
    coarse pointer every control in them gets an invisible 44px hit area widened
    by one tap gap, and the list's `.matrx-touch-targets` floor stops growing
    them. The shell owns the row's geometry: `headerActions` buttons are forced
    to 28px whatever size the page asked for. `responsive-contract.test.ts`
    fails on any `h-11` / `h-12` / `lg:h-9` / `min-w-11` in the header parts.

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
🚨 It must ALSO be mapped in `../aidream/apps/shared/chat/src/surfaces/utils/route-to-surface.ts`
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

- 2026-10-09 (PAGE-SPEED-3) — **A count or facet read is ONE request.** `readListRpc` for the `public` schema now calls `platform.list_rpc_once(p_fn, p_args)`, which runs the named `*_scope_counts` / `*_facets` / `*_counts` function once and returns every row as one jsonb array. The paged reader (a count, page one, then every further page) ran the function five times for the member with 1,532 organizations (3,072 rows); it stays only for a caller that passes another schema's `client`. Nothing is dropped.
- 2026-10-09 (response checks phase 2) — **`usageColumns.tsx` gains an optional Warnings column.** A caller whose rollup counts warnings passes `warnings: { read, door? }`; the column (id `warnings`, after Failures) sorts and filters server-side by the Runs buckets (`0` = "None", `USAGE_WARNINGS_FILTER_OPTIONS`). Workflows pass it; agents do not, so their five columns are unchanged. Pinned by `usageColumns.test.tsx`.
- 2026-10-07 (agents and workflows as ONE system) — **`usageColumns.tsx`: THE usage columns.** Runs, Last used, Success rate, Failures (hidden by default), Cost — declared once, read off a row by a `read(row)` the caller supplies, so every list over `platform.entity_usage` (agents, workflows) shows the same five columns with the same words, sorts and filters. Column ids are the RPC keys; the caller names only its last-used key (`last_used` / `last_run`) and optional doors (the run count and last run open their pages). Runs filters by bucket with `0` = "Never used"; Success rate / Failures / Cost declare `filter: false` until the RPCs filter them. Cost renders through `components/cost/Cost`.

- 2026-10-05 (/data at 375px scrolled twice: the page body AND the table) — **`footer` is gone; a list has ONE scroller at every width.** The footer mode made the table pane one screen tall and let the body scroll on to content below it, so the body and the table both scrolled. Its only consumer (/data) moved its inbox to a header action opening the inbox window; the `--entity-list-body-top` measure went with it. Under the table the TABLE is the scroller (it virtualizes); the body pads its foot past floating chrome (`data-matrx-page-end`).
- 2026-10-04 (owner, /agents/all + the ui-unification agents sample: "These two rows should never attempt to become one, regardless of space … the view tabs … need to be all the way to the left"; "the page is modifying [the table] and not using the canonical features") — **Two header rows, always; the shell no longer re-styles the table.** `useHeaderRowFit` is deleted: lanes · dimension · organization · actions are row 1 and the toolbar is row 2 at every width (the joined row put the saved-view tabs on top of the "Any dimension" select). The table's saved-view tabs now open row 2 on the LEFT through the package's `toolbar.tabsPortalInto` (the table's own controls still close it on the right through `portalInto`). Every override the shell forced on the package is now a package option (`@ai-matrx/design-system` ≥ the release after 0.60.8): `density="condensed"` (was `className="text-xs [&_td]:py-1 [&_th]:py-1"`), `frameHeight="content"` (was `tableClassName="h-auto max-h-full"`), `emptyHeader="hide"` (was `[&_thead]:hidden`), the row's own focus ring (was the pane's `[&_[data-row-id]:focus-visible]` reach — kept only on the surface's own alt views and phone cards), and the seven `[&_[data-matrx-table-…]]` selectors on the table-controls slot are gone. Guards: ESLint `matrx/no-canonical-component-override` (error) + `pnpm findings` ui-drift rule `canonical-override` (shrink-only baseline, 48 sites in 37 files at the seed).

- 2026-10-03 (owner, /agents/all and /board/all vs before 2026-10-02) — **The 28px header keeps the old toolbar's room.** The 28px pass also took the toolbar's 8px gaps (rows and controls, from `sm:`), its 8px corners and 10px padding on search / Filters / Columns / View / the toggle groups, and the search's `lg:min-w-56`; all restored at 28px. `useHeaderRowFit` reads the search box's real min-width instead of a 160px constant. The row-menu column (a width-less `customActions` column) took a 180px share of a wide table's slack on /board/all — fixed in `@ai-matrx/design-system` 0.60.1, which draws it as wide as its controls with its header on the right.
- 2026-10-03 (Arman, /agents/all?q=an: "non-functional and loading on each character") — **Typed text keeps the rows until its answer lands.** The typing exception to THE ROWS ANSWER THIS QUESTION lasted one second (`typingRecently()`), while a server list answers in 0.5–3 s, so at a normal typing pace every character dropped the table to its skeleton. `useEntityList` now keeps the previous rows (box spinner, `isFetching`) for as long as the box still holds what the person typed; a search arriving by Back or a link still holds the skeleton, and a FAILED typed answer drops the old rows so they never sit under its error banner. Every list on the shell inherits it. Guard `__tests__/typed-search-keeps-rows-until-its-answer.test.tsx` (both cases red on their previous hook).
- 2026-10-03 — **Small lists get the list header.** `laneRows.ts` + `useLaneParam.ts` serve lists that read every row at once: /files/webhooks (All / Mine / My team / My Orgs, `public.webhook_list_lanes`), the /code sandbox panel (adds Shared, `public.sandbox_instance_list_lanes`, through `/api/sandbox?lanes=1`), and the CRM views bar (Mine / Shared with me / Organization as inline sections, `public.saved_view_list_lanes`). `EntityScopeTabs compact` renders the lanes as the one select at every width for a narrow panel. Guards: `features/files/webhooks/__tests__/webhooks-list-lanes.test.tsx`, the `list lanes` block in `SandboxesPanel.lifecycle.test.tsx`, `features/crm/components/saved-views/__tests__/saved-views-bar-sections.test.tsx` (each red on the previous component).
- 2026-10-02 (owner on an iPad, /board/all: "giant buttons … massively wasteful") — **One 28px header, one row when it fits.** Every lane, the organization filter, search, Filters, Columns, View and the page's actions were `h-11` (44px) below 1024px and the whole list sat inside `.matrx-touch-targets`, which grows every control to 44px on any touch screen, so an iPad got two rows of 44px slabs (768px: first row at 214px). Now every header control is 28px everywhere (group toggles 24px inside a 28px capsule), touch uses the tap model's invisible ring (`.matrx-tap-ring`, which also outranks the package Button's coarse-pointer growth inside the row and rings table column headers instead of growing them), and `useHeaderRowFit` measures the real controls and draws the toolbar inside the lane row whenever both fit. Measured on the clone as admin@admin.com: /board/all 1024 one row, first record 173→133px; 768 two 28px rows, 214→167px; 375 one 28px row (was 44px); on a phone the un-narrowed organization filter is an icon and the lane select truncates before the row passes the gutter. Guard: `responsive-contract.test.ts`.
- 2026-09-30 — **Facet and count reads never come back silently short.** Facet RPCs return one row per value and passed the API's 1,000-row cap (clone, admin@admin.com: `trx_list_facets` 1,394 rows, `agx_list_facets` System lane 1,421) — every facet after row 1,000 vanished without a word. Every list facet/count RPC the app calls (32 call sites, 31 functions) now reads through `readListRpc.ts`. Guard `__tests__/list-rpc-reads-never-truncate.test.ts`: the census half red 32 offenders on HEAD → green.
- 2026-09-30 — **The lane and the organization filter are two axes.** `EntityListQuery.orgId` (`?org_filter=`, null = All organizations) narrows every lane, the counts and the facets; `EntityOrgFilter` renders it at the right end of the lane row and `setOrgId` sets it. New default lane `all`, added to every tab bar by `withStandardLanes`. The per-tab organization chevron on My Orgs / My team is gone. Both defaults are Feature Knobs (`lists.landing_tab`, `lists.org_filter`). `useOrgFilterParam` + `exact` make both controls usable outside the shell. Law: `common-docs/policies/access-ladder.md`.

- 2026-09-29 — **Where a list opens is its own knob, never its visibility.** `registryToken` now resolves the Feature Knob `lists.landing_tab/<token>` (`mine` | `organization`; organization and person may override) through `lib/list-scope` `resolveListScope` and the one knob snapshot; it no longer derives from `access.shown_to_default`. Each of the 580 rows was seeded once from the old derivation, so nothing moved except flashcard decks (`fc_set`) and quizzes/practice tests (`assessment`), which open on Mine while their visibility default stays "everyone" (Arman 2026-09-29: never tighten a visibility default to change a tab). A URL-carried or clicked scope still wins. Test: `lib/list-scope/__tests__/defaultListFilter.test.ts` (red on the old reader, green now).
- 2026-09-29 (flashcards lane report: two just-made decks "not in the list") — **A miss in this lane names the lanes that hit:** an empty lane whose other lanes count matches under the same search/filters (the count IS the list) now says so ("No decks match in My Orgs … but 2 in Mine did") with a one-click door per lane that keeps the search. Cause: `/education/flashcards` opens on My Orgs (registry view for `fc_set`), which by definition holds only other people's records, and the generic miss copy named no lane. Every list on the shell inherits it (My team keeps its own empty copy). Guard `__tests__/a-miss-in-this-lane-names-the-lanes-that-hit.test.tsx` (red on HEAD 2/3).
- 2026-09-28 (list-shell fix D, blind judges on /education/quizzes, /education/flashcards, notes) — **The URL keeps a lane and page it names:** the table clamped `?page=2` to 1 while rows loaded (total 0) and that write dropped `scope=mine` as "the default" before the late registry default (My Orgs) landed; the table now gets a total covering the named page while loading (`EntityListTable`, and the clamp waits for a known count in design-system), and a lane the address names or the person chose is always written (`useEntityList`). Guard `__tests__/a-named-lane-and-page-survive-the-load.test.tsx`. **One column set and order in every lane:** owner/org columns are handed over in every lane and auto-hide in Mine as uniform-by-construction; column state is controlled in every mode with the person's drag order in prefs (`columnOrder`). Guard `__tests__/one-column-set-in-every-lane.test.tsx`. **An empty lane draws no column header** unless a column filter is set, and the footer says "0 of 0" everywhere (`__tests__/an-empty-lane-draws-no-header.test.tsx`). **Phone:** the saved-view tabs take their own line below `sm` (`responsive-contract.test.ts`). **My team** is honest: `iam.my_team_reach` is empty for a person on no team (was: the person alone, so My team = Mine).

- 2026-09-27 (round 3, live-verified at aimatrx.com `0d18617a38`, design-system 0.48.8) — A "+" view survives a real reload: named "PP test — saved view" on /research/topics, reloaded, the tab was listed and reapplied its Name A→Z sort. Phone: the search owns its own line, the table's row never wraps, scope tabs are unboxed, the cards scroller has no frame (design-system), cards omit empty fields and read the meta line at 12px, the list root and the Filters popover carry the touch floor (the table's own floor now also applies below 640px). The Filters button is absent when the panel would be empty (/connected-sources; `__tests__/filter-panel-never-empty.test.tsx`). Two of these hunks were swept into `675bc5a7e5` by the sync.

- 2026-09-27 (round 2, coordinator rulings) — The table's "+" views are RESTORED and now kept:
  named on creation (the name field opens at once; Escape discards), stored in the surface's
  view preferences (`ListViewPrefs.savedViews`, survives a shape bump and "Reset view"), and a
  reload reopens them (`viewTabsStore` → design-system `TableViewWorkspace` `store`, after
  0.48.1). Column widths follow the data (`columnWidths.ts`): a column empty in ≥70% of the
  loaded rows yields to 120px; the name column (and a leading marker) is pinned left with an
  explicit width capped at 360px. Phone: scope tabs keep their labels and scroll sideways; the
  search placeholder is the short `Search <plural>…`; card fields sit in one two-column grid so
  every card aligns. Guards: `column-widths-follow-the-data.test.ts`, the search-miss case in
  `all-archived-empty-state.test.tsx`, `list-views/__tests__/defaults.test.ts`.

- 2026-09-27 — List chrome, shared page-pass defects (/education/flashcards, /research/topics,
  /connected-sources). Filters & Sort: filters lead and Sort sits last; the "Recently updated /
  created" presets exist only over a real sortable timestamp column and REPLACE that column's
  newest-first row (never both); hidden columns are not offered unless they are the current sort;
  a list with no sortable column shows no sort at all (`panelSortOptions`, guard
  `__tests__/panel-sort-options.test.ts`). The table's in-memory working view tabs are off on list
  pages (`viewTabs={false}` — "+" made a "View 2" that a reload lost); the table's remaining
  toolbar controls are drawn INTO the page's toolbar row (`pageToolbarSlot` → `toolbar.portalInto`)
  and its Columns modal is off (`toolbar.columns: false`, design-system after 0.48.1) — the page's
  picker is the one; the table box sizes to its rows (`tableClassName="h-auto max-h-full"`); the
  native search clear (x) is hidden beside "Clear search"; the phone Display menu rows share one
  shape; a SEARCH that found nothing keeps the page's `emptyAction` (e.g. New topic "<search>")
  beside the widen door. Package side (aidream 18ff49083b): actions column pinned right, eraser
  absent when nothing is filtered.

- 2026-09-27 — Right-click a table row now offers that row's own actions (its `menuFor`
  sections, the first marked `primary`) on every list. The table's registered row
  descriptor wins over `ItemContextMenu`'s resolution and carried only edit commands, and
  was built only when a surface set `getRowAgentContext`; `EntityListTable` now always
  builds it with the row menu included. Guard: `__tests__/right-click-a-row-gets-its-actions.test.tsx`.
  Found live on /research/topics (page-pass).

- `2026-09-26` — Claude (Opus): **A failed count is not zero.** When the counts or facets read fails, `EntityListPage` shows no number on any scope tab (it passes `countsLoading || countsError` to the tabs) and renders `EntitySourceFailures` — one plain sentence per failed side read and a Try again that calls `refresh`. Found on `/mandates/list-preview`, which read "0" on every tab after a 57014. Guard: `__tests__/a-failed-count-is-not-zero.test.tsx` (RED "Mine0System0" without the fix, GREEN with it).
- `2026-09-25` — Claude (Opus): **`memoryService.ts`** — an `EntityListService` over a fully loaded small corpus, for report-shaped sources that cannot page or facet themselves. First consumers: `/administration/mandates/unconverted-preview` and `/administration/mandates/health-preview` (`features/mandates/code-references/`).
- `2026-09-24` — Claude (Opus): **`config.tableToolbar` (opt-in)** — the table's own title row carries search, saved views (`tableId`), working view tabs and the column picker (controlled `columnState` over the same `useListViewPrefs.hiddenColumns`); the shell toolbar row is not rendered. Absent = unchanged. First consumer: `/administration/mandates/list-preview` (`features/mandates/admin-list/`).
- `2026-09-22` — Claude (Opus): **No two rows in a list are indistinguishable**
  (jobs-bar cold-walk-21, defect D). New `lookalikes.ts`: given the rows a view
  is about to render, it returns a short distinguishing note ONLY for the rows
  whose name reads the same as another's — built from the creation moment
  (escalating to the minute when twins share a day) plus one caller-supplied
  detail when that detail separates every twin, and nothing at all when a twin
  carries no distinguishing fact. Duplicate names stay allowed (Notion/Linear);
  the list does the telling apart. First consumer: `/masterwork/all`, which had
  shown three rows all reading one name with nothing to separate them. Guard:
  `__tests__/no-two-rows-read-alike.test.ts`.
- `2026-09-20` — Claude (Opus): **Cancel no longer throws the selection away
  and then claims the work was done** (jobs-bar cold-walk-13, Friction). A bulk
  action whose verb is a DIALOG resolves with nothing when the person cancels,
  and `EntityBulkBar` read that as `{}` — clearing the selection AND raising a
  success toast for work that never started. Three surfaces have that shape
  (`source-library`'s Transcribe and Send to a Masterwork Rulebook, `exports`'
  Send), so the fix is in the shell that owns the selection lifecycle: a
  `void`/`undefined` result now means "this action did not run" — the selection
  stays exactly as it was and nothing is announced, the same treatment a thrown
  error already got. An action that DID work returns a result object, even an
  empty one; `EntityBulkAction.run` says so. Guard: `bulk-selection.test.tsx`
  ("keeps the selection and says nothing when the action did not run"), proven
  red against the old `?? {}`.

- `2026-09-19` — Claude (Sonnet): **a tall `notice` can no longer squeeze the
  table out of reach.** `notice` renders in the STATIC `shrink-0` zone above
  the scope tabs and toolbar (flex-shrink: 0, so flexbox never compresses
  it); found on `/libraries/[id]` (D4, cold-walk-12), where
  `LibraryMetricsHeader`'s stat tiles plus two fixed `h-[276px]` charts
  consumed nearly the whole viewport there, squeezing the table's scroll body
  (`flex-1 min-h-0`) down to a sliver with no genuinely scrollable ancestor —
  reachable by neither mouse nor wheel. `notice` now renders inside its own
  `max-h-[42vh] overflow-y-auto` (scrolls independently, however tall its
  content), and the table's scroll body is floored at `min-h-[16rem]`
  instead of `min-h-0` (still shrinks — its own scroll still engages once
  content exceeds it — but never below a workable slice of table). Every
  other consumer's notice (`AssistStrip`, paste boxes, small banners) is far
  under the 42vh cap, so nothing about them changes. Guard:
  `features/source-library/__tests__/library-table-reachable/` (`pnpm
  test:library-table-reachable`), real-Chromium layout at 1440x900 and
  390x844, proven RED against the pre-fix classes and GREEN against these.
- `2026-09-18` — Claude (Fable): **a search spans the surface's default narrowing**
  (`config.searchSpansDefaultFilters`, `config.searchPlaceholder`). `defaultFilters` is
  a BROWSING default; a search is a different intent. With the knob on, a search typed
  over the UNTOUCHED default bag runs over the whole corpus (fetch, counts, facets) and
  the surface reads the lifted bag back, so a bucket control shows "All". Untouched is
  recognised by identity — `query.filters` is still the very `defaultFilters` object —
  never by value, so a chip click that equals the default is still honoured; the URL
  writes an explicitly-set bag even when it equals the default for the same reason.
  Why: a Claude Code session id pasted into /work/conversations found nothing — the
  row sat one bucket over, behind a chip count nobody reads while staring at an empty
  table. First consumer: `features/ai-work/conversations/listConfig.tsx`.
- `2026-09-17` — **Bulk selection, as an opt-in capability of the primitive**
  (`config.bulkActions` + `config.bulkSelection`). Per-row checkbox with a 44px
  touch hit area, shift-click range, header select-all, the honest two-meaning
  banner with "select all M matching this filter" resolved through the surface's
  own service, selection that survives sort/filter/paging, keyboard (`x`,
  `cmd/ctrl-A`, `Escape`), phone-card checkbox, confirms that name the
  consequence. Zero behaviour change for the eighteen surfaces that declare
  nothing — proven by `__tests__/bulk-selection.test.tsx`, whose opt-out block
  goes RED (3 failures) the moment the shell passes `selection` unconditionally
  and whose banner block goes RED (4 failures) without the banner; 21 GREEN.
  First consumer: `/transcripts` bulk **Export**. Full contract above under
  § Bulk selection.

- `2026-09-17` — **The card list got its own select-all**
  (`<EntityCardsSelectAll>`). Below `sm` the table's header row is replaced by
  cards, so a phone could only select a page one tap at a time and never reached
  the "all N matching this filter" offer, which needs every row on screen ticked
  — the gap that mattered for a channel library of hundreds of videos. Same
  `toggleLoaded` verb as the table header, indeterminate on a half-ticked page,
  44px row with the `.matrx-tap-area` ring. RED 5 without it. Verified live at
  390 on `/transcripts`: one tap → 25 selected → the 524-matching offer →
  "Every item matching this filter is selected — 524 in total", light and dark.

- `2026-09-11` — Facets now carry their own request-keyed loading and failure
  state on `EntityListController`. `EMPTY_FACETS` remains a safe payload shape,
  never evidence that a read completed with zero values; consumers suppress
  stale values while a newer facet request is pending and can offer the
  controller's existing refresh action after a failure.

- 2026-09-10 — **A LIST MAY NOT SAY "NONE" WHILE ITS OWN DEFAULT IS HIDING
  ROWS** (archived-items-law row F10 repair, from an independent live review).
  `EntityListController.archivedProbe` + the shell's all-archived empty state
  and its one-click door; `countActiveFilters` now compares against the
  surface's own archive default rather than the literal `"active"`. Full
  reasoning under § The archive axis is a LAW above. **RED 8 of 12 against the
  pre-fix shell** (`41fb3da018`), GREEN 12. Verified live on `/maps` with all
  46 of `admin@admin.com`'s maps archived — _"All 46 maps are archived"_ + a
  working door — and on `/workflows/all` (`workflow.definition`), where a
  search whose only match was archived said _"No live workflows match … but 1
  archived workflow did"_ instead of the old _"Nothing matched your current
  search and filters"_. Every touched row restored byte-exact (`is_archived`,
  `updated_at`, `updated_by`, `version`) and confirmed by SELECT.

- 2026-09-08 — **A SERVICE'S OWN INPUTS ARE PART OF THE FETCH KEY, AND A
  DECLARED SCOPE SECTION IS NEVER ABSENT** (one-resolution FIX-R6/F1, from a
  Sonnet walk of production v0.4.1722). `/mandates` declares an **Organization**
  scope section and, for an admin who belongs to nine organizations, it did not
  render at all. Two shell defects, both fixed as a class. (1) Every fetch here
  was keyed by the QUERY alone; `/mandates` builds its service from
  `useUserOrganizations()`, which answers AFTER the first render, so the
  scope-counts call went out once knowing about ZERO organizations and never
  again — the query had not changed. `UseEntityListArgs.serviceKey` (surfaced as
  `EntityListConfig.serviceKey`) is the declared identity of what a service was
  built FROM; it joins `queryKey`/`countsKey`, and the shell re-asks the moment
  it changes. The service object itself cannot be the dependency — hosts build
  it inline, so it is a new object every render. (2) `EntityFilterPanel`
  rendered a declared scope section only `if (options.length > 0)`, so "no
  options" and "this page cannot narrow by that" looked identical and neither
  said anything. Empty is now a STATE with a sentence — still reading, refused
  in the SERVICE'S own words, or genuinely none — carried by
  `EntityScopeCounts.narrowUnavailable`, with the shell printing its own
  "this is a defect" line when a surface supplies no reason at all. The counts
  query also gained its own `countsLoading` (derived from an answered-for key,
  never written from an effect body) and `countsError` on the controller.
  Guards: `__tests__/scope-section-loud.test.tsx` drives the real panel through
  its own popover, and `__tests__/service-key-refetch.test.tsx` drives the real
  hook across a late-arriving organization list — RED 4 failed / 1 passed at
  `0d57acc92e`, GREEN 5 passed.

- 2026-09-08 — **A REFUSAL RENDERS ONCE, CARRIES NO DEAD CONTROL, AND IS NEVER
  CALLED A FILTER PROBLEM** (one-resolution R-O1). Measured on production
  `https://www.aimatrx.com/mandates?scope=system` as a real non-admin: the list
  door's one honest refusal was printed THREE times — the shell's failure
  banner plus one toast per refetch — beside a **Retry** that could never
  succeed and an empty state reading _"No mandates match … Clear the filters to
  see the full registry"_ with nothing filtered. Root cause: the controller held
  the failure as a bare `string`, so the shell could not tell a REFUSAL from a
  BREAKAGE, and announced the same event through two channels. `./failure.ts`
  is the missing distinction — `EntityListFailure { message, retryable }`,
  classified by duck-typing a door's `refused` / `retryable` / SQLSTATE `code`
  so `lib/` never imports a feature's error class and every door inherits it.
  Consequences, all in the shared shell: `EntityListController.error` is now
  that object; `useEntityList` fires NO toast (the banner is permanent and
  renders off the same state — a toast is a second copy, not extra volume);
  `EntityListPage` renders Retry only when `retryable`, and its empty state has
  a FAILURE branch that comes first, never repeats the door's sentence, never
  mentions filters, and offers no action. Siblings censused and fixed the same
  way: `MandatesBrowsePage`'s home notice is absent rather than describing a
  corpus the reader was refused; `CrmListPage` and `DataStoresPage` (hand-rolled
  list shells) no longer print their "nothing here yet" copy over their own
  error. Found in passing and fixed: `facetSections` was required by
  `EntityFilterPanel`/`EntityListToolbar` but optional on `EntityListConfig`, so
  a legal config crashed the page — now defaulted to `[]`. Guard:
  `__tests__/one-refusal-one-copy.test.tsx` drives the real `EntityListPage`
  (real Redux store, real `MandateListDoorError` over the real 42501 payload) —
  **RED 5 failed / 2 passed at `a04e1f92dc`** (toast fired twice, Retry present,
  "Clear the filters…" printed on both the refusal and the breakage, failure
  still a string), **GREEN 7 passed**.

- 2026-08-29 — Inline edit drafts retain their source row across server-page
  reconciliation, preventing refresh/realtime/page movement from rejecting a save.

- 2026-08-26 — Enforced the phone touch-target contract across shared search,
  scope narrowing, and column selection controls.

- 2026-08-25 — Moved context-menu ownership from N desktop-only table-row
  wrappers to one delegated pane menu. Table, alternate cards, and dense rows
  now resolve the same row registry at open time; mobile long-press and desktop
  right-click share actions, per-row entity, and live surface values. The
  toolbar refresh indicator now names its operation for assistive technology,
  and fetch failures use the canonical toast façade.

- 2026-09-17 — **The shell now HAS a narrow layout.** The `mobileCards` seam
  had existed for a year and not one of the ~23 surfaces supplied one, so at
  390px `/masterwork/all` rendered a seven-column, 3,065px-wide table inside a
  364px box (`/masterwork/encore` 1,720px; `/agents/all` eleven columns,
  `/work/conversations` thirteen) — about a column and a half of seven behind a
  sideways scroll, with the record name a 2,483px anchor 20px tall. A default
  phone card now renders for every surface that declares none
  (`phoneCards.tsx`), derived from the door column, the date columns and
  declaration order, honouring the user's hidden-column preference, carrying
  `data-row-id` for the pane menu and `.matrx-touch-targets` for the 44px
  floor. Four surfaces declared a `phone` role where the derivation was wrong
  (agents, workflows, masterwork). Measured after, at 390×844 in both themes:
  every list route renders cards and the grid is gone below `sm`; at 1440 with
  a fine pointer the seven-column table and its density are byte-for-byte what
  they were. Guard: `__tests__/phone-cards.test.tsx` (3 of its 9 RED with the
  default removed).

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
