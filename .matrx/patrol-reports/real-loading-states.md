# P8 — Real loading states

- Run date: 2026-08-10
- Run kind: first run; required full-repository pass
- Authority: Tier R only because the P8 fix skill is absent
- Prior-month loop health: no prior P8 report, Git history, or automation memory existed

## Scope scanned

- Full repository scan across tracked UI source under `app/`, `components/`, `features/`, `lib/`, `hooks/`, `providers/`, and `utils/` (`.tsx`/`.jsx`).
- Registry expression: case-insensitive word-boundary `Loading...` / `Loading…` (`\bloading\s*(\.\.\.|…)`). Word boundaries intentionally exclude `Uploading…` and `Downloading…`.
- All 6,914 UI source files were eligible. The scan returned 196 textual matches in 172 files.
- The P8 sighting ledger had no open entry before this run, so there was no hinted sighting to verify. This report's verified backlog is now linked from one open P8 ledger entry.
- This first run is the required monthly full pass. Generated output, dependencies, build output, and non-UI source types were excluded; no generated file was touched.

## Detection and triage baseline

- Raw signature baseline: 196 matches in 172 files.
- Verified P8 findings: 106 user-visible bare-loading occurrences in 95 files.
- Rank 1 — standard-loader candidates: 45 files. These are compact labels, controls, menus, metadata lines, or bounded status regions where the future P8 skill can specify a canonical component-library loader without designing a surface skeleton.
- Rank 2 — skeleton/design cases: 50 files. These replace page, panel, list, tree, editor, preview, or identity content and require surface-specific skeleton judgment; they remain Tier R even after a mechanical recipe exists.
- Already compliant: 71 files use a spinner, skeleton, pulse indicator with context, or the component-library loading primitive. Examples include `components/ui/loading-spinner.tsx`, `features/marketing/components/shared/MarketingUi.tsx`, and the version selectors whose visible `Loading...` placeholder is paired with a sibling `Loader2`.
- False-positive files: 6 — four comments/docs, one ARIA-only label, and one non-UI copy-data string. Named examples: `features/action-catalog/components/ActionCatalogClient.tsx`, `app/(core)/chat/[conversationId]/page.tsx`, `features/tts/components/SpeakerButton.tsx`, and `features/marketing/components/pages/PageContentCard.tsx`.
- Fixes: 0. The readiness guard forbids mutation until a P8 fix skill defines the only permitted fix style.
- Certifier verdict: **NOT APPLICABLE** — this was a report-only Tier R run with no fix batch.
- Main-agent checks: `pnpm type-check` PASS; `pnpm check:migrations` PASS; `git diff --check` PASS.

## Rank 1 — standard-loader candidates (45 files)

