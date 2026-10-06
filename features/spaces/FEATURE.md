# Spaces — Notion-style pages (FEATURE)

**Status:** building (2026-10-05). Route `/spaces` (not in any menu until the switch-over).
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
  (`templatePreview` — in-memory sample data, no writes), `@ai-matrx/design-system/controls`.
- Something missing outside the fence (a design-system option, a records-ui layout, an icon) goes in
  `NEEDS.md` beside this file — the owner session adds it to the package and clears the row.

## The contract — `contract.ts`

| Port | Now | Later (owner session) |
|---|---|---|
| `SpacesStore` | the database store (`store-db/`, owner's) wrapped by `state/live-store.ts` (active org via `ensureOrgId` for new top-level pages, change events for the tree) | realtime merge |
| `SpacesDataPort` | `templatePreview(spec).config` over a realistic template spec | live config + built-in modules via drill doors |
| `SpacesAiPort` | `wired: false` → the AI surface opens and says AI is not connected yet | our agents |

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
