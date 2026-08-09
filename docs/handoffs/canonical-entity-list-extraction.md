# Handoff — the shared entity-list system

**Live:** `/agents/all` (production) and `/transcripts` (this branch) both run
on the extracted shell at **`lib/entity-list/`** — read its `FEATURE.md` first,
then [`lib/list-scope/FEATURE.md`](../../lib/list-scope/FEATURE.md) (scope
vocabulary + RPC template) and
[`lib/list-views/FEATURE.md`](../../lib/list-views/FEATURE.md) (style prefs).

---

## 0. READ THIS FIRST — the mistake that must not repeat

When this list moved to server-side paging, its search was rewritten as a flat
SQL `ILIKE OR` with **no ranking**, ordered by `updated_at`. A passing mention
in a description scored the same as a name match. The scorer already existed
(`features/agents/search/score.ts` — *"One implementation, every surface"*),
had been found and cited — and then not ported.

**The lesson:** when moving something to a new layer, PORT the proven
implementation first and improve it second. Fixed in
`migrations/agx_search_score.sql`; transcripts got `trx_search_score` (same
tiers) built in from day one; parity guarded (§3).

## 1. Ratified decisions — do not re-litigate

| Decision | Ruling |
|---|---|
| Extraction shape | Config-driven shell + escape hatches: `<EntityListPage config={...} />`; render props for bespoke parts |
| Scope vocabulary | Fixed five: mine · my orgs · shared · industry · public. A surface declares its subset, never a sixth |
| Industry semantics | Opt-in both ends (`iam.industry_curators` publish / `iam.org_industries` attach); records attach by grant row, never a column or association edge |
| Per-feature RPCs | Hand-written from the template in `lib/list-scope/FEATURE.md`, not generated |
| Column policy | Every column sorts AND filters, server-side, no exceptions; finite sets get options with counts; dates + numerics get buckets |
| Heterogeneous rows | ONE row type with a `kind` column (proven on transcripts); never special-cased inside the shell |
| Default sort / page size | Favorites first, most recent; relevance overrides while searching. 25/page |

## 2. DONE (compressed)

- **Steps 1–5:** shell extracted to `lib/entity-list/` (config contract, query
  hook, all components); `/agents/all` re-pointed and behaviourally identical;
  old browse components + `useAgentBrowse` deleted; CRM consumes
  `EntityScopeTabs`. Latent Rename-does-nothing bug fixed (TextInputDialog).
- **Step 6 — `/transcripts`:** `trx_list_scoped` / `trx_list_scope_counts` /
  `trx_list_facets` (applied live + ledgered, `migrations/trx_list_scoped.sql`)
  UNION the five hub shapes into one `kind`-typed row list, scoped
  mine/orgs/shared/public with relevance-first search. New
  `features/transcripts/browse/` consumer; the sectioned hub stack is deleted
  (`TranscriptsHubTable` 817 lines, cards/sections, grouping/sort/filter
  utils, `transcriptsHubService`, hub types, one of the four legacy
  `localStorage` view blocks).

## 3. Parity contracts (break these and users notice, not CI)

**Search scorer.** `features/agents/search/score.ts` ↔ `public.agx_search_score`
↔ `public.trx_search_score` (same tiers). Change one, change the others in the
same commit.
- Fixture: `features/agents/search/__fixtures__/search-score-parity.json`
- TS: `npx jest features/agents/search/score.parity.test.ts --no-coverage`
- SQL: `scripts/search-parity/check-search-score-parity.sql` — every row `MATCH`

**Prefs shape.** Bump the config's `prefsVersion` in the same change that adds
or removes a column.

## 4. Open items

- **`pnpm db-types` was not runnable in the build session** (no
  `SUPABASE_ACCESS_TOKEN`); the `trx_*` signatures in
  `types/database.types.ts` were hand-added in generator format. Next
  `pnpm db-types` run converges — run it once from a credentialed machine.
- **Nested/tree rows** (session → recordings) were dropped with the hub's
  bespoke table. If wanted back, extend `MatrxDataTable` with a hierarchy
  concept — the one place extending the canonical table is likely correct.
- **Transcripts row actions are read-only** (open/copy). Delete / move-to-
  session / detach actions belong in the `useTranscriptRowActions` menu. The
  old hub's `ReferencesBulkCopyButton` (copy ALL visible items as reference
  fences) was also dropped — restore as a shell-level affordance if missed.
- **Deep-search cost:** `trx_list_scoped` evaluates the transcript-segments
  ILIKE in the pre-scope `unified` CTE, so a deep search scans all users'
  transcripts before scoping filters them. Counting calls skip scoring
  (LIMIT<=1 guard) but the deep ILIKE still runs — restructure if it shows up
  in timings.
- **`components/official/ListScopeSwitcher.tsx`** — old chip-per-org shape;
  remaining consumer: `TranscriptsSidebar`. Should absorb `EntityScopeTabs`.
- **Industry scope documented but unwired** — first feature that needs it
  builds the grant table per `lib/list-scope/FEATURE.md`.
- **Pre-hydration view flash** — prefs hydrate after first paint; needs an
  SSR-readable preference.
- **Three hand-rolled `localStorage` view blocks** left to migrate onto
  `useListViewPrefs`: `ProjectsHub`, `TaskListPane`,
  `app/(core)/documents/page.tsx`.
- Multi-select + bulk actions; user-controlled column order/width.
- **`/agents/classic` + `ClassicViewNotice` + the
  `display.agentsClassicNoticeDismissed` preference — delete all three
  together ~mid-Aug 2026.**
- **Next consumers:** CRM list page (already half-way — uses `EntityScopeTabs`
  + its own hook) and every `(core)` feature entry list.

## 5. Verification recipes

```bash
pnpm type-check                                              # 0 errors
npx jest features/agents/search/score.parity.test.ts --no-coverage
pnpm check:migrations
```
Live DB (Supabase MCP, project `txzxabzwovsujtloxrus`), after setting the JWT
claim to a real user:
```sql
select kind, count(*) from public.trx_list_scoped('mine',null,null,false,'updated','desc','{}'::jsonb,200,0) group by kind;
select * from public.trx_list_scope_counts();   -- tab totals + org labels
```

## 6. Working notes

- Concurrent sessions edit this repo constantly — stage explicit paths, never
  `git add -A`.
- Migrations: apply via Supabase MCP, then record in
  `public._schema_migrations` (`duration_ms` NOT NULL), then `pnpm db-types`.
