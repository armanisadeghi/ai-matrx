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
| `SpacesStore` | in-memory store inside the fence, shows a "sample data — not saved" marker | Supabase table, realtime |
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

- 2026-10-05 — fence, contract, guard laid by the owner session.
