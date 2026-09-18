# VERIFY-E — the browser walk for Lane E (home, start-a-map, sharing, the read-only door, the seven link-in points)

Run on a machine that can host the app (`pnpm preview:start`, open the hostname it prints, `pnpm dev-login /marketing`). Record the build SHA (`git rev-parse HEAD`) at the top of your report. No fixture, mock or env toggle is on during any step. Every step names what you SAW; "looks fine" is not a result.

Real data: brand **All Green Recycling** `c2db36a1-15b5-4717-b8d6-161600aa5db7` (map `e9df6779-8e0e-45e9-a664-375e7d1ecffd`, site `d0aff5b6-0710-4848-8304-164db3c80ab7`); brand **Factory Playground** `370f9281-2c10-41bf-af9e-5784aaee5838` (for the start-a-map run — a throwaway brand).

## 1. The Content home — `/marketing/c2db36a1-15b5-4717-b8d6-161600aa5db7/content/map`

Note: the `home_single_map_opens_workspace` knob defaults to `true`. If All Green has exactly ONE map, a COLD arrival redirects straight into the map's outline (expected — that is the knob). To see the home itself, open the map first, then click the header's back link (or open `…/content/map?start=1` and press Close): once the map has been opened this session, the home no longer bounces. Record which happened.

1. The header carries the route nav (Topical map · Content plan) and a "Start a map" action on the right.
2. One card per map: name (link), status mark when not active, description, "changed N ago".
3. Counts (each a link): Topics, Proposals waiting, Empty topics, Sites using it. Each shows "loading…" before it lands, never a 0 while loading. Click Topics → the outline. Click Proposals waiting → history. Click Empty topics → table.
4. Diagnostics strip (only non-zero items): "N crowded topics" → table; "N pages on 3+ topics" → pages; "N retired topics still carrying attachments" → history.
5. Sites section: `allgreenrecycling.com` listed via `EntityRef` (open / new tab / peek), with "N pages on no topic" → pages view with `?site=d0aff5b6…`, and "Extend from the site".
6. "Site uses this map": the picker lists only sites of the brand NOT already using the map (if every site is bound, the control is absent — record that). If a site is available, bind it and see the toast "The site now uses this map." Undo is not offered here; use a throwaway site if you test the write.
7. `ShareButton` on each card opens the standard share modal for `seo_topical_map`.
8. Mobile 375×812, light and dark: the cards stack; counts stay a 2-column grid; nothing overflows horizontally.

## 2. Start a map — Factory Playground

Open `/marketing/370f9281-2c10-41bf-af9e-5784aaee5838/content/map?start=1`.

1. Six tiles in the wire's order: From this brand's data · From documents · From a description · From a web page · From finished research · Research it first. Selecting each swaps the control beneath: site picker · note picker + editable box · textarea · address + "Fetch and clean" + editable box · research-topic picker · a sentence and a "Start the research" button.
2. The mode line under the control states the org's change mode ("Topics land as PROPOSALS you review (change mode: propose)" or apply, or "You will be asked…").
3. Choose "From a description", type a 2–3 sentence business description, add emphasis "Do not split by city". Press "Build the map". A `ConfirmDialog` appears naming the consequence (what is written where, that it is paid, that it survives closing the page). In `ask` mode it also offers Propose / Apply radios and the confirm is disabled until one is chosen. Confirm.
4. The run floats in `LiveRunWindow` (label "Topical map author") — never a spinner over the page. The card under the controls shows the server's stage sentences ("Reading the source you chose…", "Writing the topic tree…", …).
5. RELOAD mid-run. The page says "A map run for Factory Playground is already in progress — rejoining it." and the run continues; the result lands after rejoin.
6. Result: "Topics written to the map (as proposals)" or "Tree proposed — nothing written", the summary, Created/Updated/Unchanged counts, "Cost: unmeasured on this build…", "Open the map" → the new map's outline. The proposed tree renders read-only through the shared tree with expand/collapse and a note that this is the interim render until the proposal kind component lands.
7. Choose "Research it first" and press "Start the research": the result says "Research started — the map is not built yet", names the research run (`EntityRef` to the research topic) and offers "Build the map from it when it finishes", which switches the tile to "From finished research" with that topic preselected.
8. Choose "From a web page", paste a services-page URL of a real business, press Fetch and clean: text streams into the box; edit one line; build. (Cost: one scrape + one extractor call + one author run.)
9. A deliberately failed run: choose "From finished research" and leave the picker on "No research selected" — the Build button is disabled with the readiness note "Pick the finished research topic." (no paid call). Then pick a research topic that has NOT finished, build, and record the server's own refusal sentence rendered in the red box with "Run it again exactly as sent".

## 3. Extend from the site — All Green

