# components/rich-editor — THE ONE EDITOR (Tiptap 3 visual + CodeMirror 6 source + shared-renderer preview)

Rich-content PLAN decisions 5, 6, 11 (`../../../common-docs/projects/rich-content-unification/PLAN.md`), register row RC-B4.
Verified against code 2026-09-25. Built beside Toast UI — **no surface uses it yet except `/markdown-studio` → Editor mode**; the flip is a later row.

## The contract — the stored text is the truth

- **No edit → the stored bytes.** Open, switch Visual/Source/Preview, save: byte-identical (`serializeVisualDocument` writes every unchanged block as its stored bytes).
- **An edit changes bytes only where the person typed.** Only changed blocks are serialized (`core/markdown-serialize.ts`) in the author's own spelling (`md*` attrs: `*`/`-`, `**`/`__`, `1)`, heading style, quote prefix, link tail, table row bytes). **No escapes are ever added** (a literal `|` typed into a table cell is the one exception — it would split the cell).
- **The fidelity gate.** A construct is editable rich text only if the serializer reproduces its stored bytes exactly at load (`core/markdown-parse.ts`); otherwise it is a `sourceLocked` atom — rendered, edited as source, written back verbatim.
- **Islands are bytes.** Kinds / `__kind` JSON, XML sections, fences, math, HTML, comments, anchors, `{{vars}}`, citations, tags are atoms (`islandBlock`, `inlineIsland`) edited only in their own editor (`islands/IslandCodeEditor.tsx`, `replaceIslandRaw`). Typing over a selected island starts a paragraph after it.
- **The save gate (`core/save-plan.ts`).** Every view saves through `planSave(stored, current)`: block-LCS regions, island accounting (removed / changed / swallowed need consent unless changed through the island's own editor; moved never asks), then content-ir 0.13's strict splice in two proven steps — `islandEdit` for island changes, block edits for prose. Validation offers, never blocks: the consent dialog always has **Save anyway**.

## Where things are

| Path | What |
|---|---|
| `RichEditor.tsx` | Front door — the ONE `dynamic(ssr:false)` edge; props type re-exported |
| `RichEditorImpl.tsx` | Shell: views, toolbar, find, outline, focus, dictation (`useMicField`), right-click AI menu (`EditableContextMenu`), save + consent, status bar |
| `core/` | React-free, headless-testable: schema (`extensions.ts`), parse/serialize, `visual-document.ts`, `save-plan.ts`, `commands.ts` (every verb), `find-replace.ts` + `visual-find.ts`, `outline.ts` (github-slugger = renderer anchors), `text-metrics.ts`, `variables.ts` (HighlightedText's rule), `shortcuts.ts` (THE key table), `source-format.ts`, `html-to-markdown.ts` (the paste converter = the schema + serializer) |
| `visual/` | Tiptap view: node views, slash + `{{` menus, selection & table toolbars, block handle (drag/move), decorations (anchors, task boxes, footnotes, find), `shortcut-handlers.ts` |
| `source/` | CodeMirror live preview: marks hide off the cursor line, `{{var}}` chips, islands rendered through `MarkdownStream` via portals, find highlights, `{{` completion |
| `islands/` | Island labels/icons, `IslandPreview` (shared renderer; print package page-break divider), `IslandCodeEditor` |
| `panels/` | Find & replace, outline, shortcuts sheet (⌘/), kind picker (`content_ir.kind_definition` + canonical `kind_example`) |

Page breaks use `@ai-matrx/print/directives` (`PAGE_BREAK_MARKDOWN`, `isPageBreakLine`) — one grammar. `marked` is used ONLY in `core/markdown-parse.ts`, as a byte-mapped lexer (lawful site in `scripts/rich-content-inventory/registry.ts`).

## Gates

- `npx jest components/rich-editor` — adapter, features, strict splice, shortcuts (mutations via `plant.py` go red: naive serializer, escaping serializer, consent-less gate, table-row reuse, skipped island step).
- `npx tsx scripts/check-rich-editor-roundtrip-corpus.ts` — every stored row (shared reader `scripts/lib/rich-content-corpus.ts`) through a real headless Editor: no-edit, view switch, exact one-paragraph edit, islands intact, no escapes. Read-only; ids only.

## Change Log

- 2026-09-25 — Built (RC-B4): three views, save gate on content-ir 0.13, slash/variable menus, tables, callouts, checklists, page breaks, footnotes, block handle, find & replace, outline, metrics, focus mode, shortcut table, paste converter, image upload, math/code/kind islands; mounted on `/markdown-studio` Editor mode saving only to a disposable note.
