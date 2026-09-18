# VERIFY-A — the browser walk for Lane A (Outline + Text views)

Run this on a machine that can host the app (the build container cannot: 15 GB against a
dev server that needs 18–90 GB). You are the verifier: you did not write this code, you read
the vision (`common-docs/inbox/topical-map-app-requirements.md` §2.1) and the plan's Lane A
brief (`common-docs/projects/table-provisioning/TOPICAL-MAP-UI-PLAN.md` §6 "A — Outline + Text"),
and you return what is missing against THOSE, never against this file's claims.

Record the build SHA (`git rev-parse HEAD` on `claude/tender-gates-5qcxnd`) at the top of your
report. No fixture, mock mode, seed script or env toggle is on during the walk.

## Setup

1. `pnpm preview:start` — open the hostname it prints (never `localhost:3001`).
2. Sign in as the test admin: `pnpm dev-login /marketing/c2db36a1-15b5-4717-b8d6-161600aa5db7/content/map/e9df6779-8e0e-45e9-a664-375e7d1ecffd`
   (All Green Recycling's map: 50 active topics, 14 roots; site
   `d0aff5b6-0710-4848-8304-164db3c80ab7` has 5,552 pages placed on topics and 330 proposed
   destinations).
3. Have the browser at desktop width first; later steps switch to 375×812 and to dark mode.

## A. The outline renders from the store (vision: "looks like a file tree … dense")

| Step | Must be true |
|---|---|
| A1 | The Outline screen shows the 14 root topics as one dense tree (28 px rows), each root with a chevron. No "outline view" harness card, no "Selected topic: none" line. |
| A2 | Click a chevron: children appear indented one step with a hairline guide; click again: they fold. |
| A3 | Use "Expand all" (toolbar, right): every branch opens; "Collapse all": only roots remain. |
| A4 | The `outline_detail` knob is `labels` by default: rows show names only — no counts, no snippets. In the settings UI set `seo.topical_map.outline_detail` to `counts` for your user: rows now show `N N N` (pages, planned, keywords) after the name; set it to `counts_snippet`: a muted one-line description snippet appears too, clipped with `…` at `outline_description_max_chars`. Set it back to `labels`. |
| A5 | Below the tree, ONE line of diagnostics: `N empty · N crowded · N still proposed · N pages on no topic · 1 site using this map`. The numbers must equal what `select seo.map_diagnostics('e9df6779-…', null, null)` returns (run it, compare). |

## B. Selection, keyboard, state survives a switch (plan: "state survives a switch")

| Step | Must be true |
|---|---|
| B1 | Click a root: it gets the primary wash + left rail. Press ↓ three times, ← once, → once, Home, End: the selection moves exactly as a file tree does (→ on a collapsed parent opens it; ← on an open parent closes it, on a child jumps to the parent). |
| B2 | Type the first letters of a topic's name: the selection jumps to it (type-ahead). |
| B3 | With a branch expanded and a topic selected, switch to **Table**, then back to **Outline**: the same branch is still expanded and the same topic still selected. |
| B4 | Type `recycl` in "Find a topic…": within ~150 ms the tree narrows to matches AND their ancestors, ancestors auto-open, and the toolbar reads `N of 50 topics`. Clear with the × : the full tree returns with the PREVIOUS expansion (search does not destroy it). |
| B5 | Change "Map order" to "Name": siblings at every level sort A–Z; "Pages": siblings sort by page count descending; back to "Map order": the original order returns. Switch to Table and back: the sort choice persists. |

## C. Edit in place (vision: "Editable in place on click"; plan: "click the selected label, Enter or F2 edits")

| Step | Must be true |
|---|---|
| C1 | Click a topic (selects), click it AGAIN: an inline editor opens with the name selected. Press Esc: nothing changed. |
| C2 | Select a topic, press F2, type a new name, press Enter: the row shows the new name instantly; reload the page: the new name is still there (`seo.patch_map_topics` landed). Rename it back. |
| C3 | Select a topic, press Enter: the editor opens (Enter = activate = edit here). Click elsewhere (blur) after typing: the edit COMMITS (Finder contract). Rename back. |
| C4 | **The deliberately failed write.** Open the topic's right-click menu → Rename → set the name to a single space and press Enter: nothing is written (an empty name cancels). Now sign in as a user who can VIEW the brand but not EDIT it (or temporarily revoke your editor grant on the brand) and rename: the row reverts and a banner above the tree reads the database's own sentence (a `42501 … _denied` refusal; the SQLSTATE is printed under it) — screenshot it. Also a toast with the same sentence. Dismiss the banner with "Dismiss". |

## D. Drag to move (plan: `useMoveMapTopic`)

| Step | Must be true |
|---|---|
| D1 | Drag a leaf topic ONTO another root: it re-parents under it immediately; a strip "Drop here to move to the top level" appears only while dragging. Reload: the move persisted. Drag it back. |
| D2 | Drag a parent onto its own child: NOTHING happens (the cycle is refused before any call — no network request, no banner). |
| D3 | Right-click a topic → "Move to another parent": a dialog with a searchable list; the topic itself and its descendants are NOT offered; "Top level" is offered unless it is already a root. Pick one: it moves; a refusal (e.g. pick a retired slug typed by hand — not possible from the list; use the dev tools to call the action with a bad slug if you want the P0002) shows inside the dialog. |

## E. Hover card (vision: "Hover shows a small well-made popover: description, counts, facets, a button to open the full panel")

