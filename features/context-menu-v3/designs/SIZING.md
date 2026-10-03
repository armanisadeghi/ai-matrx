# Right-click menu sizes — round 2 tokens

Arman, 2026-10-02: *"our menu is too small — the text is too small and the height and width are too small … the one place where we have essentially unlimited space, we're suddenly cheap."*

These are the demo's tokens (`sizing.ts`: `DESKTOP` / `PHONE` numbers, `D` / `P` class strings). Every design in `/demos/context-menu-designs` draws at them. The package (`@ai-matrx/alchemy` `react/menu.tsx`, `react/dropdown-nodes.tsx`, `react/sheet.tsx`) has not been changed. It can adopt the class strings as written.

## What was measured (2026-10-02)

| Menu | Width | Row | Label | Icon | Shortcut | Separator | Surface padding | Source |
|---|---|---|---|---|---|---|---|---|
| Google Sheets, cell right-click | 322 | 32 | 14px Roboto 400 | 18 | 14px, 38% ink, right-aligned | 1px, 8px above and below | 6px vertical | Measured live in headless Chromium on Google's public sample sheet (`1BxiMVs0…upms`). Item padding was 38px left (the icon gutter) and 15px right. Radius 4, shadow `0 2px 6px 2px rgba(0,0,0,.15)`. |
| AI Matrx round 1 (production demo) | 288 | 32 | 14px | 16 | 12px | 1px, 4px | 4px | Measured live on demos.aimatrx.com. Icon-strip buttons were 28×28. |
| VS Code | — | 26 | 13px | 16 | 13px | — | — | Published values, not measured here (`.monaco-menu` rows are 2em at 13px). |
| macOS menus | — | 22 | 13pt SF | 16 | 13pt | — | — | Apple HIG, published values, not measured here. |
| Notion | ~265 | 28 | 14px | 20 | — | — | — | Observed, not measured here. |

Round 1 already matched Sheets on row height (32) and text (14). It lost on width (288 vs 322), icon size (16 vs 18), shortcut size (12 vs 14), separator air (4 vs 8) and strip targets (28 vs Sheets' 32+ toolbar buttons). So a 14px label would have looked unchanged. The tokens below beat Sheets on every axis Arman named.

## Desktop tokens

| Token | Value | Why |
|---|---|---|
| Menu width | 360px (`w-[22.5rem]`) | Sheets 322 +38. That fits 8 icon buttons per strip line with gaps. |
| Surface padding | 6px all round (`px-1.5 py-1.5`) | Sheets 6px vertical. |
| Radius | 8px (`rounded-lg`) | Our cards and dialogs use 8. Sheets uses 4. |
| Row height | 36px (`min-h-9`) | Sheets 32 +4, inside Arman's 32–36 band. |
| Row padding / gap | 10px sides, 12px icon→label | The label starts at 40px, the same gutter as Sheets' 38. |
| Label | 15px / 20px line (`text-[15px] leading-5`) | Sheets 14px +1, because "the text is too small" and round 1 was already at 14. |
| Shortcut | 14px, muted, right-aligned, 16px clear of the label | Sheets 14px at 38% ink. |
| Section heading | 12px semibold, muted | Notion and Linear use small muted group names. Only "Intelligence" uses one. |
| Icon | 18px | Sheets 18. |
| Strip icon button | 34×36, 18px glyph, 2px gap | The same height as a row. The tooltip gives the name, then the shortcut or the reason it is greyed. |
| Split chevron | 16×36, 12px glyph | Sits beside the icon (Copy, Export, Read aloud). |
| Separator | 1px, 8px above and below (`my-2`) | Sheets 8. |
| Filter field | 36px tall, 15px text | Matches a row. |
| Submenu width | 320px (`w-80`) | Sheets' menu width. |

## Phone tokens (desktop × ~1.33, floored at the 44–48px touch target)

| Token | Value | Why |
|---|---|---|
| Row height | 48px | Material's 48dp list row. This is above iOS's 44pt floor. |
| Label | 17px / 24px | iOS body text size. |
| Icon | 22px | 18 × 1.22. |
| Strip icon button | 48×48, 4px gap | The touch floor. |
| Shortcut | 15px muted | Shown only where a hardware keyboard exists. |
| Heading | 13px semibold | iOS footnote size. |
| Filter field | 44px, 17px text | 17px keeps iOS from zooming (16px is the floor). |

The earlier designs' phone view still draws through the package's sheet. The pages lift it to these numbers with `PACKAGE_SHEET_CSS`, a scoped style that only touches `[data-alchemy-layout="sheet"]`.

## Adoption note for the package

- `react/menu.tsx` surface: replace `w-72` with `D.menu`, and the search input with `D.search`.
- `react/dropdown-nodes.tsx` rows: `gap-2` becomes `D.row`, glyphs become `D.glyph`, the hint becomes `D.shortcut`, section labels become `D.heading`, and separators become `D.separator`.
- Strip `LeafButton`: `h-7 min-w-7` becomes `D.iconButton`.
- `react/sheet.tsx` `ROW`: becomes `P.row`.
