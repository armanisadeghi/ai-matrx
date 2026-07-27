# Handoff — extract the one entity-list shell, second consumer `/transcripts`

**State:** the proving ground is DONE and live in production (`/agents/all`,
v0.4.133). Everything below is the extraction that makes it reusable.
**Read first:** [`features/agents/browse/FEATURE.md`](../../features/agents/browse/FEATURE.md)
and [`lib/list-scope/FEATURE.md`](../../lib/list-scope/FEATURE.md).

---

## Ratified decisions — do not re-litigate these

| Decision | Ruling |
|---|---|
| Extraction shape | **Config-driven shell + escape hatches.** One `<EntityListPage config={...} />`; a feature supplies an RPC name, a column registry, and an action-registry builder. Render props for genuinely bespoke parts. |
| Second consumer | **`/transcripts`** — chosen as the hard test, not the easy win. |
| Scope vocabulary | **Fixed five**: mine · my orgs · shared · industry · public. A feature declares which subset applies; it may not invent a sixth. |
| Industry semantics | Opt-in both ends: curators publish in; an org *attaches* the industry (`iam.org_industries`) to read out. Records attach by **grant row**, per `rag.data_store_grants.industry_id`. |
| Per-feature RPCs | **Hand-written from a documented template**, not generated. Template + invariants in `lib/list-scope/FEATURE.md`. |
| Column policy | **Every column sorts AND filters, server-side. No exceptions.** Finite value sets get real options with counts; dates get relative buckets. Sorting is on the DB column, never the rendered cell. |

## What already exists and should NOT be rebuilt

- `public.agx_list_scoped` / `agx_list_scope_counts` / `agx_list_facets` /
  `agx_since_bucket` — the worked RPC set (`migrations/agx_list_scoped_v3_all_columns.sql`).
- `lib/list-views/` — `useListViewPrefs` + shape `version` backfill.
- `lib/coming-soon/` — the tracked-promise registry.
- `components/official/scroll-fade/` — the overflow cue.
- `components/official/filter-panel/parts.tsx` — `FilterSection`, `RadioSelect`, `FacetChips`.
- `components/official/item/` — `ItemMenuConfig` + `badge` (trailing chip).
- `components/official/matrx-data-table/` — now carries the `"tags"` cell-edit type.

## The extraction, in order

1. **Generalize the types.** `features/agents/browse/types.ts` is already
   feature-agnostic except for `AgentBrowseRow`. Lift `BrowseScope`,
   `BrowseFilters`, `BrowseQuery`, `BrowseFacets`, `BrowseScopeCounts` into
   `lib/entity-list/types.ts` with a generic row parameter.
2. **Lift the hooks.** `useAgentBrowse` → `useEntityList(config)`; the only
   agent-specific parts are the three RPC names. `useAgentRowActions` stays
   per-feature (it IS the feature's behaviour) but its shape becomes the
   `actions` slot of the config.
3. **Lift the components** unchanged in behaviour: `BrowseScopeTabs`,
   `BrowseToolbar`, `BrowseFilterPanel`, `ColumnPicker`, the table, cards, rows.
4. **Define the config type** — this is the real design work. Sketch:
   `{ surfaceKey, rpc: { list, counts, facets }, scopes: ScopeKind[], columns:
   ColumnSpec[], actions: (ctx) => ItemMenuConfig, card?: renderProp,
   emptyState, newHref }`.
5. **Re-point `/agents/all` at the shell.** It must come out byte-identical in
   behaviour — that is the proof the config is sufficient.
6. **Then transcripts.**

## What transcripts will break (expect these)

- **Heterogeneous rows.** `transcript | session | cleanup | recording |
  unsorted` are five shapes in one list; agents is one. Either the config gets
  a discriminated row kind, or transcripts collapses to one row type with a
  `kind` column. **Do not** special-case it inside the shell.
- **Tree/nested rows.** `MatrxDataTable` has no hierarchy concept and
  transcripts' bespoke table does. This is the one place where extending the
  canonical table is likely correct rather than bending transcripts.
- **Five source tables, not one RPC.** `transcriptsHubService.ts` runs four
  queries plus two enrichment calls. A `transcripts_list_scoped` RPC that
  UNIONs them is the honest move; that is most of the work.
- **`applyListScope` throws on `shared`** — transcripts needs the RPC path anyway.

Deleting `TranscriptsHubTable.tsx` (780 lines) is part of the job, not a bonus.

## Open, not blocking

- `components/official/ListScopeSwitcher.tsx` implements the OLD chip-per-org
  shape and knows nothing about Industry/Public. It should absorb
  `BrowseScopeTabs` rather than diverge further.
- Industry scope is **documented but unwired** — no feature has an industry
  grant table yet. First feature to need it builds it per the doc.
- Pre-hydration view flash (prefs hydrate after first paint) — needs an
  SSR-readable preference, not a localStorage shortcut.
- Multi-select + bulk actions; column ORDER/width are not user-controlled.
- `/agents/classic` + `ClassicViewNotice` + the
  `display.agentsClassicNoticeDismissed` preference are **scheduled for deletion
  ~mid-Aug 2026**. Delete all three together.