- `app/(admin)/administration/users/email/page.tsx:442`
- `app/(admin)/administration/users/feedback/components/FeedbackDetailDialog.tsx:1228`
- `app/(auth-pages)/login/page.tsx:154,166,178`
- `app/(auth-pages)/sign-up/page.tsx:150,164,178`
- `app/(dev)/demos/api-tests/tool-testing/ToolTestingClient.tsx:417`
- `app/(dev)/demos/context-menu/launch-inspector/page.dev.tsx:400`
- `app/(dev)/demos/json-block-detector/page.dev.tsx:957,1012`
- `app/(dev)/demos/scopes/context-lab/dense/page.dev.tsx:102`
- `app/(dev)/demos/tests/slack/components/SlackManager.tsx:220`
- `app/(public)/free/data-truncator/page.tsx:52`
- `components/admin/EmailComposeSheet.tsx:218`
- `components/admin/server-logs/CoolifyLogViewer.tsx:1420`
- `features/agent-apps/components/inputs/AgentAppCategoryPicker.tsx:157`
- `features/agent-apps/components/inputs/AgentVersionCompact.tsx:135`
- `features/agent-shortcuts/components/next/CompactVersionPicker.tsx:130`
- `features/agent-shortcuts/components/next/SurfacePicker.tsx:116`
- `features/agent-shortcuts/components/ShortcutQuickCreateBody.tsx:76`
- `features/agent-shortcuts/components/ShortcutScopePicker.tsx:271`
- `features/agents/components/agent-listings/AgentSneakPeekModal.tsx:416`
- `features/agents/components/diff/AgentComparisonPage.tsx:370`
- `features/agents/components/settings/AgentSettingsWorkspace.tsx:74`
- `features/ai-models/components/smart/SmartModelSelect.tsx:111`
- `features/canvas/components/CanvasArtifactDebugPanel.tsx:125`
- `features/code/terminal/SandboxLogsView.tsx:194`
- `features/code/views/explorer/FileTreeNode.tsx:627`
- `features/code/views/library/SourceFolderNode.tsx:194`
- `features/code/views/sandboxes/SandboxDiagnosticsPanel.tsx:902`
- `features/files/components/core/FileEditor/CloudFileEditor.tsx:219`
- `features/files/components/surfaces/PreviewPane.tsx:223`
- `features/files/components/surfaces/single-file/SingleFileTopBar.tsx:185`
- `features/files/webhooks/components/WebhooksManager.tsx:320`
- `features/marketing/components/sites/SitePeekWindow.tsx:194`
- `features/marketing/seo/keyword-research/components/KeywordResearchWorkbench.tsx:548`
- `features/page-extraction/components/ChunkingConfigForm.tsx:797`
- `features/page-extraction/data-review/ExtractionDatasetClient.tsx:614,757`
- `features/podcasts/components/admin/EpisodeDetailClient.tsx:83`
- `features/podcasts/components/admin/ShowDetailClient.tsx:169`
- `features/rag/components/documents/DocumentViewer.tsx:169`
- `features/rag/components/library/PageContentHeader.tsx:364`
- `features/scope-system/components/ContextItemPicker.tsx:160`
- `features/scopes/components/quick-assign/ScopeContextTargetPicker.tsx:223`
- `features/secrets/components/VaultItemDetail.tsx:1686`
- `features/settings/pages/SandboxStorageSettingsPage.tsx:150`
- `features/surfaces/components/ManifestDriftDialog.tsx:577`
- `features/tool-registry/executor-surfaces/components/ExecutorSurfaceDetailPanel.tsx:256`

## Rank 2 — skeleton/design cases (50 files)

