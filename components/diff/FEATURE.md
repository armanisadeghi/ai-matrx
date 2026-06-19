# Diff System (canonical)

**Status:** active · **Owner dir:** `components/diff/`

The single canonical place to render a difference between two pieces of
content anywhere in the app. One **headless core** picks between two
engines so callers never wire diff internals by hand:

| Engine | Component | Backed by | Use for |
|---|---|---|---|
| **light** | `text/TextDiff.tsx` | custom LCS engine (this dir) | plain text, markdown, prose, version history, clipboard compares |
| **heavy** | `code/CodeDiff.tsx` | Monaco `DiffEditor` (lazy) | source code, large inputs |

> Two pre-existing structured frameworks remain and are **not** replaced:
> `components/diff/engine` + `views/` + `adapters/` is the **structured
> object/entity** diff (agent versions, note fields). This canonical text/
> code system is for *content* diffs. They are complementary.

## The core contract — import THIS

```tsx
import { DiffViewer } from "@/components/diff/DiffViewer";

<DiffViewer
  original={a}
  modified={b}
  engine="auto"        // "auto" | "light" | "monaco"
  language="typescript" // drives auto selection; omit for text/md
  originalLabel="Before"
  modifiedLabel="After"
  defaultView="split"  // "split" | "inline" | "highlight"
/>
```

