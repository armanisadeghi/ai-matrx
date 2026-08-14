# P8 — Real loading states

- Run date: 2026-08-14
- Run kind: scheduled structural-novelty run plus a fresh full-repository pass
- Authority: mixed Tier M / Tier R under the dedicated `real-loading-states` skill
- Scan-start commit: `3a650ee9a6de6c29c4c8a382c678469c2b61f80e`
- Worktree: isolated Codex worktree `b336`; clean and equal to `origin/main` before mutation

## Scope scanned

- Ran the exact P8 detector over all `.tsx`/`.jsx` UI source under `app`, `components`, `features`, `lib`, `hooks`, `providers`, and `utils`.
- Pre-edit detector baseline: 183 matching lines in 159 files.
- Re-verified the open P8 sighting and every one of the 83 historical files carried from the 2026-08-12 report rather than trusting the old classification.
- Performed a full pass even though the prior monthly pass was only four days old, so this report replaces the 2026-08-10 structural baseline.
- Structural novelty since 2026-08-10: route leaves changed from 1,040 to 1,007; top-level feature directories remained 121; the signature-bearing file set only shrank. There were no newly added P8 signature files.
- Reviewed rendered context for all required exclusion classes: ARIA-only text; comments/docs; copied diagnostic data; contextual operation labels; component-library spinners, skeletons, shimmer, and pulse indicators; and error/empty-state copy.

## Approval routing and findings

- Verified findings: **83 files**.
- Auto-approved and fixed now: **3 files**.
- Manual approval requested: **12 files**.
- Backlog retained: **68 files** — 32 compact/control or identity cases still lack a verified direct primitive mapping, and 36 page/panel/list/tree/editor/preview cases need a surface-shaped skeleton or chunk-boundary decision.
- Excluded as compliant or false positive: the other 76 post-fix signature files. These render an existing component-library loader/skeleton or contextual indicator, are ARIA-only, are comments/docs/diagnostics, or contain the term only in non-loading error/empty/copy data.
- Resolved before this run: `features/agents/components/agent-listings/AgentSneakPeekModal.tsx` no longer contains the P8 signature.

### Auto-approved and fixed

Every automatic gate held: each literal was the sole indicator inside a React Suspense fallback; the existing wrapper, dimensions, theme classes, boundary, data/control flow, and chunk entry stayed unchanged; the canonical lightweight static import fit directly; messages are deterministic; the worktree had no overlapping edit; and the batch was three files.

- `app/(admin)/administration/ai/ai-models/provider-sync/page.tsx` → `Loading model provider sync…`
- `features/agents/agent-creators/interactive-builder/ComprehensiveBuilder.tsx` → `Loading agent builder section…`
- `features/agents/agent-creators/tabbed-builder/MainPromptBuilder.tsx` → `Loading prompt builder section…`

Each wrapper now renders `SuspenseLoader centered={false}` with one polite live status. No shared primitive changed.

### Manual approval requested

These 12 compact states have direct React-node slots and deterministic nouns, so the problem is certain, the safe fix is known, and the repair is worthwhile. Approval would authorize only replacing the bare child with `SuspenseLoader centered={false}` and the message shown below, preserving the owning wrapper, dimensions, data/control flow, interaction, theme, viewport behavior, and chunk entry. They fit one bounded 12-file Tier-M batch and would receive the same static, scoped, representative-browser, and adversarial certification.

- `components/admin/server-logs/CoolifyLogViewer.tsx` → `Loading server logs…`
- `features/agent-apps/components/inputs/AgentAppCategoryPicker.tsx` → `Loading app categories…`
- `features/agent-apps/components/inputs/AgentVersionCompact.tsx` → `Loading agent versions…`
- `features/code/terminal/SandboxLogsView.tsx` → `Loading sandbox logs…`
- `features/code/views/explorer/FileTreeNode.tsx` → `Loading folder contents…`
- `features/code/views/library/SourceFolderNode.tsx` → `Loading source folder…`
- `features/code/views/sandboxes/SandboxDiagnosticsPanel.tsx` → `Loading environment variables…`
- `features/files/webhooks/components/WebhooksManager.tsx` → `Loading webhook deliveries…`
- `features/marketing/components/sites/SitePeekWindow.tsx` → `Loading top pages…`
- `features/marketing/seo/keyword-research/components/KeywordResearchWorkbench.tsx` → `Loading keyword library…`
- `features/settings/pages/SandboxStorageSettingsPage.tsx` → `Loading sandbox storage…`
- `features/tool-registry/executor-surfaces/components/ExecutorSurfaceDetailPanel.tsx` → `Loading tool bindings…`

