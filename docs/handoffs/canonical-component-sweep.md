---
status: active
updated: 2026-08-11
repos: [matrx-frontend]
vision: [features/content-ir/FEATURE.md]
---

# Canonical Component Law — repo sweep worklist

Audit only; nothing was changed. Every row below was read in the source, not inferred.

## Vision — Arman's words

> "A SHAPE HAS EXACTLY ONE COMPONENT. Rendering a registered kind with anything else is BANNED."
> "Hand-writing a second renderer for a shape we already have a component for is the single most
> expensive mistake in this repo… exceptions require his explicit approval, and no agent may grant
> itself one." — `features/content-ir/FEATURE.md` § THE CANONICAL COMPONENT LAW, 2026-08-11

The four escape hatches that are NOT hand-rolling: split the canonical component into child parts;
put editing IN it; put the verb on it via the kind-action registry; add a prop. Reference end
state: `components/mardown-display/blocks/page-brief/PageBriefBlock.tsx` (exported parts +
`editable` + `actions`) consumed by `features/marketing/content-plan/components/BriefEditor.tsx`.

## Summary

| Class | Count |
|---|---|
| A — full duplicate | 3 files (1 live, 2 dead) |
| B — partial duplicate | 2 |
| C — bespoke editor | 3 |
| D — action beside, not on | 1 |
| E — wrapper padding | **0 found** |

Scope covered: all 25 top-level registered kinds that carry a `legacyBlockType` (`system-kinds.ts`
+ `kinds/*.ts`) against every consumer in `features/**` and `app/**`. Clean (verified consuming the
canonical component): `page_brief`, `presentation_deck` (OutputsStudio, CanvasRenderer),
`diagram_spec` (education mind maps), `keyword_relationship_research` +
`keyword_classification_batch_v1` (SavedResearchFeed / KeywordResearchTab / KeywordResearchWindow),
`transcript`, `comparison_set`, `research_report`, `resource_collection`, `progress_tracker`,
`questionnaire`, `troubleshooting_guide`, `cooking_recipe`, `timeline`, `decision_tree`,
`mermaid_diagram`, `item_presentation`, `schema_proposal`, `structured_info`. The whole
`features/canvas/artifact-types/renderers/*` family is thin adapters over the canonical components —
it is the model, not a violation.

No class-E box-in-a-box was found: every non-canvas consumer wraps at most in `h-full` / `space-y-3`.

## Remaining work — ranked by user-visible damage

### 1. `media_chapters` is hand-rendered on the podcast studio run page — A + D
- **Where:** `features/podcasts/studio/components/EpisodeChaptersPanel.tsx:189-203` (the `<ol>`),
  `:158-179` (the Generate/Regenerate button).
- **See it:** `/podcast/studio/run/<runId>` — an episode with chapters generated.
- **Damage:** the page renders `PodcastAudioPlayer` (StudioRunView) and the canonical
  `MediaChaptersBlock` takes an `onSeek` prop that turns each chapter into a button that jumps the
  player — the hand-rolled `<ol>` is static text, so the one thing a chapter index is FOR does not
  work here. `MediaChaptersBlock`'s own header (`components/mardown-display/blocks/media-chapters/MediaChaptersBlock.tsx:1-13`)
  already claims it renders "the podcast studio's persisted-chapters panel"; it does not — the panel
  never imports it. Field parity is documented as exact (`features/content-ir/kinds/media-chapters.ts`
  ≡ `PcEpisodeChapter`), so this is a byte-for-byte duplicate shape.
- **Fix:** delete the `<ol>` and render
  `<MediaChaptersBlock serverData={{ chapters }} onSeek={…} actions={<Button …>Regenerate</Button>} />`.
  The `actions` slot is exactly the D-class remedy — the verb moves onto the component. Keep the
  fetch/save/write-target wiring where it is; only the markup moves.
- **Effort:** S.

### 2. `flashcard` faces re-rendered by hand in the set grid — B
- **Where:** `features/flashcards/components/set-detail/SetDetailView.tsx:108-204` (`CardPeek`),
  consumed at `:602`.
- **See it:** `/education/flashcards/<setId>`.
- **Damage:** card faces are printed as raw strings — cloze faces go through
  `faces.front.replace(/\*\*/g, "")`, i.e. markdown is *stripped* rather than rendered, so a card
  with bold/LaTeX/lists reads wrong in the grid and right everywhere else. Matching pairs get a
  second layout that will drift from `FlashcardItem`'s. Every future card-face improvement
  (`FlashcardItem` is consumed by StudyDeck, the study/subcard windows, and CanvasFlashcardsView)
  skips this grid.
- **Fix:** export a compact face part from `FlashcardItem` (a `variant="peek"` prop, or a
  `FlashcardFaces` child the way `PageBriefBlock` exports `PageBriefAngle`) and have `CardPeek` keep
  only what is genuinely not part of the shape — the mastery pill and the has-helper/example/audio
  badges.
- **Effort:** M.

