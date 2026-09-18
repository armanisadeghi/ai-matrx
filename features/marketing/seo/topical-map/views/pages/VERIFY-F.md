# VERIFY-F — the pages convergence workspace, walked on All Green

Lane F of the topical-map UI build (plan §6 "F — Pages workspace + runs"; vision §2.7 steps
5–7 and acceptance §6 steps 5–6). This is the walk a verifier who did NOT build the screen
runs on a machine that can host the app. No fixture, mock mode, seed script or env toggle is
on during the walk. Record the build SHA (`git rev-parse HEAD`) at the top of your report.

Site: All Green Recycling, site `d0aff5b6-0710-4848-8304-164db3c80ab7`, map
`e9df6779-8e0e-45e9-a664-375e7d1ecffd`, brand `c2db36a1-15b5-4717-b8d6-161600aa5db7`.
Live counts when this was written: 5,552 `covers` edges and 330 proposed intents (307 keep,
19 redirect, 3 delete, 1 move — source `agent`, state `proposed`). Query the live numbers
when you walk; never quote these back as fixed.

Sign in as the test admin (`pnpm dev-login /marketing/c2db36a1-15b5-4717-b8d6-161600aa5db7/content/map/e9df6779-8e0e-45e9-a664-375e7d1ecffd/pages?site=d0aff5b6-0710-4848-8304-164db3c80ab7`
prints the URL; open the hostname it prints, never `localhost:3001`).

## 1. The table (Screaming Frog / Ahrefs bar)

1. The screen loads with NO spinner-only state: the loading state names what loads, then the
   table renders with the header sentence `N pages · traffic over the last 28 days` where N is
   the read's `total` (compare against `select count(*)` of the pages `seo.list_page_intents`
   returns for that site — the screen never prints a number it did not read).
2. Columns present, in order: page · current topics · destination · disposition · state ·
   source · clicks · impressions · note. No sort arrows (the read has no ORDER BY — the
   screen must not fake one over a single page).
3. Pick a row: the page name opens the page record (`/marketing/pages/{id}`), the external
   icon opens the live URL in a new tab, each current-topic chip opens the topic. Screenshot.
4. Find a row with `current_topics: []` (filter state=proposed; the intent proposer marked
   some pages the mapper could not place — or reject a proposed topic on the Factory
   Playground map and read its pages): the cell says "on no topic", never blank.
5. Find a proposed `redirect` row: the destination cell shows the dot in the org's
   `intent_colors` for its state, the topic name, AND the `into` target as a record link.
6. Clicks: a page with a real `0` shows `0`; a page the caller cannot open shows `—` titled
   "not measured for this page". If every page on All Green is readable, note that the hidden
   case could not be exercised here and cite the unit test that covers it.
7. Page size 25 → 100 → 1000: paging is a server operation (watch the network tab: a new
   `list_page_intents` call with the new `p_limit`/`p_offset`); the `1000` cap is honoured.

## 2. Filters

1. Topic picker: type "electron" → the search offers live topics with their path; choose
   one → the table narrows (server call carries `p_topic_slug`); a chip appears; clearing
   the chip restores the full list.
2. Disposition = redirect, State = proposed, Source = agent: each is a server or client
   narrowing as labelled; when a CLIENT-side filter (text, traffic, source) is active the
   header says "narrowed within the N loaded of TOTAL — page through to see the rest".
3. Traffic = "low (≤ 0 clicks)": the threshold is the `pages_low_traffic_clicks_max` knob
   (change it in the map settings to 5 and watch the label follow). Rows whose numbers are
   absent match neither traffic bucket and the bar says so.
4. Region: the control opens, lists the map's region values, and says plainly that the page
   list cannot be narrowed by region yet. It must not pretend to filter.
5. Reload the page: filters, the checked rows and the review cursor survive (they live in the
   slice), the table re-reads.

## 3. The 200-page redirect in two clicks (acceptance §6.5)

1. Filter: topic "electronics recycling" (or the closest live topic), traffic low.
   Select 200 rows (header checkbox on a 200-row page, or 2 × 100 across pages — the count in
   the bulk bar must say `200 pages selected`).
