# P6 — No emojis in UI

- Run date: 2026-08-12
- Run kind: first/full pass plus human-approved remediation follow-up
- Authority: Tier M under Arman's explicit approval; `no-emojis-in-ui` is now the approved fix skill
- Prior-month loop health: no prior P6 report, Git-history report, or automation memory existed

## Scope scanned

- Full repository scan across all 7,026 tracked `.tsx` files.
- Registry expression: PCRE2 unicode-range grep `[\x{1F000}-\x{1FAFF}\x{2600}-\x{26FF}\x{2700}-\x{27BF}]`.
- Initial raw signature baseline: 279 matched lines in 130 files.
- The prior PlanTree sighting was verified directly: `features/matrx-envelope/directives/planTree/PlanTreePreview.tsx:123` renders the literal key beside a primary keyword in the user-visible patch preview.
- This first run is the required periodic full pass. Dependencies, ignored build output, and non-TSX source types were excluded; no generated file was touched.

## Detection and triage baseline

- Initial verified P6 findings: 226 user-visible lines in 94 files.
- Fixed, certified, and shipped: 23 user-visible lines in 19 files across two separately approved batches (14 files + 5 files), released in `v0.4.527` (`99b0d4703`).
- Remaining: 203 user-visible lines in 75 files. These stay unresolved pending per-surface safety review; none was silently excluded or proposed as an exception.
- Rank 1 — production/shared surfaces: 64 remaining lines in 34 files.
- Rank 2 — admin, demo, debug, and rendered sample surfaces: 139 lines in 41 files. These remain findings because people can see them; the false-positive rule does not exempt a rendered demo or sample.
- False positives: 53 lines. Thirty-six files were false-positive-only: 37 documentation/comment lines in 30 files, 10 browser-console diagnostic lines in 5 files, and 1 non-UI parser constant. Five additional documentation/comment lines were excluded from four otherwise-live finding files.
- Fixtures/sample data: no rendered fixture or sample was cleared as a false positive. The only exclusions were non-rendered documentation, console-only diagnostics, and parser behavior.
- Approved exceptions: none. Proposed exceptions: none.
- Approval routes: 19 files manually approved, fixed, certified, and shipped; 75 files unresolved pending per-surface review; 0 proposed exceptions.
- Certifier verdicts: **CERTIFIED** for Batch A (14 files) and Batch B (5 files). The certifier initially found three accessible-state regressions; all three were repaired with screen-reader text. Fleet Health verified Tic-Tac-Toe at desktop and 375×812 mobile widths in both light and dark themes. The mobile DOM confirms `New Game`, `Reset Scores`, and the future-of-TicTacToe copy contain no emoji; screenshots were captured. The observed mobile horizontal overflow predates and is unrelated to P6. The unrelated full-repository type errors that blocked the original verdict were subsequently repaired, and the combined `main` type gate is green.
- Main-agent checks: P6 skill validation PASS; touched-file detector PASS except the two documented comment-only false positives in Batch B; scoped `git diff --check` PASS; doctrine/UI/doc-claim gates PASS; current full `pnpm type-check` PASS. Targeted lint surfaced pre-existing same-file debt plus one banned `Sparkles` proposal; `Sparkles` was removed and the text preserved.

## Approved fixes shipped

- **Batch A — 14 files:** replaced product-authored status, warning, visibility, keyword, document, truncation, game, reset, and celebration glyphs with semantic Lucide icons; deleted decorative sparkles and the redundant high-score trophy. Text, handlers, semantic colors, ARIA meaning, and interaction behavior remain unchanged.
- **Batch B — 5 files:** removed emoji prefixes from structured feedback headers; replaced feature/status/recommended/dropped-state glyphs with `Check`, `Star`, and `CheckCircle2`. The two surviving detector hits are non-rendered comments already covered by the false-positive baseline.
- The new `no-emojis-in-ui` skill defines exact detection, false-positive triage, approval routing, safe transformation gates, and adversarial certification. All ten active pattern-patrol automations now carry both `ROUTE APPROVAL` and `ROUTED REPORT` contracts.