| Step | Must be true |
|---|---|
| E1 | Rest the pointer on a topic name ~350 ms: a card opens to the right with name, path crumbs, description (or "No description yet."), counts, facet chips (inherited ones flagged) and an "Open topic" button. |
| E2 | Set `seo.topical_map.outline_hover_popover` to `false` for your user: no card opens anywhere. Set it back. |
| E3 | Click "Open topic" in the card: the topic panel opens IN PLACE (a window panel by default; `detail_panel = drawer` opens the side drawer). Nothing navigates away. |

## F. Marks, pages under a topic, intent dots (vision: "proposed/retired marks, intent color dots on pages when a topic is expanded to its pages")

| Step | Must be true |
|---|---|
| F1 | Open the Factory Playground proposals map (`/marketing/370f9281-2c10-41bf-af9e-5784aaee5838/content/map/ff2010ec-f53d-4d8b-81d9-094c4ca73397`): every row carries the dotted-circle **Proposed** mark; the toolbar shows a "Proposed only 52" toggle; on All Green (0 proposed) that toggle is absent. |
| F2 | Back on All Green with `outline_detail = counts`: a topic with pages shows a small `N` chip with a pages icon. Click it: page rows appear under the topic one level deeper, each with a coloured dot, the page URL, and its clicks. The dot colours come from `intent_colors` (in place green, leaving amber, arriving blue, delete red). Pick one page and confirm its colour against `seo.list_page_intents` for that page. |
| F3 | Hover a page row's right edge: two doors — peek (eye) and new tab. Peek opens the page record without leaving the map; new tab opens `/marketing/pages/<id>`. |
| F4 | Set `seo.topical_map.outline_intent_dots` to `false`: the page rows stay, the dots are gone. Set it back. |
| F5 | If any topic has pages you cannot open (a second user with narrower site access): ONE row "N pages you cannot open" appears, never silently nothing. |

## G. The right-click menu (context-menu v3)

| Step | Must be true |
|---|---|
| G1 | Right-click a topic: the FIRST section is the topic's name with: Open topic panel, Open in a window (disabled with a reason until Lane G's window lands), Open in a new tab, Copy slug, Rename, Move to another parent, Retire topic, Reject topic, Ask the topic agent (disabled with a reason — the panel's launcher, Lane D). Below it the universal sections (Copy, agents…). |
| G2 | Copy slug: the clipboard holds the slug. |
| G3 | Retire topic on a topic WITH pages: a dialog states the consequence FIRST ("It leaves the live map … Its N pages, N planned and N keywords stay attached — and if anything is attached, the map refuses…"). Confirm: the database refuses with a **23514** sentence listing the attachments, shown verbatim in the banner. Nothing was retired (reload; the topic is there). |
| G4 | Reject topic on an ACTIVE topic: the dialog states its consequence; confirm: a **22023** refusal sentence appears (only a proposed topic can be rejected). On Factory Playground, reject ONE proposed topic: it disappears from the outline and is on the History screen. |

## H. Read-only (plan: "no write controls when readOnly, never disabled-looking")

| Step | Must be true |
|---|---|
| H1 | Share the map read-only with a second user (ShareButton on the map home) and open the flat door `/marketing/topical-maps/e9df6779-…` as that user: the outline renders; F2/Enter/double-click open NO editor; dragging does nothing (no drag handle); the right-click section offers Open topic panel, Open in a new tab and Copy slug live, and Rename/Move/Retire/Reject disabled WITH the reason "needs edit access to this map". |
| H2 | A non-member opening the same URL gets the same denial an invented map id gets. |

## I. Mobile, light and dark

| Step | Must be true |
|---|---|
| I1 | 375×812: the toolbar wraps to two lines, no horizontal scroll, rows are 36 px (comfortable), the "Open topic" door is visible on every row without hover, no hover card ever opens on tap, tapping a row selects it, tapping the selected row opens the editor (keyboard on screen, no page zoom). |
| I2 | Dark mode: the selection wash, the left rail, the proposed mark (info tone), the diagnostics warning icon and the intent dots are all visible; nothing is white-on-white or black-on-black. |

## J. Text view (vision: "exactly what an agent receives, copyable, read-only")

| Step | Must be true |
|---|---|
| J1 | Open **Text**: the sentence "This is the map exactly as an agent receives it (seo.map_outline), not a rendering of it." is there; the outline text scrolls inside the card, the page itself does not scroll. |
| J2 | Compare the text with `select seo.map_outline('e9df6779-…', null, null, '{}')` — byte-identical. |
| J3 | "Focus: whole map" → search a topic and pick it: the text changes to that topic's neighbourhood and the sentence adds `Focused on "…"`. Compare with `seo.map_outline(map, '<slug>', null, '{}')`. Clear focus with ×. |
| J4 | "Sizing" → change "Overview: at most" to a smaller number: the text shrinks; the button reads "1 override"; the sentence adds "Sized with this preview's overrides". "Reset to the settings" restores. The knob rows in `platform.feature_knob` are UNCHANGED (check). |
| J5 | The copy control copies the text for a person and for an agent (Copy / Copy for AI) — paste and compare. |

## K. Gates on that machine

`pnpm type-check` (report the total; 0 in `features/marketing/seo/topical-map`), `pnpm check:parse`,
`pnpm check:dead-ends` (no topical-map finding), `pnpm check:scroll-chain`, `pnpm check:agent-disclosure`,
`pnpm test -- features/marketing/seo/topical-map/views/outline`.

## Report

Terminal truth first; every step with PASS / FAIL and what you saw; the failed-write screenshot;
the build SHA; what you could not exercise and why. Send it to the Lane A owner via the coordinator.
