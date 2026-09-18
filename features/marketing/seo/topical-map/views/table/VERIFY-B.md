# VERIFY-B — the Table view, walked in a real browser

The lane's builder floor ran here (type-check, parse, dead-ends, scroll-chain, 27 tests over
the real reducer, the real selectors and the RECORDED round-22 intents payload). What no test in
this container can prove is the platform table's rendering of the props it is handed and the
live database's answers — that is this walk. Run it as a verifier who did not build the table,
on a machine that can host the app, against **All Green Recycling**: map
`e9df6779-8e0e-45e9-a664-375e7d1ecffd`, brand `c2db36a1-15b5-4717-b8d6-161600aa5db7`, site
`d0aff5b6-0710-4848-8304-164db3c80ab7`. Sign in as the test admin (`pnpm dev-login`), name the
build SHA in the report, no fixture or mock mode on.

The owner's words for this screen (vision §2.1): *"the platform's reusable table, rows indented
for hierarchy, drag-and-drop to move, inline edit, sort/filter on counts, status, facets, intent
states. Scrolls; never squeezes everything onto one screen."* Ruling R10: *"hierarchy mode sorts
siblings within their parent; sorting/filtering a data column flips to an honest flat list with a
visible toggle."* Champion: Linear / Airtable — a dense, keyboard-friendly, honest grid.

URL: `/marketing/c2db36a1-15b5-4717-b8d6-161600aa5db7/content/map/e9df6779-8e0e-45e9-a664-375e7d1ecffd/table?site=d0aff5b6-0710-4848-8304-164db3c80ab7`

Record for every step: what you saw (screenshot), what you expected, PASS / FAIL, and anything
the builder would not already believe.

## 1. It is the platform table, over the real map

1. The page shows `MatrxDataTable` (sticky header, the package toolbar with search, a Columns
   control, the Copy / Copy-for-AI controls) — not a hand-built grid. The root topics of All
   Green (50 active topics + 1 retired in the map) are rows; children are hidden until expanded.
2. Default columns are the organization's `table_default_columns` knob:
   Topic · Pages · Planned · Keywords · Status · Leaving · Arriving. Facets, Updated and
   Description are absent until chosen.
3. The Topic cell: an expand chevron on a topic with children, the name, and a compact status
   mark ONLY on a non-active topic (the retired one carries a dashed-circle mark; active topics
   carry no badge). Expand one: its children appear indented one step, with their own chevrons.
4. Counts: each topic's Pages / Planned / Keywords are numbers; a real zero is a muted "0".
   Hover the header of Leaving / Arriving: with 5,552 pages on this site and the read capped at
   1,000, the header carries a small **partial** tag whose title says "Counted over the first
   1,000 of 5,552 listed pages". If the tag is absent, the rollup is either complete or the read
   failed — a failed read shows the function's own sentence in a red box, never a blank column.
5. Leaving / Arriving cells: a topic with pages moving shows an amber (leaving) or blue
   (arriving) dot with the count (the colours are the org's `intent_colors` knob); a topic with
   none shows a muted 0. All Green has 330 proposed destinations (307 keep, 19 redirect, 3
   delete, 1 move): expect a handful of non-zero cells, not none.
6. Scroll: with every root expanded (use the outline's expand-all, then come back — expansion
   is shared) the table grows and the page scrolls; nothing is squeezed, clipped, or cut at the
   fold. Open the browser console: no `[clipped-content]` error.

## 2. R10 — hierarchy sorts, then the honest flip

7. Click the **Pages** header once. Expected: the header arrow shows descending, the rows are
   still a TREE (chevrons, indent intact), and every sibling group is ordered by pages, biggest
   first. The toggle above the grid still reads **Hierarchy**. Switch to the Outline view and
   back: the same order (it is `siblingSort` in the shared store, not table state).
8. Click **Pages** again (ascending). Expected: the table flips to **Flat** — the toggle moves,
   indent and chevrons disappear, every topic in the map (children included) is one list, sorted
   ascending by pages, and a sentence above the grid says it was sorted by Pages and shows
   every topic flat "so the order is honest", with a **Back to hierarchy** link.
9. Click **Back to hierarchy**. Expected: tree restored, sort cleared to the map's own order,
   toggle on Hierarchy.
10. Click the **Status** header. Expected: flat immediately (status is a data column the walk
    cannot honour), sorted by the status word.
11. Back to hierarchy, then open the Status column's filter and pick `proposed` (if the map has
    none, pick `retired` — All Green has one). Expected: flat, filtered to that status only,
    the sentence says "Filtered — every matching topic in one flat list". Clear the filter from
    the toolbar's clear control: the list is every topic, still flat; the toggle brings the tree
    back.