## Rank 1 — remaining production and shared surfaces (34 files)

- `app/(public)/pricing/compare/page.tsx:80`
- `app/(transitional)/local/page.tsx:36,37,38,39`
- `app/auth/desktop-handoff/page.tsx:39,40,42,43,218,260,308,337,352`
- `components/mardown-display/blocks/cooking-recipes/cookingRecipeDisplay.tsx:519`
- `components/mardown-display/chat-markdown/FullScreenMarkdownEditor.tsx:383,392,428,700,806,1712`
- `components/mardown-display/chat-markdown/analyzer/analyzer-options/JsonComparator.tsx:277,282`
- `components/mardown-display/chat-markdown/analyzer/analyzer-options/lines-viewer.tsx:154,165`
- `components/markdown-studio/AnalysisView.tsx:534,535`
- `components/official/ImageAssetUploader.tsx:1282`
- `components/ui/loaders/select.tsx:156`
- `features/administration/database-admin/workbench/MergePanel.tsx:433`
- `features/agents/agent-creators/chatbot-customizer/AIOptionComponents.tsx:207`
- `features/ai-models/audit/CapabilitiesAuditTab.tsx:64`
- `features/applet/builder/modules/smart-parts/fields/EnhancedMultiFieldSelector.tsx:260`
- `features/applet/contepts/BrokerDebugger.tsx:74`
- `features/canvas/core/CanvasRenderer.tsx:524`
- `features/canvas/leaderboard/CanvasLeaderboard.tsx:50,51,52`
- `features/canvas/social/CanvasShareSheet.tsx:640`
- `features/code/terminal/SimpleTerminal.tsx:290,325`
- `features/code/terminal/TerminalTab.tsx:93,645`
- `features/code/views/explorer/EditHistorySection.tsx:252,258`
- `features/code/views/history/MessageFilesStrip.tsx:182,188`
- `features/code/views/sandboxes/SandboxDiagnosticsPanel.tsx:959`
- `features/html-pages/components/tabs/SavePageTab.tsx:324,361`
- `features/knowledge/components/KnowledgePipelineDiagram.tsx:143`
- `features/marketing/change-tracking/SeoChangeTrackingWorkspace.tsx:1768`
- `features/marketing/search-console/components/insights/ClassInsights.tsx:362`
- `features/marketing/search-console/intake/SiteIntakeWizard.tsx:633`
- `features/pdf-extractor/components/ManipulationPanel.tsx:148`
- `features/pdf-extractor/studio/PdfStudioChunksPane.tsx:444`
- `features/pdf-extractor/studio/PdfStudioReader.tsx:800,978`
- `features/rag/components/search/RagSearchExperience.tsx:764`
- `features/research/components/init/ResearchInitForm.tsx:993`
- `lib/email/templates/WelcomeEmail.tsx:21,22,23,24`

## Rank 2 — admin, demo, debug, and rendered sample surfaces (41 files)

