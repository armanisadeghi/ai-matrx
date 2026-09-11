# FEATURE.md — copy-subset ("Filter & sort before copying…")

**Status:** `live` · **Tier:** `2` (platform primitive under `agent-copy`) · **Last updated:** `2026-09-11`

**Working label.** No canonical vocabulary term exists for this; "copy-subset" is a plainly descriptive working label (directory, overlay id `copySubsetWindow`, menu row "Filter & sort before copying…"). Naming is Arman's — flagged, not coined. "workspace" is retired in the lexicon and is never used for this.

## What it is

Arman (2026-09-11): *"a repeatable badass way to get exactly what you want from a subset of data using your own custom sort and filter only for the purpose of copying … it takes whatever data you had and puts it into a popover with the table for you to mess with then click copy and when you go back to the original table you were on, it's unaffected … it could even be that the ui you were on didn't have a tabular setup."*

Every Copy-for-AI control gets one more menu row, **Filter & sort before copying…**, which opens a non-blocking window holding the canonical `MatrxDataTable` over a **snapshot** of the caller's rows: global search (contains / whole words), per-column filters, layered advanced filters, sort, pagination, checkbox row selection, a column chooser (show/hide), a format switch (**For AI** · Markdown · CSV · JSON), a live count, and a live size estimate (chars · bytes · ~tokens) of the exact text the Copy button writes. Copy writes the visible columns × (the ticked rows, else every match). The origin surface is never touched. Champions judged against: Airtable (view export with field toggles), Notion (database export with format choice), Linear (filter-then-export).

## The contract — three pieces, one door

| Piece | File | Job |
|---|---|---|
| `useCopySubsetVariant()` | `useCopySubsetVariant.ts` | Returns a factory `(getSource, overrides?) => AiVariant`. Spread the variant into any `CopyButtons` / `AiCopyMenu` `aiVariants`. The getter runs at click time. |
| `CopySubsetSource<T>` | `types.ts` | `{ label, location, kind, rows: T[] \| () => Promise<T[]>, columns?, getRowId?, serializer?, initialSelectedIds?, defaultFormat?, onCopied? }`. No `columns` → inferred from the first 200 rows' keys. No `getRowId` → snapshot index. No `serializer` → generic envelope (records + Markdown summary + shaping attributes). |
| Overlay | `features/overlays/catalogue.ts` `copySubsetWindow` · `features/overlays/openers/copySubsetWindow.tsx` (`useOpenCopySubsetWindow` / `CopySubsetWindowController`) · `OverlayController.tsx` block · `CopySubsetWindow.tsx` | Multi-instance WindowPanel. Bound with `onClose` (never `overlayId`), so window persistence never restores a session-less window. |

Pure core: `serialize.ts` (formats, size, column inference), `model.ts` (`computeCopySubset` / `copySubsetText` through the real `filterAndSortRows`), `session.ts` (the module-scope registry).

## Laws

- **THE COPY LAW.** The session holds a fresh ARRAY of the caller's rows, taken at registration (array source) or after the loader resolves. The window only reads it; every shaping step returns new arrays. The origin array and the origin's query state are never referenced again. Test: `model.test.ts` deep-freezes the origin and asserts same references, order, and bytes after filter + sort + select + copy.
- **THE SHALLOW-COPY LAW.** Row OBJECTS are shared with the origin. Nothing in copy-subset mutates one; the window never passes `edit` to its table.
- **Rows and functions never enter Redux.** The opener registers a session and dispatches only `{ sessionId, title }`. `callbackManager` carries events, not data snapshots, so `session.ts` is the sibling channel — same shape as `rich-document/runtime/providerBridge.ts`. A session is released on window unmount and on the opener handle's `close()`.
- **Hidden columns leave the query** — exactly as in `MatrxDataTable` (it filters over `visibleColumns`). Hiding a column prunes its filter and sort so the table and the copy never disagree.
- **Serialization never drops a column.** The shared row builders skip `filter === false` columns without an `accessorKey` (right for an actions column in a live table); the primitive serializes every chosen column as a value column.
- **Server-paged tables get no door.** `MatrxDataTable` in remote `controlled` mode holds ONE page; a door promising "exactly what you want from the data" over one page would lie, so the variant is omitted there until a fetch-all seam exists.
- **Nothing fails silently.** A window whose session is gone (reload, navigation) says so and names the remedy; a loader failure shows the error with Retry; an empty subset disables Copy with the reason in the tooltip.

## Where it appears (adoption)

- **Every `MatrxDataTable` with a `copy` config** (local / controlled-local): the toolbar view copy AND the selected-rows copy. Serializer = `buildViewAgentInput(copy, rows, data, { scope: "custom" })`.
- **Provider sync** (`features/ai-models/components/ProviderSyncCopyForAi.tsx`): provider menu and page control, rows = `{ provider, comparison }` with Model / Provider id / Provider / Status / Released / DB name / Deprecated / Type(hidden). Serializer = `buildProviderSyncSubsetPayload`.
- **Tool re-fetch report** (`features/admin/tool-refetch/ToolRefetchConsole.tsx`): header pair (new — the report had no copy action), rows = the summary rows with the table's own column labels.
- **User data tables** (`features/data-tables/components/TableCopyControls.tsx`): "Filter & sort before copying…" over the COMPLETE table via the `loadRows` loader; serializer = `buildDataTableAgentInput({ scope: "custom" })`. Replaced and deleted: `TableCustomCopyWindow.tsx` (UDT-only, WindowPanel outside the overlay system, Markdown/AI only, no size estimate, no format switch).

### Census of "little popover UIs that modify data before copying" (2026-09-11)

`TableCustomCopyWindow` — row-subset-shaped → superseded and deleted. Not row-subset-shaped, therefore kept: `AgentCopyGroomerWindow` (whole-page sections × detail levels), `AiCustomDialog` (`aiCustom` option schemas, 8 surfaces), `ragAiCopyWindow` (RAG hit bundle options), `features/html-pages/…/CustomCopyTab.tsx` (page-content options). They shape *what detail*; copy-subset shapes *which rows and columns*. A future surface that needs both composes them; none forks either.

## Tests

`serialize.test.ts` (formats, escaping, inference, size) · `model.test.ts` (THE ORIGIN-UNTOUCHED TEST + selection/hidden/default seeds + session leak check) · `overlay-registration.test.ts` (catalogue entry, controller lazy import + gated block, opener hook + controller, no rows in Redux data). Run: `npx jest components/agent-copy/copy-subset`.

## Change Log

- **2026-09-11** — Created. Design attacked before build (standard lane): 4 blocking fixed — server-paged tables suppressed; hook returns a factory so view and selection menus open different sources; `buildViewAgentInput` `meta.scope` widened with `"custom"`; loader sources with loading / error / retry so the UDT path lost nothing. Adjudicated as REJECT: none. Owner-only: the user-visible wording of the menu row.
