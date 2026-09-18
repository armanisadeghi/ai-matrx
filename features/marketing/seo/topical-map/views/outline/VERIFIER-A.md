# VERIFIER-A — zero-authorship verification of Lane A (Outline + Text views)

LANE: `quick`/`standard`, model `claude-sonnet-5`. You did not write this code and you must not
read the builder's summary before forming your own view. You are dispatched by the coordinator on
behalf of the Lane A owner; your report goes back through the coordinator.

## What you judge against (read these FIRST, in this order, and nothing from the builder)

1. `common-docs/inbox/topical-map-app-requirements.md` — §0 standing rules and §2.1 (the
   Outline and Text bullets, and the three settings named there).
2. `common-docs/projects/table-provisioning/TOPICAL-MAP-UI-PLAN.md` — §3 rulings R5, R11, R17;
   §6 "A — Outline + Text" (the brief, including its "Done:" line).
3. `features/marketing/seo/topical-map/CONTRACTS.md` — §0 laws, §1 view props, §4.1 `TopicTree`,
   §4.3 the UI kit, §7 the outline's knobs.
4. `features/marketing/seo/topical-map/FEATURE.md` — the four things that are easy to get wrong.

Only THEN open the code: `views/OutlineView.tsx`, `views/TextView.tsx`, everything under
`views/outline/` (including its tests and `__fixtures__/`). `VERIFY-A.md` beside this file is the
browser walk — run it if your machine can host the app (`pnpm preview:start`; the build
container cannot); otherwise say so and do everything below.

## Environment

Repo `/home/user/ai-matrx`, branch `claude/tender-gates-5qcxnd`. The Supabase MCP is ALLOWED
(project `brsgrqvjdzwihsvnfqkf`) — use it for the recorded fixtures below; never for a write.
No `create_session`. Commit only the files you create under `views/outline/__fixtures__/` and
your test file, by explicit path, message prefix `Topical map Lane A verifier:`, ending with
`Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` and
`Claude-Session: https://claude.ai/code/session_01DYJabK1tHxrYkU7V5tyaaX`; push with
`git push -u origin claude/tender-gates-5qcxnd` (`git pull --no-rebase` first if refused).

## Your work

### 1. Replace the shape-transcribed fixtures with RECORDED bytes
The builder had no database access, so `views/outline/__fixtures__/mapTreeShape.ts` and
`pageAssociationsShape.ts` are transcribed from the migrations, not recorded. Record the real thing:

- `select seo.map_tree('e9df6779-8e0e-45e9-a664-375e7d1ecffd', NULL, NULL,
  '{description,status,counts,facets}'::text[], NULL)` — All Green Recycling, 50 topics — as
  `views/outline/__fixtures__/mapTreeAllGreen.recorded.ts` (header: the SQL, the timestamp, the
  project; the bytes untouched).
- The same call with `'{description,status}'` (no counts) as a second export in that file.
- `select seo.map_topic_associations('e9df6779-…', '<a slug from the tree that has pages>',
  '{pages}'::text[])` — pick the topic with the most pages from the counts; record as
  `pageAssociationsAllGreen.recorded.ts`. If the row set is large (>200 rows), record a topic with
  fewer pages AND note the biggest topic's count in your report.
- `select seo.map_tree('ff2010ec-f53d-4d8b-81d9-094c4ca73397', NULL, NULL, '{status,counts}', NULL)`
  — Factory Playground, 52 proposed topics — as a third export.

Then write `views/outline/OutlineView.recorded.test.tsx`: the SAME harness shape as the builder's
`OutlineView.test.tsx` (real store, real query client, `data.ts` mocked at the wrapper seam, the
same jsdom polyfills) but fed the RECORDED payloads, and assert against the vision and the plan,
NOT against the builder's tests:

- (a) the 14 roots render in `spath` order with the names the database returned; expanding one
  reveals its real children;
- (b) with `outline_detail = counts` every row prints the recorded `pages / planned / keywords`,
  and with the no-counts payload NOTHING numeric is printed on any row (absent ≠ zero);
- (c) on Factory Playground every row carries the "Proposed" mark and the toolbar shows the
  "Proposed only" toggle; on All Green it does not;
- (d) a text filter for a real deep topic keeps its ancestors visible and nothing else;
- (e) with the recorded associations, the page rows under that topic are ONE per page id, their
  labels are the recorded urls, the dots are present with `outline_intent_dots=true` and absent
  with `false`, and any hidden count becomes a "cannot open" row;
- (f) `readOnly` renders no editor on F2 and no drag handle, while the "Open topic" door remains;
- (g) a rejected `patchMapTopics` (build the rejection from a REAL refusal: call
  `seo.patch_map_topics` on the live map with an edit the function refuses — e.g. a `new_slug`
  of `"Not A Slug"` — inside a transaction you roll back, or simply against a topic slug that does
  not exist, and copy the Postgres `message`/`code` byte for byte) shows that sentence verbatim in
  the banner.

### 2. Judge the surface against the vision and the plan, from the code
For every item in PLAN §6 A and vision §2.1, say PRESENT / PARTIAL / MISSING with the file and
line: click selects; click-on-selected / Enter / F2 edit; drag-to-move (and the cycle refusal);
hover card gated by `outline_hover_popover` with description, counts, facets, open button;
`outline_detail` levels with the snippet clipped at `outline_description_max_chars`;
expand-to-pages rows with `IntentDot` gated by `outline_intent_dots`, coloured by
`pageIntentTone`; status marks; ancestor-keeping search via `setFilters`; sibling sort via
`setSiblingSort`; expand/collapse all; the v3 menu per row via `buildTopicMenuSection` +
`resolveContextOnOpen`; "Open topic" via `useOpenTopicPanel`; `AssistStrip`; every taste from
`useTopicalMapKnobs`; errors through `TopicalMapFailed` verbatim; `readOnly` honoured; the Text
view with `useMapOutline` + focus picker over `useMapTopicSearch` + `overrides` + `CopyButtons`
and the existing sentence. Add anything the vision asks that the plan forgot.

### 3. Hunt what the builder does not believe
At least: a hard-coded taste (grep the lane's files for numbers and colour words); a count printed
from `?? 0`; a place a refusal is reworded or swallowed; a control that looks clickable and does
nothing; a hover trap on touch; a scroll chain broken by a non-flex ancestor; a page-row id that
can collide with a topic slug; anything a screen reader cannot name; light/dark tokens; iOS zoom
on the search input (16 px floor is global — confirm nothing overrides it inline).

### 4. Gates (paste verbatim)
`pnpm type-check` (total; 0 in `features/marketing/seo/topical-map`), `pnpm check:parse`,
`pnpm check:dead-ends`, `pnpm check:scroll-chain`, `pnpm check:agent-disclosure`,
`pnpm test -- features/marketing/seo/topical-map/views/outline`.

## Report shape
Terminal truth first (what is verified on real bytes, what is not); the PRESENT/PARTIAL/MISSING
table; every defect with file:line and a one-line fix-by-class suggestion; the recorded fixtures'
paths and SHAs; gate results verbatim; what you could not exercise and why.