- `app/(admin)/administration/ui/official-components/component-displays/floating-sheet.tsx:100,101,102,103,104,105,106,107,108,109,184,188,192,196,200,204,208,212,216,220,224,228`
- `app/(admin)/administration/ui/official-components/component-displays/icon-input-with-validation.tsx:73,74,75,76,77,78,79,193,197,201,205,209,213,217,221,225`
- `app/(admin)/administration/ui/official-components/component-displays/icon-resolver.tsx:295,302,306,310`
- `app/(admin)/administration/ui/official-components/component-displays/text-array-input.tsx:64,65,66,67,68,69,70,71,72,107,130,207,211,215,219,223,227,231,235,239,243`
- `app/(dev)/demos/api-tests/agent/AgentTestClient.tsx:346,350,446`
- `app/(dev)/demos/api-tests/matrx-ai/agent-demo/AgentDemoClient.tsx:813`
- `app/(dev)/demos/api-tests/matrx-ai/dynamic-api/DynamicApiClient.tsx:1103`
- `app/(dev)/demos/api-tests/matrx-ai/tools-demo/ToolsDemoClient.tsx:610`
- `app/(dev)/demos/color-test/page.dev.tsx:483,507,514,521,528,535,542,649,667`
- `app/(dev)/demos/general/monaco-test/page.dev.tsx:340,351,362,372`
- `app/(dev)/demos/header-demo/HeaderDemoClient.tsx:150`
- `app/(dev)/demos/layout-tests/fixed-input/page.dev.tsx:52`
- `app/(dev)/demos/layout-tests/resizable-test/page.dev.tsx:73,77,91,97,151,172`
- `app/(dev)/demos/local-tools/documents/page.dev.tsx:1182`
- `app/(dev)/demos/local-tools/scraper/page.dev.tsx:741`
- `app/(dev)/demos/performance-review/PerformanceReviewApp.tsx:344,412`
- `app/(dev)/demos/scopes/context-lab/page.dev.tsx:2140,2141,2142,2143`
- `app/(dev)/demos/tests/_maps/OpenStreetMapComponent.tsx:142,148,156,162,170,176`
- `app/(dev)/demos/tests/_maps/components/LocationMarker.tsx:23`
- `app/(dev)/demos/tests/_maps/components/SearchControl.tsx:45`
- `app/(dev)/demos/tests/applet-tests/applet-builder-3/components/steps/DeployStep.tsx:12,18,24`
- `app/(dev)/demos/tests/applet-tests/resume-builder-test/page.dev.tsx:466`
- `app/(dev)/demos/tests/field-tests/direct-fields/FieldDefinitionTable.tsx:41,94,131`
- `app/(dev)/demos/tests/google-apis/pagespeed/components/LLMDataModal.tsx:59,105`
- `app/(dev)/demos/tests/google-apis/pagespeed/components/PageSpeedForm.tsx:152`
- `app/(dev)/demos/tests/oauth/components/SlackManager.tsx:254,317`
- `app/(dev)/demos/tests/slack/components/SlackManager.tsx:188`
- `app/(dev)/demos/tests/slack/with-brokers/components/TokenManager.tsx:93`
- `app/(dev)/demos/tests/tailwind-test/components/ButtonTest.tsx:30`
- `components/admin/debug/ChatDebug.tsx:318,320`
- `components/admin/markdown-tester/BlockParserComparison.tsx:149,151,153`
- `components/admin/state-analyzer/stateViewerTabs.tsx:721`
- `components/animated/demos/bento-grids/BentoGridExampleThree.tsx:302`
- `components/debug/AgentExecutionDebugPanel.tsx:503,947,953`
- `features/agent-apps/sample-code/apps/fact-checker.tsx:103`
- `features/agent-apps/sample-code/apps/flashcard-generator.tsx:49`
- `features/agent-apps/sample-code/apps/lasi-generator-3.tsx:105`
- `features/agent-apps/sample-code/apps/lsi-generator.tsx:315`
- `features/agents/components/debug/StreamDebugPanel.tsx:599,1638`
- `features/agents/components/messages-display/user/ResourceEditableToggleSamples.tsx:76`
- `features/agents/components/messages-display/user/UserMessageAttachmentStyleComparison.tsx:167`

## False-positive audit

