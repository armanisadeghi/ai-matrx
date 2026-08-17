# P8 — Real loading states

- Run date: 2026-08-17
- Run kind: scheduled structural-novelty pass plus open-sighting reconciliation
- Authority: mixed Tier M / Tier R under the dedicated `real-loading-states` skill
- Scan-start commit: `edc63f092`
- Worktree: canonical automation worktree `/Users/armanisadeghi/code/matrx-frontend`; baseline diagnostics captured before mutation

## Scope scanned

- Ran the exact literal detector and the required generic visual-loader scan over `.tsx`/`.jsx` UI source under `app`, `components`, `features`, `lib`, `hooks`, `providers`, and `utils`.
- Structural novelty since the prior baseline: 42 route leaves added / 8 removed, 8 feature directories added / 2 removed, 9 newly added literal-signature files, and 134 newly added generic visual-signature files.
- Pre-edit literal baseline: 175 matching lines in 152 files. Post-fix baseline: 145 files.
- Re-verified the open `SafeBlockRenderer` sighting and all 68 retained backlog paths. One prior compact path and `SafeBlockRenderer` no longer remain findings; two new string-only control cases enter the missing-machinery backlog.
- Reviewed exclusions rather than counting raw signatures: contextual button/status spinners, established surface-shaped skeletons, ARIA labels, active-element navigation overlays, comments, and diagnostic copy remain compliant.

## Approval routing and findings

- Verified findings in current scope: **19 files**.
- Standing-authority fixes: **17 files / 19 callsites**, split into independently certified 15-file and 2-file batches.
- Genuine human decisions required: **0**.
- Backlog retained: **68 files** — 33 compact/control or identity cases still lack a verified owning-control mapping, and 35 page/panel/list/tree/editor/preview cases need a proven surface-shaped skeleton or chunk-boundary decision.
- Excluded as compliant or false positive: `ChaseboxPage.tsx`'s detector match is comment-only; `PipelineStageNode.tsx` is an active-node transition overlay with exact context; the remaining reviewed visual signatures are contextual or established component-library states.

### Standing-authority fixes

Every repair uses the existing canonical `SuspenseLoader` with a deterministic user-facing noun. Existing wrappers, dimensions, loading conditions, theme/responsive behavior, and chunk entry are unchanged; the two `next/dynamic` fallbacks keep their original single boundaries.

- `SystemErrorsPanel.tsx` → `Loading system errors…`
- `AgentIODetails.tsx` → `Loading agent inputs…` / `Loading agent output…`
- `GitHubConnectionCard.tsx` → `Loading GitHub account…`
- `LandscapeBriefCard.tsx` → `Loading competitor landscape…`
- `PlanContextPanel.tsx` → `Loading target keyword…`
- `ResearchUsedBy.tsx` → `Loading research usage…`
- `SafeBlockRenderer.tsx` → `Loading content…`
- Bing callback page → `Loading Bing connection…`
- workflow-runtime demo → `Loading workflow views…` / `Loading workflow runtime…`
- Hindsight page → `Loading hindsight workspace…`
- `OrchestraBuilder.tsx` → `Loading orchestra builder…`
- `PipelineGraph.tsx` → `Loading research plan…`
- `MandateOverridesPage.tsx` → `Loading mandate overrides…`
- `OrchestraRunPanel.tsx` → `Loading orchestra run…`
- `AddToOrchestraDialog.tsx` → `Loading orchestras…`
- `MandateAgentPicker.tsx` → `Loading mandate details…`
- `OrchestraBuilderCanvas.tsx` → `Loading orchestra canvas…`

### Backlog retained — compact/control/identity mapping not yet proven (33 files)

These are certain bare-loading states, but the exact safe primitive mapping is not yet proven: many sit in string-only props, select placeholders, button pending text, or identity/title slots where inserting an inline loader could alter geometry or require extending a shared control. A focused mapping pass must name the owning primitive and settled geometry before any approval request.

