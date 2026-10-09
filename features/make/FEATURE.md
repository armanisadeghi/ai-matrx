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
| `recent.ts` | What "Recently changed" never shows: archived rows, test organizations (`settings.test_fixture`), platform-owned tables. |

## Rules

- Reads (Recent, the table list) walk every organization through `custom.data_home` and name each
  row's organization. A builder mounts in the chosen TABLE's organization. A new table, portal or
  example is made in the active organization; with none, the page says so in one line and the
  first make asks for it.
- A tile without a working flow is absent. Guard G1: `pnpm check:make-no-dead-tile`. Guard G2:
  `features/make/__tests__/recent-skips-archived-and-test-rows.test.ts`.
- Entries: `/dashboard` QUICK_ACTIONS (and so the launchpad), `/welcome`, the sidebar Data group,
  the Tools grid (`tile.make`, everyone).
- The public gallery: `/templates` and `/templates/<catalogue id>` (app/(public)/templates), server-
  rendered, indexed and in the sitemap; the cards and summary are `gallery/TemplateCards.tsx`, the
  same drawing /make uses. "Use this template" = sign up, then `/make/templates/<id>`. The signed-out
  read is `custom.templates` with the publishable key; a closed or absent door is an empty gallery.

## Change log

- 2026-10-02 — wave 1: route, seven tiles, step 1, Recent, templates row, entries, G1/G2.
- 2026-10-03 — wave 4b: public template gallery (one drawing, two hosts), sitemap entries.
- 2026-10-05 — lane CHAIR-DESCRIBE: the describe box runs mandate `make.describe_template` (one sentence →
  one Template spec), checks it with `validateTemplate` (describe profile; a failure is one line + Try again),
  declares it `template_declare('org')` and installs it with the gallery's `runTemplateDoor`, `Progress` and
  `Landing` (`describe/describeTemplate.ts`). Guard: `describe/__tests__/describe-installs-only-what-passes-the-check.test.ts`.