### Backlog retained — compact/control/identity mapping not yet proven (32 files)

These are certain bare-loading states, but the exact safe primitive mapping is not yet proven: many sit in string-only props, select placeholders, button pending text, or identity/title slots where inserting an inline loader could alter geometry or require extending a shared control. A focused mapping pass must name the owning primitive and settled geometry before any approval request.

- `app/(admin)/administration/users/email/page.tsx`
- `app/(admin)/administration/users/feedback/components/FeedbackDetailDialog.tsx`
- `app/(auth-pages)/login/page.tsx`
- `app/(auth-pages)/sign-up/page.tsx`
- `app/(dev)/demos/api-tests/tool-testing/ToolTestingClient.tsx`
- `app/(dev)/demos/context-menu/launch-inspector/page.dev.tsx`
- `app/(dev)/demos/json-block-detector/page.dev.tsx`
- `app/(dev)/demos/scopes/context-lab/dense/page.dev.tsx`
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

### Backlog retained — surface-shaped skeleton/design required (36 files)

These replace page, panel, list, tree, editor, preview, or identity content. The skill forbids inventing a skeleton during a patrol. Several also sit in `next/dynamic` loading callbacks, so any repair must first use the `code-splitting` skill and prove that chunk entry remains unchanged.

- `app/(core)/cms/html-pages/[pageId]/page.tsx`
- `app/(core)/data/[id]/DataTableDetailClient.tsx`
- `app/(core)/sandbox/[id]/page.tsx`
- `app/(dev)/demos/agent-selector-demo/page.dev.tsx`
- `app/(dev)/demos/general/fetch-react/HtmlDisplay.tsx`
- `app/(dev)/demos/tests/tailwind-test/color-converter/components/ColorInput.tsx`
- `components/mardown-display/blocks/json/JsonBlock.tsx`
- `components/mardown-display/chat-markdown/EnhancedChatMarkdown.tsx`
- `components/mardown-display/chat-markdown/internal-handlers/SafeBlockRenderer.tsx`
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

## Structural baseline for the next run

- Route-tree baseline: 1,007 tracked `page.tsx` / `page.dev.tsx` leaves; sorted path-list SHA-256 `4bb37671087282c6b408b8a496278ae6cf01952cb7522f1f9281ef443d51bfb7`.
- P8 signature baseline: 156 files; sorted path-list SHA-256 `ab8a4ee320f9a1b866bb60d8264ad6b8546bc8c5a4a47410bcbc00f1ba3812a8`.
- Feature-directory baseline: 121 top-level directories; sorted basename SHA-256 `b7fe66d584074bd0df19cd37f41cb65f8b4ae6415e7864ca558fe6592a0cb52a`.
- Open verified P8 inventory: 80 files — 12 awaiting manual approval and 68 retained with the missing mapping/design evidence above.
- Next non-monthly run: compare structural route/signature/feature sets, verify the open P8 ledger item, auto-fix only the exact Suspense class, and keep the three approval routes separate.
- Next monthly run: repeat the full repository pass regardless of structural deltas.

## Cadence health and candidates

- The preceding month contains only the 2026-08-10 findings pass and the 2026-08-12 approved repair batch; it is not an all-clean month, so no longer cadence is proposed.
- No repeated batch-caused P8 rejection exists, so mutation is not paused.
- No new unregistered recurring class was found; no Candidate-bench nomination was added.
- The certifier observed a separate P3 mobile defect on provider-sync (compressed/overlapping header at 375×812). It was not caused or touched by P8 and is logged as an open P3 sighting.
