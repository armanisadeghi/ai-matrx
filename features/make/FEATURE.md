# /make — the make hub

**Status:** wave 1 (lane MAKE-HOME, v6 Unified Data System). Product truth and the plan live in
`../common-docs/projects/data-doctrine-adoption/v6/HANDOFF-MAKE-HOME.md` and `PROGRESS-MAKE-HOME.md`.

## What it is

One page, `/make` (`app/(core)/make/page.tsx` → `MakeHome.tsx`), that shows what a person can make
from the record store and makes it. Every tile opens the EXISTING `@ai-matrx/records-ui` builder in a
dialog on the page — no builder is forked.

## Files

| File | Holds |
|---|---|
| `tiles.ts` | The tile registry: one row per tile `{id, label, what (≤60), flow, kind, champion, asksForTable, href?}`. |
| `MakeHome.tsx` | The page, `MakeMount` (RecordsMount + `useRecordsUiPorts` + `recordsUiHostFor` behind the store switch), `MakeFlowSheet` (step 1 "Which table, or make one?" on `PickOrAdd`, then the builder made NEW: `createOnMount` / `startNew`), Recent and templates. The only file here that imports `@ai-matrx/records*` (registered in `lib/knobs/unifiedDataCampaign.register.ts`). |
| `recent.ts` | What "Recently changed" never shows: archived rows, test organizations (`settings.test_fixture`), app-kept tables. |

## Rules

- Reads (Recent, the table list) walk every organization through `custom.data_home` and name each
  row's organization. A builder mounts in the chosen TABLE's organization. A new table, portal or
  example is made in the active organization; with none, the page says so in one line and the
  first make asks for it.
- A tile without a working flow is absent. Guard G1: `pnpm check:make-no-dead-tile`. Guard G2:
  `features/make/__tests__/recent-skips-archived-and-test-rows.test.ts`.
- Entries: `/dashboard` QUICK_ACTIONS (and so the launchpad), `/welcome`, the sidebar Data group,
  the Tools grid (`tile.make`, everyone).

## Change log

- 2026-10-02 — wave 1: route, seven tiles, step 1, Recent, templates row, entries, G1/G2.
