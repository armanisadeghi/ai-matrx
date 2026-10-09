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
| `describe/plan.ts` | The guided run's plan (lane MAKE-WORKS): the route read from the words (`data` → template builder, `page` → Space Builder via `features/spaces/embed/useSpaceBuild`, `both` → the Space first, then the template builder reusing its tables), the visible steps, and up to three one-line follow-ups. Pure, no model. |
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

### Describe box — lane M3 (2026-10-09)

- The agent behind `make.describe_template` (Sentence To Template Builder) is stored with an `output_schema` built by the
  package (`describeResultJsonSchema()`, `@ai-matrx/records/templates`): `__kind` `describe_template_result`, the closed words
  (audience `organization|individual`, industry, job, teaches) read from the same constants the check reads, the deep parts as
  JSON text. `coerceDescribeAnswer` opens them with the package's `parseDescribeTemplate`. A personal request is audience
  `individual` (the agent used to write "personal": live "is not one of: organization, individual").
- The agent builds what was asked (fewest tables), gives the main table 2-3 example rows, and invents no locale, currency or address.
- A refused answer is a failed run: `useHeadlessAgentJson` records it on the run (`chat.user_request` failed + `metadata.output_refused`).
  The box shows ONE plain sentence plus "Try again"; the technical reason is in the console, never on screen.
- A press before the organization has loaded is kept and runs when the organization is ready (the waiting notice shows meanwhile).
- Stuck installs: `custom.template_install` is client-driven and resumable; a page closed mid-install leaves `installing` / `uninstalling`
  forever. Remove (`template_uninstall`) finishes any of them; see the change log for the 2026-10-09 settlement.

## Change log

- 2026-10-02 — wave 1: route, seven tiles, step 1, Recent, templates row, entries, G1/G2.
- 2026-10-03 — wave 4b: public template gallery (one drawing, two hosts), sitemap entries.
- 2026-10-05 — lane CHAIR-DESCRIBE: the describe box runs mandate `make.describe_template` (one sentence →
  one Template spec), checks it with `validateTemplate` (describe profile; a failure is one line + Try again),
  declares it `template_declare('org')` and installs it with the gallery's `runTemplateDoor`, `Progress` and
  `Landing` (`describe/describeTemplate.ts`). Guard: `describe/__tests__/describe-installs-only-what-passes-the-check.test.ts`.
<!-- matrx-auto-git-docs-resolution-needed-delete-this-when-resolved — two versions follow: LOCAL first, then GITHUB. (LOCAL latest 2026-10-09 00:39; GITHUB latest 2026-10-09 01:07; LOCAL lacks 14 of GITHUB's 14 new lines; GITHUB lacks 2 of LOCAL's 2 new lines; recover: git show ede216c8ac:'features/make/FEATURE.md' / 1dcb78466f:'features/make/FEATURE.md') Delete these three marker lines when resolved. -->
- 2026-10-09 — lane MAKE-WORKS: the describe box is ONE GUIDED RUN — the plan shown at once (`describe/plan.ts`), each step with its own clock, the model runs streamed in the floating LiveRunWindow (was headless), a workspace-shaped sentence routed to the Space Builder and opened, a data result with one Open button, up to three follow-ups that run through the same box, and Try again RESUMING at the failed step (a finished design or Space is never redone). Guards: `describe/__tests__/a-sentence-goes-to-the-door-that-can-build-it.test.ts`, `describe/__tests__/a-failed-run-resumes-where-it-stopped.test.tsx`.
<!-- matrx-auto-git-docs-resolution-needed-delete-this-when-resolved — GITHUB version below -->

- 2026-10-09 (M3): describe agent output schema + prompt (individual, fewest tables, sample rows, nothing invented); failed-run
  recording; plain failure copy; kept press while the organization loads; 14 abandoned installs settled.
<!-- matrx-auto-git-docs-resolution-needed-delete-this-when-resolved — end of both versions -->
- 2026-10-09 — lane F13: the design run's `coerce` is `readDesign` (read + safe reuses + the store's check), so every refused answer fails the run itself and the person reads a plain sentence, never a JS error; a Space build shows only its own person-written refusals (`SpaceBuildRefused`). Guard: `the-live-personal-requests-build.test.ts` (the three live v8 answers).
