# Spaces — Notion-style pages (FEATURE)

**Status:** building (2026-10-05). Route `/spaces` — first row of the main menu's Content group (round 32, members only).
Product truth: `../common-docs/systems/content/spaces/` — `VISION.md` (Arman's words), `PARITY.md`
(the checklist: builder's to-do, reviewer's scorecard), `STATE.md`.

## The rule of this build

Copy Notion **exactly**; improve nothing until parity (Arman, 2026-10-05). Notion's layout, spacing,
interactions, keyboard and menus; **our** brand: design tokens, Lucide icons, no emojis in UI, no
Notion code, fonts or logos.

## THE FENCE

- The builder lane writes **only** `features/spaces/**` and `app/(core)/spaces/**`, and prefixes every
  commit `spaces:` (or `spaces(<area>):`).
- Nothing outside the fence imports from it until the switch-over.
- Guard: `pnpm check:spaces-fence` (`:self-test`) — run before every commit.
- Published packages are **read, never edited**: `@ai-matrx/records-ui` (grid, board, calendar,
  timeline, gallery, list, chart, dashboard, form, record page), `@ai-matrx/records/memory`
  (`templatePreview` — in-memory sample data, no writes; only the template gallery's preview draws it),
  `@ai-matrx/design-system/controls`.
- Something missing outside the fence (a design-system option, a records-ui layout, an icon) goes in
  `NEEDS.md` beside this file — the owner session adds it to the package and clears the row.

## The contract — `contract.ts`

| Port | Now | Later (owner session) |
|---|---|---|
| `SpacesStore` | the database store (`store-db/`, owner's) wrapped by `state/live-store.ts` (active org via `ensureOrgId` for new top-level pages, change events for the tree) | realtime merge |
| `SpacesDataPort` | live store tables (`DataMount`, the table's own org) + built-in modules via drill doors; the sample's tables are installed by `data/agency-install.ts` (`custom.template_declare` + `template_install`, the gallery's Install door); `templatePreview` only in the template gallery preview | — |
| `SpacesAiPort` | `ai/spaces-ai.ts`: `spaces.writing_assist` (useLiveAgentRun) and `spaces.ask_page` (launchAgentExecution) looked up in `MANDATE_KEYS`; a missing key = "AI is not connected yet" | — |

Block document: a tree of `SpaceBlock` (`id`, `type`, `text: RichSpan[]`, `color`, `background`,
`props`, `children`). Add block types and props freely; never rename a stored one.

## Laws that still apply inside the fence

- No permission logic. The database decides; blocks are filters only. Delete = archive.
- AI output renders through the one stream pipeline (`MarkdownStream`), never a hand-rolled renderer.
- Controls (buttons, fields, selects, switches) come from `@ai-matrx/design-system/controls`; the
  editor canvas, blocks and sidebar are this feature's own layout.
- Lucide icons only; no Sparkles for AI; `bg-textured`/semantic tokens; light and dark both correct.
- Mobile per the `ios-mobile-first` skill. `pnpm type-check` clean before every commit.

## Change log

- 2026-10-07 — builder round 32: (0) block format: `synced` { sourceId }, `button` { label, icon?, actions }, span mark
  `suggestion` { id, kind, by, at }; live `content.space_snapshot_schema` regenerated (check OK); fence guard opens
  lib/spaces-blocks to `spaces:` commits by owner brief. (1) Form view for non-editors re-walked live
  (`form-answer.walk.mjs` all checks pass). (2) C18 synced blocks (`editor/synced-block.tsx`, `SyncedBody.tsx`,
  `state/synced-sources.ts`): the content is ONE source Space (a sub-page of the page it was made on, hidden from the
  tree by the `synced_source` association); every copy holds the same `sourceId` and edits it in place (version-guarded
  saves, re-read on others' saves); "Copy and sync" + paste makes a linked copy; `synced_block` edges per page give
  "Editing in N pages"; Unsync turns a copy into plain blocks. (3) C19 Button (`editor/button-block.tsx`): insert blocks,
  add a page / edit pages in a database (records client), open a page or link, send a notification
  (`content.space_button_notify`, new door), run an agent (`launchAgentExecution`). (4) Person @mentions in the page body
  already notify through the `space_payload` trigger (`content._space_mention_notify`, once per page per person, deep link
  to the block) — a duplicate client door was not kept. (5) Spaces in the main menu (Content, first row). (7) N3 suggested
  edits (`editor/suggest.tsx`): a "Suggest edits" switch in the page menu (per page, this device); typing becomes an insert
  suggestion, deleting marks text as a delete suggestion; the card under a click accepts or rejects (editors).
- 2026-10-07 — builder round 31: (1) N5 property menu in records-ui 0.103.7 (ccdddefded): "Wrap column" per column (kept on the
  view as `wrapColumns`; store key `presentation.wrapColumns` added to `custom.view_keys()`; Spaces passes it both ways, ca80b9e66f)
  and "Duplicate property" (the new-column panel starts from the original, named "<name> (1)"; values are not copied — NEEDS). Change
  type and option rename / recolour / reorder / delete walked (`property-edit.walk.mjs`). (2) A non-editor's Form view is the forms
  system's public form inline (`FormToAnswer`, server action `data/form-actions.ts`, cb55940755) — blocked from showing after a reload
  because the snapshot schema refuses layout `form` (NEEDS). (3) A built-in table block saved before its "+ New page" row reads its
  stored size with 34px added (`paintedSizesOf`, `nr` marker on new saves, 0dc23598bf). (4) The advanced-filter popover is opaque
  (solid surface, white, no backdrop). (5) N9 Automations (`data/Automations.tsx`, b614bdc129) on `@ai-matrx/records` 0.77.1's
  automation doors: trigger (page added / property edited [to] / form answered; schedule shown unavailable), condition, actions
  (set with value / now / me / empty / copy-from, add page, edit pages, notify author or a person property, webhook, agent), on/off,
  archive / restore, run history with each step (count = knob `spaces.automation_runs_shown`); walk `automations.walk.mjs`.
  (6) Width drag fixed in design-system 0.73.1 (3ca9d4ef31): the grip sat half outside its clipping header cell. NEEDS rows: N3
  suggested edits, N11 "Can edit content" + share wording, Form layout in the snapshot schema, duplicate values door.
- 2026-10-07 — builder round 30: (1) built-in tables: a magnifier search holds still (rows held dimmed while the read
  runs, the grid remounts per answer, the body keeps its height while a term is on, the count keeps its width; CLS 0.21 -> 0,
  walk `entity-search.walk.mjs`); the "70 unrelated rows" were the page's other tables counted page-wide; built-in tables get
  Notion's "+ New page" row and the custom tables' New + templates button (`NewButton` in `menu-parts.tsx`). (2) records 0.76.19
  knows percent_empty / percent_filled / range. (3a) N7 advanced filter: Filter -> Add advanced filter (records-ui
  `ConditionGroup`, `maxDepth` 2), saved as the view's `where` (walk `advanced-filter.walk.mjs`). (3b) N8 Form view: Layout ->
  Form draws records-ui `FormBuilder` for the table, the view keeps `formId`; an answer at `/f/<id>` is a row (walk
  `form-view.walk.mjs`). (3c) N5: inline tables mount the merged grid (`DataMount`), whose header menu renames, edits
  options, changes type, inserts, hides and deletes a property; widths and column order are kept per view. NEEDS: per-column
  wrap, Duplicate property.
- 2026-10-07 — N2 Remind on a date mention: clicking a date mention opens its card (day, optional time, Remind: None / at
  time / 5 min / 1 h / 1 d / 2 d / 1 week before; a day without a time counts from 9:00). `editor/reminders.ts` hands this
  person's reminders on the page to `communication.reconcile_my_notices` (scope `spaces:<pageId>:`) after every change, so
  moving, unsetting or deleting the mention moves or cancels the reminder; the notice deep-links to `/spaces/<id>#block-<id>`
  and is delivered by the existing notification dispatcher. Walks: `remind.walk.mjs`, `remind-cancel.walk.mjs`.
- 2026-10-07 — builder round 29: (1) no hidden page body — the 3 s React-block hold and the 4 s first-visit table hold are gone.
  Reserved geometry instead: every save writes each database block's painted size per window width (`props.paintedSize`,
  `editor/database-host.tsx` `withPaintedSizes`; never content — `contentKey` skips it; a size the store does not hold rides as
  one save, `paintedDrift`); the first frame holds it (node decoration `--spaces-painted-h` on the empty React wrapper,
  `stored-blocks.tsx`), DatabaseHost holds it until still. The callout is a vanilla spec drawn with its text
  (`editor/callout-block.tsx`, picker via `CalloutIconHost`); page rows hold 33px before React draws. Walk
  `first-paint.walk.mjs`: 12 loads, max CLS 0.003. (2) "/" Database with AI / Database saves the moment the table exists
  (`saveSoon`, no debounce) — a tab closed inside the 2 s debounce left a page with a table and no stored version (walk
  `ai-database-save.walk.mjs`); room trace also logs host / cadence / schedule / save. (3a) N4 find in page
  (`page/FindInPage.tsx`, CSS highlights, opens closed toggles; walk `find-in-page.walk.mjs`). (3d) N2 date mentions in the
  "@" menu (`editor/date-mention.ts`; walk `date-mention.walk.mjs`). NEEDS rows: Tabs block types (N1), the embedded grid's
  calculation footer (N6; `summaries` already kept on the view), a one-shot notice door for reminders (N2 Remind).
- 2026-10-07 — builder round 28: the late load shift was never the room — a room trace (`collab/space-collab.ts`,
  `window.__spacesCollabTrace`; walk `__tests__/walk/room-trace.walk.mjs`) showed one seed and no block added or removed after
  joining. Causes: BlockNote draws React blocks (database, callout) through portals a frame after the text, and a table grows
  in steps as its rows land. The body now shows once every React node view has drawn (`SpaceEditor` + spaces.css, 3 s cap); a
  kept database holds its exact size (clipped) until its content is still, re-reading the kept height when the column layout
  changes its width; a first visit holds the body hidden while an in-view database settles (`editor/database-host.tsx`).
  Joining a room is one source of truth (`collab/join-room.ts`): presence not reported yet means "not known", and a present
  member's body is waited for — a slow room no longer gets a second seed beside it (test `collab/__tests__/join-room.test.ts`
  fails on the old decision with two block groups). D3: tiles in a nested column row keep 110px and wrap (two by two in a
  50/50 half); column flex-grow is the width ×1000 so wrapped lines fill. The column resize grab area is the whole gutter
  (walk `column-resize.walk.mjs`).
- 2026-10-07 — builder round 27: D1 a kept device copy is decided once the page is ready in any order (`page/useRestoreKept.ts`;
  edit access used to answer after the one check, which marked the page done); until decided the page neither overwrites nor
  saves over it; a copy equal to what is stored is never kept, and one equal to what is shown is cleared without a redraw;
  someone's newer version offers Restore / Discard. Test `page/__tests__/restore-wiring.test.tsx` renders the hook with late
  readiness. "/page" opens the sub-page with the caret in its title (`openToName`), the parent's edits sent first. D4 "/" results
  ranked as Notion (`editor/slash-rank.ts`). D5 an emptied column leaves the layout (`editor/column-heal.ts`, local edits only).
  D2 column and callout layout keys on the node view's own wrapper (`.react-renderer.node-columnList|node-column|node-callout`),
  never on what React draws into it later; link rows hold one line before their titles; the sidebar foot holds its three
  rows; a database block holds its kept height until its content grows back (`editor/database-host.tsx`). No `*.tmp.*` file
  is tracked in the fence (`check:spaces-fence`, `features/spaces/.gitignore`).
- 2026-10-07 — publish round 3 (lane spaces-publish-3): a published page now carries what round 2 left out. (1) Uploaded covers and
  icons: publish makes the page's cover/icon files (and included sub-pages') public through the server's change-visibility call
  (`publish/published-media.ts`, PATCH /files/{id}); the file records `metadata.spaces_published_by = {page: visibility before}` so
  unpublish puts back only what publishing made public (a file made public on purpose, or shared with another published page, stays);
  `space_public_view` answers `media` (file id -> CDN address, public files only) and `page/media.ts` draws it signed out. (2) Formula,
  lookup and roll-up columns are computed by the store's own reader (`custom.record_values_of`) inside the helper, which reads as the
  publisher (request claims set to the publisher while it works). (3) Built-in modules (task, project, crm_deal, hr_employee) answer
  through `content._space_public_entities` (publisher's rights via `iam.has_access_for`, page's organization, fixed short column list,
  the view's filter before the 500-row cut) into the memory entity store. (4) A relation column shows the related record's title as
  plain text when the publisher can open it. Proofs: `publish/published-extras-live-proof.ts` 22/22 live, `publish-media.walk.mjs`
  (signed-out screenshot, unpublish puts the file back), `__tests__/published-media.test.ts`. Open: a cover picked AFTER publishing
  becomes public when the Publish panel next opens (not on the pick); a 3 s signed-out statement limit bounds how big a formula table
  a page can publish (44 rows with 3 formulas answers in ~1.6 s).
- 2026-10-07 — publish round 2 (lane spaces-publish-2): a published page shows its database rows and charts signed out —
  `content.space_public_view` returns `databases` (helper `content._space_public_databases`, never granted: only the page's own
  blocks, each block's views — filters, sort, hidden properties, 500 rows a view — read as the publisher), drawn by
  `data/published-rows.tsx` as a read-only in-memory store (no New, no automations). Unpublishing a Private page keeps it
  Private (T-13 dual-write trigger restores `personal` when `shown_to = only_me`). `get_share_capabilities` reads a CHECK's
  rule, not the word "public" in it (documents are publishable). Page links the tree does not hold are read by id under row
  security; "Page in Trash" only when it is. `/site` answers 200 (the editor draws in the browser). Proof
  `publish/published-rows-live-proof.ts` 14/14 live. Open: uploaded covers/icons are not yet served signed out.
- 2026-10-07 — phase 6, Publish (J1, I4, O10; lane spaces-publish): Share menu gains Notion's Publish tab (`collab/PublishPanel.tsx`):
  Publish, the public link (copy / open), Include sub-pages (on), Allow search engines (off, the T-12 switch
  `platform.set_search_engine_indexed`), Allow duplicate as template (on), Site customization (the link), Unpublish.
  Doors (`publish/publish-doors.ts`): `content.space_publish` (editor-only, sub-pages follow), `content.space_public_view`
  (the one anonymous read, `published_to_web`), `content.space_duplicate_published`. Public page `/site/<link>`
  (`app/(link)/site/[slug]`, outside the fence, entry `public/PublicSpace.tsx` + `public/public-view.ts`): the same
  SpaceEditor read-only behind `StaticSpacesProvider`, title/description/cover OG image, noindex unless allowed.
  Duplicate lands on `/spaces/duplicate?from=<link>` (sign-in first when signed out; the platform's organization
  picker on the person's press). A sub-page made under a published page is published only when it includes sub-pages.
  Proofs: `publish/publish-live-proof.ts` 19/19 (refusals: unpublished, sub-pages off, signed out, non-editor,
  duplicate off), walk `__tests__/walk/publish.walk.mjs` 11/11. Open: NEEDS rows (anonymous table rows, uploaded
  media signed out, custom domain, embed).
- 2026-10-07 — builder round 25: the real chart-tile rule (round 24 overstated it). Tile width follows the window (172px at 1699,
  114px at 1280). Name pill: 14px/600 and a 10px/10px symmetric pad, start-aligned and cut with an ellipsis, down to a 130px-wide
  tile; at or under 130px the name is 12px, 4px/5px pad, no icon. Centre number: ONE size, 20px, for any value of up to five
  characters ("4", "8.6", "355", "12,345"); 16px for six or seven, 13px beyond, so it stays inside the 72px inner ring. Tile height:
  373px minimum (reference ~375); a tile carrying the "Only showing 200 options" chip (34px + 21px of space) is 428px, the other
  tiles stay 373 (they no longer stretch to match). The pill's dev-guard break ("pill ink is off-centre") came from an 8/10px
  hand-shaved pad on a pill whose text is cut by an ellipsis. Table title dot: ONE `::before` route for both table types
  (custom grid cell content and the built-in title button are flex rows, dot beside the title, 37px rows). Chart sort test now
  reads what is drawn (donut slice titles, real ChartBlock bar heights) over a store order that is neither A-Z, Z-A nor by value.
- 2026-10-07 — builder round 24: chart tiles on the reference (172px tile at 1699, 80px ring, 4px stroke, 20px centre number
  [corrected in round 25: not a fixed size, see that entry], 14px/600 name cut with an ellipsis, view-settings icon at rest; a column row inside a column takes a 62px gutter that narrows
  with the window, five across keep 16px); a bar/line chart now follows the view's sort (rows reach ChartBlock in point order);
  table rows start with the grey record circle (O14, `.spaces-row-dot`; a record's own icon still needs records-ui, NEEDS row);
  image page icon 124px over the cover by 72px; toggle triangles in the text ink; the sort icon turns blue (the control's own
  colour won over the button rule — the svg is coloured); built-in tables (`EntityDatabase`) now run on the same spreadsheet cell
  cursor as a custom table's grid (the cause: it passed only `onRowOpen`, so a click opened the record) — one click selects,
  Enter or a typed letter opens the record window, nothing reaches the page; colours in spaces.css are semantic tokens defined
  once with dark values; the sample page is created with Small text (the reference's 14px set). Test
  `data/__tests__/chart-wiring.test.tsx` renders ChartView over a fake client.
- 2026-10-06 — builder round 23: column gutter 46px (Notion's spacer; a column row nested in a column takes 16px);
  a chart tile under 200px wraps its name (≤3 lines, 13px) so five-across KPI tiles stay readable; chart tiles carry
  Filter / Sort and count + order what their view shows (`data/chart-rules.ts`, test `data/__tests__/chart-follows-its-view.test.ts`,
  walk `__tests__/walk/chart-filter.walk.mjs`); view tab icons draw any Lucide name (SpaceIcon → DynamicIcon); type, view
  pill and table rows on NOTION-MEASUREMENTS (title 40/48, body 16/24, 32px radius-20 pill, 36px header, 37px rows); the
  table magnifier sits in the toolbar row (records-ui's own search row hidden in Spaces).
- 2026-10-06 — Build with AI (Space Builder, mandate `spaces.build`): `ai/SpaceBuilder.tsx` hosts one request box and
  one floating run (`useFloatingAgentRun` → LiveRunWindow) above every page (`SpacesWorkspace`), so a 1–8 min build
  survives page switches. Doors: sidebar New page options → Build with AI, a blank page's starter, page ••• → Ask AI
  to change this page. userInput = the typed words; `space_id`/`page_title`/`page_markdown` only on the change door;
  active organization; result opens `/spaces/<root_space_id>` (a change re-opens the page, `reopenPage`). Disclosed in
  the Agents menu. Test `ai/__tests__/space-builder.test.ts`; walk `__tests__/walk/space-builder.walk.mjs`.

- 2026-10-06 — round 22: co-editing convergence proved — `collab/__tests__/convergence.test.ts` (two members over the
  real provider + realtime manager, jittered out-of-order delivery, 300 keys each, 5 seeds: identical, no pending) and
  `__tests__/walk/convergence.walk.mjs` (two browsers, 30 s / 60 s, same line + own blocks: editors, Yjs state vectors
  and the stored page identical). A frame LOST while connected never heals (provider has no anti-entropy) — `it.failing`
  in that test. A database in a narrow column stays inside it: the block host is a size container, the toolbar wraps
  and padding shrinks under 440px, the table scrolls sideways (`__tests__/walk/narrow-database.walk.mjs`). Walk helper `trashPage`.
- 2026-10-06 — a chart counts what its view shows: the view's "is" filters (saved + the viewer's unsaved) go to both
  `record_aggregate` asks and to the read-rows fallback (`ChartView` `filter`); the CHURN ring reads 1, not the table's 10.
- 2026-10-06 — a chart tile's title pill takes the tile's whole width (the view-settings icon shows on hover / open /
  focus, always on touch) and carries the full name as its hover title.

- 2026-10-06 — AP-3 U7: from `@ai-matrx/records-ui` 0.102.0 the built-in boards (`TablePage source={{kind:"entity"}}`)
  read and write through `@ai-matrx/entity-data`'s one engine (keyset pages, a card move drawn at once and rolled back
  with the store's sentence, live updates); `EntityDatabase.tsx` keeps the drill shapes `EntityColumn` / `EntityRow`.
  Takes effect when 0.102.0 and `@ai-matrx/entity-data` 0.3.0 are on npm and `pnpm sync-types` installs them.
- 2026-10-05 — `embed/RecordBodySpace.tsx` is a cheap shell (row_body lookup + ONE `dynamic(ssr:false)` edge to
  `embed/RecordBodySpaceImpl.tsx`, editor + SpacesProvider), loaded only once a body Space is found; a chunk failure draws `fallback`.
- 2026-10-05 — Cmd+\ collapses the sidebar only: `workspace/useSpacesSidebarShortcut.ts` takes the key in the
  capture phase and marks it handled; the shell chat skips a handled key (it used to toggle the chat too).
- 2026-10-05 — fence, contract, guard laid by the owner session.
- 2026-10-05 — builder lane, phase 1: `/spaces` + `/spaces/[spaceId]`; `store/` (memory store, seed = the
  Traveling SMM™ OS + one sub-Space per link), `editor/` (BlockNote schema: callout, page, link to page,
  columns, `slot`; `convert.ts` is the only engine↔SpaceBlock boundary), `page/`, `sidebar/`, `nav/QuickFind`,
  `workspace/`, `spaces.css`. Column widths are written as CSS keyed by block id — never onto ProseMirror's DOM
  (a style write there re-renders the node view in a loop and hung the tab).
- 2026-10-05 — builder round 2: saves are real (memory store removed). `state/live-store.ts` wraps `store-db`;
  `SpacePage` autosaves on the integer `version` (Saving… / Edited, a stale save reloads the latest and says so);
  Templates → "Add the Traveling SMM™ OS sample" creates it through the store (`store/sample.ts`); uploads go
  through the file handler (`page/media.ts`). Adopted: `useClaimSearchKeys` (Cmd+K/P), `surface="solid"` popovers,
  the shell's Cmd+\ opt-out. Editor menus close instantly and the slash menu prefers below (`editor/floating.ts`).
- 2026-10-05 — builder round 3 (phase 2): every stored block type renders and round-trips — `editor/stored-blocks.tsx`
  (image, video, audio, file, PDF, bookmark, embed, block equation, table of contents, breadcrumb, database; stored props
  ride verbatim in one `data` prop), `editor/inline.tsx` (mentions, inline equations as engine nodes `inlineMention` /
  `inlineEquation` holding the whole span), simple tables on BlockNote's table, `unsupportedText`, `unknownBlock` (any
  unheard-of stored type kept whole). Proof: `editor/__tests__/round-trip.test.tsx` (Jest, convert both ways) and
  `editor/__tests__/run-editor-proof.sh` (the real BlockNote editor, bundled — Jest cannot load BlockNote's ESM).
  `data/`: database block (views F1, toolbar F3, view settings F4, New ▾ F8, + New page F7, linked title F9, side / center
  / full-page peek) on records-ui `ViewSwitcher` / `Peek` / `RecordForm` / `DashboardCanvas`; chart view (donut with the
  value in the middle drawn here, bar / horizontal bar / line on `ChartBlock`, settings G2, overflow notice G3); the
  agency sample (`agency-spec.ts`, `templatePreview`) or a real table (`DataMount`, the table's own organization).
  "Add the sample" is idempotent and upgrades an older copy's slots in place.
- 2026-10-05 — builder round 4 (visual parity): ring tiles measured on screenshot 1 (`data/ChartView.tsx` 112px ring,
  5px stroke, Notion chart colors; `.spaces-chart-title` grey pill); the sample's charts read rows (never ask
  `record_aggregate`) and its mount binds an honest no-op realtime port (`data/DataMount.tsx`; live tables use
  `useAppRecordsConfig`); `page/TocRail.tsx` (A11); `page/gallery.ts` + `assets/` (bundled cover landscapes and a
  portrait icon, stored as `gallery:<key>`); BlockNote's trailing line is off and the page ends in a click zone
  (`.spaces-page-end`, page-rhythm clean); Esc drops the selection toolbar; "+ New page" writes a row in place;
  select/status filter picklist; linked-view picker draws its list once. `embed/RecordBodySpace.tsx` — a row's
  `row_body` Space in the Spaces editor (null when none; `useRowBodySpace` for a host that must decide synchronously).
- 2026-10-05 — builder round 5 (phase 3): built-in sources (F10). The source picker lists a "Built-in" group (Tasks,
  Projects, Deals, Employees) above "Your tables"; the block stores `{kind:"entity", token}` and `data/EntityDatabase.tsx`
  draws it under `RecordsMount` + `useAppRecordsConfig` (active organization = write target only): its own describe +
  `drillRows` call with the view's filter (`filters[field]` scalar = is, list = is any of) and sort asked of the store,
  table (one data table, title cell opens the row), read-only board, side / center / full-page peek whose writable
  properties save through `entityRowWrite`. Shared toolbar pieces moved to `data/menu-parts.tsx`. The database host
  (`editor/stored-blocks.tsx` `DatabaseHost`) stops mouse / key events natively — ProseMirror listens on the editor element,
  so React's stopPropagation came too late and a row click became a block selection. Page history (A13,
  `page/PageHistory.tsx`, `store.history`), code block language picker (C10).
- 2026-10-05 — builder round 6: `editor/rubber-band.ts` (B11 — drag from the margin draws a box, touched blocks turn
  blue and become the editor's selection; Backspace/Delete/Cmd+D act on all), block-menu search + "Turn into page in"
  (B9, `SpacePage` creates the page under the picked one through `store.create`), `editor/PasteUrlMenu.tsx` (B12 — a
  lone pasted URL becomes a link with Link / Mention (Space addresses) / Bookmark / Embed beside it; Markdown and HTML
  keep BlockNote's conversion), `editor/code-block.ts` (C10 — Copy, Wrap, Caption over BlockNote's code block; any DOM
  change inside a block makes ProseMirror redraw it, so the empty caption is folded by CSS and opened by focus),
  table header row/column + cell colors (C14, `props.cellStyles`), word count in ••• (A14). `SpacePage` resets on a
  new id during render (no setState in an effect). records-ui 0.101.18 hides back-link columns; its `TablePage`
  embedded presentation is not in the published package (NEEDS).
- 2026-10-05 — builder round 7: A12 `page/Backlinks.tsx` ("N backlinks" under the title, hidden at 0, click lists icon + title, each opens;
  `content.space_backlinks`, read on page load). B12 Mention now stores `mention {kind:"link", url, title, icon}` for any pasted URL
  (favicon + host/path title until a title fetch exists, hover card; `editor/inline.tsx` `LinkMention`); "@" on a page opens a page picker
  (`SpaceEditor`, inserts `mention {kind:"space"}`). `data/ChartView.tsx` lint errors fixed (offsets computed up front, error box carries the Alchemy Menu).
- 2026-10-05 — builder round 8 (phase 4): `embed/RecordBodySpace.tsx` takes `fallback` (drawn while loading, failed — captured — and none)
  and mounts no QuickFind. I1 duplicate opens the copy (top-level copy filed in the active org, `live-store.ts`); I2/I3 `state/templates.ts`
  (template label + Use template = `space_duplicate` to the top level), `sidebar/TemplateGallery.tsx`; K1 `io/markdown.ts` (blocks → Markdown,
  also the page text the AI reads), `io/export.ts` + `page/ExportDialog.tsx` (Markdown / HTML via @ai-matrx/print, zip with sub-pages, PDF
  print window); K2 `io/import.ts` + `sidebar/ImportMenu.tsx`. C22/B12 `useLinkPreview` cards and mention titles. M1/M2/M4 `ai/` (Ask AI box,
  Ask about this page; disclosed through `useDeclaredSurfaceMandates`). Data: `ViewSwitcher embedded` + `sortOverride` + "New page" line;
  built-in boards on `TablePage source`, built-in charts on `EntityChartBlock`, New adds task / project rows.
- 2026-10-05 — builder round 11: "Add the sample" installs the agency spec as REAL store tables in the active org
  (`data/agency-install.ts`: `template_declare` upsert on catalogue id `T-SPACES-1` + `runTemplateDoor("template_install")`,
  the same door as the template gallery's Install; a second add answers `already` with the same tables) and points the
  page's ring and client blocks at them (`{kind:"table", tableId, viewId}`, no `sample`); an older copy is repointed in
  place. The source picker's "Sample agency" rows install too. Date fields carry `absoluteDates`; title fields are not
  required ("+ New page" writes an untitled row); the client grid hides the store's reverse links (`linked:<inverse key>`).
  Type measured on the references: title 36px, blocks 15px/1.5 (`spaces.css`).
- 2026-10-06 — builder round 12: "Add the sample" files the agency tables in the sample PAGE's organization (an existing
  page: `content.document.organization_id`; a new page and its tables: the write organization, created by
  `createDatabaseSpacesStore(org)`), and repoints any block left on another organization's agency tables. The install is
  the gallery's whole Install: after `template_install`, `addInstalledAgent` (features/make) copies and notes the "Agency
  assistant" with the gallery's ports (`installAgencySample(org, dispatch)`). Embedded grids hand every date column
  `presentation.formats` date `long` ("January 1, 2026"); records-ui 0.101.29's embedded look (40px centred rows,
  dividers, choice dots) needs nothing from the host. Rhythm: link-to-page rows 32.5px, to-dos 29px (measured).
- 2026-10-06 — builder round 14 (phase 5, collaboration): `collab/`. Comments on the ONE comment store — `comments.ts` reads
  `cmt_list` raw and writes `cmt_add` with `part_anchor` `block:<id>` (the quoted text in `label`); edit / delete (archive) / resolve /
  mention notices are `features/rich-document/annotations/service.ts`'s own calls; the composer is its `MentionComposer`, bodies its
  `CommentBody`. Page comments under the title ("Add comment" on title hover), selection-toolbar Comment, block-menu Comment, right
  panel All / Open / Resolved from the top bar, highlights by the CSS Custom Highlight API and margin count bubbles (`CommentMargin.tsx`).
  `useSpaceRoom.ts`: ONE `@ai-matrx/realtime` channel per page (namespace `spaces-page`) — presence (top-bar avatars, +N) and
  `platform.comments` changes. "@" in the page lists people (`cmt_mention_candidates`) before pages and stores `mention {kind:"person"}`.
  A save from someone else while this person is typing shows "Page updated · Show latest" instead of replacing the page. Share opens
  the platform `ShareModal` on `document` (Invite) beside Copy link.
- 2026-10-06 — builder round 15 (H3 live co-editing): `collab/space-collab.ts` + `collab/useSpaceCollab.ts`. The page body is a Yjs
  fragment shared over Supabase broadcast through the workbook provider (`yjs:spaces:<id>`, imported as-is) and bound by BlockNote's
  `CollaborationExtension` (named cursors in `personColor`, the same colour rings the top-bar avatar); title / icon / cover / settings
  ride a Yjs map. An empty room is seeded from the stored version in a scratch doc whose client id hashes (page, version), so two
  people opening at once write identical items (no duplicated blocks). Exactly one host saves: editors still on the page's presence
  channel, lowest `uid:clientID`, the room's tab leader; it saves through `space_save` on knobs `spaces.collab.snapshot_debounce_ms` /
  `snapshot_max_wait_ms` (page org; platform value for an outside sharee) and on leave; a save whose content is stored is skipped,
  and the seed's own normalisation is the baseline (opening a page writes nothing). Others' saves only teach the version. Offline
  marker in the top bar; on reconnect the provider is rebuilt and this member's state re-sent (works around the provider dropping
  late `y-state` answers). Viewers / commenters (`useAccess` below edit) get the live room read-only and no Add icon / Add cover.
- 2026-10-06 — builder round 16: "Add the sample" on an older install runs `upgradeTemplateInstall` (custom.template_upgrade)
  from install's `upgrade` hint — stages in the Templates row, counts in the toast, the refusal sentence on failure (Harbor & Pine
  upgraded v1 → v2 through the UI). Sample views name fields by the install's keys, matched by title (`AgencyTable.keys`,
  `viewOnInstalledKeys`): an upgraded install's Offer Bought is `offer_2`. A stored version the live room did not write (Move to
  from another page) is merged into the room on block ids before the host saves (`page/merge-stored.ts`). The store's
  `subscribe()` is on `subscribeToRealtimeManager`. Column widths follow the editor's change feed (a room's body never reached
  BlockNoteView's onChange, so columns drew 50/50); an unfocused block selection shows no selection toolbar; relation links in
  embedded grids read in body ink.
- 2026-10-06 — builder round 17: a block dropped on another's left / right edge makes columns (`editor/column-drop.ts`:
  BlockNote's `dropCursor.hooks.computeDropPosition` draws the vertical guide, a window-capture drop takes it before
  ProseMirror's move; inside a column it adds a column). The block menu opens on a click only (the handle's press never
  reaches the menu trigger). "/" items land where the "/" was typed — the block is named at the click and the insert goes by
  id after the picker's await (`editor/slash-insert.ts`; proof `run-editor-proof.sh slash-insert`). A page trashed from the
  sidebar while open shows the Trash banner (`page/trash-state.ts` + test). "Saving…" only while a write is in flight. A
  built-in read that never answers is retried once, then named with Try again. Built-in charts group by a choice by
  default. Slash menu fits the page's scroll area. Sample: thinner rings, dashed many-group ring, grey pill on the open
  view tab, lightning → the table's automations (`NotifyRuleEditor`), Claude Skills / Auto posting lines as the reference
  (`upgradeLinkLines` on Add the sample).
- 2026-10-06 — builder round 18: column lists are always well formed across the store boundary (`editor/columns.ts`, run by
  `convert.ts` on load and save: stray blocks get a column, a list in a list joins it, one-column lists and loose columns melt;
  a list inside a column is valid and kept). The editor never nests: "/2 columns" in a column lands below the outer list, a
  dragged column list keeps its above/below drop. A save that does not land never loses edits (`page/unsaved.ts`): a body the
  database would refuse is not sent, a refused or failed save keeps the page on the device, a reload restores it ("Unsaved
  changes restored"), a stored save clears it; the label reads "Not saved" for a refusal. A page in Trash writes nothing and
  elects no host (`trash-state.ts` `mayWrite` / `roomCanEdit`). Use template on the sample copies it (`state/template-plan.ts`);
  the sample is the oldest page with its title. Pages this tab made (new, duplicate) seed their room at once. Enter at the end
  of an open toggle's title writes its first child (`editor/toggle-enter.ts`). Inline tables at natural widths, scrolling
  sideways; grey toggle triangles; no selection ring between columns. Viewer search on table blocks (records-ui
  `searchOverride`); built-in Load more reads one 50-row page by offset.
- 2026-10-06 — builder round 21 (by-hand rebuild): a margin click beside a line puts the caret there (`editor/rubber-band.ts`
  `lineBeside`; the next "/" went nowhere); "/2 columns" in a column and a drop beside a block sharing its column nest a
  column row there (`slash-insert.ts`, `column-drop.ts`); colour "Default" (renamed from Auto) draws the callout's border;
  Enter in a callout writes inside the box (`toggle-enter.ts`); Link to page / `[[` / `[+` offer New page "name"
  (QuickFind `create`); `/Database - Inline|Full page` make a real table (`data/new-database.ts`); Properties → edit / New
  property in records-ui `FieldEditor`; view names and database titles typed in place; column gutter bar on hover; any
  Lucide name draws (DynamicIcon) and the icon search reaches all of Lucide; Use template into another organization
  copies its tables (`state/template-tables.ts`); collab resync rebuild removed, teardown synchronous. Walk tooling:
  `__tests__/walk/lib.mjs` (dev-login, org pick, sample-page guard, block menu / colour helpers).
- 2026-10-06 — builder round 20 (Arman: Use template on the Traveling SMM™ OS "set up" but the first page was empty):
  the sample page gets its content the moment it is made and every later write lands on its CURRENT version
  (`store/sample.ts` `saveOnCurrent`) — opening it mid-install used to write the editor's empty starting line and the
  last-step fill was refused ("This Space changed since it was opened"), leaving it blank for good. Opening a page
  stored with no blocks writes nothing (`page/content-key.ts`). A blank sample left by an earlier add is completed in
  place, never copied blank; a Use template copy in another organization reads that organization's own installed
  tables (`pointCopyAtItsTables`); a screen opened mid-install re-opens on the finished content (`pageEpoch`); a failed
  add toasts with Try again. Test `store/__tests__/sample-fill.test.ts`.
