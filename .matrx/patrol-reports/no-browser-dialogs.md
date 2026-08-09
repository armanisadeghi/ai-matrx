# P7 — No browser dialogs

- Run date: 2026-08-09
- Run kind: first run; required full-repository pass
- Registry scope: full repository every run
- Prior-month loop health: no prior P7 reports or automation memory existed

## Scope scanned

- Full repository scan with the registry expressions `window\.(confirm|alert|prompt)\s*\(` and bare `confirm(`/`alert(`/`prompt(` forms.
- Executable-code triage across `app/`, `components/`, `features/`, and `lib/` with ESLint scope resolution (`no-restricted-globals`, `no-alert`, `no-restricted-properties`).
- Open P7 ledger sighting independently verified; its two-file count was stale.
- Generated output, dependencies, and build output were excluded; no generated file was touched.

## Detection and triage baseline

- Raw explicit `window.*` scan: 3 textual matches in 3 files; all are documentation/comments describing approved replacements, so 0 executable findings.
- Raw bare-form scan: 314 textual matches in 237 files; 243 matches in 187 TypeScript/JavaScript files.
- Scope-aware executable findings before mutation: 48 calls in 34 files — 31 `alert`, 16 `confirm`, 1 `prompt`.
- Scope-aware executable findings after Batch 1: 44 calls in 32 files — 27 `alert`, 16 `confirm`, 1 `prompt`.
- False positives triaged: the approved imported `confirm({...})` host primitive; locally declared `confirm` callbacks/functions; prose, comments, and API/domain uses of “prompt”; fixtures such as safe-HTML and `javascript:alert(1)` strings.

## Findings and outcomes

- Total findings: 34 files (48 executable calls).
- Fixed: 2 files (4 executable `alert` calls) in one Tier M batch.
- Remaining: 32 files (44 calls).
- Tier M backlog: 27 `alert` calls in 18 files, eligible for later small `toast` batches after independent certification.
- Tier R backlog: 16 synchronous `confirm` calls in 14 files; converting them changes control-flow/interaction semantics and needs surface-specific review.
- Tier R backlog: 1 `prompt` call in 1 file; replacing it with `TextInputDialog` requires state and secure-token UX judgment.

## Tier M Batch 1 — code-editor HTML page errors

- `features/code-editor/components/code-block/MultiFileCodeEditor.tsx`
- `features/code-editor/multi-file-core/useCodeEdiorBasics.ts`
- Transformation: four blocking `alert(...)` error messages became `toast.error(...)` through the existing captured `@/lib/toast` primitive. Guards, text, return behavior, and `finally` cleanup are unchanged.
- Main-agent checks: `pnpm type-check` PASS; `pnpm check:migrations` PASS; changed-file P7 warnings removed. Five changed-file ESLint errors are pre-existing and unrelated (confirmed independently against `HEAD`).
- Certifier verdict: **CERTIFIED** — second adversarial agent passed type-check, doctrine, tsconfig, and UI-primitives gates; found no P7 false positives in the batch; checked 1440×900 and 390×844 in light and dark with no runtime/overflow regression. A pre-existing collapsed-panel defect in `/demos/tests/markdown-tests/tui-tests` prevented safely triggering the final action but is unrelated to the toast-only diff.

## Remaining executable baseline

### Tier M alert candidates

- `app/(admin)/administration/ui/official-components/component-displays/floating-sheet.tsx:329`
- `app/(admin)/administration/ui/official-components/component-displays/placeholder.tsx:46`
- `app/(admin)/administration/ui/official-components/component-displays/simple-card-grid.tsx:195,205,223,245`
- `app/(admin)/administration/ui/official-components/component-displays/simple-card.tsx:127`
- `app/(dev)/demos/general/resizable-demo/resizable-builder/page.dev.tsx:344,347`
- `app/(dev)/demos/settings-primitives/page.dev.tsx:342,350,357`
- `app/(dev)/demos/tests/_maps/components/SearchControl.tsx:84,88`
- `app/(dev)/demos/tests/google-apis/search-console/components/DataTable.tsx:146`
- `app/(dev)/demos/tests/slack/with-brokers/components/BrokerForm.tsx:150`
- `components/mardown-display/blocks/common/ContentBlockWrapper.tsx:138`
- `components/mardown-display/blocks/math/MathProblemBlock.tsx:61`
- `components/mardown-display/blocks/quiz/QuizSessionList.tsx:52`
- `components/mardown-display/chat-markdown/tui/TuiEditorContent.tsx:345`
- `components/mardown-display/markdown-classification/custom-views/view-components/LsiKeywordView.tsx:520`
- `components/mardown-display/markdown-classification/custom-views/view-components/ModernCandidateProfileView.tsx:207`
- `components/mardown-display/markdown-classification/custom-views/view-components/ModernKeywordAnalyzerView.tsx:440`
- `components/mardown-display/markdown-classification/custom-views/view-components/ModernOneColumnProfile.tsx:250`
- `features/html-pages/components/HtmlPreviewModal.tsx:385,390,437`

### Tier R confirm candidates

- `app/(admin)/administration/compute/sandbox-infra/page.tsx:360`
- `app/(transitional)/_apps/app-builder/applets/[id]/edit/components/EditTabLayout.tsx:50,81`
- `app/(transitional)/_apps/app-builder/apps/[id]/edit/components/AppletsEditTab.tsx:39`
- `app/(transitional)/_apps/app-builder/apps/[id]/edit/components/EditTabLayout.tsx:44,74`
- `app/(transitional)/_apps/app-builder/apps/[id]/edit/components/LegacyEditorTab.tsx:28`
- `app/(transitional)/_apps/app-builder/containers/[id]/ContainerDetailLayoutClient.tsx:47`
- `app/(transitional)/_apps/app-builder/fields/[id]/FieldDetailLayoutClient.tsx:45`
- `app/(transitional)/_apps/builder/unified-concept/field-builder/FieldComponentsList.tsx:39`
- `components/admin/query-history/query-history-overlay.tsx:300`
- `components/mardown-display/blocks/quiz/QuizSessionList.tsx:44`
- `components/user-generated-table-data/RowOrderingModal.tsx:238`
- `features/applet/builder/modules/field-builder/FieldComponentsList.tsx:92`
- `features/applet/builder/modules/field-builder/PrimaryFieldBuilder.tsx:122`
- `features/canvas/core/SavedCanvasItems.tsx:322`

### Tier R prompt candidate

- `app/(dev)/demos/tests/slack/page.dev.tsx:54`

## Cadence health and candidates

- This is the first P7 run, so there is no preceding month of clean runs and no cadence-lengthening proposal.
- No repeated rejected batches exist; mutation remains active.
- No recurring unregistered class was observed, so no Candidate-bench nomination was added.