From the home card's site row press "Extend from the site". The home switches into start mode titled "Extend All Green… from the site": the tile is locked to "From this brand's data" with the site preselected, the mode line reads propose, an "Add under" picker lists the map's active topics, and the ConfirmDialog names "one new section under …" when a parent is chosen. Confirm on a THROWAWAY map only, or stop at the dialog and record its text.

## 4. The read-only id door — `/marketing/topical-maps/e9df6779-8e0e-45e9-a664-375e7d1ecffd`

1. As admin (brand readable): the door REDIRECTS into `/marketing/c2db36a1-…/content/map/e9df6779-…` (expected).
2. As a record-only grantee (share the map with a second test user who is NOT a member of the brand's org, then sign in as that user in a second browser profile): the door renders "Topical map · read-only", the map name, the share button, and the real views below with a screen switcher (Outline · Table · Graph · Text · Pages · History). Every write control is ABSENT (no rename on click, no drag, no "site uses map"); every record named opens through a flat door (`/marketing/topical-maps/topics/{id}`, `/marketing/pages/{id}`, …), never a brand URL.
3. A non-member with no grant: the `AccessGate` — the same denial a nonexistent id gets (`/marketing/topical-maps/00000000-0000-4000-8000-000000000000`).
4. Signed out: redirected to `/login?redirectTo=/marketing/topical-maps/e9df6779…`.

## 5. The seven link-in points

1. **Keyword Workbench** `/marketing/c2db36a1-…/seo/d0aff5b6-…/keywords/workbench`: a "Map topic" column (default-on, beside "Offering"). Cells: a topic name with its door into the map (`?topic=<slug>`), or "not homed yet" (title explains the assigner homes it from the Offering), or "no map". The column can be hidden/shown in the column chooser. Note: no "attach to map topic" write exists on the client (owed — see § 7).
2. **Search Console insights** `…/seo/d0aff5b6-…/search-console` → Insights: with the Pages dimension toggle on, a "Map these pages" button appears beside the toggle → the map's pages view with `?site=`. Right-click a page row → "Decide its place on the topical map" in the Page section.
3. **Site overview** `/marketing/c2db36a1-…/websites/d0aff5b6-…`: Quick work has "Topical map — place the pages" → the pages view. On a site with no map it reads "Start a topical map" → the home in start mode.
4. **Brand overview** `/marketing/c2db36a1-…`: the Topical map card lists the maps; on a brand with none (make a throwaway brand) it shows "Start a map from this brand's data".
5. **Content plan** `/marketing/c2db36a1-…/content/plan`: the site list has a "Map" column naming the map ("Built on map X" door) or "No map". Open a node → the Page section has "Topic (on the topical map)": a select of the map's active topics; choose one, Save, reload — it persists (`plan.node.topic_id`), and "Open <topic> in the map" appears beneath it.
6. **CMS** `/cms/<a site paired to d0aff5b6…>`: the header actions carry "Topical map" beside "Content plan" (only when the paired web site uses a map) → the id door → redirect into the workspace.
7. **Coverage** `…/seo/d0aff5b6-…/coverage`: a "Topics with no page" tile in the first row (amber when > 0) → the map's table view; on a site with no map it reads "no map" with the start door.

## 6. Research output card

`/research/topics/<a finished topic>` → Outputs → Domain reports lists "Topical map" (mandate picker beside it shows the Topical Map Author). Click → `/marketing/topical-maps/start?research=<id>&source=existing_research`: pick a brand, the start screen opens on "From finished research" with that topic preselected.

## 7. Not verified on this build / owed (report these as-is)

- No browser in the build container; every step above is unwalked by the builder. Type-check, parse, jest and the static guards were the builder's floor.
- No recorded `map_diagnostics` fixture exists in the repo, so the home card has no recorded-bytes test; recording one needs the live database (the coordinator may record it now that the Supabase MCP is allowed).
- The Keyword Workbench "attach selected keywords to a map topic" action: the only map-home writer is `seo.set_site_keyword_map_home`, server-only by design (register lesson 30). A client-callable door is owed (server lane); until then the human path is the Offering cell, and the column says "not homed yet".
- Search Console "map these pages" pre-filter: the pages workspace reads filters from the map store (CONTRACTS §3); a URL contract (`?disposition=`, `?onNoTopic=`) is owed to Lane F / the coordinator. The link opens the site's pages unfiltered and says so.
- The proposal tree in the start result renders through `TopicTree` until Lane G's `map_topic_proposal_v1` kind component lands (R12); swap and delete `start/proposalRows.ts` then.
- Cost line: "unmeasured" until the author's `chat.request` row is confirmed live and surfaced on the result.
- `home_single_map_opens_workspace` bounce is skipped once the map's workspace state exists in the store this session (`selectMapLoadedAt`); the header's back link therefore works after a first visit. A brand-new tab bounces again — by design of the knob.