2. CLICK 1: "Redirect to page" → the popover offers a topic (prefilled from the filter) and a
   target: a live page OR "Make a planned page here". Choose the planned page, type a label,
   create it → it appears as a plan-node record link (open it: `plan.node.topic_id` must be
   the chosen topic — read it via the node's page or the DB).
3. CLICK 2: "Preview and apply" → the consequence sentence names 200 set / N kept / M would
   fail (a dry run through `seo.map_dry_run`, watch the network tab) and, because 200 is above
   the `bulk_action_confirm_threshold` (20 by default), a ConfirmDialog with that sentence
   blocks. Confirm. Under a minute of clicks from step 1.
4. Outcome line + toast: "Set 200 · Kept 0 · Failed 0" (or the honest numbers). The rows now
   show `redirect → <topic>` with the planned page as target, state `accepted`, source
   `human`. Screenshot.
5. Set the knob `bulk_action_confirm` to `never` and repeat with 3 rows → no dialog, the same
   sentence appears in the outcome. Set it back.
6. KEPT: pick 5 rows you just decided (human, accepted) and, as the same user, run "Keep" —
   they are set (human beats human). Then find rows an agent proposed and that a person
   accepted earlier (or accept 5 via the review deck first), and run the intent proposer with
   `dry_run` off on those topics: the run result reports `kept_existing` ≥ those pages and
   the workspace never shows them as failed. A kept row in the bulk outcome reads "kept — a
   person already decided this page".
7. Mark done: select 10 accepted rows → "Mark done" → the sentence names them; after apply
   their state reads `done`. Select a row with no intent → the sentence says it was skipped.
8. Delete: the button is destructive-styled and its sentence names the count and that the
   pages' existing intents are replaced.
9. A deliberately failed write: choose "Keep" on a selection that includes a page with
   `current_topics: []` and no topic override → the preview lists the function's own 22023
   sentence verbatim for that page. Screenshot the sentence.

## 4. Review deck (`intent_review_mode`)

1. Toggle "Review proposals": the deck opens in the org's `intent_review_mode` (one_by_one by
   default) over the proposed rows of the loaded page; A/R/S keys work; the counter reads
   `1 of N`.
2. Accept one: the row's own intent is re-sent with state `accepted`, source `human`; the
   deck advances.
3. Reject: the control says plainly that it needs `seo.withdraw_page_intents`, which has no
   client wrapper yet. It must not silently do nothing.
4. Switch to batch: checkboxes + a bulk bar; "accept all" shows the consequence sentence
   naming the count before anything runs.

## 5. Graph and table show them leaving (acceptance §6.6)

After §3: open the graph view in convergence mode → the topic shows the leaving pages in the
`leaving` colour and the planned page in the `planned` treatment (purple dashed). Open the
table view → the topic's leaving/arriving rollup counts the 200. (Those two views are Lanes C
and B; if they do not yet show it, record that here — it is their row, not this one.)

## 6. Run controls (header)

1. Read-only grantee (share the map read-only, open the share door): no run controls, no
   checkboxes, no bulk bar, no review toggle — absent, not disabled. Screenshot.
2. "Map the pages": the popover states the consequence from the live ledger (`queue_pending`,
   `pending_clicks`, the daily ceiling knob) and the spend BEFORE Start; the knob chips show
   the `mapping_*` values; Start with `dry_run` on → the run floats in the LiveRunWindow (no
   top-of-page block); reload mid-run → it rejoins; the result summary names mapped / kept /
   no_topic / dropped_geography_topic and the `notes` verbatim. "The map is missing this"
   lists the wanted topics with their example URLs; "Held back" lists `held_back_because`.
3. "Find the regions": `dry_run` on → free; turn on "retire geography topics" → a dry run
   answers first with the branches and how many pages would end on no topic; Start is not
   offered before it answers.
4. "Propose destinations": `dry_run` and `limit` are first-class; the consequence names the
   ceiling and the spend and says cost is unmeasured until the ledger reader lands; run with
   `limit: 5`, `dry_run` on → the result shows `by_disposition` and every `downgraded_*` count.
5. With `?site=` removed (every site): each control offers a site chooser naming the sites
   using this map; nothing can start without one.

## 7. Errors, mobile, themes

1. Break a call on purpose (e.g. filter by a topic slug that was just retired on another tab)
   → the RPC's own P0002 sentence renders, unaltered, with its code. Screenshot.
2. 375×812: the filter bar wraps, the table becomes the canonical phone cards, the bulk bar is
   reachable, popovers fit. Light and dark: no raw colours, the intent dots read in both.
3. A non-member opening the URL gets the same denial as a nonexistent map id.

Return: what is missing against §2.7 / §6 of the vision, each control you actuated, the
screenshots, and the build SHA.