- `app/(admin)/administration/users/email/page.tsx`
- `app/(admin)/administration/users/feedback/components/FeedbackDetailDialog.tsx`
- `app/(auth-pages)/login/page.tsx`
- `app/(auth-pages)/sign-up/page.tsx`
- `app/(dev)/demos/api-tests/tool-testing/ToolTestingClient.tsx`
- `app/(dev)/demos/context-menu/launch-inspector/page.dev.tsx`
- `app/(dev)/demos/json-block-detector/page.dev.tsx`
- `app/(dev)/demos/tests/slack/components/SlackManager.tsx`
- `app/(public)/free/data-truncator/page.tsx`
- `components/admin/EmailComposeSheet.tsx`
- `features/agent-shortcuts/components/next/CompactVersionPicker.tsx`
- `features/agent-shortcuts/components/next/SurfacePicker.tsx`
- `features/agent-shortcuts/components/ShortcutQuickCreateBody.tsx`
- `features/agent-shortcuts/components/ShortcutScopePicker.tsx`
- `features/agents/components/diff/AgentComparisonPage.tsx`
- `features/agents/components/settings/AgentSettingsWorkspace.tsx`
- `features/ai-models/components/smart/SmartModelSelect.tsx`
- `features/canvas/components/CanvasArtifactDebugPanel.tsx`
- `features/files/components/core/FileEditor/CloudFileEditor.tsx`
- `features/files/components/surfaces/PreviewPane.tsx`
- `features/files/components/surfaces/single-file/SingleFileTopBar.tsx`
- `features/page-extraction/components/ChunkingConfigForm.tsx`
- `features/page-extraction/data-review/ExtractionDatasetClient.tsx`
- `features/podcasts/components/admin/EpisodeDetailClient.tsx`
- `features/podcasts/components/admin/ShowDetailClient.tsx`
- `features/rag/components/documents/DocumentViewer.tsx`
- `features/rag/components/library/PageContentHeader.tsx`
- `features/scope-system/components/ContextItemPicker.tsx`
- `features/scopes/components/quick-assign/ScopeContextTargetPicker.tsx`
- `features/secrets/components/VaultItemDetail.tsx`
- `features/surfaces/components/ManifestDriftDialog.tsx`
- `features/crm/components/outreach-start/CrmFoldControl.tsx`
- `features/sms/components/SmsAssistantSettingsSection.tsx`

### Backlog retained — surface-shaped skeleton/design required (35 files)

These replace page, panel, list, tree, editor, preview, or identity content. The skill forbids inventing a skeleton during a patrol. Several also sit in `next/dynamic` loading callbacks, so any repair must first use the `code-splitting` skill and prove that chunk entry remains unchanged.

- `app/(core)/cms/html-pages/[pageId]/page.tsx`
- `app/(core)/data/[id]/DataTableDetailClient.tsx`
- `app/(core)/sandbox/[id]/page.tsx`
- `app/(dev)/demos/agent-selector-demo/page.dev.tsx`
- `app/(dev)/demos/general/fetch-react/HtmlDisplay.tsx`
- `app/(dev)/demos/tests/tailwind-test/color-converter/components/ColorInput.tsx`
- `components/mardown-display/blocks/json/JsonBlock.tsx`
- `components/mardown-display/chat-markdown/EnhancedChatMarkdown.tsx`
- `components/matrx/resizable/NestedResizableWithHeaderFooter.tsx`
- `components/message-display/MessageContentDisplay.tsx`
- `components/official-candidate/json-inspector/JsonInspector.tsx`
- `components/official-candidate/voice-pad/components/VoicePadHistorySidebar.tsx`
- `features/agent-apps/components/shells/AgentAppChatShell.tsx`
- `features/agent-apps/components/shells/AgentAppFormToResultShell.tsx`
- `features/agent-apps/components/shells/AgentAppWidgetShell.tsx`
- `features/agent-apps/route/AgentAppSettingsContent.tsx`
- `features/agent-shortcuts/components/batch/BatchSurfaceSelector.tsx`
- `features/agent-shortcuts/components/ShortcutList.tsx`
- `features/agents/ui-first-tools/ui/lists/ListsHubView.tsx`
- `features/code/views/explorer/FileTree.tsx`
- `features/code/views/library/LibraryTree.tsx`
- `features/cx-chat/components/SsrSidebarAgents.tsx`
- `features/dictionary/components/DictionaryManager.tsx`
- `features/files/blocks/image/UnifiedImageBlockRenderer.tsx`
- `features/files/components/core/FilePreview/FilePreview.tsx`
- `features/rag/components/documents/panes/ChunksPane.tsx`
- `features/rag/components/documents/panes/CleanedMarkdownPane.tsx`
- `features/rag/components/documents/panes/RawTextPane.tsx`
- `features/rag/components/library/LibraryPreviewPage.tsx`
- `features/recipes/components/RecipeEditContent.tsx`
- `features/recipes/components/RecipeViewContent.tsx`
- `features/structured-lists/StructuredListManagerV2.tsx`
- `features/surfaces/components/SurfaceDetailPanel.tsx`
- `features/surfaces/components/SurfaceValuesTable.tsx`
- `features/transcript-studio/components/scribe/ScribeScreen.tsx`

## Verification and certification

### 2026-08-17 structural-novelty batches

