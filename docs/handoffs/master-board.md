---
type: Handoff
title: "The master Board (/board) — handoff"
description: "Arman's own canvas, meant to become the one main UI: drop in any platform feature, work in it for real, and let agents reach every item."
status: active
updated: 2026-09-30
repos: [matrx-frontend]
scope: feature
feature: Spatial Board
vision: []
---

# The master Board (/board) — handoff

**What this is:** a zoomable canvas at `/board` (its own menu item, with feature boards such as War Room as
sub-options) where a person drops in anything the platform supports (notes, files, chats, custom data
tables and records, tasks, meetings, research, projects, workflow runs, web pages, images) and works in
the REAL feature component inside the tile, while agents can read and change every item.
**Seen from his seat:** open `/board`, press Add, pick an item type, start a new one or bring in an
existing one, work in it; chat with the board's agent about several items at once.

## Vision — Arman's words

- "the user's master one and it's got it's own menu item... show all of the supported features as
  suboptions... drop in anything... If we do it properly, it will eventually be the only ui we ever
  need... The big key is that you can choose form supported options to drop things into the ui and just
  get started on them immediately."
- "each item that is added properly declares it's FULL surface values and actions because if the agent
  can't do the exact same things as on the normal screen, it doen't work well"
- "The 'notes' you added are fake. it's not our real notes ui... Ideally, we give them literally the same
  ui but if not the same ui, then at least the same core part"
- "it still needs to offer all of the items that are open and the agent should be able to reach them
  with two requests. The first carries the active surface and a list of all other open items... give the
  agent enough info to know what that item is, including the name and some basics. If the agent wants to
  do something with the non-open items, it fiirst requests that item and it gets the state and controls
  for it."
- On a multi-item ask: "We're working on redoing the website and I have some images here and I have the
  notes with the color options. Look at what this other agent said and then see if you think for our
  website the colors I have set in the table make sense and update them for what you think is best."
- "the things on the canvas don't have proper controls for resizing... You have to easily and freely
  resize"; "scrolling the page DOES NOT WORK if you are hovering over one of these items. We cannot ever
  have the scroll move the canvas when you're over one of these"; full screen on a chat tile "changed
  sizes" and he "couldn't get out... you cannot allow that to happen"; "a double click on any node needs
  to move to it, zoom it in and bring it into focus." "There are a lot more things like that."

## Where it stands