12. In hierarchy mode type "recycl" in the search box. Expected: matching topics AND their
    ancestors, ancestors auto-expanded; the tree stays a tree. Switch to Outline: it shows the
    same search (one `filters.text` in the store). Clear it.

## 3. Columns — the chooser, the knob, the persistence

13. Open the table's **Columns** control. Turn on Facets, Updated and Description; turn off
    Keywords. Expected: the grid shows the new set in that order; a **Default columns** button
    appears in the toolbar. Facets render as small `key value` chips (All Green has a region
    facet); Updated is a short date; Description is one clipped line with the full text in the
    tooltip.
14. Switch to Outline and back to Table. Expected: the column set survives (it is
    `table.columns` in the store). Click **Default columns**: the knob's set returns and the
    button disappears.
15. Every visible column sorts (click its header) and filters (its funnel). Numbers get a
    min/max filter; Status and Facets get option lists WITH counts.

## 4. Writes — inline edit, drag, the row menu

16. Hover a topic name: a pencil appears (the row body is the door, the pencil is the edit).
    Click it, change the name, Enter. Expected: the floating Save pill appears; click Save; the
    name persists after a reload. Change it back the same way.
17. Deliberately fail one: edit a name to an empty string or to 600 characters. Expected: the
    function's own sentence (a 22023 rule) in a toast, unaltered, and the draft stays in the
    pill for retry. Screenshot it.
18. Drag a child topic's row onto another parent (the drop shadow shows the target); drop.
    Expected: the tree reparents instantly (optimistic), and survives a reload. Drag it back.
    Drag a topic onto the root strip: it becomes a root. Drag it back.
19. Right-click a row. Expected: the v3 menu with a **section named after the topic** first:
    Open topic panel · Open in a window (disabled with a reason until the map window lands) ·
    Open in a new tab (a real link) · Copy slug · Rename · Move to another parent · Retire topic
    · Reject topic · Ask the topic agent (disabled with a reason). Try each:
    - Copy slug → toast, clipboard holds the slug.
    - Rename → a dialog (never a browser prompt) prefilled with the name; Enter renames.
    - Move → a toast telling you to drag the row (there is no second move UI).
    - Retire → a confirmation that NAMES the consequence (its page / planned / keyword counts,
      that it leaves the live map, that children move up, that a refusal is named). Cancel.
      Then confirm on a topic that carries pages: expected the function's 23514 sentence
      naming what blocks, verbatim, and the dialog stays open. Screenshot it.
20. Click a row body. Expected: the topic panel opens (Lane D's body, or the honest "being
    built" stub) and the row is highlighted as selected; the selection survives a view switch.

## 5. Selection → the pages workspace

21. Check one topic's checkbox. Expected: the bulk bar appears ("1 topic selected") with
    **Open pages**. Click it: the pages screen opens filtered to that topic (`topicSlug` in the
    page filters; the pages screen shows the topic in its filter bar).
22. Come back, check five topics. Expected: **Open pages** becomes a menu listing the five
    topics with the sentence "The pages screen filters to one topic at a time. Pick which:".
    Pick one: the pages screen opens filtered to it. The checked set survives a view switch
    (`checkedSlugs` in the store) — the Outline shows the same checks.

## 6. Hosts and access

23. Read-only: open the flat id door `/marketing/topical-maps/e9df6779-8e0e-45e9-a664-375e7d1ecffd`
    as a record-only grantee (or pass `readOnly` through the window host once Lane G lands).
    Expected: no pencil on any cell, no drag handle / drop shadow, no Rename / Move / Retire /
    Reject in the row menu (disabled, with the reason), but checkboxes, Open pages, sort, filter,
    columns and the panel door still work.
24. Mobile 375×812: the table falls back to the package's narrow layout without a horizontal
    page scroll; the toggle and search remain reachable. Light and dark: every dot, chip and
    mark readable in both.
25. Knob failure: temporarily blank the org's `table_default_columns` value in the settings
    screen (or set it to a non-array). Expected: the table view shows the settings failure with
    the setting's name — never a guessed column set. Restore it.

## What the builder could not verify here

- Anything above that touches the live database or the rendered package table.
- The `partial` tag's numbers (depend on the live `list_page_intents.total`).
- Drag-and-drop (dnd-kit needs a real pointer).