- `app/(admin)/administration/ai/ai-models/aliases/page.tsx:14`
- `app/(admin)/administration/ai/ai-models/deprecated-audit/page.tsx:10`
- `app/(admin)/administration/ai/ai-models/endpoints/page.tsx:10`
- `app/(admin)/administration/ai/ai-models/offerings/page.tsx:14`
- `app/(admin)/administration/ai/ai-models/page.tsx:10`
- `app/(admin)/administration/ai/ai-models/provider-sync/page.tsx:59`
- `app/(admin)/administration/ai/ai-models/providers/page.tsx:10`
- `app/(admin)/administration/ai/ai-models/settings/page.tsx:14`
- `app/(admin)/administration/knowledge/podcasts/shows/[showId]/episodes/[episodeId]/page.tsx:14`
- `app/(admin)/administration/knowledge/podcasts/shows/[showId]/page.tsx:14`
- `app/(admin)/administration/knowledge/podcasts/shows/new/page.tsx:11`
- `app/(admin)/administration/knowledge/podcasts/shows/page.tsx:14`
- `app/(core)/cms/html-pages/[pageId]/page.tsx:108`
- `app/(core)/data/[id]/DataTableDetailClient.tsx:46`
- `app/(core)/sandbox/[id]/page.tsx:310`
- `app/(dev)/demos/agent-selector-demo/page.dev.tsx:439`
- `app/(dev)/demos/general/fetch-react/HtmlDisplay.tsx:36`
- `app/(dev)/demos/tests/tailwind-test/color-converter/components/ColorInput.tsx:108`
- `components/mardown-display/blocks/json/JsonBlock.tsx:69`
- `components/mardown-display/chat-markdown/EnhancedChatMarkdown.tsx:865`
- `components/mardown-display/chat-markdown/internal-handlers/SafeBlockRenderer.tsx:13`
- `components/matrx/resizable/NestedResizableWithHeaderFooter.tsx:49`
- `components/message-display/MessageContentDisplay.tsx:24,94,120`
- `components/official-candidate/json-inspector/JsonInspector.tsx:43`
- `components/official-candidate/voice-pad/components/VoicePadHistorySidebar.tsx:32`
- `features/agent-apps/components/shells/AgentAppChatShell.tsx:122`
- `features/agent-apps/components/shells/AgentAppFormToResultShell.tsx:87`
- `features/agent-apps/components/shells/AgentAppWidgetShell.tsx:81`
- `features/agent-apps/route/AgentAppSettingsContent.tsx:263`
- `features/agent-shortcuts/components/batch/BatchSurfaceSelector.tsx:188,195`
- `features/agent-shortcuts/components/ShortcutList.tsx:452`
- `features/agents/agent-creators/interactive-builder/ComprehensiveBuilder.tsx:126`
- `features/agents/agent-creators/tabbed-builder/MainPromptBuilder.tsx:104`
- `features/agents/ui-first-tools/ui/lists/ListsHubView.tsx:128`
- `features/code/views/explorer/FileTree.tsx:189`
- `features/code/views/library/LibraryTree.tsx:92`
- `features/cx-chat/components/SsrSidebarAgents.tsx:293`
- `features/dictionary/components/DictionaryManager.tsx:209`
- `features/files/blocks/image/UnifiedImageBlockRenderer.tsx:859`
- `features/files/components/core/FilePreview/FilePreview.tsx:234`
- `features/rag/components/documents/panes/ChunksPane.tsx:66`
- `features/rag/components/documents/panes/CleanedMarkdownPane.tsx:46`
- `features/rag/components/documents/panes/RawTextPane.tsx:45`
- `features/rag/components/library/LibraryPreviewPage.tsx:254`
- `features/recipes/components/RecipeEditContent.tsx:148`
- `features/recipes/components/RecipeViewContent.tsx:44`
- `features/structured-lists/StructuredListManagerV2.tsx:429,1232`
- `features/surfaces/components/SurfaceDetailPanel.tsx:438,504`
- `features/surfaces/components/SurfaceValuesTable.tsx:139`
- `features/transcript-studio/components/scribe/ScribeScreen.tsx:297`

## Structural baseline for the next run

- Scan-start commit: `a8b72e87857ac1d41b7d9003288540a09b56cd11`.
- Route-tree baseline: 1,040 tracked `page.tsx` / `page.dev.tsx` leaves; sorted path-list SHA-256 `d7945e804596dc2c09f6020b232da717d7c8bba98587dcdc44c7219fcf729beb`.
- P8 signature-file baseline: 172 files; sorted path-list SHA-256 `45adb5b2a6d51c83f4689b65238c7af90604cc18bf177869aa80a699c03f66b3`.
- Feature-directory reference: 121 top-level directories; sorted path-list SHA-256 `6551f707a6287df9ae10085dbadd379d4425bbda8c9a944a77124646ae2bd361`.
- Next non-monthly run: compare structural route/signature sets against this commit, re-verify the open P8 ledger entry, and triage new matches. Do not scope by aggregate changed-line churn.
- Next monthly run: repeat the full repository pass regardless of structural deltas.

## Cadence health and candidates

- This is the first P8 run, so there is no preceding month of clean runs and no cadence-lengthening proposal.
- No Tier M batch exists and no rejected-batch pattern exists; no mutation pause is needed.
- No recurring unregistered class was observed, so no Candidate-bench nomination was added.