**Views:** `split` (side-by-side), `inline` (unified, both sides stacked),
`highlight` (single-pane: the *new* doc rendered as flowing prose with only the
added/changed regions tinted — the reader's view, not a code diff). `highlight`
is **light-engine only**; the Monaco path falls back to `inline` for it.

`DiffViewer` is **wrapper-free on purpose**. It fills its container, holds no
overlay/router/Redux state, and renders identically as:

- a **route** (drop into a page),
- a **WindowPanel** (`features/window-panels/windows/DiffViewerWindow.tsx`),
- a **modal / sheet** (render inside any dialog),
- an **inline region** of any component.

`engine="auto"` → Monaco for recognized code languages or inputs over
~60k chars; the light text engine otherwise.

### Light engine highlights (what the old diffs lacked)

`text/engine/computeTextDiff.ts` consolidates the two legacy hand-rolled LCS
diffs and adds **word/character-level intra-line highlighting**
(`text/engine/wordDiff.ts`) for changed line pairs — shown in both split and
inline views. One computation produces both representations.

## Files

```
components/diff/
  DiffViewer.tsx              # ⭐ canonical headless core (engine router)
  text/
    TextDiff.tsx              # light core: inline + split, word-level, toolbar
    engine/
      types.ts                # DiffRow, InlineDiffLine, WordSegment, stats
      computeTextDiff.ts      # line LCS + inline/aligned builders + stats
      wordDiff.ts             # intra-line word/char LCS
  code/
    CodeDiff.tsx              # heavy core: clean lazy Monaco DiffEditor wrapper
  engine/ views/ adapters/    # (pre-existing) STRUCTURED entity diff — unchanged
```

## Wrappers & integration

- **Window:** `features/window-panels/windows/DiffViewerWindow.tsx`
  (overlayId `diffViewerWindow`, multi-instance, ephemeral). Open via
  `useOpenDiffViewerWindow()` (`features/overlays/openers/diffViewerWindow.tsx`).
- **Pick-two flow state:** `lib/redux/slices/diffCompareSlice.ts`
  (`setCompareBase`, `openCompareWithBase` thunk).
- **Menu actions (RichDocument):** `features/rich-document/actions/handlers/compare.ts`
  registers `compare-with-clipboard`, `set-compare-base`, `compare-with-base`
  under the **Compare** submenu (`variants/shared/menuStructure.ts`). These
  appear on every RichDocument content surface (notes, agent messages,
  prompt results, tool overlays, …).
- **History compare:** `EditHistoryDialog` now has a per-version
  *Compare with current* button that opens the diff window (Restore kept).
- **Working-doc "what the agent last changed":**
  `features/transcript-studio/components/scribe/WorkingDocDiff.tsx` renders this
  core at `defaultView="highlight"` (single-pane) with the toolbar toggle to the
  two-pane views. Shared by Scribe + War Room via `WorkingDocumentHeader`; the
  before-snapshot comes from `useWorkingDocChanges` (last content the user saw).

---

## Replacement candidates (consolidation backlog)

Verified repo-wide 2026-06-11. Two categories: (A) existing diff code to
migrate/delete, (B) surfaces with version/history/restore flows that have **no**
Compare today. Migrate **when touched**, only where ours is genuinely better —
interactive per-hunk Monaco surfaces stay on Monaco.

### Category A — existing diff implementations to replace

| # | Location | Today | Action |
|---|---|---|---|
| A1 | `features/code-editor/utils/generateDiff.ts` | hand-rolled LCS | delete → `text/engine/computeTextDiff` |
| A2 | `features/code-editor/agent-code-editor/utils/generateDiff.ts` | dup of A1 | delete → canonical engine |
| A3 | `features/notes/utils/diffAnalysis.ts` | 3rd LCS | migrate engine; keep thin `analyzeDiff` stats wrapper |
| A4 | `features/code-editor/components/DiffView.tsx` | LCS + Prism, inline | `DiffViewer light` (monaco for big code) |
| A5 | `features/code-editor/agent-code-editor/components/parts/DiffView.tsx` | copy of A4 | same as A4 |
| A6 | `features/research/components/document/VersionDiff.tsx` | `react-diff-viewer-continued` | `DiffViewer light`; drop dep |
| A7 | `features/agents/route/AgentVersionsWorkspace.tsx` | `react-diff-viewer-continued` (**dead**) | delete |
| A8 | `features/versioning/components/VersionDiffView.tsx` | raw `<pre>`/spans | text→`light`, JSON→structured/`monaco` |
| A9 | `features/notes/components/NoteConflictWindow.tsx` | `diffAnalysis` segments | diff tab→`light`; keep resolution actions |
| A10 | `features/notes/components/diff/adapters/NoteContentAdapter.tsx` | custom row renderer | inner renderer→`TextDiff` inside structured adapter |
| A11 | `features/agents/components/diff/adapters/MessagesAdapter.tsx` | colored `<pre>`, no LCS | per-message text→`TextDiff`; keep message matching |
| A12 | `components/diff/views/RawJsonView.tsx` | direct Monaco `DiffEditor` | `CodeDiff` |
| A13 | `components/mardown-display/chat-markdown/diff-blocks/renderers/SearchReplaceDiffRenderer.tsx` | A1+A4 on complete | complete-state→`DiffViewer light`; keep streaming SM |
| A14 | `features/canvas/custom-components/CodePreviewCanvas.tsx` | A4 + stats | diff tab→`DiffViewer monaco` |
| A15 | `features/code-editor/components/AICodeEditor.tsx` | A4 | `DiffViewer` when touched |
| A16 | `features/code-editor/agent-code-editor/components/parts/ReviewStage.tsx` | A5 | `DiffViewer` when touched |
| A17 | `features/data-tables/components/VersionHistoryViewer.tsx` | local key prev→next | long values→`light`; keep key summary |
| A18 | `features/text-diff/components/DiffViewer.tsx` | stacked cards (**unwired**) | delete |
| A19 | `features/text-diff/` (`DiffControls`, `useDiffHandler`, `textDiffSlice`) | accept/reject pipeline (**no callers**) | retire stack; keep `DiffHistory`/`versionService` until notes sidebar migrates |
| A20 | `features/code-editor/components/unused/ProCodeEditor.tsx` | Monaco toggle (**unused/**) | delete/ignore |
| A21 | `features/code/views/source-control/SourceControlPanel.tsx` | git diff as raw `language:"diff"` text | parse hunks→`DiffViewer monaco` (pairs B14) |
| A25 | `features/code/editor/TabDiffView.tsx` | Monaco + per-hunk accept/reject | **keep on Monaco** |
| A26 | `features/code/editor/TripleDiffView.tsx` | 2 stacked Monaco | **keep on Monaco** |
| A27 | `features/agents/components/diff/AgentDiffViewer.tsx` / `NoteDiffViewer.tsx` | structured shell | **keep shell**; migrate text adapters (A10–A12) |

**Keep as-is (structured / non-content tools, not targets):** A22 `BlockParserComparison`,
A23 `JsonComparator`, A24 `ManifestDriftDialog`; plus `ComparisonTableBlock`,
`features/agent-comparison` battle UX, `cx-chat/utils/settings-diff.ts`,
`RecentChangeOverlay`/`diffRange.ts`.

**Dep cleanup:** remove `react-diff-viewer-continued` from `package.json` after A6 + A7.

### Category B — surfaces missing a Compare (new adoption)

Attach `useOpenDiffViewerWindow()` / RichDocument Compare to these:

`B1` file versions (`FileVersionsList`) · `B2` note version timeline (`DiffHistory`) ·
`B3` `NoteVersionDiffPage` content-window action · `B4` agent-app version page ·
`B5` `AgentAppVersionsContent` rows · `B6` `ContextVersionHistory` · `B7` canvas
artifact versions · `B8` `ContentHistoryViewer` (broken stub — mirror `EditHistoryDialog`) ·
`B9` `UndoHistoryOverlay` rows · `B10`–`B13` RAG raw↔cleaned panes / library preview /
detail sheet / ingest preview · `B14` git source-control rows · `B15` chunking draft↔saved ·
`B16` data-table row JSON snapshots · `B17` transcript-studio raw↔cleaned segments ·
`B18` transcript edit draft↔saved · `B19` research version "open in window" ·
`B20` `VersionHistoryPanel` long-text "open in window" · `B21` `/ai/prompts/compare`
placeholder · `B22` `.diff`/`.patch` file preview · `B23` agent-comparison run **outputs** ·
`B24` user-message edit history · `B25` stream-debug payload pairs · `B26` scraper snapshots ·
`B27` PD-ratings draft↔saved · `B28` content-templates/skills body edits ·
`B29` `PromptGenerator` generated↔current · `B30` `stringTransformDisplay` util result.

## Change Log

- 2026-06-11 — Created canonical diff system: light text engine with
  word-level highlighting, headless `DiffViewer`, Monaco `CodeDiff`,
  `DiffViewerWindow`, `diffCompareSlice`, RichDocument Compare actions, and
  EditHistoryDialog per-version compare.
- 2026-06-11 — Wired Compare (clipboard / set base / compare with base) into
  `UnifiedAgentContextMenu` (`features/context-menu-v2`) so it appears in the
  agent-builder system-prompt menu and every other surface using that menu.
  Added dev playground at `/demos/diff`
  (`app/(dev)/demos/diff/page.dev.tsx`).
- 2026-06-11 — Replaced the consolidation backlog with the verified repo-wide
  inventory: Category A (27 existing diff sites) + Category B (30 new-adoption
  surfaces).
- 2026-06-19 — Light-mode color fix across all diff viewers. The structured
  entity diff (`adapters/defaults.tsx`, `views/SummaryView`, `views/DiffViewerShell`,
  all `features/agents/components/diff/**` adapters + `VersionHistoryTimeline`) and
  `features/notes/components/diff/**` were authored dark-only (`bg-*-950`, `text-*-300/400`
  with no `dark:` sibling) — unreadable in light mode. Made every diff color token
  theme-aware (light `*-50/*-100` bg + `*-600/*-700` text, original dark value behind
  `dark:`). `RawJsonView` (Monaco) and research `VersionDiff` (`react-diff-viewer-continued`)
  now follow `state.theme.mode` instead of hardcoding dark.
- 2026-06-15 — Added the light-engine `highlight` view (single-pane: new doc
  with changes tinted inline) to `TextDiff` + `DiffViewer`; Monaco falls back to
  inline. First consumer: working-doc `WorkingDocDiff` (Scribe + War Room).
