# VERIFY-G — the browser walk for Lane G (proposals, history, chat kind, tool renderer, canvas, the map window)

Runs on a machine that can host the app (`pnpm preview:start`, dev-login as `admin@admin.com`).
No fixture, mock or env toggle is on. Record the build SHA. Every step names what to click, what
must be on screen, and what counts as a failure. Vision: `common-docs/inbox/topical-map-app-requirements.md`
§2.5 (proposals) and §0.4 (windows); plan: `TOPICAL-MAP-UI-PLAN.md` §6 G.

Real data: Factory Playground map `ff2010ec-f53d-4d8b-81d9-094c4ca73397` (brand
`370f9281-2c10-41bf-af9e-5784aaee5838`) — 52 proposed topics, recorded 2026-09-18 in
`proposals/__fixtures__/factoryPlaygroundRecorded.ts`. All Green `e9df6779-…` for a map with
active topics.

## 1. History and proposals on the page host

Open `/marketing/370f9281-2c10-41bf-af9e-5784aaee5838/content/map/ff2010ec-f53d-4d8b-81d9-094c4ca73397/history`.

1. Top of the body: a small **Open as window** button (right-aligned). Below it a section
   **"52 proposals waiting"** with the ReviewDeck: a mode switcher (One by one · Batch · Accept
   all · Reject all) showing the org's `proposal_review_mode` (default *One by one*), "1 of 52",
   the first card **IT Asset Disposition** with its path line "At the root of the map", the
   description, a *Proposed* mark and the slug. FAIL if the deck is absent, shows 0, or shows
   any topic that is not proposed.
2. One by one: press **A**. A ConfirmDialog does NOT appear (one_by_one decides the cursor
   directly). Toast "1 topic accepted." The card advances to the next proposal; the count reads
   "1 of 51". Reload: the accepted topic is gone from the deck and the Outline shows it without
   the *Proposed* mark. FAIL on a generic "Are you sure", or if the tree does not update.
3. Press **R** on the next card with the policy left at *Refuse if anything is attached*. Toast
   "1 topic rejected — kept in History, nothing deleted." The row then appears in **What left the
   map** below with status *Rejected*, "by 87a6e699" (short uuid, full uuid in the tooltip),
   the tier chip reading exactly the recorded word (`human` / `agent` — never "AI", never "Person")
   and a **Restore** button.
4. Reject a topic that has children — e.g. **Secure Data Destruction** — with *Refuse if anything
   is attached*. EXPECT the database's own sentence (a 23514 check-violation naming the blockers
   and the policies that unblock) rendered verbatim in the red `TopicalMapFailed` box above the
   deck. Screenshot it. FAIL if the sentence is reworded, truncated or replaced by a generic error.
5. Switch the policy to *Move attachments into another topic*, type "asset" in the search: only
   LIVE topics are listed (the one you accepted in step 2 appears; proposed and rejected ones do
   not). Pick one; the chip shows its slug. Cancel.
6. Switch to **Accept all**. Click the one button. A ConfirmDialog states the consequence ("Accepting
   makes N topics live in this map: pages can be placed on them …"). Cancel (do not drain the
   map). Switch to **Batch**: checkboxes appear; check two, click Accept in the bulk bar, confirm.
   Toast "2 topics accepted."
7. **What left the map**: status toggles (rejected · retired · proposed · active). Turn on
   *proposed* → the list grows to the remaining proposals (the read is server-side; total updates).
   Try to turn every status off → the last one refuses to go off (an empty list would silently
   mean "rejected+retired" to the function). *Who* lists the recorded actors as short ids; *Since*
   is a date input. Setting Since to tomorrow shows the honest empty state naming how many of the
   total were read.
8. Click **Restore** on the rejected row from step 3. ConfirmDialog says it goes back to
   *proposed* ("returns to the review deck and is not live until accepted"). Confirm. Toast
   "… is proposed again." and the topic reappears in the deck. Retired rows (All Green has one)
   say they go back to *active*.
