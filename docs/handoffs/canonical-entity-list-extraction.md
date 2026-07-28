# Handoff — the shared entity-list system

**Live:** `/agents/all` in production (v0.4.157). It is the proving ground for
a reusable list shell that every feature will adopt.
**Read first:** [`features/agents/browse/FEATURE.md`](../../features/agents/browse/FEATURE.md)
· [`lib/list-scope/FEATURE.md`](../../lib/list-scope/FEATURE.md)
· [`lib/list-views/FEATURE.md`](../../lib/list-views/FEATURE.md)

---

## 0. READ THIS FIRST — the mistake that must not repeat

When this list moved to server-side paging, its search was rewritten as a flat
SQL `ILIKE OR` with **no ranking**, ordered by `updated_at`. A passing mention
in a description scored the same as a name match, so searching "image" returned
ten unrelated agents before any image-generation agent. Arman hit it first and
hardest, and it was a platform-wide complaint.

The scorer already existed: `features/agents/search/score.ts`, whose header
says *"One implementation, every surface. Never fork this function."* It had
been found during research, cited in the notes — and then not ported.

**The lesson, which applies to every remaining step:** when moving something to
a new layer, PORT the proven implementation first and improve it second. Do not
re-derive it. Others' work is already encoded in those weights and tiers.
Search, filtering, ordering, permissions, and file handling all have existing
canonical implementations in this repo. Find them before writing SQL.

Fixed in `migrations/agx_search_score.sql`; parity now guarded (§4).

---

## 1. Ratified decisions — do not re-litigate

| Decision | Ruling |
|---|---|
| Extraction shape | **Config-driven shell + escape hatches.** One `<EntityListPage config={...} />`; a feature supplies RPC names, a column registry, and an action-registry builder. Render props for genuinely bespoke parts. |
| Second consumer | **`/transcripts`** — chosen as the hard test, not the easy win. |
| Scope vocabulary | **Fixed five**: mine · my orgs · shared · industry · public. A surface declares which subset applies; it may not invent a sixth. |
| Industry semantics | Opt-in both ends: curators publish in (`iam.industry_curators`); an org must *attach* the industry (`iam.org_industries`) to read out. Records attach by **grant row**, per `rag.data_store_grants.industry_id`. Never an `industry_id` column, never a `platform.associations` edge. |
| Per-feature RPCs | **Hand-written from a documented template**, not generated. Template + six invariants in `lib/list-scope/FEATURE.md`. |
| Column policy | **Every column sorts AND filters, server-side. No exceptions.** Finite value sets get real options with counts; dates get relative buckets. Sorting is on the DB column, never the rendered cell. |
| Default columns | Name, Description, Category, Tags, Favorite, Version, Updated. Others available in the picker. |
| Default sort | Favorites first, then most recently updated. Relevance overrides both while searching. |
| Page size | 25. |
| "Coming soon" | A tracked promise, not a placeholder — `lib/coming-soon/registry.ts`. Growing the list is encouraged; leaving one untracked is not. |

## 2. What is DONE and live

- **`/agents/all`** — the new list. Old gallery at `/agents/classic` behind a
  dismissible notice; `/agents/browse` redirects.
- **Scopes** Mine / My Orgs (+ per-org dropdown) / Shared / Public, with true
  server counts. My Orgs surfaced agents that were previously invisible
  platform-wide (org-internal agents made by teammates).
- **Table** — every column sorts + filters server-side; column picker; inline
  edit of Name / Description / Category / Tags with a Save pill; full-row click;
  vertical kebab carrying every record action.
- **Cards** and a rebuilt **compact list**.
- **Relevance search** with TS↔SQL parity (§4).
- **Step 1 of the extraction** — types lifted to `lib/entity-list/types.ts` and
  scopes to `lib/list-scope/types.ts`.

## 3. What exists and must NOT be rebuilt

| Path | What it is |
|---|---|
| `migrations/agx_list_scoped_v3_all_columns.sql` | The worked RPC set: `agx_list_scoped`, `agx_list_scope_counts`, `agx_list_facets`, `agx_since_bucket` |
| `migrations/agx_search_score.sql` | Relevance scorer + the ORDER BY wiring |
| `lib/entity-list/types.ts` | Generic query/filter/facet/count types |
| `lib/list-scope/` | The five-scope vocabulary + helpers |
| `lib/list-views/` | `useListViewPrefs` + shape `version` backfill |
| `lib/coming-soon/` | Tracked-promise registry |
| `components/official/scroll-fade/` | The "there is more below" cue |
| `components/official/filter-panel/parts.tsx` | `FilterSection`, `RadioSelect`, `FacetChips` |
| `components/official/item/` | `ItemMenuConfig` + trailing `badge` |
| `components/official/matrx-data-table/` | Canonical table; now carries the `"tags"` cell-edit type |

## 4. Parity contracts (break these and users notice, not CI)

