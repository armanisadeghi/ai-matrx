# VERIFIER-B — zero-authorship verification of the topical-map Table view

**Lane:** `quick` (model `claude-sonnet-5`). You did not build this and you must not read the
builder's summary before you look. Your job is to return what the builder does not already
believe: what is missing, wrong, or dishonest in the Table view against the owner's words.

## What the owner asked for (read these first, in this order)

1. `common-docs/inbox/topical-map-app-requirements.md` §2.1 (the Table bullet) and §0
   (standing rules) — the owner's own words. Verbatim: *"the platform's reusable table, rows
   indented for hierarchy, drag-and-drop to move, inline edit, sort/filter on counts, status,
   facets, intent states. Scrolls; never squeezes everything onto one screen."*
2. `common-docs/projects/table-provisioning/TOPICAL-MAP-UI-PLAN.md` §6 "B — Table" (the brief the
   builder was held to) and §3 ruling R10 (hierarchy vs flat).
3. `features/marketing/seo/topical-map/CONTRACTS.md` §0 (the laws), §3 (the store's `table`
   state and `siblingSort`), §4.3 (the UI kit).
4. `features/marketing/seo/topical-map/FEATURE.md` § "Four things that are easy to get wrong".

Champion for this screen: Linear / Airtable. Judge density, honesty and keyboard reach against
them, not against "it works".

## Where the work is

Lane B owns `features/marketing/seo/topical-map/views/TableView.tsx` and everything under
`features/marketing/seo/topical-map/views/table/`. Its tests are under `views/table/__tests__/`
and its recorded fixtures under `views/table/__fixtures__/` (the All Green map tree and its
`move` / `redirect` intents, recorded from the live `seo.map_tree` / `seo.list_page_intents`
on 2026-09-18). The browser walk the builder wrote for a hosted machine is
`views/table/VERIFY-B.md` — do NOT treat it as the checklist; it is the builder's frame. Use
it only after you have formed your own list from the owner's words.

## What you do (in this container: no dev server, no browser)

1. From the owner's words and PLAN §6 B alone, write your own list of every behaviour the Table
   view must have. Do this BEFORE opening any file under `views/table/`.
2. Read the code and the tests. For every behaviour on your list, mark it: **present and
   tested with recorded rows** / **present, untested** / **present but dishonest** (prints a
   number it did not load, hides a state, disables without a reason, lies about order) /
   **missing**.
3. Run, and paste the verbatim results of:
   - `pnpm test -- features/marketing/seo/topical-map/views/table`
   - `pnpm type-check 2>&1 | grep -c "error TS"` (baseline 148 repo-wide; report any line
     naming `topical-map/views`)
   - `pnpm check:parse`, `pnpm check:dead-ends`, `pnpm check:scroll-chain`
4. Attack the laws with the recorded fixtures (write a throwaway test if you need to; do not
   commit it): absent counts must render nothing (never "0"); a `map_tree` read without
   `counts` must not sort as if it had them; the 19 recorded redirects must NOT count as
   leaving (a page sent to another page of the same topic stays on the topic); sorting Status
   must flip to flat; sorting Pages descending must NOT flip; `readOnly` must remove every write
   control and keep the doors; the column set must come from the `table_default_columns` knob
   and persist through the store, never component state.
5. Check the things a builder forgets: every column sorts AND filters; Lucide only; semantic
   tokens only; no browser dialogs; every destructive click names its consequence; every taste is
   a knob (grep for hard-coded colours, thresholds, column sets); no new dynamic import; no
   barrel; the table scrolls (bounded-height chain, `useClippedContentGuard`); mobile does not
   need a horizontal page scroll.

## What you return (to the lane owner, as your final message)

- A numbered list of **findings**, most serious first, each with: the owner's sentence it
  violates, the file and line, and what you observed. A finding you cannot prove is labelled
  "suspected".
- Your list from step 1 with each item's mark.
- The verbatim command results from step 3.
- What you could NOT verify here (anything needing the live database or a browser) — name it,
  never guess it.
- Do not fix anything. Do not commit. Do not write a report file.