### 3. `task_list` re-rendered as an editable list — C
- **Where:** `features/tasks/components/TaskPreviewWindow.tsx:119-433` (rows at `:295-345`).
- **See it:** open a tasks artifact in canvas (`TasksArtifact.tsx:185`), or `/demos/tasks-widgets`.
- **Damage:** the parsed `TaskItemType[]` (the same array `TaskChecklist` renders) is re-laid-out by
  hand with section headers, indent maths, and per-row inputs — a second nesting/indent
  implementation to keep in sync. Secondary: it uses a bare `<select>` rather than the UI select.
- **Fix:** add an `editable` mode to `TaskChecklist` (rename / priority / include-toggle emitted
  upward), then compose it here. Only the project/scope pickers and the create action stay.
- **Effort:** L.

### 4. Flashcard set editor is a bespoke editable copy — C
- **Where:** `features/flashcards/components/editor/EditSetView.tsx:477-760` (`CardEditor`),
  consumed at `:428`.
- **See it:** `/education/flashcards/<setId>/edit`.
- **Damage:** add / delete / reorder / preview for the `flashcard` shape live outside the kind
  component, so the editing affordances the law says belong IN `FlashcardItem` exist only on this
  one route. The Preview toggle re-implements a face renderer a third time
  (`ConfigurableMarkdownContent` in a `min-h-[76px]` box).
- **Not the known Tailwind failure mode:** the textareas are `rows={3}` + `resize-y`, so prose is
  not crushed into one line. Do not "fix" that; the defect here is location, not sizing.
- **Fix:** move editing into `FlashcardItem` (`editable` + `onCardChange`, mirroring
  `PageBriefBlock`'s `editable` + `onBriefChange`), and let the reorder/delete/add chrome stay in
  `EditSetView` as the set-level owner.
- **Effort:** L.

### 5. `task_list` re-rendered a second time in the import dialog — B/C
- **Where:** `features/tasks/components/ImportTasksModal.tsx:248-296` (`renderTaskTree`).
- **See it:** any chat message with a task list → "Import to tasks" (opened by `TaskChecklist`,
  `ProgressTrackerBlock`, `TroubleshootingBlock`, `TimelineBlock`).
- **Damage:** a third rendering of the same tree — and it is opened *from* the canonical components,
  so a user sees the canonical list and then a hand-made one of the same data in the dialog. Also
  uses raw `text-gray-*` / `bg-gray-*` instead of semantic tokens (log as a colour-token patrol
  sighting when touched).
- **Fix:** once #3 lands, this dialog consumes the same selectable `TaskChecklist` mode.
- **Effort:** M (after #3).

### 6. Two orphan full copies of the `math_problem` renderer — A (dead code)
- **Where:** `features/math/components/MathGo.tsx`, `features/math/components/MathProblemG.tsx`.
- **See it:** nowhere — zero importers repo-wide (only reference is a lint-debt report line).
- **Damage:** two complete alternate `math_problem` renderers sitting beside the real one
  (`MathProblemImpl` behind `MathProblem`, which `MathProblemArtifact` and
  `/education/subjects/quick-math/<id>` both use). The next agent asked to "fix the math problem
  view" has a one-in-three chance of editing a dead file.
- **Fix:** delete both; confirm with `pnpm type-check` and a repo grep.
- **Effort:** XS.

## Adjacent findings (not law violations — no registered kind involved)

- **Unregistered `__kind` slugs with hand-written renderers.** `study_summary`
  (`features/education/convert/generators/summary.ts:76`, rendered by
  `features/education/onboard/components/SummaryDetail.tsx:70`) and `memory_aid`
  (`features/education/memory/components/MemoryAidView.tsx`) both write a `__kind` into
  `study_media.ir_envelope` but are not in the registry, so they can never stream in chat or reach a
  kind component. Registering them is the fix; the current renderers become the kind components.
- **Gray area, needs Arman's ruling, not an agent's.** (a) `features/education/assessment/**`
  renders `education.assessment_item` rows (question / options / correct_answer / explanation) —
  the `quiz_set` shape plus grading, attempts and trust. (b)
  `features/marketing/search-console/components/classification/KeywordClassificationWorkspace.tsx`
  is a thousand-row table over the persisted classification columns whose kind
  (`keyword_classification_v1`) renders as cards. Both are persisted entities with lifecycles rather
  than re-rendered envelopes, and both already share the canonical child chips where they exist.
  Neither should be "fixed" without a decision.
- **Two dispatch tables for canvas artifacts.** `features/canvas/core/CanvasRenderer.tsx:342-520`
  keeps a legacy `switch` beside `features/canvas/artifact-types/artifact-renderers.tsx`'s
  `RENDERERS` map. Both delegate to the canonical components, so no shape is duplicated — but the
  routing is, and the file's own comment says the switch is meant to retire.

## Decisions needed

**Situation.** The assessment engine (quiz-taking, grading, mastery) and the keyword-classification
table each render data that matches a registered shape's fields, but they are database entities with
their own lifecycle, not agent output being re-displayed. Folding them onto the kind components
would mean the kind components grow grading, attempts and server-side pagination.

**Decide.** Either (a) they are out of scope — the law covers rendering a kind *instance*, not any
table whose columns happen to match — and that sentence gets added to the law; or (b) they are in
scope and get scheduled as their own projects. Nothing else in this sweep depends on the answer.