**Search scorer.** `features/agents/search/score.ts` ↔ `public.agx_search_score`.
Server paging forces two implementations because ranking must happen before
`LIMIT`. **Change one, change the other in the same commit.**
- One fixture: `features/agents/search/__fixtures__/search-score-parity.json`
- TS: `npx jest features/agents/search/score.parity.test.ts --no-coverage`
- SQL: run `scripts/search-parity/check-search-score-parity.sql` — every row
  must read `MATCH`.

**Prefs shape.** Bump `SURFACE_DEFAULTS.version` in the same change that adds or
removes a column, or existing users keep their old `hiddenColumns` forever and
every new column arrives switched ON for them.

## 5. The extraction — remaining steps

**Step 1 is DONE.** Steps 2–6 remain.

2. **Lift the hooks.** `useAgentBrowse` → `useEntityList(config)`; the only
   agent-specific parts are the three RPC names. `useAgentRowActions` stays
   per-feature (it IS the feature's behaviour) but becomes the config's
   `actions` slot.
3. **Lift the components** with behaviour unchanged: `BrowseScopeTabs`,
   `BrowseToolbar`, `BrowseFilterPanel`, `ColumnPicker`, table, cards, rows.
4. **Define the config type** — the real design work. Sketch:
   `{ surfaceKey, rpc: { list, counts, facets }, scopes, columns, actions,
   card?, emptyState, newHref }`.
5. **Re-point `/agents/all` at the shell.** It must come out behaviourally
   identical — that is the proof the config is sufficient.
6. **Then `/transcripts`.**

## 6. What `/transcripts` will break (expect these)

- **Heterogeneous rows.** `transcript | session | cleanup | recording |
  unsorted` are five shapes in one list; agents is one. Either the config gains
  a discriminated row kind, or transcripts collapses to one row type with a
  `kind` column. **Do not** special-case it inside the shell.
- **Tree / nested rows.** `MatrxDataTable` has no hierarchy concept and the
  bespoke transcripts table does. This is the one place where extending the
  canonical table is likely correct rather than bending transcripts.
- **Five source tables, not one RPC.** `transcriptsHubService.ts` runs four
  queries plus two enrichment calls. A `transcripts_list_scoped` RPC that UNIONs
  them is the honest move, and it is most of the work.
- **Relevance.** Transcripts needs its own scorer tier list. Look for an
  existing one before writing it (§0).

Deleting `TranscriptsHubTable.tsx` (780 lines) is part of the job, not a bonus.

## 7. Open items

- **`components/official/ListScopeSwitcher.tsx`** — still the old chip-per-org
  shape, knows nothing about Industry/Public, **and reads org names from
  `selectAllOrgs`, so it carries the same latent empty-dropdown bug** that was
  just fixed in `BrowseScopeTabs` (org names now come from the counts RPC). It
  should absorb `BrowseScopeTabs` rather than diverge further.
- **Industry scope is documented but unwired** — no feature has an industry
  grant table yet. The first one that needs it builds it per
  `lib/list-scope/FEATURE.md`.
- **Pre-hydration view flash** — prefs hydrate after first paint, so a
  cards-preferring user sees the table for a beat. Needs an SSR-readable
  preference, not a `localStorage` shortcut.
- **Four hand-rolled `localStorage` view-state blocks** remain unmigrated onto
  `useListViewPrefs`: `ProjectsHub`, `TranscriptsListPage`, `TaskListPane`,
  `app/(core)/documents/page.tsx`.
- Multi-select + bulk actions; column ORDER and width are not user-controlled.
- **`/agents/classic` + `ClassicViewNotice` + the
  `display.agentsClassicNoticeDismissed` preference are scheduled for deletion
  ~mid-Aug 2026.** Delete all three together.

## 8. Verification recipes

```bash
pnpm type-check                                              # must be 0 errors
npx jest features/agents/search/score.parity.test.ts --no-coverage
pnpm check:migrations                                        # ledger vs files
```
Browser: `http://localhost:3001/api/dev-login?token=$DEV_LOGIN_TOKEN&next=/agents/all`

Live DB checks (Supabase MCP, project `txzxabzwovsujtloxrus`) — set the JWT
claim first, then:
```sql
select name from public.agx_list_scoped('mine',null,'image',false,'updated','desc',
  true,'active','{}'::jsonb,10,0);   -- name matches must come first
select * from public.agx_list_scope_counts();  -- tab totals + org labels
```

## 9. Working notes

- **Concurrent sessions edit this repo constantly.** Stage explicit paths, never
  `git add -A` — one round of this work was swept into another session's commit.
- The dev server dies often; `preview_start {name:"next-dev"}` on port 3001.
- `TEMP_SKIP_RELEASE_CHECKS=true` is set in the environment, so `release.sh`
  skips gates. Run `pnpm type-check` and `pnpm check:migrations` yourself.
- Migrations: apply via Supabase MCP, then record in `public._schema_migrations`
  (`duration_ms` is NOT NULL), then `pnpm db-types`.