- Item registry + Add menu: `features/spatial/items/` (`catalog.ts`, `*-items.tsx`, contract in `types.ts`); every item declares `surface`.
- Real components in tiles: notes (`NoteWorkspace`), file (`SingleFileWorkspace`, 7 tabs), chat (`ChatConversationSurface`, shared with `/chat`), custom-data Table (`UnifiedTable`, shared with `/data-v2`) and Record (`Peek`), task, War Room, meeting, workflow run, research, project.
- Agent reach in two requests: `board_items` value (every item + `basics` from each manifest's `briefValues`), then `board_open_item` / `board_item_act` (`features/spatial/tools/item-surfaces.ts`); only the live tile registers globally (`SurfaceActivity`), every tile registers into its own capture.
- Skill for adding an item type: `.claude/skills/board-items/SKILL.md`, proven RED/GREEN (`evals.md`).
- Unit tests pass (spatial, surfaces runtime, record surface); **nothing has been verified in a browser yet.**

## Future — everything still open

1. **Board interaction batch is implemented on `main`; browser verification remains.** `SpatialTile` now requires an explicit resize decision, wired to `useBoard.resizeTile` on the `/board`, demo, meeting and workflow boards, with War Room opting out because its layout stores positions only. The same change adds touch-aware press routing and a shared full-screen Escape stack. Focused tests passed 61/61 across six suites, and `pnpm check:parse` passed for 20,520 tracked TypeScript files. `pnpm type-check` stopped before analysis because `/tmp` ran out of space (`No space left on device`); no browser walk was performed because the preview was stopped and the system volume had only 553 MiB free. Before calling the interactions verified, use the shared preview to check touch scrolling inside tiles, resize behavior across hosts, nested full-screen Escape, and toast/exit-bar clearance.
2. **Browser-verify every item type from the user's seat** — none has been. Per type: (a) Add → start new and bring in existing; (b) real task inside the tile; (c) change visible on the feature's own page; (d) exactly one global registration of its surface while selected; (e) with ANOTHER tile live, an agent reaches it via `board_items` → `board_open_item` → `board_item_act` (approval card where the target asks first). Then one real multi-item agent run in the board's side chat (e.g. note "Website colors" + a table with a color column: "update the color column to match my note"). Also check the side chat beside the board sends the chat tile's transcript in `surface_chain`, and that the chat tile never treats its own conversation as context.
   - New rule (Arman, 2026-09-29): never test against the live database — use the nightly copy (`../common-docs/operations/clone/CURRENT.md`; there appears to be a clone preview profile, see `.next-preview-clone` in `tsconfig.json`). If the preview can't point at it, create only ordinary records through the UI and delete them after; no SQL writes, no knob changes.
   - Temporary test hooks must never be committed. At writing time one existed: `features/spatial/home/__verify_hook.ts` + a `// TEMP-VERIFY-HOOK` import line in `UserBoard.tsx` — delete both once no walk is running.
3. **Decision for Arman — agents can't touch custom-data tables by default.** Situation: the table's agent surface (`matrx-user/data-tables` via `RecordStoreTableSurface`) only mounts under the merged grid, which the `data_tables.merged_grid` knob turns on; it is off platform-wide with no overrides, so agents can't read or write any table on `/data-v2` or on the Board (the single-Record tile is unaffected). The grid-merge project plans to flip the default at its final step. Decide: turn the knob on for his organization now (recommended — agent access is the point, and Airtable/Notion AI work on every table), or give the classic grid its own surface, or wait for the merge. Code: `features/unified-data/table-page/UnifiedTable.tsx:398`, `features/data-tables/records-ui-host/mergedGridKnob.ts`.
4. **Type-check** `features/unified-data/table-page/UnifiedTable.tsx` and every file changed under `features/spatial/**`, `features/surfaces/runtime/**`, `features/agents/components/chat/ChatConversationSurface.tsx`, and `features/notes/components/NoteWorkspace.tsx` with the repo's required `pnpm type-check`. Isolate unrelated diagnostics while proving the changed files and affected callers are clean; do not substitute a temporary tsconfig. The latest full check stopped before analysis because the system temp volume was full.
5. **More core items** Arman asked for ("custom data, files, and more"). Follow the skill: canonical component, full surface with `briefValues`, `startNew` + `bringIn` + `href`.
   - **Documents are implemented through the shared `DocumentRecord` component.** The board item renders the same component as `/documents/[id]`, with the `matrx-user/documents` surface and body text routed through Univer's command service. Focused document-record tests passed in the previous sync. Remaining evidence to establish in a browser: same-tab collaboration between two tiles for one document, the headless canvas rendering discrepancy, and precise caret placement under board zoom. Historical handoff measurements reported matching caret positions at focus 1.000 and board zoom 0.984, drift at 0.787 and 1.922, and no improvement from one reverted `offsetX`/`offsetY` rewrite attempt. Reproduce those results before choosing a fix; they are not current browser verification.
   - Then scopes, lists, and an education board (study sets, flashcards).
6. **Known weaknesses:**
   - Record tile: `RecordsProvider` memoizes its client on its config; `config.realtime` comes from `createRecordsRealtimePort(org)` in `useUnifiedTable` and relies on the React Compiler memoizing it — if it doesn't, the record surface re-reads row actions every render.
   - Notes tile has no comments (matches `/notes`, which has none); mode labels collapse to icons below a 26rem-wide tile.
   - Meeting, War Room and workflow-run feature boards don't yet publish `board_items` basics.
   - Files: no mobile host for `/files/f`.
   - Only `data-tables` and `notes-editor` briefs were chosen by their owners; the other seven were chosen mechanically — review them when you touch those surfaces.

## Resources

- Mechanics: `features/spatial/FEATURE.md` (Board section + change log); item contract `features/spatial/items/types.ts`; surfaces runtime `features/surfaces/runtime/SurfaceRuntimeContext.tsx` (`SurfaceActivity`, `createSurfaceCapture`, `useSurfaceDormant`); bridge `features/spatial/tools/item-surfaces.ts`, `useBoardAgentTools.ts`, `board-tools.ts`; board manifest `features/surfaces/manifests/spatial-board.manifest.ts`.
- Tests: `pnpm -s jest --forceExit features/spatial features/surfaces/runtime features/unified-data/__tests__/one-record-carries-the-data-tables-surface-for-that-row-only.test.tsx`.
- Browser: `docs/official/browser-testing.md`; `pnpm preview:start` then `pnpm dev-login /board`; admin's Workspace in the org picker. In a Claude cloud container, Chromium needs `--ignore-certificate-errors-spki-list` with the egress CA pins (never `ignoreHTTPSErrors`) and the proxy bypassing `.localhost`; the dev server uses ~8.5 GB, so run one browser at a time and no full type-check alongside it.
- Skills: `board-items`, `surface-authoring`, `surface-write-targets`.