9. Mobile 375×812, light and dark: the filter bar wraps, nothing overflows horizontally, the
   deck's mode switcher stays reachable.
10. A record-only grantee (share link) sees the proposals count sentence "Reviewing needs edit
    access to this map." and no Restore buttons — absent, not disabled.

## 2. The map as a window from the Tools grid on /chat

1. Open `/chat`. Open the shell's Tools grid → **Content** → tile **Topical map**. A window
   titled "Topical map" opens on the **map picker** listing the organization's maps with their
   status. FAIL if a blank or "loading" frame stays up, or if a map is guessed.
2. Pick Factory Playground. The title becomes the map's name; the title bar shows six screen
   buttons (Outline · Table · Graph · Text · Pages · History), a brain icon (**Ask the map**) and
   an external-link icon (opens `/marketing/topical-maps/<mapId>` in a new tab). The body is the
   same outline the page renders. Click **History** → the deck from §1 renders inside the window.
3. Selection survives: select a topic on Outline, switch to Table, back — still selected.
4. Reload the page: the window comes back on the same map and screen (preservation), and the URL
   carries `?panels=topical_map:<mapId>:s-<screen>`. Open that URL in a fresh tab: same window.
5. Open a second map from the grid (pick another map): it floats beside the first (multi). Click
   the first map's "Open as window" from its page: the existing window is FOCUSED, not duplicated.
6. Click the brain icon: the Mandate window opens IN PLACE on **Topical Map Agent**
   (`seo.map_curation`); the top **Agents** menu on any screen hosting the map lists it. Nothing
   was added to the page body for disclosure.
7. Mobile: the window presents as a drawer.

## 3. A chat run rendering the tree

1. In `/chat`, pick an agent that carries the `topical_map` tool (the Topical Map Agent) and ask:
   "Show me the tree of the Factory Playground map." The tool card **Read the map tree** renders
   as a card (no folded line) with the subtitle "52 topics", a real `TopicTree` (chevrons, keyboard
   ↑/↓/←/→, *Proposed* marks), and the **Open** menu carrying *Open map in canvas* and *Open map as
   window*. Click each: the side canvas opens the same outline with the six-screen strip and
   *Ask the map* / *Window*; the window opens as in §2.
2. Ask: "Give me the outline of the map." The card **Read the map outline** shows the text
   verbatim in a monospace sheet.
3. Ask the agent to add a topic while the org's `map_agent_change_mode` is `propose` (the default).
   The **Wrote topics** card shows the server's note ("…rehearsed…") at the top of the body and the
   `created / updated / unchanged` rows. FAIL if the note is missing — the screen would be lying
   about whether the map changed.
4. Run the map author (Lane E's Start-a-map, or an agent bound to `seo.map_author`) on a brand
   with a profile. The result message renders **Proposed topical map** — a TopicTree with the
   *Proposed* marks, the summary, "Still to settle" when coverage notes exist, and, when the run
   named a map, **Accept all / Reject all** plus *Open in canvas* / *Open as window* / *Ask the map*
   and an *Open the map* record link. Check two rows and click Accept 2 checked → ConfirmDialog with
   the consequence → toast. When no map is named the tree is read-only and SAYS why.
5. Reload the conversation: the tree renders again from the persisted message (the `__kind` must
   still be on the root and every node — check the raw message JSON).

## Gates the builder ran (repeat on the verification machine)

`pnpm type-check` (0 errors in Lane G files), `pnpm check:parse`, `pnpm check:kind-marker-law`,
`pnpm test:render-matrix`, `pnpm check:dead-ends`, `pnpm check:agent-disclosure`,
`pnpm check:mandate-keys`, and the lane's tests:
`npx jest features/marketing/seo/topical-map/proposals features/marketing/seo/topical-map/views/HistoryView.test.ts features/marketing/seo/topical-map/canvas features/tool-call-visualization/renderers/topical-map features/content-ir/__tests__/kind-map-topic-proposal.test.ts`.
