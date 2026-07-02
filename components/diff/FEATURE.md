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

### Merge, don't just view — `DiffReview`

```tsx
import { DiffReview } from "@/components/diff/DiffReview";

<DiffReview original={a} modified={b} onApply={(mergedText) => save(mergedText)} />
```

`DiffReview` turns a comparison into an **editing tool**: the user accepts (take
the new lines) or rejects (keep the old lines) each **hunk**, sees the running
result, and Applies → `onApply(mergedText)`. Headless of any source — the caller
owns what "apply" means (write a note / code file / context value / resolve a
conflict). Engine in `text/engine/hunks.ts` (`getHunks` + `applyHunks`; all
hunks accepted === `modified`, none === `original`). Use `DiffViewer` for a
read-only comparison, `DiffReview` when the user should selectively merge.

### Light engine highlights (what the old diffs lacked)

`text/engine/computeTextDiff.ts` consolidates the two legacy hand-rolled LCS
diffs and adds **word/character-level intra-line highlighting**
(`text/engine/wordDiff.ts`) for changed line pairs — shown in both split and
inline views. One computation produces both representations.

## Files

```
components/diff/
  DiffViewer.tsx              # ⭐ canonical headless core (engine router), read-only
  DiffReview.tsx             # ⭐ per-hunk accept/reject MERGE tool → onApply(mergedText)
  text/
    TextDiff.tsx              # light core: inline + split + highlight, word-level, Swap toggle
    diffColors.ts            # ⭐ ONE source of truth for diff colors (every renderer imports)
    AnimatedDiffReveal.tsx    # single-pane human reader; animates a known edit landing
    useDiffReveal.ts          # paced "fill the replacement in" reveal for a known before→after
    engine/
      types.ts                # DiffRow, InlineDiffLine, WordSegment, stats
      computeTextDiff.ts      # line LCS + inline/aligned builders + stats
      wordDiff.ts             # intra-line word/char LCS
      hunks.ts               # getHunks + applyHunks (per-hunk merge model for DiffReview)
  code/
    CodeDiff.tsx              # heavy core: Monaco DiffEditor behind ONE next/dynamic({ssr:false})
  adapters/
    InlineTextDiff.tsx       # compact, self-sizing, chrome-less light diff (structured grid / markdown blocks)
  engine/ views/              # (pre-existing) STRUCTURED entity diff — unchanged
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
  prompt results, tool overlays, …). The context menus carry the same actions:
  `features/context-menu-v3/components/{MenuContent,MobileMenuContent}.tsx` and
  legacy `features/context-menu-v2/UnifiedAgentContextMenu.tsx`.
- **Clipboard compare direction (invariant):** current content is the
  **original** (baseline the user has now); the clipboard is the **modified**
  (incoming version about to be pasted). So clipboard-only text reads as an
  **addition**, current-only text as a **removal**. All four callsites above
  follow this; never flip it back to clipboard-as-original. The viewer's **Swap**
  toggle lets the user reverse it per-view.
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
| A1 | `features/code-editor/utils/generateDiff.ts` | hand-rolled LCS | delete → `computeTextDiff` — **blocked**: still used by A13 preview, `ContextAwareCodeEditor*`, `useAICodeEditor`, `TabDiffView`. Migrate those first. |
| A2 | `features/code-editor/agent-code-editor/utils/generateDiff.ts` | dup of A1 | delete — **blocked**: still used by `TabDiffView`. |
| A3 | `features/notes/utils/diffAnalysis.ts` | 3rd LCS | migrate engine; keep thin `analyzeDiff` stats wrapper |
| A4 | `features/code-editor/components/DiffView.tsx` | ~~LCS + Prism~~ | **✓ done** → thin wrapper over `DiffViewer` (auto) |
| A5 | `features/code-editor/agent-code-editor/components/parts/DiffView.tsx` | ~~copy of A4~~ | **✓ done** — re-exports A4 (dup gone) |
| A6 | `features/research/components/document/VersionDiff.tsx` | ~~`react-diff-viewer-continued`~~ | **✓ done** → `DiffViewer light` (inline) |
| A7 | ~~`features/agents/route/AgentVersionsWorkspace.tsx`~~ | dead | **✓ done** — deleted |
| A8 | `features/versioning/components/VersionDiffView.tsx` | ~~raw `<pre>`/spans~~ | **✓ done** → `InlineTextDiff` (short scalars stay compact) |
| A9 | `features/notes/components/NoteConflictWindow.tsx` | ~~`diffAnalysis` segments~~ | **✓ done** → diff tab `DiffViewer` + new **Merge** tab (`DiffReview`) |
| A10 | `features/notes/components/diff/adapters/NoteContentAdapter.tsx` | custom row renderer | inner renderer→`TextDiff` inside structured adapter |
| A11 | `features/agents/components/diff/adapters/MessagesAdapter.tsx` | colored `<pre>`, no LCS | per-message text→`TextDiff`; keep message matching |
| A12 | `components/diff/views/RawJsonView.tsx` | ~~direct Monaco~~ | **✓ done** → consumes `CodeDiff` |
| A13 | `components/mardown-display/chat-markdown/diff-blocks/renderers/SearchReplaceDiffRenderer.tsx` | complete diff via A4 (now canonical); `generateUnifiedDiff` still powers the collapsed count + 4-line preview | **partial** — main diff canonical; preview/count still A1 |
| A14 | `features/canvas/custom-components/CodePreviewCanvas.tsx` | ~~A4 + getDiffStats~~ | **✓ done** — diff via canonical A4; stats via `computeTextDiff` |
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

**Dep cleanup:** **✓ done** — `react-diff-viewer-continued` removed from
`package.json` + lockfile. Its three users (A6, A7, and the markdown ` ```diff `
block renderer `DiffCanvas` — not previously inventoried) are all migrated off it.