- Documentation/comment-only files (30 files, 37 lines): `app/(admin)/administration/database/data-integrity/page.tsx`, `app/(admin)/administration/users/feedback/components/FeedbackTable.tsx`, `app/(dev)/demos/context-menu/lab/page.dev.tsx`, `components/mardown-display/blocks/media-chapters/MediaChaptersBlock.tsx`, `components/mardown-display/blocks/page-brief/PageBriefBlock.tsx`, `components/mardown-display/blocks/seo-package/SeoPackageBlock.tsx`, `components/official/Field.tsx`, `components/official/deep-link/DeepLinkMissNotice.tsx`, `components/official/entity-ref/EntityDoorControls.tsx`, `features/agent-comparison/shared/BoundColumn.tsx`, `features/agent-shortcuts/components/ShortcutList.tsx`, `features/agents/components/builder/message-builders/system-instructions/SystemMessage.tsx`, `features/agents/components/live-run/LiveRunDisplay.tsx`, `features/files/components/preview/FileResourceChip.tsx`, `features/marketing/content-plan/components/BriefEditor.tsx`, `features/marketing/content-plan/components/NodeRealityCard.tsx`, `features/marketing/content-plan/setup/components/SetupBridgeSection.tsx`, `features/organizations/peek/peekHrefOverride.tsx`, `features/overlays/openers/liveRunWindow.tsx`, `features/page-extraction/components/SavedJobsList.tsx`, `features/pdf-extractor/studio/PdfStudioHeaderControls.tsx`, `features/pdf-extractor/studio/PdfStudioShell.tsx`, `features/pdf-extractor/studio/PdfStudioUploadDrawer.tsx`, `features/podcasts/studio/components/EpisodeChaptersPanel.tsx`, `features/research/components/sources/SourceDetail.tsx`, `features/scopes/components/active-context/ContextLensBar.tsx`, `features/shell/components/header/variants/variants/HeaderIconTitle.tsx`, `features/structured-lists/StructuredListManagerV2.tsx`, `features/window-panels/windows/agents/AgentRunWindow.tsx`, and `features/window-panels/windows/agents/LiveRunWindow.tsx`.
- Console-only diagnostics (5 files, 10 lines): `app/(dev)/demos/tests/markdown-tests/tui-tests/page.dev.tsx`, `components/mardown-display/chat-markdown/StreamAwareChatMarkdown.tsx`, `features/shell/components/DeferredShellData.tsx`, `providers/google-provider/GoogleApiProvider.tsx`, and `providers/google-provider/LazyGoogleAPIProvider.tsx`.
- Non-UI parser constant (1 file, 1 line): `components/mardown-display/blocks/tree/TreeBlock.tsx` accepts arrow glyphs in input; changing it would alter parsing behavior.
- Mixed-file comment exclusions (5 lines): `app/(admin)/administration/users/feedback/components/FeedbackDetailDialog.tsx:1200`, `features/agent-comparison/components/SubmitAllPreflightDialog.tsx:7`, `features/canvas/core/CanvasRenderer.tsx:343,490`, and `features/pdf-extractor/studio/PdfStudioReader.tsx:218`.

## Structural baseline for the next run

- Scan-start commit: `cd0b4796953a8ec5a30ebdc459c10ed15f08f765`.
- Route-tree baseline: 1,054 tracked `page.tsx` / `page.dev.tsx` leaves; sorted path-list SHA-256 `0c229ebcc777e7564fd6e920c00a63807044c4092549c9796e1fb4e986e34b68`.
- Current P6 raw signature baseline: 256 lines in 113 files; sorted path-list SHA-256 `06baa5de38891edf57909b15dcf4c6c71a6710b504564560d57007d7725c212a`.
- Feature-directory reference: 122 top-level directories; sorted path-list SHA-256 `edda1d66263b6d74c36ab96a4fdf184b5fd1c2a0005da1ce6de100f299d0e2e0`.
- Next non-full run: compare structural route/signature/feature sets against this baseline, re-verify the open report-linked P6 ledger entry, and triage new matches. Never scope by aggregate changed-line churn.
- Next periodic full run: repeat the full repository pass regardless of structural deltas.

## Cadence health and candidates

- This is the first P6 run, so there is no preceding month of clean runs and no cadence-lengthening proposal.
- Two Tier M batches were certified after the accessible-state repairs, complete desktop/mobile × light/dark proof, and a green full type gate. They shipped in `v0.4.527`; the remaining 203 findings continue through per-surface review.
- No recurring unregistered class was observed, so no Candidate-bench nomination was added.
