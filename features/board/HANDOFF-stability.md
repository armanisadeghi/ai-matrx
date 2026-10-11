# HANDOFF — Board stability: state, remount safety, containment (2026-10-10)

Scope: the program that started 2026-09-30, when resizing a Board tile froze the page. It became
"make the Board able to hold 10–15 full pages of heavy, live work without slowing down or losing
anything". It ran 2026-09-30 → 2026-10-03 and was re-checked against the code on 2026-10-10.
Feature reference: `features/board/FEATURE.md` (what the Board does today) and `CHANGELOG.md`.
This file covers WHY the Board is built the way it is and WHAT is still open in that area.

---

## 1. Vision (the owner's, with every change he made along the way)

**Original ask (2026-09-30).** Resizing a tile broke everything and locked the page, "almost
certainly due to bad state management". Fix state at the core: "there will be times that we'll have
dozens of nodes with heavy processing all at the same time and with changes in position, size, data,
and more so let's get it right."

**Additions and refinements, in order:**

1. **A gesture can never leave the UI stuck.** After a resize, the cursor stayed as double-arrows
   and the Board stayed frozen. Every pointer gesture must end, whatever happens.
2. **Scale target (big-picture ask).** "Imagine we'll have the equivalent of 10–15 full pages of stuff
   open in windows and it will need to not slow down and not have problems." Use the best tools and
   libraries available ("If we need to add libraries or use Redux… we're better off doing those
   things and not holding back"). He asked for confirmed total stability, not a claim.
3. **Nothing takes over the Board (2026-10-02).** Adding a meeting replaced the whole Board, and he
   lost access to it.
   - (1) Eventually ANYTHING can be added to a Board.
   - (2) Until then, something that can't run inside a tile must say so and open a new tab. It must
     never take over the Board.
   - The goal: everything can be wrapped as a tile, "no matter how complex", even a meeting with its
     own internal board.
4. **Feature boards use the real Board.** The meeting's own board was "a cheap alternative". Every
   feature that shows a board must mount the same Board engine.
5. **No working around defects (2026-10-02, the strongest ruling).** He rejected the idea that
   improper Redux, bad Supabase subscriptions, broken streaming or one-way open/close are limits to
   code around: "Am I missing something or are you just claiming that massive fuckups are ok?"
   Out of this came **the remount law**: every screen survives hide, show and remount with no lost
   work, no repeated side effects and no repeated reads. Data lives in Redux, keyed by record.
   Subscriptions and server open/close are idempotent and ref-counted. A feature that breaks this is
   fixed at its root (package included), never exempted.
6. **Status reporting (2026-10-03).** Don't report releases or package versions to him. Status means
   what's broken for a person, what I'll do, and what I need from him.

**Why the key decisions were made:**

- **An external store (`BoardStore`) with per-tile subscriptions, not React state.** A drag or
  resize changes one tile 60 times a second. With whole-board state, every tile re-rendered on every
  frame; that was the freeze. Each tile now subscribes to its own slice.
- **One gesture primitive (`startPointerGesture`).** The stuck resize happened because one release
  event was missed (pointer released outside the window, focus lost, a `lostpointercapture`). Every
  gesture now ends through the same set of exits instead of each component handling its own.
- **Tiles sleep (`<Activity mode="hidden">`), but only types that pass the remount test.** Freezing
  off-screen tiles is what keeps 10–15 heavy pages fast. But waking re-runs effects, and that lost
  data in real features. So sleeping is opt-in per type, and the opt-in is gated by a test (the
  ledger) rather than trust.
- **Working copies live in Redux (`lib/working-copy`).** The same note can be open in a tile and
  in Quick Notes at once. Two components each holding their own text was the root of lost edits and
  double saves. Now there is one copy, one save and one conflict rule.
- **Page tiles (an iframe of the app's own origin).** This is how "anything can be added" holds
  *today* for features that don't have a native tile yet, without letting them take over the Board.
- **CSS performance traps get guard tests.** Two CSS patterns, not JavaScript, caused the worst
  measured stalls: a menu open took 21 s and crashed the tab. Nobody would spot them in review, so
  each one has a test that fails if it comes back.

---

## 2. Current state (verified against the code 2026-10-10)

Since the program ended, `features/spatial` became `features/board`, `SpatialTile` became
`BoardTile`, `SpatialViewport` became `BoardViewport`, and `spatial-store` became `camera-store`. The
table `projects.spatial_boards` became `projects.boards`, and a temporary pass-through view keeps the
old name working. Other lanes have since added shapes, sticky notes, templates, presets and social
tiles on top of this foundation.

### Done and still in the code

| Area | What | Where |
|---|---|---|
| State core | `BoardStore`: per-tile, layout and whole-board subscriptions through `useSyncExternalStore`; `commit` wakes only the tiles that changed; batch = one undo step; agent actions tagged with an actor so the person's ⌘Z and an agent's undo don't interfere | `board/board-store.ts`, `board/useBoard.ts` (`useBoardTile`, `useBoardLayout`, `useBoardView`); tests `__tests__/board-store.test.tsx`, `agent-actor.test.tsx` |
| Gestures | `startPointerGesture`: ends on up / cancel / lostpointercapture / blur / page hidden / Escape (reverts) / a move with no button held. Used by tile move and resize, frames, shapes, connectors, creation, viewport pan | `engine/pointer-gesture.ts`; `__tests__/tile-gestures.test.ts`, `BoardTile.test.tsx` |
| Tile life | Live / frozen / discarded; `FREEZE_AFTER_MS` 8000, `WARM_TILE_BUDGET` 12, `holdAwake` (focus inside a tile, a running chat), grace period starting when a tile stops being needed | `engine/camera-store.ts`, `engine/react.tsx` (`useIsLiveTile`, `useTileLife`); `__tests__/tile-life.test.tsx` |
| Sleep gate | `sleeps: true` per item type, allowed only when its remount-safety row passes; `Keep` sibling keeps a live run going while its tile sleeps | `items/types.ts`; ledger `__tests__/remount-safety/cases.ts` + `remount-ledger.test.ts`; harness `__tests__/remount-safety*.test.tsx` |
| Remount law | Every item type passes the quiet law: zero reads and writes on sleep/wake and remove+undo (meeting, chat, task, project, record and table finished 2026-10-04). The shared read primitive is `useStoreRead` | `lib/redux/store-reads/useStoreRead.ts`, `lib/redux/slices/storeReadsSlice.ts`, `lib/kept-answer/`, `features/meet/redux/meetingsSlice.ts` |
| Working copy | One Redux working copy per record for notes, files and documents. Ref-counted views, one coalesced save, flush when the last view leaves, retry with backoff (offline-aware), permanent failures wait for the person, and a conflict choice (Keep mine / Take theirs / Merge) instead of a silent overwrite. Notes save to the database through this same path (one door). A document's Univer instance is parked and re-attached, so undo survives sleep; carets are kept per record | `lib/working-copy/*` (read its `FEATURE.md`); kinds in `features/notes/utils/noteLiveContent.ts`, `features/files/redux/working-copy.ts`, `features/documents/document-model/documentModels.ts` |
| Focus | Automatic focus never takes the caret from a field the person is typing in (this was the "new note loses focus, keys land in the chat" bug). The Board claims the keyboard on load | `lib/dom/focus-guard.ts` (re-exports `@ai-matrx/chat/utils/dom/focus-guard`), `engine/claim-load-focus.ts` |
| Containment | Inside a tile, the router opens other pages on the Board as a Page tile, or in a new tab with a toast. Document navigations started by a press in a tile are cancelled and re-routed (Navigation API). Each tile has its own error boundary, so one tile's crash stays in that tile | `engine/tile-navigation.tsx` (`TileNavigationBoundary`, `useTileNavigationGuard`, `BoardNavigationContext`), used in `components/BoardTile.tsx` and `components/BoardViewport.tsx`; `openOnBoard` in `home/UserBoard.tsx`; `__tests__/tile-navigation.test.tsx` |
| Page tiles | Any app page as a tile: same-origin iframe; `<html data-board-embed>`, set by a boot script, hides the shell chrome; dedupe through `recordKeyOf` | `items/page-items.tsx`, `features/shell/components/BoardEmbedBootScript.tsx`, `styles/shell.css` §13d; `__tests__/page-items.test.ts` |
| Meeting board | The meeting's board IS `UserBoard` over a saved `projects.boards` row (one per person per meeting, linked by `settings.meeting_id`), opened on a "Meeting notes" frame of five `meeting_part` tiles. Guests get the same document kept in the browser, filtered to guest-safe types | `features/meet/components/board/MeetingBoard.tsx`, `useGuestMeetingBoard.ts`, `features/board/items/meeting-items.tsx`, `persistence/boardsService.ts` (`getMeetingBoard`) |
| Saving | Lazy document build; version-guarded save; keepalive flush on hide/pagehide; the newest edit is sent urgently beside a save already in flight; two tabs on one board merge per tile | `persistence/autosave.ts`, `persistence/useSavedBoard.ts`, `board/merge.ts` |
| URL | A hash-only address write (`#cam=`) forwards Next's history state, so the router isn't woken | `lib/url-state/addressWithoutNavigating.ts`; `lib/url-state/__tests__/hashOnlyWrites.test.ts` |
| CSS traps | (a) no `[style…]` attribute selector with a descendant part; (b) `::highlight()` rules only when annotations exist, scoped by root class | `styles/__tests__/no-style-attribute-descendant-selectors.test.ts`, `features/rich-document/annotations/__tests__/highlight-rules-scoped.test.ts` |
| Annotation sidebar | Reads once per tab; one ref-counted pair of live channels per source; keeps working while asleep | `features/rich-document/annotations/useAnnotationSidecar.ts`; `__tests__/sidecar-reads-once.test.tsx`, `sidecar-write-while-asleep.test.tsx` |
| Document render | Documents no longer draw solid black: Univer 1.0 theme names are now turned into real colours | `lib/univer/univer-theme-token-color.ts`, `features/documents/univer-doc-canvas-colors.ts` |

**Measured 2026-10-02** (headless Chromium, five long chats, about 8.9k elements):
- menu-open restyle: 21 s with a crash → 7–58 ms;
- pan, drag and resize: 17 ms frames;
- pan while streaming, p95: 1267 → 17 ms.

On the 100-stream stress board: 58 fps standing still, 21–24 fps panning (software raster). See FEATURE.md "Performance rules".

### Partial

- **"Anything can be added."** About 25 native item types plus Page tiles cover everything else.
  Page tiles are a stopgap: the Board's AI agent sees a Page tile by its title only, because the
  page's surface registers inside the iframe (`page-items.tsx`, `surface: { none: … }`). What's
  left: either bridge the framed page's surface to the parent over `postMessage`, or turn the most
  used pages into native item types.
- **Meeting ↔ board link.** It works, but the link is a JSON key (`settings.meeting_id`) with no
  database guarantee of one board per person per meeting. The Studio board already uses the stronger
  pattern: a unique index `boards_one_studio_per_brand` over `settings.studio_brand_id`. Add the same
  for meetings (a partial unique index on `(user, settings->>'meeting_id')` among live rows).
  `getMeetingBoard` then becomes a refused-duplicate re-read like `getOrCreateStudioBoard`.
- **Meeting board extras the owner saw as missing:** a jump to the meeting's notes, a live
  indicator on the board, and throwing a tile up into Notes. None of these were found in
  `MeetingBoard.tsx`.
- **Scale proof.** The 10–15-page target was measured on 2026-10-02 only. Since then, shapes,
  sticky notes, social tiles, templates and the after-first-paint body mount have been added.
  Nothing has re-measured it since.

### Not started

- A standing performance guard: an automated "N heavy tiles, pan p95 < X ms" check in CI or as a
  script with a budget. Today only the two CSS traps are guarded.
- Native tiles for the features that are Page tiles today. A census of what people actually put on
  boards as Page tiles would choose the order.

### Regressions found on 2026-10-10

Command: `npx jest features/board lib/working-copy lib/kept-answer lib/redux/store-reads styles/__tests__`.
Result: 97 of 102 suites and 820 of 825 tests pass. A second run was invalidated when someone else's
`pnpm install` swapped `@ai-matrx/kit` partway through, so if many suites fail with ENOENT, re-run.

| Failing test | What broke | Who owns the fix |
|---|---|---|
| `remount-safety.work.test.tsx`, chat: "waking and remounting reach the network not at all" | A remounted chat tile calls RPC `block_state_list_staged` again, so it breaks the quiet law. Something added since 2026-10-04 reads in the view, not once per conversation | Find the hook that calls `block_state_list_staged` (chat package or `features/`); move it to a record-keyed store read (`useStoreRead` or the package's own store) |
| `remount-safety.data.test.tsx`, data-table | The tile now logs `[cost] … billing.points_per_usd could not be read`: no `platform.feature_knob` row exists for `billing / points_per_usd`, and the harness treats unexpected console errors as failures | Seed the knob (the error message names the fix), or add the knob to `remount-safety/platform-fixtures.ts` if it already exists live. Check live first |
| `styles/__tests__/no-style-attribute-descendant-selectors.test.ts` | New trap-(a) selector: `features/spaces/spaces.css` `.spaces-media-frame[data-media-kind="pdf"] .spaces-media-body:not([style]) .spaces-iframe-pdf`. `:not([style])` followed by a descendant part brings the whole-subtree restyle back | Replace it with a data attribute or class set by the component |
| `features/board/__tests__/boards-list-front-door.test.tsx`, "has ONE 'Boards' row" | The nav no longer has the row this test looks for (Board menu changed 2026-10-09/10) | Check `/board` is still one nav click away. Fix the nav if it isn't, otherwise update the test to the current nav shape |
| `styles/__tests__/no-overlay-layout-reservation.test.ts` | Reads `components/ui/toast.tsx`, which no longer exists | Point it at the current toast host |

### Known issues / risks

- **The 2026-10-10 check read code and ran unit tests only; no browser was used.** The shared
  preview reported that `node_modules` had changed under it and needed a restart.

- **Page tiles share the app's origin and session.** That is intended: the page runs signed in as
  the person. But a framed page can still navigate itself; only the parent's navigations are
  contained.
- **The remount ledger is the gate.** If someone sets `sleeps: true` without a passing row,
  `remount-ledger.test.ts` fails. Don't weaken that test to get a type to sleep; fix the type (see
  §5).
- **Fixtures model reads; the browser can show more.** The harness counts reads it models. The
  chat lane on 2026-10-03 saw extra reads in the browser the harness didn't model at first (canvas
  item check, version history, task organization members). A clean ledger means "no modeled reads".
  Confirm in a real browser with the network panel.
- **Not re-checked since 2026-10-03:** caret restore in Safari, and the click-through of the
  conflict buttons for files.

---

## 3. Architecture / orientation

```
app/(core)/board/**            routes: /board (list), /board/<id>
features/board/
  home/BoardPage.tsx           chat-beside-canvas page; UserBoard.tsx = the board (place(), Add menu, agent host, openOnBoard)
  board/board-store.ts         BoardStore (content: tiles, frames, edges, undo) + useBoard.ts hooks
  engine/                      camera-store.ts (camera, selection, tile life), pointer-gesture.ts,
                               tile-gestures.ts, tile-navigation.tsx, wheel-input.ts, reveal.ts, snapping.ts
  components/                  BoardViewport.tsx (camera, pan, key tracking, nav guard), BoardTile.tsx
                               (frame, handles, Activity sleep, boundary), FocusLayer, layers
  items/                       one BoardItemType per feature (types.ts contract, catalog.ts registry);
                               Body = the feature's canonical component; Keep = keeps a live run going while asleep
  persistence/                 boardsService.ts (projects.boards), useSavedBoard.ts, autosave.ts
  __tests__/remount-safety/    the harness + ledger (cases.ts) — the gate for `sleeps`
lib/working-copy/              the one working-copy primitive (notes, files, documents)
lib/redux/store-reads/         useStoreRead — record-keyed, read-once side reads
lib/kept-answer/               session-kept answers refreshed in the background
features/meet/components/board meeting board = UserBoard over a saved board
```

Data flow: a tile saves only a reference (`NodeSource`: `{kind:"entity", entity, id}`). Its body
reads the record from Redux or the package store, keyed by record. Content edits go through the
working copy, and Board layout edits go through `BoardStore` → `useSavedBoard` → `projects.boards`.
The camera is per viewer (localStorage plus `#cam=`), never saved to the board.

---

## 4. Next steps (in priority order)

0. **Clear the five red tests above**, with the chat quiet-law regression and the CSS trap first.
   Both are the exact classes this program closed. About an hour of work.
1. **Re-measure the scale target on today's code.** Run Playwright headless and sign in with
   `pnpm dev-login /board` as admin@admin.com. Build a board with 12–15 heavy tiles: long chats (one
   streaming), a table, a document, a note, a meeting, a project. Record pan, drag, resize and
   menu-open p95, plus heap after 10 minutes. Compare with §2. Turn the run into a script with
   budgets so it can be re-run, and put it in `scripts/` next to `board-add-timing.mjs`. Treat any
   regression as a defect and find it with a CDP trace (recipe in §5).
2. **Database guarantee for the meeting board.** Add a partial unique index like
   `boards_one_studio_per_brand`, and make `getMeetingBoard` a create-or-reread. Run it on live as
   admin@admin.com: it is a short DDL, and the clone is only for destructive or long-locking jobs.
   Write no migration files; apply it through the Supabase MCP.
3. **Meeting board extras:** jump to notes, live indicator, and throwing a tile up into Notes.
   Use the existing `meeting_part` and notes primitives.
4. **Page-tile agent bridge:** the framed page posts its surface (values and tools) to the parent
   through `postMessage`. The Page item then declares a real surface, and the Board's agent can act
   inside a Page tile.
5. **A standing performance guard:** step 1's script with budgets, run nightly or before release.

---

## 5. Gotchas and context

- **Fix at the root, never exempt.** The owner's ruling: a feature that re-reads, re-subscribes or
  loses state on remount is a defect in that feature (or its `@ai-matrx/*` package). Fix it there,
  publish the package, and adopt it here in the same session. `sleepsAnyway` waivers were rejected
  and removed.
- **React Compiler is on.** No manual `useMemo` / `useCallback`. `pnpm check:compiler-skips` flags
  components the compiler skips (`??=`, try/finally in a component body, eslint-disable). Move those
  into helpers.
- **Never put Board-wide state in React state.** Subscribe per tile (`useBoardTile`). A selector
  that returns a new object on every call re-renders everything (skill `redux-selector-rules`).
- **CSS that freezes the page:**
  - (a) an attribute selector on `style` followed by a descendant part makes Chrome restyle a whole
    subtree on every inline-style change, which means every tile on every camera frame;
  - (b) unscoped `::highlight()` rules cost documents × elements.

  To find the next one: headless Chromium plus a CDP trace with
  `disabled-by-default-devtools.timeline.invalidationTracking` (look for "Invalidation set
  invalidates subtree"), and compare UpdateLayoutTree `elementCount` against the DOM count.
- **Hidden browser panes lie about timing.** requestAnimationFrame is throttled. Measure in headless
  Playwright, or synchronously or with a MessageChannel, never in a hidden pane.
- **Tile bodies are static imports** inside the page's one `ssr:false` edge. Never `dynamic()` a
  body.
- **`place()` dedupes by `recordKeyOf`.** The same record twice shows the existing tile instead.
  Page tiles key by path plus query.
- **Shared checkout.** Work directly on `main` with no branches or worktrees. Commit with
  `git commit -m … -- <paths>`; the index is shared, so a plain `git add` + commit can take other
  lanes' files. Never stash, reset or `checkout .`. The ~30-minute sync pushes and publishes.
- **Testing.** Test on live as admin@admin.com (credentials are in `.env`; never print them). Check
  `pnpm preview:status` first. There is one shared dev server on :3001 (`pnpm preview:start`).
  Open the per-session hostname it prints, not `localhost`, and sign in with
  `pnpm dev-login /board`. Use headless browsers only.
- **Talking to the owner.** Plain English, in chat. No file paths, codenames or release status.
  Lead with what is broken for a person and what you'll do.