### Category B — surfaces missing a Compare (new adoption)

Attach `useOpenDiffViewerWindow()` / RichDocument Compare to these:

`B1` file versions (`FileVersionsList`) · `B2` note version timeline (`DiffHistory`) ·
`B3` `NoteVersionDiffPage` content-window action · `B4` agent-app version page ·
`B5` `AgentAppVersionsContent` rows · `B6` `ContextVersionHistory` · `B7` canvas
artifact versions ·
`B9` `UndoHistoryOverlay` rows · `B10`–`B13` RAG raw↔cleaned panes / library preview /
detail sheet / ingest preview · `B14` git source-control rows · `B15` chunking draft↔saved ·
`B16` data-table row JSON snapshots · `B17` transcript-studio raw↔cleaned segments ·
`B18` transcript edit draft↔saved · `B19` research version "open in window" ·
`B20` `VersionHistoryPanel` long-text "open in window" · `B21` `/ai/prompts/compare`
placeholder · `B22` `.diff`/`.patch` file preview · `B23` agent-comparison run **outputs** ·
`B24` user-message edit history · `B25` stream-debug payload pairs · `B26` scraper snapshots ·
`B27` PD-ratings draft↔saved · `B28` content-templates/skills body edits ·
`B29` `PromptGenerator` generated↔current · `B30` `stringTransformDisplay` util result.

**✓ Shipped (2026-06-27 rollout):** `B4` agent-app version code · `B6`
ContextVersionHistory · `B7` canvas artifact versions · `B10`/`B11`/`B12` RAG
raw↔cleaned — plus surfaces not in the original list: **Quick Save overwrite
confirms** (note + code, compare-before-apply), **transcript CleanupPad**,
**SystemPromptOptimizer**, **ContextItemForm** (compare-with-saved), **content
TemplateEditor**, **podcast EpisodeContentStudio** (saved↔regenerated). Plus the
per-hunk **merge** tool (`DiffReview`) wired into `NoteConflictWindow` (A9).
**Still open:** `B13` RAG ingest preview · `B16`/`B17`/`B18` data-table +
transcript-studio · `B29` PromptGenerator · notes Find/Replace-All preview ·
`A13` collapsed preview/count (still on A1) · `A3` `diffAnalysis` engine
migration · `A1`/`A2` deletion (blocked on the consumers noted above).
Expansions still to build: `<CompareTwoPicker>` (pick A / pick B), a standalone
`/compare` route (the `/demos/diff` playground already does paste-two +
compare/merge), agent-emittable `matrx-diff` block, 3-way merge, since-last-seen.

## Change Log

- 2026-06-27 — Rollout pass 2: replacements + the merge tool. **New capability —
  `DiffReview`** (`components/diff/DiffReview.tsx` + `text/engine/hunks.ts`):
  per-hunk accept/reject → `onApply(mergedText)`, turning the read-only system
  into an editing tool; verified live on `/demos/diff` ("review & merge" toggle).
  **Replacements:** code-editor `DiffView` A4 → thin wrapper over `DiffViewer`,
  A5 → re-export (duplicate LCS render gone, ~200 lines); `NoteConflictWindow`
  A9 → canonical diff tab + new per-hunk **Merge** tab; `CodePreviewCanvas` A14
  stats → `computeTextDiff`. **New Compare surfaces:** `ContextItemForm`
  (compare-with-saved by the required change summary), agent-app version page B4
  (client island → Monaco diff of version vs current code), content
  `TemplateEditor` (saved↔draft), podcast `EpisodeContentStudio`
  (saved↔regenerated). A1/A2 LCS utils kept (still have consumers — see table).