- First exact candidate `d82ac5e38275c1b1a4b216e314d0169c749f264a`: **CERTIFIED** by `/root/p8_exact_certifier`; 17 callsites across 15 files. Type-check, patrol contracts, Prettier, diff check, and batch-delta lint passed. All four scoped lint errors reproduce on base `458decd82` and are unchanged debt. Representative Bing callback smoke returned HTTP 200, rendered the final DOM, and emitted no console warning/error; transient fallback markup was verified statically.
- Follow-up exact candidate `78cac960bd795942b590b9240449856235818a5e`: **CERTIFIED** by `/root/p8_exact_certifier`; 2 callsites across 2 files. Type-check, patrol contracts, Prettier, diff check, and scoped lint all passed. The picker lazy-open flow and geometry are unchanged; the canvas retains one `next/dynamic({ ssr: false })` boundary and its full-size wrapper.
- The first candidate is delivered on `origin/main` and recorded in permanent run `ba129be4-5d09-40b0-a8bb-4a0eb77fdc26`. The follow-up is integrated on `origin/main`; its permanent run `ff48b527-3733-47e8-9f33-1dc4e326cfe2` is awaiting the serialized release projection before its final `delivered` event.
- Managed preview used the exact automation checkout and enforced lease. The core route compiled at 187.4 GB under the 192 GB cap. No cap termination occurred during proof.

### Delivered 3-file batch

- Immutable pre-edit baseline: clean status; `pnpm type-check` PASS; `pnpm check:doctrine` PASS; exact detector 183 lines / 159 files.
- Post-edit `pnpm type-check`: PASS.
- Post-edit `pnpm check:doctrine`: PASS.
- `git diff --check`: PASS.
- Changed-file P8 detector: PASS; zero bare literals remain in the three repaired files.
- Full detector after repair: 180 matching lines in 156 files.
- Scoped ESLint: `ComprehensiveBuilder` clean. The provider page's `react-hooks/set-state-in-effect` error and `MainPromptBuilder`'s legacy explicit-`any` warning reproduce exactly against `HEAD` via stdin, so both are unchanged baseline debt.
- Static SSR proof for both wrapper classes: existing wrapper classes unchanged; one `role="status"` / `aria-live="polite"`; spinner `aria-hidden="true"`; contextual visible text.
- Managed preview was owned by this exact worktree. Mobile-dark representative checks passed the provider and builder risk classes with no new overflow, bare loading text, or console error. The fallback itself settles too quickly (and the current children do not suspend), so exact fallback markup was verified statically.
- The preview later exceeded the mandatory 8 GB process-group cap while compiling another route (17.9–19.0 GB reported) and was stopped. This happened after proof and is infrastructure evidence, not a product regression.
- Independent adversarial certifier verdict: **CERTIFIED** — no batch-caused defect found.
- `pnpm check:migrations`: completed with a non-blocking unrelated baseline warning for three drifted migration files; this batch contains no migration or generated file.

### 12-file standing-authority follow-up

- Focused P8 literal detector: PASS; no bare `Loading…` literal remains in the 12 changed files.
- Changed-file TypeScript diagnostics: PASS; the current full repository type-check also passes.
- `git diff --check`: PASS.
- Manifest tests: 6/6 PASS; repository and live automation contract validation PASS.
- Independent adversarial certification: **CERTIFIED** for exact candidate `e67fb5fd9b3820fc76962879ce1f43ab5b75b97a`. The reviewer inspected all 12 files / 14 repaired callsites, found no control-flow, wrapper, responsive, theme, or chunk-entry change, and repeated the focused detector, diff, type, manifest, and record checks.
- Delivery: candidate ancestry is preserved by integration commit `fe22be55481e9ffb29318261a888444aabd6c08a`; `v0.4.702` is the first containing release. The durable authority ref is `refs/heads/patrol-runs/P8/01a0009c-dfb8-7991-a488-441139eb6a50`.

## Structural baseline for the next run

- Route-tree baseline: 1,041 tracked `page.tsx` / `page.dev.tsx` leaves; sorted path-list SHA-256 `4bd3aa12fd3419b593d0547eacbab9796c96560aaaa20fa0604121ec350eebc3`.
- P8 literal-signature baseline: 145 files; sorted path-list SHA-256 `277c61b6934be67f953da27277654c759571942b678ea7445cd2b9a106172f02`.
- Feature-directory baseline: 127 top-level directories; sorted basename SHA-256 `f052952a00d278ac20fa8f06cdb4790dfb3168658992f3c9f0cbdd7a0e9de28a`.
- Open verified P8 inventory: 68 files retained with the missing mapping/design evidence above; no human approval is pending.
- Next non-monthly run: compare structural route/signature/feature sets, re-verify the open inventory, and prioritize extending the owning select/read-only-field primitives for the two string-only cases.
- Next monthly run: repeat the full repository pass regardless of structural deltas.

## Cadence health and candidates

- The preceding month contains only the 2026-08-10 findings pass and the 2026-08-12 approved repair batch; it is not an all-clean month, so no longer cadence is proposed.
- No repeated batch-caused P8 rejection exists, so mutation is not paused.
- No new unregistered recurring class was found; no Candidate-bench nomination was added.
- Recursive learning: central bare spinners inside React-node slots are safely auto-fixable when the wrapper and size are preserved; the smallest detector improvement is to distinguish those from string-only props so future runs do not spend the same manual triage effort.
- The certifier observed a separate P3 mobile defect on provider-sync (compressed/overlapping header at 375×812). It was not caused or touched by P8 and is logged as an open P3 sighting.