- 2026-06-27 — Universal-rollout pass (foundation + 9 surfaces). **Foundation:**
  Monaco now loads via a single `next/dynamic({ssr:false})` in `CodeDiff` +
  `RawJsonView` (was `React.lazy` — rule violation); verified Monaco renders both
  inline and through the overlay window (`lazyOverlay`) with no nesting breakage.
  Extracted the GitHub palette into one source of truth `text/diffColors.ts`
  (`LINE_BG`/`WORD_BG`/`GUTTER`/`INLINE_BG` + `splitSideTint`/`wordSegmentClass`);
  `TextDiff` **and** `InlineTextDiff` consume it — the latter had missed the
  2026-06-26 color fix and still had the invisible palette + muddy amber.
  **Replacements:** research `VersionDiff`→light (A6); deleted dead
  `AgentVersionsWorkspace` (A7); `RawJsonView`→`CodeDiff` (A12); markdown
  ` ```diff ` block `DiffCanvas`→`InlineTextDiff`; **`react-diff-viewer-continued`
  removed from package.json + lockfile.** **New Compare surfaces** (all via
  `useOpenDiffViewerWindow()`): Quick Save Note + Code overwrite confirms
  (compare-before-apply, data-loss guard), RAG raw↔cleaned ×3, transcript
  `CleanupPad`, `SystemPromptOptimizer`, `ContextVersionHistory`,
  `ArtifactVersionHistory`. Driven by the adversarial discovery workflow's ranked
  plan; remaining waves tracked in the Category A/B "Still open" note above.
- 2026-06-26 — Clipboard compare direction fix + legible diff colors + Swap
  toggle. **Direction:** clipboard compare was backwards (clipboard as
  original/old, current as modified/new) — fixed at all four callsites
  (`rich-document/actions/handlers/compare.ts`, context-menu-v3
  `MenuContent`/`MobileMenuContent`, context-menu-v2 `UnifiedAgentContextMenu`):
  current content is now the baseline, clipboard the incoming version.
  **Colors:** `TextDiff` reds/greens were near-invisible (`*-50` in light,
  `*-950` in dark) — replaced with a GitHub-style palette in `LINE_BG` / `WORD_BG`
  / `GUTTER` constants (light `*-100` line + `*-300` word; dark bright hue at low
  opacity `*-500/15` line + `*-500/40` word). Split view now tints **per side**
  (`splitTint`): old column red, new column green on modified rows, instead of
  one muddy amber across both. These are deliberate raw `green/red-*` (the
  universal diff convention), NOT the `success`/`destructive` tokens used by the
  structured adapters and `AnimatedDiffReveal` — do not "tokenize" them.
  **Swap:** added a Swap toggle to the `TextDiff` toolbar (all three views) that
  flips original↔modified and their labels.
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
- 2026-06-19 — Structured text diffs now highlight only what changed. The
  structured entity adapters (`adapters/defaults.tsx` `TextFieldAdapter`,
  `features/agents/.../MessagesAdapter`) tinted the ENTIRE old value red and
  ENTIRE new value green whenever a field differed at all — so unchanged text
  looked "updated" (and whitespace-only diffs lit the whole block). Added
  `adapters/InlineTextDiff.tsx`: a compact, self-sizing, chrome-less renderer on
  the canonical `computeTextDiff` engine (word/line-level, `ignoreTrailingWhitespace`).
  Modified string fields/messages now render through it; identical text stays plain.
- 2026-06-19 — Extended the word/line-level `InlineTextDiff` migration to the
  remaining whole-block-tint renderers. Migrated the MODIFIED (both-sides-present)
  free-text case in `features/agents/.../VariablesAdapter` (var default + helpText),
  `ContextSlotsAdapter` (slot label + description), and `CustomToolsAdapter`
  (tool description + input schema), plus `features/versioning/.../VersionDiffView`
  (side-by-side + long-inline panes). Add/remove/unchanged and scalar/short-token
  rendering left intact. Deliberately left as-is: `ToolsAdapter`/`McpServersAdapter`
  (add/remove of ID tokens), `SettingsAdapter`/`ModelAdapter` (scalars/single tokens),
  `data-tables/VersionHistoryViewer` (inline `prev → next`, not whole-block tint),
  and `notes/.../NoteContentAdapter` (already line-level with collapse + whitespace +
  stats UX; not the whole-block-tint bug).
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
- 2026-06-23 — Animated diff reveal + engine word-pairing fix. Added
  `text/useDiffReveal.ts` (paces a KNOWN before→after edit: hold on the removal,
  then fill the replacement in char-by-char; inactive → final diff at once) and
  `text/AnimatedDiffReveal.tsx` (single-pane human reader on `computeTextDiff` —
  removed runs struck `destructive`, added runs `success`, surrounding text
  plain; semantic tokens only). First consumer: the `ctx_patch` / working-doc
  patch renderer (`PatchDiffInline`), which now renders instantly from the tool
  args and animates the fill while live. Engine fix in `computeTextDiff`: change
  blocks now collect added/removed lines in ANY order (was "removed* then
  added*"), so a phrase inserted mid-line word-pairs correctly and tints only
  the phrase — previously such pairs fell through to single-sided lines with no
  intra-line segments (whole line tinted). `highlight` view tints switched from
  raw `green/red-*` to `success`/`destructive` tokens.
