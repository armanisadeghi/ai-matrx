# Rich content legacy inventory

GENERATED — never edit by hand. Regenerate with `pnpm rich-content:inventory` (reads the import graph through the TypeScript compiler API; aliases and re-exports followed). Registry: `scripts/rich-content-inventory/registry.ts`. Plan: `common-docs/projects/rich-content-unification/PLAN.md` §7. BANNED rows are guarded by `pnpm check:rich-content-legacy` (shrink-only `baseline.json`); tracked rows are today's entry points; review rows are heuristics.

## Headline

| Category | Status | Pieces | Sites | Files |
|---|---|---:|---:|---:|
| hand-rolled-helper | banned | 2 | 10 | 10 |
| hand-rolled-textarea | banned | 1 | 5 | 5 |
| legacy-actions | banned | 2 | 6 | 6 |
| legacy-editor | banned | 6 | 35 | 24 |
| markdown-package | banned | 7 | 41 | 24 |
| prompt-editor | banned | 2 | 7 | 5 |
| raw-content-render | review | 3 | 849 | 679 |
| raw-html | review | 1 | 37 | 23 |
| renderer-entry-point | tracked | 8 | 178 | 167 |
| **total** | | 32 | 1168 | 886 |

Files scanned: 14822. Surfaces reached: 1148. Unresolved local code imports (broken or generated paths the graph cannot follow): 3.

## Pieces

| Piece | Category | Status | Files | Sites | Replacement |
|---|---|---|---:|---:|---|
| react-markdown | markdown-package | banned | 14 | 14 | Render through the ONE markdown core: `BasicMarkdownContent` / `MarkdownStream` (components/markdown-core/MarkdownCore → MarkdownCoreImpl is the only react-markdown/remark/rehype/katex edge). Target: `<RichContent source level>` — rich-content-unification PLAN §3.1–3.2. Never import the package directly. |
| remark-* plugins | markdown-package | banned | 8 | 11 | Render through the ONE markdown core: `BasicMarkdownContent` / `MarkdownStream` (components/markdown-core/MarkdownCore → MarkdownCoreImpl is the only react-markdown/remark/rehype/katex edge). Target: `<RichContent source level>` — rich-content-unification PLAN §3.1–3.2. Never import the package directly. |
| rehype-* plugins | markdown-package | banned | 1 | 2 | Render through the ONE markdown core: `BasicMarkdownContent` / `MarkdownStream` (components/markdown-core/MarkdownCore → MarkdownCoreImpl is the only react-markdown/remark/rehype/katex edge). Target: `<RichContent source level>` — rich-content-unification PLAN §3.1–3.2. Never import the package directly. |
| katex (direct) | markdown-package | banned | 6 | 6 | Render through the ONE markdown core: `BasicMarkdownContent` / `MarkdownStream` (components/markdown-core/MarkdownCore → MarkdownCoreImpl is the only react-markdown/remark/rehype/katex edge). Target: `<RichContent source level>` — rich-content-unification PLAN §3.1–3.2. Never import the package directly. |
| react-katex | markdown-package | banned | 6 | 6 | Render through the ONE markdown core: `BasicMarkdownContent` / `MarkdownStream` (components/markdown-core/MarkdownCore → MarkdownCoreImpl is the only react-markdown/remark/rehype/katex edge). Target: `<RichContent source level>` — rich-content-unification PLAN §3.1–3.2. Never import the package directly. |
| marked | markdown-package | banned | 2 | 2 | Render through the ONE markdown core: `BasicMarkdownContent` / `MarkdownStream` (components/markdown-core/MarkdownCore → MarkdownCoreImpl is the only react-markdown/remark/rehype/katex edge). Target: `<RichContent source level>` — rich-content-unification PLAN §3.1–3.2. Never import the package directly. |
| markdown-it | markdown-package | banned | 0 | 0 | Render through the ONE markdown core: `BasicMarkdownContent` / `MarkdownStream` (components/markdown-core/MarkdownCore → MarkdownCoreImpl is the only react-markdown/remark/rehype/katex edge). Target: `<RichContent source level>` — rich-content-unification PLAN §3.1–3.2. Never import the package directly. |
| @toast-ui/* (Toast UI editor) | legacy-editor | banned | 1 | 6 | THE ONE EDITOR (Tiptap 3 visual + CodeMirror 6 source, save = splice) — rich-content-unification PLAN §3.5–3.6. Until it lands, add NO new consumer: extend the surface's existing editor call site instead of adding a new one. |
| TuiEditorContent | legacy-editor | banned | 9 | 14 | THE ONE EDITOR (Tiptap 3 visual + CodeMirror 6 source, save = splice) — rich-content-unification PLAN §3.5–3.6. Until it lands, add NO new consumer: extend the surface's existing editor call site instead of adding a new one. |
| @remirror/* (installed, unused) | legacy-editor | banned | 2 | 2 | THE ONE EDITOR (Tiptap 3 visual + CodeMirror 6 source, save = splice) — rich-content-unification PLAN §3.5–3.6. Until it lands, add NO new consumer: extend the surface's existing editor call site instead of adding a new one. |
| FullScreenMarkdownEditor (16-tab editor) | legacy-editor | banned | 4 | 5 | THE ONE EDITOR (Tiptap 3 visual + CodeMirror 6 source, save = splice) — rich-content-unification PLAN §3.5–3.6. Until it lands, add NO new consumer: extend the surface's existing editor call site instead of adding a new one. |
| BasicContentEditor (split editor) | legacy-editor | banned | 3 | 3 | THE ONE EDITOR (Tiptap 3 visual + CodeMirror 6 source, save = splice) — rich-content-unification PLAN §3.5–3.6. Until it lands, add NO new consumer: extend the surface's existing editor call site instead of adding a new one. |
| components/official/content-editor/ContentEditor | legacy-editor | banned | 5 | 5 | THE ONE EDITOR (Tiptap 3 visual + CodeMirror 6 source, save = splice) — rich-content-unification PLAN §3.5–3.6. Until it lands, add NO new consumer: extend the surface's existing editor call site instead of adding a new one. |
| messageActionRegistry (chat, both copies) | legacy-actions | banned | 2 | 2 | Register the action in the ONE action registry: features/rich-document/actions/registry.ts (rich-content-unification PLAN §3.10). The chat registry and both AssistantActionBar copies are being deleted. |
| AssistantActionBar (both copies) | legacy-actions | banned | 4 | 4 | Register the action in the ONE action registry: features/rich-document/actions/registry.ts (rich-content-unification PLAN §3.10). The chat registry and both AssistantActionBar copies are being deleted. |
| HighlightedText (prompt {{var}} contentEditable) | prompt-editor | banned | 5 | 5 | The one editor's CodeMirror 6 source mode with {{variable}} highlighting (rich-content-unification PLAN §3.5). Do not extend the hand-rolled contentEditable prompt pieces. |
| MessageViewModeMenu (bespoke mode toggle) | prompt-editor | banned | 2 | 2 | The one editor's CodeMirror 6 source mode with {{variable}} highlighting (rich-content-unification PLAN §3.5). Do not extend the hand-rolled contentEditable prompt pieces. |
| cleanMarkdownPreview (regex markdown stripping) | hand-rolled-helper | banned | 6 | 6 | Render the preview at the inline level through the markdown core (`BasicMarkdownContent`; target `<RichContent level="inline">`, PLAN §3.1) instead of stripping markdown with regexes. |
| renderAnnouncementMessage (regex link parser) | hand-rolled-helper | banned | 4 | 4 | Render the message through the markdown core at the inline level (`InlineMarkdownWithLinks` / `BasicMarkdownContent`; target `<RichContent level="inline">`, PLAN §3.1). |
| hand-rolled AutoTextarea / AutoResizeTextarea | hand-rolled-textarea | banned | 5 | 5 | Use `ProTextarea` (components/official/ProTextarea.tsx) — it auto-grows and carries dictation, cleanup and agent actions. Never hand-roll another auto-resizing textarea. |
| MarkdownStream | renderer-entry-point | tracked | 89 | 92 | Current entry point — keep using it; it is absorbed by `<RichContent source level>` at cutover (PLAN §3.1). |
| BasicMarkdownContent | renderer-entry-point | tracked | 31 | 31 | Current entry point — keep using it; it is absorbed by `<RichContent source level>` at cutover (PLAN §3.1). |
| ConfigurableMarkdownContent | renderer-entry-point | tracked | 5 | 6 | Current entry point — keep using it; it is absorbed by `<RichContent source level>` at cutover (PLAN §3.1). |
| MarkdownRenderer | renderer-entry-point | tracked | 8 | 8 | Current entry point — keep using it; it is absorbed by `<RichContent source level>` at cutover (PLAN §3.1). |
| InlineMarkdownWithLinks | renderer-entry-point | tracked | 4 | 4 | Current entry point — keep using it; it is absorbed by `<RichContent source level>` at cutover (PLAN §3.1). |
| CardFaceContent | renderer-entry-point | tracked | 15 | 15 | Current entry point — keep using it; it is absorbed by `<RichContent source level>` at cutover (PLAN §3.1). |
| RichDocument | renderer-entry-point | tracked | 19 | 19 | Current entry point — keep using it; it is absorbed by `<RichContent source level>` at cutover (PLAN §3.1). |
| MarkdownPreview | renderer-entry-point | tracked | 3 | 3 | Current entry point — keep using it; it is absorbed by `<RichContent source level>` at cutover (PLAN §3.1). |
| dangerouslySetInnerHTML | raw-html | review | 23 | 37 | Rich text renders through the markdown core; HTML-origin bodies go through the HTML-sanitizing path (PLAN §2). |
| {x.content\|body\|description\|prompt\|reasoning\|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td> | raw-content-render | review | 562 | 690 | If the field can hold markdown, render it through the core at the right level (PLAN §3.1). |
| .split("\n").map(→ JSX) paragraph renderer | raw-content-render | review | 7 | 7 | Paragraphs come from the markdown core, never a hand split on newlines (PLAN §3.1). |
| whitespace-pre-wrap / pre-line on a content field | raw-content-render | review | 134 | 152 | pre-wrap shows markdown source; render it through the core instead (PLAN §3.1). |

## Top surfaces (by their OWN legacy sites — shared files excluded)

| Surface | Own files | Own banned | Own tracked | Own review | All banned (incl. shared) |
|---|---:|---:|---:|---:|---:|
| overlay agentAdvancedEditorWindow (Agent Advanced Editor) | 12 | 8 | 6 | 10 | 41 |
| route /administration/agents/system-agents/agents/[id]/build | 12 | 8 | 6 | 10 | 41 |
| route /agents/[id]/build | 12 | 8 | 6 | 10 | 41 |
| route /agents/battle/variations | 12 | 8 | 6 | 10 | 41 |
| route /agents/battle/system-prompt | 9 | 6 | 5 | 2 | 39 |
| overlay contentEditorWorkspaceWindow (Content Workspace) | 5 | 5 | 2 | 2 | 38 |
| overlay contentEditorListWindow (Content List Editor) | 5 | 5 | 2 | 1 | 38 |
| overlay contentEditorWindow (Content Editor) | 5 | 5 | 2 | 1 | 38 |
| overlay markdownEditor (Markdown Editor (fullscreen)) | 7 | 4 | 0 | 13 | 37 |
| overlay markdownEditorWindow (Markdown Editor) | 7 | 4 | 0 | 13 | 37 |
| route /s/[token] | 4 | 4 | 0 | 2 | 37 |
| route /administration/users/feedback | 8 | 3 | 0 | 11 | 36 |
| layout /notes | 2 | 2 | 1 | 1 | 36 |
| overlay quickUtilities (Utilities) | 2 | 2 | 1 | 1 | 36 |
| route /p/e/[resourceType]/[id] | 1 | 2 | 0 | 2 | 35 |
| overlay htmlPreviewBridge | 3 | 2 | 1 | 0 | 35 |
| overlay quickNotes (Quick Notes) | 1 | 2 | 1 | 0 | 36 |
| route /education/notes/[id] | 1 | 2 | 1 | 0 | 36 |
| route /education/notes/[id]/edit | 1 | 2 | 1 | 0 | 36 |
| route /seo/ai-visibility | 2 | 2 | 0 | 1 | 35 |
| overlay announcements (Announcements) | 2 | 2 | 0 | 0 | 2 |
| overlay noteInfoWindow (Note Info) | 1 | 2 | 0 | 0 | 35 |
| route /administration/agents/system-agents/agents | 2 | 2 | 0 | 0 | 35 |
| route /agents/all | 2 | 2 | 0 | 0 | 35 |
| route /marketing/ai-visibility/runs/[runId] | 1 | 2 | 0 | 0 | 35 |
| route /workflows/all | 2 | 2 | 0 | 0 | 35 |
| route /marketing/[brandId]/content/plan/[siteId] | 8 | 1 | 1 | 10 | 36 |
| route /marketing/[brandId]/content/plan/[siteId]/ai-runs | 8 | 1 | 1 | 10 | 36 |
| route /marketing/[brandId]/content/plan/[siteId]/brief | 8 | 1 | 1 | 10 | 36 |
| route /marketing/[brandId]/content/plan/[siteId]/entities | 8 | 1 | 1 | 10 | 36 |
| route /marketing/[brandId]/content/plan/[siteId]/map | 8 | 1 | 1 | 10 | 36 |
| route /marketing/[brandId]/content/plan/[siteId]/setup | 8 | 1 | 1 | 10 | 36 |
| route /marketing/[brandId]/content/plan/[siteId]/table | 8 | 1 | 1 | 10 | 36 |
| route /cms/[siteId]/pages/[pageId] | 5 | 1 | 1 | 4 | 35 |
| route /cms/[siteId]/pages/new | 5 | 1 | 1 | 4 | 35 |
| route /marketing/[brandId]/websites/[siteId]/pages/[pageId] | 5 | 1 | 1 | 4 | 35 |
| route /masterwork/all | 3 | 1 | 0 | 2 | 34 |
| route /administration/agents/system-agents/content-blocks | 1 | 1 | 1 | 0 | 34 |
| route /administration/utilities/content-blocks | 1 | 1 | 1 | 0 | 34 |
| route /administration/utilities/message-templates | 1 | 1 | 1 | 0 | 34 |
| route /chat/message-templates/[id] | 1 | 1 | 0 | 1 | 1 |
| api /api/chat/email-response | 1 | 1 | 0 | 0 | 1 |
| api /api/export/email-table | 1 | 1 | 0 | 0 | 1 |
| api /api/public/email | 1 | 1 | 0 | 0 | 1 |
| api /api/sharing/email-link | 1 | 1 | 0 | 0 | 1 |
| opener fullScreenEditor | 1 | 1 | 0 | 0 | 1 |
| overlay extractionCellEditorWindow (Extraction Cell Editor) | 1 | 1 | 0 | 0 | 34 |
| route /chat/message-templates/edit/[id] | 1 | 1 | 0 | 0 | 1 |
| route /chat/message-templates/new | 1 | 1 | 0 | 0 | 1 |
| layout / | 22 | 0 | 3 | 22 | 34 |

## Shared files — reach more than 10 surfaces (convert once, every surface benefits)

### `components/MarkdownStreamImpl.tsx` — reaches 1010 surfaces

- [ ] `components/MarkdownStreamImpl.tsx:8` — **MarkdownStream** (tracked) — `./MarkdownStream` (type-only)

### `components/content-cleanup/CellCleanupOptionsPopover.tsx` — reaches 1010 surfaces

- [ ] `components/content-cleanup/CellCleanupOptionsPopover.tsx:130` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{m.description}`

### `components/mardown-display/MarkdownRenderer.tsx` — reaches 19 surfaces

- [ ] `components/mardown-display/MarkdownRenderer.tsx:11` — **react-markdown** (BANNED) — `react-markdown` (type-only)

### `components/mardown-display/blocks/agent-result/AgentResultBlock.tsx` — reaches 1010 surfaces

- [ ] `components/mardown-display/blocks/agent-result/AgentResultBlock.tsx:59` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### `components/mardown-display/blocks/artifact/ArtifactBlock.tsx` — reaches 1010 surfaces

- [ ] `components/mardown-display/blocks/artifact/ArtifactBlock.tsx:23` — **BasicMarkdownContent** (tracked) — `../../chat-markdown/BasicMarkdownContent`

### `components/mardown-display/blocks/comparison/ComparisonTableBlock.tsx` — reaches 1010 surfaces

- [ ] `components/mardown-display/blocks/comparison/ComparisonTableBlock.tsx:587` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{comparison.description}`

### `components/mardown-display/blocks/cooking-recipes/cookingRecipeDisplay.tsx` — reaches 1010 surfaces

- [ ] `components/mardown-display/blocks/cooking-recipes/cookingRecipeDisplay.tsx:571` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{step.description}`
- [ ] `components/mardown-display/blocks/cooking-recipes/cookingRecipeDisplay.tsx:599` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{recipe.notes}`

### `components/mardown-display/blocks/decision-tree/DecisionTreeBlock.tsx` — reaches 1010 surfaces

- [ ] `components/mardown-display/blocks/decision-tree/DecisionTreeBlock.tsx:397` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{node.description}`
- [ ] `components/mardown-display/blocks/decision-tree/DecisionTreeBlock.tsx:462` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{node.description}`
- [ ] `components/mardown-display/blocks/decision-tree/DecisionTreeBlock.tsx:605` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{decisionTree.description}`
- [ ] `components/mardown-display/blocks/decision-tree/DecisionTreeBlock.tsx:804` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{currentNode.description}`

### `components/mardown-display/blocks/diagram/InteractiveDiagramBlock.tsx` — reaches 1010 surfaces

- [ ] `components/mardown-display/blocks/diagram/InteractiveDiagramBlock.tsx:3054` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{diagram.description}`

### `components/mardown-display/blocks/flashcards/CardFaceContent.tsx` — reaches 1011 surfaces

- [ ] `components/mardown-display/blocks/flashcards/CardFaceContent.tsx:20` — **ConfigurableMarkdownContent** (tracked) — `@/components/mardown-display/chat-markdown/ConfigurableMarkdownContent`

### `components/mardown-display/blocks/flashcards/FlashcardItem.tsx` — reaches 1010 surfaces

- [ ] `components/mardown-display/blocks/flashcards/FlashcardItem.tsx:6` — **CardFaceContent** (tracked) — `./CardFaceContent`
- [ ] `components/mardown-display/blocks/flashcards/FlashcardItem.tsx:5` — **ConfigurableMarkdownContent** (tracked) — `@/components/mardown-display/chat-markdown/ConfigurableMarkdownContent`

### `components/mardown-display/blocks/flashcards/FlashcardMobileView.tsx` — reaches 1010 surfaces

- [ ] `components/mardown-display/blocks/flashcards/FlashcardMobileView.tsx:24` — **ConfigurableMarkdownContent** (tracked) — `@/components/mardown-display/chat-markdown/ConfigurableMarkdownContent`
- [ ] `components/mardown-display/blocks/flashcards/FlashcardMobileView.tsx:25` — **ConfigurableMarkdownContent** (tracked) — `@/components/mardown-display/chat-markdown/ConfigurableMarkdownContent` (type-only)

### `components/mardown-display/blocks/inline-decision/InlineDecisionBlock.tsx` — reaches 1010 surfaces

- [ ] `components/mardown-display/blocks/inline-decision/InlineDecisionBlock.tsx:111` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{decision.prompt}`

### `components/mardown-display/blocks/json/StructuredAgentAnswerBlock.tsx` — reaches 1010 surfaces

- [ ] `components/mardown-display/blocks/json/StructuredAgentAnswerBlock.tsx:298` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{rawContent}`

### `components/mardown-display/blocks/links/InlineMarkdownWithLinks.tsx` — reaches 1010 surfaces

- [ ] `components/mardown-display/blocks/links/InlineMarkdownWithLinks.tsx:35` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: applyInlineMarkdownHtmlFormatting(chunk), }}`
- [ ] `components/mardown-display/blocks/links/InlineMarkdownWithLinks.tsx:54` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: applyInlineMarkdownHtmlFormatting(chunk), }}`
- [ ] `components/mardown-display/blocks/links/InlineMarkdownWithLinks.tsx:66` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: applyInlineMarkdownHtmlFormatting(text), }}`

### `components/mardown-display/blocks/map/MapCanvas.tsx` — reaches 1010 surfaces

- [ ] `components/mardown-display/blocks/map/MapCanvas.tsx:69` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{m.description}`

### `components/mardown-display/blocks/markdown-preview/MarkdownPreviewBlock.tsx` — reaches 1010 surfaces

- [ ] `components/mardown-display/blocks/markdown-preview/MarkdownPreviewBlock.tsx:6` — **BasicMarkdownContent** (tracked) — `@/components/mardown-display/chat-markdown/BasicMarkdownContent`

### `components/mardown-display/blocks/markdown/MarkdownKindBlock.tsx` — reaches 1010 surfaces

- [ ] `components/mardown-display/blocks/markdown/MarkdownKindBlock.tsx:42` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### `components/mardown-display/blocks/masterwork-unfolding/CaseDisclosureBlock.tsx` — reaches 1010 surfaces

- [ ] `components/mardown-display/blocks/masterwork-unfolding/CaseDisclosureBlock.tsx:157` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{data.answer}`

### `components/mardown-display/blocks/masterwork/MasterworkResultBlock.tsx` — reaches 1010 surfaces

- [ ] `components/mardown-display/blocks/masterwork/MasterworkResultBlock.tsx:45` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### `components/mardown-display/blocks/matrx-file/MatrxFileBlock.tsx` — reaches 1010 surfaces

- [ ] `components/mardown-display/blocks/matrx-file/MatrxFileBlock.tsx:25` — **BasicMarkdownContent** (tracked) — `@/components/mardown-display/chat-markdown/BasicMarkdownContent`

### `components/mardown-display/blocks/media-chapters/MediaChaptersBlock.tsx` — reaches 1010 surfaces

- [ ] `components/mardown-display/blocks/media-chapters/MediaChaptersBlock.tsx:115` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{chapter.summary}`

### `components/mardown-display/blocks/media-io/MediaAssetBlock.tsx` — reaches 1010 surfaces

- [ ] `components/mardown-display/blocks/media-io/MediaAssetBlock.tsx:208` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{data.transcript}`

### `components/mardown-display/blocks/media-io/PodcastEpisodeBlock.tsx` — reaches 1010 surfaces

- [ ] `components/mardown-display/blocks/media-io/PodcastEpisodeBlock.tsx:161` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{data.description}`

### `components/mardown-display/blocks/memory-aid/MemoryAidBlock.tsx` — reaches 1010 surfaces

- [ ] `components/mardown-display/blocks/memory-aid/MemoryAidBlock.tsx:144` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{m.explanation}`

### `components/mardown-display/blocks/memory-aid/MemoryHintBlock.tsx` — reaches 1010 surfaces

- [ ] `components/mardown-display/blocks/memory-aid/MemoryHintBlock.tsx:89` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{hint.explanation}`

### `components/mardown-display/blocks/page-pipeline/PlanPageDraftBlock.tsx` — reaches 1010 surfaces

- [ ] `components/mardown-display/blocks/page-pipeline/PlanPageDraftBlock.tsx:148` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{section.body}`

### `components/mardown-display/blocks/page-pipeline/PlanPageResearchBlock.tsx` — reaches 1010 surfaces

- [ ] `components/mardown-display/blocks/page-pipeline/PlanPageResearchBlock.tsx:184` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{source.notes}`

### `components/mardown-display/blocks/plan/StructuredPlanViewer.tsx` — reaches 1010 surfaces

- [ ] `components/mardown-display/blocks/plan/StructuredPlanViewer.tsx:8` — **BasicMarkdownContent** (tracked) — `@/components/mardown-display/chat-markdown/BasicMarkdownContent`

### `components/mardown-display/blocks/presentations/PresentationExportMenu.tsx` — reaches 1010 surfaces

- [ ] `components/mardown-display/blocks/presentations/PresentationExportMenu.tsx:441` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{capabilities.pdf.description}`
- [ ] `components/mardown-display/blocks/presentations/PresentationExportMenu.tsx:460` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{capabilities.html.description}`
- [ ] `components/mardown-display/blocks/presentations/PresentationExportMenu.tsx:479` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{capabilities.powerpoint.description}`
- [ ] `components/mardown-display/blocks/presentations/PresentationExportMenu.tsx:529` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{capabilities.googleSlides.description}`

### `components/mardown-display/blocks/presentations/Slideshow.tsx` — reaches 1010 surfaces

- [ ] `components/mardown-display/blocks/presentations/Slideshow.tsx:236` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{p.description}`

### `components/mardown-display/blocks/progress/ProgressTrackerBlock.tsx` — reaches 1010 surfaces

- [ ] `components/mardown-display/blocks/progress/ProgressTrackerBlock.tsx:414` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tracker.description}`
- [ ] `components/mardown-display/blocks/progress/ProgressTrackerBlock.tsx:605` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{category.description}`

### `components/mardown-display/blocks/rag-kinds/collection-blocks.tsx` — reaches 1010 surfaces

- [ ] `components/mardown-display/blocks/rag-kinds/collection-blocks.tsx:35` — **BasicMarkdownContent** (tracked) — `@/components/mardown-display/chat-markdown/BasicMarkdownContent`

### `components/mardown-display/blocks/research/ResearchBlock.tsx` — reaches 1010 surfaces

- [ ] `components/mardown-display/blocks/research/ResearchBlock.tsx:543` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{theme.description}`
- [ ] `components/mardown-display/blocks/research/ResearchBlock.tsx:725` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{section.content}`

### `components/mardown-display/blocks/resources/ResourceCollectionBlock.tsx` — reaches 1010 surfaces

- [ ] `components/mardown-display/blocks/resources/ResourceCollectionBlock.tsx:335` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{collection.description}`
- [ ] `components/mardown-display/blocks/resources/ResourceCollectionBlock.tsx:480` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{category.description}`
- [ ] `components/mardown-display/blocks/resources/ResourceCollectionBlock.tsx:521` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{resource.description}`

### `components/mardown-display/blocks/scraper-kinds/ScrapedPageBlock.tsx` — reaches 1010 surfaces

- [ ] `components/mardown-display/blocks/scraper-kinds/ScrapedPageBlock.tsx:360` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{active.body}`

### `components/mardown-display/blocks/scraper-kinds/primitive-blocks.tsx` — reaches 1010 surfaces

- [ ] `components/mardown-display/blocks/scraper-kinds/primitive-blocks.tsx:568` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{body}`

### `components/mardown-display/blocks/seo-package/SeoPackageBlock.tsx` — reaches 1010 surfaces

- [ ] `components/mardown-display/blocks/seo-package/SeoPackageBlock.tsx:280` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.answer}`

### `components/mardown-display/blocks/study-notes/StudyNotesBlock.tsx` — reaches 1010 surfaces

- [ ] `components/mardown-display/blocks/study-notes/StudyNotesBlock.tsx:73` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{section.summary}`

### `components/mardown-display/blocks/table/StreamingTableRenderer.tsx` — reaches 1010 surfaces

- [ ] `components/mardown-display/blocks/table/StreamingTableRenderer.tsx:11` — **InlineMarkdownWithLinks** (tracked) — `@/components/mardown-display/blocks/links/InlineMarkdownWithLinks`

### `components/mardown-display/blocks/timeline/TimelineBlock.tsx` — reaches 1010 surfaces

- [ ] `components/mardown-display/blocks/timeline/TimelineBlock.tsx:425` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{event.description}`

### `components/mardown-display/blocks/troubleshooting/TroubleshootingBlock.tsx` — reaches 1010 surfaces

- [ ] `components/mardown-display/blocks/troubleshooting/TroubleshootingBlock.tsx:399` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{troubleshooting.description}`
- [ ] `components/mardown-display/blocks/troubleshooting/TroubleshootingBlock.tsx:504` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{issue.description}`
- [ ] `components/mardown-display/blocks/troubleshooting/TroubleshootingBlock.tsx:589` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{solution.description}`
- [ ] `components/mardown-display/blocks/troubleshooting/TroubleshootingBlock.tsx:697` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{step.description}`

### `components/mardown-display/blocks/troubleshooting/TroubleshootingLoadingVisualization.tsx` — reaches 1010 surfaces

- [ ] `components/mardown-display/blocks/troubleshooting/TroubleshootingLoadingVisualization.tsx:108` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{step.description}`

### `components/mardown-display/blocks/video-prompt-options/VideoPromptOptionsBlock.tsx` — reaches 1010 surfaces

- [ ] `components/mardown-display/blocks/video-prompt-options/VideoPromptOptionsBlock.tsx:176` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{variation.prompt}`

### `components/mardown-display/chat-markdown/BasicMarkdownContent.tsx` — reaches 1010 surfaces

- [ ] `components/mardown-display/chat-markdown/BasicMarkdownContent.tsx:990` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: ' /* Center display math that appears after a line bre…`
- [ ] `components/mardown-display/chat-markdown/BasicMarkdownContent.tsx:113` — **react-markdown** (BANNED) — `react-markdown` (type-only)

### `components/mardown-display/chat-markdown/ConfigurableMarkdownContent.tsx` — reaches 1011 surfaces

- [ ] `components/mardown-display/chat-markdown/ConfigurableMarkdownContent.tsx:1052` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: dynamicStyles }}`
- [ ] `components/mardown-display/chat-markdown/ConfigurableMarkdownContent.tsx:30` — **react-markdown** (BANNED) — `react-markdown` (type-only)

### `components/mardown-display/chat-markdown/EnhancedChatMarkdown.tsx` — reaches 1010 surfaces

- [ ] `components/mardown-display/chat-markdown/EnhancedChatMarkdown.tsx:28` — **FullScreenMarkdownEditor (16-tab editor)** (BANNED) — `./FullScreenMarkdownEditor`
- [ ] `components/mardown-display/chat-markdown/EnhancedChatMarkdown.tsx:1011` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<div pre-wrap>{block?.content || "[Render error]"}`

### `components/mardown-display/chat-markdown/FullScreenMarkdownEditor.tsx` — reaches 1010 surfaces

- [ ] `components/mardown-display/chat-markdown/FullScreenMarkdownEditor.tsx:27` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `components/mardown-display/chat-markdown/FullScreenMarkdownEditor.tsx:907` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{content}`
- [ ] `components/mardown-display/chat-markdown/FullScreenMarkdownEditor.tsx:28` — **TuiEditorContent** (BANNED) — `./tui/TuiEditorContent`

### `components/mardown-display/chat-markdown/analyzer/analyzer-options/SectionGroupTab.tsx` — reaches 1010 surfaces

- [ ] `components/mardown-display/chat-markdown/analyzer/analyzer-options/SectionGroupTab.tsx:163` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<td pre-wrap>{text}`

### `components/mardown-display/chat-markdown/analyzer/analyzer-options/SectionViewerWithSidebar.tsx` — reaches 1010 surfaces

- [ ] `components/mardown-display/chat-markdown/analyzer/analyzer-options/SectionViewerWithSidebar.tsx:69` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: content }}`
- [ ] `components/mardown-display/chat-markdown/analyzer/analyzer-options/SectionViewerWithSidebar.tsx:80` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: content }}`

### `components/mardown-display/chat-markdown/analyzer/analyzer-options/lines-viewer.tsx` — reaches 1010 surfaces

- [ ] `components/mardown-display/chat-markdown/analyzer/analyzer-options/lines-viewer.tsx:125` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: content }}`
- [ ] `components/mardown-display/chat-markdown/analyzer/analyzer-options/lines-viewer.tsx:137` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: content }}`
- [ ] `components/mardown-display/chat-markdown/analyzer/analyzer-options/lines-viewer.tsx:233` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: content }}`
- [ ] `components/mardown-display/chat-markdown/analyzer/analyzer-options/lines-viewer.tsx:242` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: content }}`

### `components/mardown-display/chat-markdown/analyzer/analyzer-options/section-viewer-V2.tsx` — reaches 1010 surfaces

- [ ] `components/mardown-display/chat-markdown/analyzer/analyzer-options/section-viewer-V2.tsx:157` — **.split("\n").map(→ JSX) paragraph renderer** (review) — `item.split('\n').map((row, rowIndex) => ( <tr key={rowIndex} className="border-b border-b…`

### `components/mardown-display/chat-markdown/analyzer/analyzer-options/sections-viewer.tsx` — reaches 1010 surfaces

- [ ] `components/mardown-display/chat-markdown/analyzer/analyzer-options/sections-viewer.tsx:200` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: safeContent }}`
- [ ] `components/mardown-display/chat-markdown/analyzer/analyzer-options/sections-viewer.tsx:211` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: safeContent }}`

### `components/mardown-display/chat-markdown/block-registry/BlockComponentRegistry.tsx` — reaches 1010 surfaces

- [ ] `components/mardown-display/chat-markdown/block-registry/BlockComponentRegistry.tsx:217` — **BasicMarkdownContent** (tracked) — `../BasicMarkdownContent`

### `components/mardown-display/chat-markdown/block-registry/block-dispatch.tsx` — reaches 1010 surfaces

- [ ] `components/mardown-display/chat-markdown/block-registry/block-dispatch.tsx:1061` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{decisionData.prompt || "Decision loading..."}`

### `components/mardown-display/chat-markdown/internal-handlers/BlockFallback.tsx` — reaches 1010 surfaces

- [ ] `components/mardown-display/chat-markdown/internal-handlers/BlockFallback.tsx:20` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{content || "[empty block]"}`

### `components/mardown-display/chat-markdown/tui/TuiEditorContent.tsx` — reaches 1010 surfaces

- [ ] `components/mardown-display/chat-markdown/tui/TuiEditorContent.tsx:4` — **@toast-ui/* (Toast UI editor)** (BANNED) — `@toast-ui/react-editor` (type-only)
- [ ] `components/mardown-display/chat-markdown/tui/TuiEditorContent.tsx:5` — **@toast-ui/* (Toast UI editor)** (BANNED) — `@toast-ui/editor` (type-only)
- [ ] `components/mardown-display/chat-markdown/tui/TuiEditorContent.tsx:11` — **@toast-ui/* (Toast UI editor)** (BANNED) — `@toast-ui/editor/dist/toastui-editor.css`
- [ ] `components/mardown-display/chat-markdown/tui/TuiEditorContent.tsx:12` — **@toast-ui/* (Toast UI editor)** (BANNED) — `@toast-ui/editor/dist/theme/toastui-editor-dark.css`
- [ ] `components/mardown-display/chat-markdown/tui/TuiEditorContent.tsx:15` — **@toast-ui/* (Toast UI editor)** (BANNED) — `@toast-ui/react-editor`
- [ ] `components/mardown-display/chat-markdown/tui/TuiEditorContent.tsx:23` — **@toast-ui/* (Toast UI editor)** (BANNED) — `@toast-ui/editor-plugin-color-syntax`

### `components/mardown-display/tables/MarkdownTable.tsx` — reaches 1010 surfaces

- [ ] `components/mardown-display/tables/MarkdownTable.tsx:11` — **InlineMarkdownWithLinks** (tracked) — `@/components/mardown-display/blocks/links/InlineMarkdownWithLinks`

### `components/matrx/MatrxSplit.tsx` — reaches 1010 surfaces

- [ ] `components/matrx/MatrxSplit.tsx:10` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `components/matrx/MatrxSplit.tsx:33` — **RichDocument** (tracked) — `@/features/rich-document/RichDocument`

### `components/matrx/Tooltip.tsx` — reaches 1010 surfaces

- [ ] `components/matrx/Tooltip.tsx:75` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{text}`

### `components/official-candidate/json-inspector/JsonInspector.tsx` — reaches 1010 surfaces

- [ ] `components/official-candidate/json-inspector/JsonInspector.tsx:522` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{rawJsonText}`

### `components/official/FullScreenOverlay.tsx` — reaches 1010 surfaces

- [ ] `components/official/FullScreenOverlay.tsx:545` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{selectedTab.content}`

### `components/official/item/ItemMenu.tsx` — reaches 1010 surfaces

- [ ] `components/official/item/ItemMenu.tsx:503` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{resolved.header.description}`

### `components/official/item/ItemMenuDrawer.tsx` — reaches 1010 surfaces

- [ ] `components/official/item/ItemMenuDrawer.tsx:106` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{config.header.description}`

### `components/official/json-explorer/BookmarksDialog.tsx` — reaches 1010 surfaces

- [ ] `components/official/json-explorer/BookmarksDialog.tsx:51` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{bookmark.description}`

### `components/official/processor-extractor/path-management/UnifiedBookmarkManager.tsx` — reaches 1010 surfaces

- [ ] `components/official/processor-extractor/path-management/UnifiedBookmarkManager.tsx:400` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{bookmark.description}`

### `components/user-generated-table-data/TableConfigModal.tsx` — reaches 1010 surfaces

- [ ] `components/user-generated-table-data/TableConfigModal.tsx:868` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{type.description}`

### `components/user-generated-table-data/UserTableViewer.tsx` — reaches 1010 surfaces

- [ ] `components/user-generated-table-data/UserTableViewer.tsx:55` — **InlineMarkdownWithLinks** (tracked) — `@/components/mardown-display/blocks/links/InlineMarkdownWithLinks`
- [ ] `components/user-generated-table-data/UserTableViewer.tsx:3701` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tableInfo.description}`

### `features/access-gate/components/AccessDenied.tsx` — reaches 1010 surfaces

- [ ] `features/access-gate/components/AccessDenied.tsx:422` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{s.description}`

### `features/admin/components/AdminDomainSection.tsx` — reaches 14 surfaces

- [ ] `features/admin/components/AdminDomainSection.tsx:73` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{destination.description}`

### `features/agent-apps/utils/allowed-imports.ts` — reaches 1010 surfaces

- [ ] `features/agent-apps/utils/allowed-imports.ts:155` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agent-apps/utils/allowed-imports.ts:163` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agent-apps/utils/allowed-imports.ts:171` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agent-apps/utils/allowed-imports.ts:179` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### `features/agent-shortcuts/components/AgentVersionPicker.tsx` — reaches 12 surfaces

- [ ] `features/agent-shortcuts/components/AgentVersionPicker.tsx:318` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{agent.description}`

### `features/agent-shortcuts/components/DefaultContextPolicyValuesEditor.tsx` — reaches 11 surfaces

- [ ] `features/agent-shortcuts/components/DefaultContextPolicyValuesEditor.tsx:91` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{slot.description}`

### `features/agent-shortcuts/components/ShortcutContextsPicker.tsx` — reaches 17 surfaces

- [ ] `features/agent-shortcuts/components/ShortcutContextsPicker.tsx:101` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{meta.description}`

### `features/agent-shortcuts/components/ShortcutScopePicker.tsx` — reaches 21 surfaces

- [ ] `features/agent-shortcuts/components/ShortcutScopePicker.tsx:180` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{option.description}`
- [ ] `features/agent-shortcuts/components/ShortcutScopePicker.tsx:239` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{selectedOption.description}`

### `features/agents/components/agent-listings/AgentSneakPeekModal.tsx` — reaches 1010 surfaces

- [ ] `features/agents/components/agent-listings/AgentSneakPeekModal.tsx:648` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{outputSchema.description}`
- [ ] `features/agents/components/agent-listings/AgentSneakPeekModal.tsx:674` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{field.description}`
- [ ] `features/agents/components/agent-listings/AgentSneakPeekModal.tsx:394` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{record.description}`

### `features/agents/components/context-items/bodies/GenericBody.tsx` — reaches 1010 surfaces

- [ ] `features/agents/components/context-items/bodies/GenericBody.tsx:36` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{text}`

### `features/agents/components/context-items/bodies/NoteBody.tsx` — reaches 1010 surfaces

- [ ] `features/agents/components/context-items/bodies/NoteBody.tsx:101` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{note.content}`

### `features/agents/components/context-policies-display/ContextPolicyDetailSheet.tsx` — reaches 1010 surfaces

- [ ] `features/agents/components/context-policies-display/ContextPolicyDetailSheet.tsx:151` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{policy.description}`

### `features/agents/components/context-policies-display/ContextValueBody.tsx` — reaches 1010 surfaces

- [ ] `features/agents/components/context-policies-display/ContextValueBody.tsx:25` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agents/components/context-policies-display/ContextValueBody.tsx:124` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{text}`

### `features/agents/components/debug/StreamDebugPanel.tsx` — reaches 53 surfaces

- [ ] `features/agents/components/debug/StreamDebugPanel.tsx:843` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{block.content}`
- [ ] `features/agents/components/debug/StreamDebugPanel.tsx:1267` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{reasoning}`
- [ ] `features/agents/components/debug/StreamDebugPanel.tsx:1273` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{text || ( <span className="text-muted-foreground/40 italic"> No text yet..…`

### `features/agents/components/inputs/smart-input/QuicksetPanel.tsx` — reaches 1010 surfaces

- [ ] `features/agents/components/inputs/smart-input/QuicksetPanel.tsx:164` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<li>{item.content}`

### `features/agents/components/inputs/smart-input/RunSkillPicker.tsx` — reaches 1010 surfaces

- [ ] `features/agents/components/inputs/smart-input/RunSkillPicker.tsx:380` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{skill.description}`

### `features/agents/components/inputs/smart-input/RunToolPicker.tsx` — reaches 1010 surfaces

- [ ] `features/agents/components/inputs/smart-input/RunToolPicker.tsx:641` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tool.description}`

### `features/agents/components/live-run/LiveRunDisplay.tsx` — reaches 1010 surfaces

- [ ] `features/agents/components/live-run/LiveRunDisplay.tsx:26` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### `features/agents/components/live-run/RunSetDisplay.tsx` — reaches 12 surfaces

- [ ] `features/agents/components/live-run/RunSetDisplay.tsx:28` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### `features/agents/components/memory/components/AgentMemoryAllView.tsx` — reaches 1010 surfaces

- [ ] `features/agents/components/memory/components/AgentMemoryAllView.tsx:96` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{memory.content}`

### `features/agents/components/messages-display/assistant/AgentAssistantMessage.tsx` — reaches 1010 surfaces

- [ ] `features/agents/components/messages-display/assistant/AgentAssistantMessage.tsx:81` — **AssistantActionBar (both copies)** (BANNED) — `./AssistantActionBar`
- [ ] `features/agents/components/messages-display/assistant/AgentAssistantMessage.tsx:41` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### `features/agents/components/messages-display/assistant/AgentEmptyMessageDisplay.tsx` — reaches 1010 surfaces

- [ ] `features/agents/components/messages-display/assistant/AgentEmptyMessageDisplay.tsx:10` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### `features/agents/components/messages-display/assistant/AssistantTurnGroup.tsx` — reaches 1010 surfaces

- [ ] `features/agents/components/messages-display/assistant/AssistantTurnGroup.tsx:40` — **AssistantActionBar (both copies)** (BANNED) — `./AssistantActionBar`

### `features/agents/components/messages-display/assistant/ProviderRetryCard.tsx` — reaches 1010 surfaces

- [ ] `features/agents/components/messages-display/assistant/ProviderRetryCard.tsx:154` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{copy.body}`

### `features/agents/components/messages-display/message-options/MessageOptionsMenu.tsx` — reaches 1010 surfaces

- [ ] `features/agents/components/messages-display/message-options/MessageOptionsMenu.tsx:24` — **messageActionRegistry (chat, both copies)** (BANNED) — `./messageActionRegistry`

### `features/agents/components/messages-display/message-options/userEditActions.ts` — reaches 1010 surfaces

- [ ] `features/agents/components/messages-display/message-options/userEditActions.ts:18` — **FullScreenMarkdownEditor (16-tab editor)** (BANNED) — `@/components/mardown-display/chat-markdown/FullScreenMarkdownEditor` (type-only)

### `features/agents/components/messages-display/user/AgentUserMessage.tsx` — reaches 1010 surfaces

- [ ] `features/agents/components/messages-display/user/AgentUserMessage.tsx:35` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### `features/agents/components/messages-display/user/CollabNoteMessage.tsx` — reaches 1010 surfaces

- [ ] `features/agents/components/messages-display/user/CollabNoteMessage.tsx:26` — **BasicMarkdownContent** (tracked) — `@/components/mardown-display/chat-markdown/BasicMarkdownContent`

### `features/agents/components/run-controls/AgentExecutionTestModal.tsx` — reaches 51 surfaces

- [ ] `features/agents/components/run-controls/AgentExecutionTestModal.tsx:184` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{responseText}`
- [ ] `features/agents/components/run-controls/AgentExecutionTestModal.tsx:362` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{responseText}`

### `features/agents/components/run-controls/PayloadTab.tsx` — reaches 51 surfaces

- [ ] `features/agents/components/run-controls/PayloadTab.tsx:117` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{text}`

### `features/agents/components/settings-management/AgentSettingsCore.tsx` — reaches 37 surfaces

- [ ] `features/agents/components/settings-management/AgentSettingsCore.tsx:318` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: colored }}`
- [ ] `features/agents/components/settings-management/AgentSettingsCore.tsx:326` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: colored }}`

### `features/agents/components/working-document/WorkingDocumentVersionHistory.tsx` — reaches 1010 surfaces

- [ ] `features/agents/components/working-document/WorkingDocumentVersionHistory.tsx:259` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{selectedContent || "(empty)"}`

### `features/agents/ui-first-tools/ui/ApprovalCard.tsx` — reaches 1010 surfaces

- [ ] `features/agents/ui-first-tools/ui/ApprovalCard.tsx:343` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{change.description}`

### `features/agents/ui-first-tools/ui/AskCard.tsx` — reaches 1010 surfaces

- [ ] `features/agents/ui-first-tools/ui/AskCard.tsx:647` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{opt.description}`
- [ ] `features/agents/ui-first-tools/ui/AskCard.tsx:878` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<div pre-wrap>{plan.reasoning}`

### `features/agents/ui-first-tools/ui/lists/TaskPanel.tsx` — reaches 1010 surfaces

- [ ] `features/agents/ui-first-tools/ui/lists/TaskPanel.tsx:164` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<div pre-wrap>{plan.reasoning}`

### `features/ai-models/components/lab/ModelListDropdown.tsx` — reaches 1010 surfaces

- [ ] `features/ai-models/components/lab/ModelListDropdown.tsx:623` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{model.description}`

### `features/approvals/kinds/contact-import.tsx` — reaches 11 surfaces

- [ ] `features/approvals/kinds/contact-import.tsx:277` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<td>{row.explanation ?? (row.values.length > 0 ? 'Value from Google Contacts: ${row.value…`

### `features/approvals/kinds/document-append.tsx` — reaches 11 surfaces

- [ ] `features/approvals/kinds/document-append.tsx:85` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{text}`

### `features/approvals/kinds/task-import.tsx` — reaches 11 surfaces

- [ ] `features/approvals/kinds/task-import.tsx:94` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{row.notes}`

### `features/assists/components/AssistActionTextEditor.tsx` — reaches 95 surfaces

- [ ] `features/assists/components/AssistActionTextEditor.tsx:97` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{definition.description}`

### `features/assists/components/AssistCard.tsx` — reaches 95 surfaces

- [ ] `features/assists/components/AssistCard.tsx:42` — **BasicMarkdownContent** (tracked) — `@/components/mardown-display/chat-markdown/BasicMarkdownContent`
- [ ] `features/assists/components/AssistCard.tsx:309` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{assist.reasoning}`
- [ ] `features/assists/components/AssistCard.tsx:296` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{assist.body}`

### `features/audio/components/MicrophoneRecordingModal.tsx` — reaches 1010 surfaces

- [ ] `features/audio/components/MicrophoneRecordingModal.tsx:306` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{editedText}`

### `features/auth/components/module-landing/ModuleLanding.tsx` — reaches 30 surfaces

- [ ] `features/auth/components/module-landing/ModuleLanding.tsx:222` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{feature.description}`
- [ ] `features/auth/components/module-landing/ModuleLanding.tsx:257` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{step.description}`

### `features/content-ir/studio/components/KindExampleManager.tsx` — reaches 11 surfaces

- [ ] `features/content-ir/studio/components/KindExampleManager.tsx:256` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{row.description}`

### `features/context-menu-v3/components/MenuContent.tsx` — reaches 1010 surfaces

- [ ] `features/context-menu-v3/components/MenuContent.tsx:158` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{node.description}`

### `features/data-tables/components/BulkRowActions.tsx` — reaches 1010 surfaces

- [ ] `features/data-tables/components/BulkRowActions.tsx:341` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{a.description}`

### `features/dynamic-react/toolRendererScope.ts` — reaches 1010 surfaces

- [ ] `features/dynamic-react/toolRendererScope.ts:313` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/dynamic-react/toolRendererScope.ts:347` — **react-katex** (BANNED) — `react-katex`

### `features/education/components/sections/SectionRenderer.tsx` — reaches 14 surfaces

- [ ] `features/education/components/sections/SectionRenderer.tsx:96` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`
- [ ] `features/education/components/sections/SectionRenderer.tsx:128` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{step.description}`
- [ ] `features/education/components/sections/SectionRenderer.tsx:163` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{card.description}`
- [ ] `features/education/components/sections/SectionRenderer.tsx:292` — **.split("\n").map(→ JSX) paragraph renderer** (review) — `section.body.split("\n\n").map((para, j) => ( <p key={j}>{para}</p> ))`

### `features/education/trust/components/VerifyAgainstSourceButton.tsx` — reaches 13 surfaces

- [ ] `features/education/trust/components/VerifyAgainstSourceButton.tsx:212` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{result.explanation}`

### `features/file-analysis/content/RawView.tsx` — reaches 12 surfaces

- [ ] `features/file-analysis/content/RawView.tsx:116` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{jsonText}`

### `features/files/blocks/image/UnifiedImageBlockRenderer.tsx` — reaches 1010 surfaces

- [ ] `features/files/blocks/image/UnifiedImageBlockRenderer.tsx:760` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{option.description}`
- [ ] `features/files/blocks/image/UnifiedImageBlockRenderer.tsx:786` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{option.description}`

### `features/files/components/core/FilePreview/PreviewerSwitch.tsx` — reaches 1010 surfaces

- [ ] `features/files/components/core/FilePreview/PreviewerSwitch.tsx:52` — **MarkdownPreview** (tracked) — `./previewers/MarkdownPreview`

### `features/files/components/core/FilePreview/previewers/MarkdownPreview.tsx` — reaches 1010 surfaces

- [ ] `features/files/components/core/FilePreview/previewers/MarkdownPreview.tsx:28` — **katex (direct)** (BANNED) — `katex/dist/katex.min.css`
- [ ] `features/files/components/core/FilePreview/previewers/MarkdownPreview.tsx:23` — **react-markdown** (BANNED) — `react-markdown`
- [ ] `features/files/components/core/FilePreview/previewers/MarkdownPreview.tsx:26` — **rehype-* plugins** (BANNED) — `rehype-katex`
- [ ] `features/files/components/core/FilePreview/previewers/MarkdownPreview.tsx:27` — **rehype-* plugins** (BANNED) — `rehype-prism-plus`
- [ ] `features/files/components/core/FilePreview/previewers/MarkdownPreview.tsx:24` — **remark-* plugins** (BANNED) — `remark-gfm`
- [ ] `features/files/components/core/FilePreview/previewers/MarkdownPreview.tsx:25` — **remark-* plugins** (BANNED) — `remark-math`

### `features/files/components/core/FilePreview/previewers/OfficePreview.tsx` — reaches 1010 surfaces

- [ ] `features/files/components/core/FilePreview/previewers/OfficePreview.tsx:47` — **react-markdown** (BANNED) — `react-markdown`
- [ ] `features/files/components/core/FilePreview/previewers/OfficePreview.tsx:48` — **remark-* plugins** (BANNED) — `remark-gfm`

### `features/flashcards/fast-fire/components/AnswerGradeBlock.tsx` — reaches 1010 surfaces

- [ ] `features/flashcards/fast-fire/components/AnswerGradeBlock.tsx:91` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{grade.verdict.explanation}`
- [ ] `features/flashcards/fast-fire/components/AnswerGradeBlock.tsx:100` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{grade.transcript}`

### `features/flashcards/fast-fire/voice-test/SingleCardVoiceTest.tsx` — reaches 1010 surfaces

- [ ] `features/flashcards/fast-fire/voice-test/SingleCardVoiceTest.tsx:3` — **CardFaceContent** (tracked) — `@/components/mardown-display/blocks/flashcards/CardFaceContent`

### `features/flashcards/fast-fire/voice-test/VoiceTestAudioSetup.tsx` — reaches 1010 surfaces

- [ ] `features/flashcards/fast-fire/voice-test/VoiceTestAudioSetup.tsx:3` — **CardFaceContent** (tracked) — `@/components/mardown-display/blocks/flashcards/CardFaceContent`

### `features/google-workspace/documents/GoogleDocumentPanel.tsx` — reaches 1010 surfaces

- [ ] `features/google-workspace/documents/GoogleDocumentPanel.tsx:408` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<div pre-wrap>{body}`

### `features/kg-suggestions/components/KgSuggestionRowItem.tsx` — reaches 18 surfaces

- [ ] `features/kg-suggestions/components/KgSuggestionRowItem.tsx:1111` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{body}`

### `features/marketing/lib/push-to-cms.ts` — reaches 98 surfaces

- [ ] `features/marketing/lib/push-to-cms.ts:216` — **marked** (BANNED) — `marked`

### `features/marketing/seo/topical-map/components/TopicalMapHomeCard.tsx` — reaches 14 surfaces

- [ ] `features/marketing/seo/topical-map/components/TopicalMapHomeCard.tsx:90` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{map.description ?? "No description"}`

### `features/marketing/seo/topical-map/panel/sections/IdentitySection.tsx` — reaches 1010 surfaces

- [ ] `features/marketing/seo/topical-map/panel/sections/IdentitySection.tsx:164` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{topic.description}`

### `features/marketing/seo/topical-map/proposals/MapTopicProposalView.tsx` — reaches 1010 surfaces

- [ ] `features/marketing/seo/topical-map/proposals/MapTopicProposalView.tsx:126` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{proposal.summary}`

### `features/marketing/seo/topical-map/start/StartMapResult.tsx` — reaches 15 surfaces

- [ ] `features/marketing/seo/topical-map/start/StartMapResult.tsx:113` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{result.summary}`

### `features/marketing/seo/value-system/workbench/RulingDialog.tsx` — reaches 43 surfaces

- [ ] `features/marketing/seo/value-system/workbench/RulingDialog.tsx:137` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{meta.description}`

### `features/marketing/strategy/components/StrategyBriefWorkspace.tsx` — reaches 14 surfaces

- [ ] `features/marketing/strategy/components/StrategyBriefWorkspace.tsx:33` — **MarkdownRenderer** (tracked) — `@/components/mardown-display/MarkdownRenderer`

### `features/math/components/InlineMathText.tsx` — reaches 1011 surfaces

- [ ] `features/math/components/InlineMathText.tsx:5` — **katex (direct)** (BANNED) — `katex/dist/katex.min.css`
- [ ] `features/math/components/InlineMathText.tsx:4` — **react-katex** (BANNED) — `react-katex`
- [ ] `features/math/components/InlineMathText.tsx:66` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{part.content}`

### `features/math/components/MathProblemImpl.tsx` — reaches 1011 surfaces

- [ ] `features/math/components/MathProblemImpl.tsx:5` — **katex (direct)** (BANNED) — `katex/dist/katex.min.css`
- [ ] `features/math/components/MathProblemImpl.tsx:6` — **react-katex** (BANNED) — `react-katex`

### `features/math/components/SolutionAnswer.tsx` — reaches 1011 surfaces

- [ ] `features/math/components/SolutionAnswer.tsx:6` — **katex (direct)** (BANNED) — `katex/dist/katex.min.css`
- [ ] `features/math/components/SolutionAnswer.tsx:4` — **react-katex** (BANNED) — `react-katex`

### `features/matrx-envelope/directives/createProjectWithTasks/CreateProjectWithTasksRenderer.tsx` — reaches 1010 surfaces

- [ ] `features/matrx-envelope/directives/createProjectWithTasks/CreateProjectWithTasksRenderer.tsx:79` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{task.description}`
- [ ] `features/matrx-envelope/directives/createProjectWithTasks/CreateProjectWithTasksRenderer.tsx:123` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{task.description}`

### `features/message-templates/components/SmartInputMessageTemplatePicker.tsx` — reaches 1010 surfaces

- [ ] `features/message-templates/components/SmartInputMessageTemplatePicker.tsx:123` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{template.content}`

### `features/notes/components/CreateFolderDialog.tsx` — reaches 1010 surfaces

- [ ] `features/notes/components/CreateFolderDialog.tsx:170` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{category.description}`

### `features/notes/components/NoteConflictWindow.tsx` — reaches 1010 surfaces

- [ ] `features/notes/components/NoteConflictWindow.tsx:144` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{analysis.summary}`
- [ ] `features/notes/components/NoteConflictWindow.tsx:231` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{remoteContent}`

### `features/notes/components/NoteEditorCore.tsx` — reaches 1010 surfaces

- [ ] `features/notes/components/NoteEditorCore.tsx:30` — **RichDocument** (tracked) — `@/features/rich-document/RichDocument`
- [ ] `features/notes/components/NoteEditorCore.tsx:41` — **TuiEditorContent** (BANNED) — `@/components/mardown-display/chat-markdown/tui/TuiEditorContent` (type-only)
- [ ] `features/notes/components/NoteEditorCore.tsx:52` — **TuiEditorContent** (BANNED) — `@/components/mardown-display/chat-markdown/tui/TuiEditorContent`

### `features/notes/components/cleanup/CleanupOptionsPopover.tsx` — reaches 1010 surfaces

- [ ] `features/notes/components/cleanup/CleanupOptionsPopover.tsx:163` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{CLEANUP_REGION_OPERATION_META.find((m) => m.id === regionOp) ?.description}`
- [ ] `features/notes/components/cleanup/CleanupOptionsPopover.tsx:204` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{m.description}`

### `features/organizations/peek/kinds/OrganizationPeek.tsx` — reaches 1010 surfaces

- [ ] `features/organizations/peek/kinds/OrganizationPeek.tsx:76` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<div pre-wrap>{row.description}`

### `features/organizations/peek/kinds/ProjectPeek.tsx` — reaches 1010 surfaces

- [ ] `features/organizations/peek/kinds/ProjectPeek.tsx:63` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<div pre-wrap>{row.description}`

### `features/organizations/peek/kinds/ShortcutPeek.tsx` — reaches 1010 surfaces

- [ ] `features/organizations/peek/kinds/ShortcutPeek.tsx:62` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<div pre-wrap>{row.description}`

### `features/organizations/peek/kinds/SkillPeek.tsx` — reaches 1010 surfaces

- [ ] `features/organizations/peek/kinds/SkillPeek.tsx:62` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<div pre-wrap>{row.description}`

### `features/organizations/peek/kinds/TaskPeek.tsx` — reaches 1010 surfaces

- [ ] `features/organizations/peek/kinds/TaskPeek.tsx:65` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<div pre-wrap>{description}`

### `features/organizations/peek/kinds/TranscriptPeek.tsx` — reaches 1010 surfaces

- [ ] `features/organizations/peek/kinds/TranscriptPeek.tsx:62` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<div pre-wrap>{row.description}`

### `features/pdf/components/PdfSurfaceSwitcher.tsx` — reaches 1010 surfaces

- [ ] `features/pdf/components/PdfSurfaceSwitcher.tsx:138` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{surface.description}`

### `features/rag/components/data-stores/DataStoreBindPanel.tsx` — reaches 14 surfaces

- [ ] `features/rag/components/data-stores/DataStoreBindPanel.tsx:187` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{s.description}`

### `features/resource-manager/resource-picker/NotesResourcePicker.tsx` — reaches 1010 surfaces

- [ ] `features/resource-manager/resource-picker/NotesResourcePicker.tsx:148` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{note.content || "Empty note"}`
- [ ] `features/resource-manager/resource-picker/NotesResourcePicker.tsx:275` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{note.content || "Empty note"}`
- [ ] `features/resource-manager/resource-picker/NotesResourcePicker.tsx:185` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<div pre-wrap>{note.content || "Empty note"}`
- [ ] `features/resource-manager/resource-picker/NotesResourcePicker.tsx:303` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<div pre-wrap>{note.content || "Empty note"}`

### `features/resource-manager/resource-picker/TablesResourcePicker.tsx` — reaches 1010 surfaces

- [ ] `features/resource-manager/resource-picker/TablesResourcePicker.tsx:395` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{table.description}`

### `features/resource-manager/resource-picker/TasksResourcePicker.tsx` — reaches 1010 surfaces

- [ ] `features/resource-manager/resource-picker/TasksResourcePicker.tsx:306` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{task.description}`
- [ ] `features/resource-manager/resource-picker/TasksResourcePicker.tsx:356` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<div pre-wrap>{task.description}`

### `features/rich-document/RichDocument.tsx` — reaches 1010 surfaces

- [ ] `features/rich-document/RichDocument.tsx:69` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### `features/scope-system/components/forms/ContextItemSettingsForm.tsx` — reaches 12 surfaces

- [ ] `features/scope-system/components/forms/ContextItemSettingsForm.tsx:455` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{FETCH_HINT_CONFIG[fetchHint].description}`
- [ ] `features/scope-system/components/forms/ContextItemSettingsForm.tsx:482` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{SENSITIVITY_CONFIG[sensitivity].description}`

### `features/scopes/components/reference/ContextValueDisplay.tsx` — reaches 1010 surfaces

- [ ] `features/scopes/components/reference/ContextValueDisplay.tsx:26` — **BasicMarkdownContent** (tracked) — `@/components/mardown-display/chat-markdown/BasicMarkdownContent`

### `features/scopes/components/reference/ContextValueInput.tsx` — reaches 1010 surfaces

- [ ] `features/scopes/components/reference/ContextValueInput.tsx:43` — **BasicContentEditor (split editor)** (BANNED) — `@/components/content-refine/BasicContentEditor`

### `features/scraper/parts/ScrapedContentPretty.tsx` — reaches 1010 surfaces

- [ ] `features/scraper/parts/ScrapedContentPretty.tsx:4` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### `features/scraper/parts/ScraperHookErrorDetails.tsx` — reaches 1010 surfaces

- [ ] `features/scraper/parts/ScraperHookErrorDetails.tsx:52` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{text}`

### `features/shell/components/header/RouteModeNav.tsx` — reaches 1023 surfaces

- [ ] `features/shell/components/header/RouteModeNav.tsx:300` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{item.description}`
- [ ] `features/shell/components/header/RouteModeNav.tsx:363` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{item.description}`

### `features/shell/components/header/templates/MobilePanelShell.tsx` — reaches 34 surfaces

- [ ] `features/shell/components/header/templates/MobilePanelShell.tsx:199` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{panel.content}`
- [ ] `features/shell/components/header/templates/MobilePanelShell.tsx:244` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{p.content}`
- [ ] `features/shell/components/header/templates/MobilePanelShell.tsx:319` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{p.content}`

### `features/tool-call-visualization/renderers/agent-call/CollabCallCard.tsx` — reaches 1010 surfaces

- [ ] `features/tool-call-visualization/renderers/agent-call/CollabCallCard.tsx:22` — **BasicMarkdownContent** (tracked) — `@/components/mardown-display/chat-markdown/BasicMarkdownContent`

### `features/tool-call-visualization/renderers/ask/AskInline.tsx` — reaches 1010 surfaces

- [ ] `features/tool-call-visualization/renderers/ask/AskInline.tsx:158` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{qa.answer}`

### `features/tool-call-visualization/renderers/dataset/DatasetInline.tsx` — reaches 1010 surfaces

- [ ] `features/tool-call-visualization/renderers/dataset/DatasetInline.tsx:123` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{ds.description}`

### `features/tool-call-visualization/renderers/document-content/DocumentContentInline.tsx` — reaches 1010 surfaces

- [ ] `features/tool-call-visualization/renderers/document-content/DocumentContentInline.tsx:66` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<div pre-wrap>{text || <span className="text-muted-foreground">No text on these pages.</s…`

### `features/tool-call-visualization/renderers/document/DocumentOverlay.tsx` — reaches 1010 surfaces

- [ ] `features/tool-call-visualization/renderers/document/DocumentOverlay.tsx:5` — **RichDocument** (tracked) — `@/features/rich-document/RichDocument`

### `features/tool-call-visualization/renderers/fs/FsInline.tsx` — reaches 1010 surfaces

- [ ] `features/tool-call-visualization/renderers/fs/FsInline.tsx:30` — **BasicMarkdownContent** (tracked) — `@/components/mardown-display/chat-markdown/BasicMarkdownContent`

### `features/tool-call-visualization/renderers/get-user-lists/UserListsInline.tsx` — reaches 1010 surfaces

- [ ] `features/tool-call-visualization/renderers/get-user-lists/UserListsInline.tsx:201` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{list.description}`

### `features/tool-call-visualization/renderers/get-user-lists/UserListsOverlay.tsx` — reaches 1010 surfaces

- [ ] `features/tool-call-visualization/renderers/get-user-lists/UserListsOverlay.tsx:308` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{list.description}`

### `features/tool-call-visualization/renderers/knowledge-browse/KnowledgeChunkInline.tsx` — reaches 1010 surfaces

- [ ] `features/tool-call-visualization/renderers/knowledge-browse/KnowledgeChunkInline.tsx:205` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<div pre-wrap>{chunk.content || ( <span className="text-muted-foreground">Empty chunk.</s…`
- [ ] `features/tool-call-visualization/renderers/knowledge-browse/KnowledgeChunkInline.tsx:226` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<div pre-wrap>{chunk.parent.content}`

### `features/tool-call-visualization/renderers/knowledge-browse/KnowledgeStoreInline.tsx` — reaches 1010 surfaces

- [ ] `features/tool-call-visualization/renderers/knowledge-browse/KnowledgeStoreInline.tsx:147` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{store.description}`
- [ ] `features/tool-call-visualization/renderers/knowledge-browse/KnowledgeStoreInline.tsx:166` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{m.notes}`

### `features/tool-call-visualization/renderers/knowledge-browse/KnowledgeStoresInline.tsx` — reaches 1010 surfaces

- [ ] `features/tool-call-visualization/renderers/knowledge-browse/KnowledgeStoresInline.tsx:72` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{store.description}`

### `features/tool-call-visualization/renderers/news-api/NewsInline.tsx` — reaches 1010 surfaces

- [ ] `features/tool-call-visualization/renderers/news-api/NewsInline.tsx:175` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{article.description}`

### `features/tool-call-visualization/renderers/news-api/NewsOverlay.tsx` — reaches 1010 surfaces

- [ ] `features/tool-call-visualization/renderers/news-api/NewsOverlay.tsx:221` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{article.description}`
- [ ] `features/tool-call-visualization/renderers/news-api/NewsOverlay.tsx:227` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{article.content}`

### `features/tool-call-visualization/renderers/note/NoteToolParts.tsx` — reaches 1010 surfaces

- [ ] `features/tool-call-visualization/renderers/note/NoteToolParts.tsx:14` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### `features/tool-call-visualization/renderers/random-wheel/RandomWheelInline.tsx` — reaches 1010 surfaces

- [ ] `features/tool-call-visualization/renderers/random-wheel/RandomWheelInline.tsx:45` — **BasicMarkdownContent** (tracked) — `@/components/mardown-display/chat-markdown/BasicMarkdownContent`
- [ ] `features/tool-call-visualization/renderers/random-wheel/RandomWheelInline.tsx:681` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{text}`

### `features/tool-call-visualization/renderers/research/ResearchOverlay.tsx` — reaches 1010 surfaces

- [ ] `features/tool-call-visualization/renderers/research/ResearchOverlay.tsx:33` — **BasicMarkdownContent** (tracked) — `@/components/mardown-display/chat-markdown/BasicMarkdownContent`
- [ ] `features/tool-call-visualization/renderers/research/ResearchOverlay.tsx:30` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/tool-call-visualization/renderers/research/ResearchOverlay.tsx:31` — **RichDocument** (tracked) — `@/features/rich-document/RichDocument`

### `features/tool-call-visualization/renderers/research/SubagentReportBlock.tsx` — reaches 1010 surfaces

- [ ] `features/tool-call-visualization/renderers/research/SubagentReportBlock.tsx:41` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/tool-call-visualization/renderers/research/SubagentReportBlock.tsx:42` — **RichDocument** (tracked) — `@/features/rich-document/RichDocument`

### `features/tool-call-visualization/renderers/scrape/ScrapeOverlay.tsx` — reaches 1010 surfaces

- [ ] `features/tool-call-visualization/renderers/scrape/ScrapeOverlay.tsx:25` — **BasicMarkdownContent** (tracked) — `@/components/mardown-display/chat-markdown/BasicMarkdownContent`

### `features/tool-call-visualization/renderers/search/SearchInline.tsx` — reaches 1010 surfaces

- [ ] `features/tool-call-visualization/renderers/search/SearchInline.tsx:58` — **BasicMarkdownContent** (tracked) — `@/components/mardown-display/chat-markdown/BasicMarkdownContent`

### `features/tool-call-visualization/renderers/search/SearchOverlay.tsx` — reaches 1010 surfaces

- [ ] `features/tool-call-visualization/renderers/search/SearchOverlay.tsx:37` — **BasicMarkdownContent** (tracked) — `@/components/mardown-display/chat-markdown/BasicMarkdownContent`

### `features/tool-call-visualization/renderers/skill/SkillInline.tsx` — reaches 1010 surfaces

- [ ] `features/tool-call-visualization/renderers/skill/SkillInline.tsx:149` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{description}`

### `features/tool-call-visualization/renderers/sql/SqlInline.tsx` — reaches 1010 surfaces

- [ ] `features/tool-call-visualization/renderers/sql/SqlInline.tsx:31` — **BasicMarkdownContent** (tracked) — `@/components/mardown-display/chat-markdown/BasicMarkdownContent`

### `features/tool-call-visualization/result-fields/ResultMarkdown.tsx` — reaches 1010 surfaces

- [ ] `features/tool-call-visualization/result-fields/ResultMarkdown.tsx:15` — **BasicMarkdownContent** (tracked) — `@/components/mardown-display/chat-markdown/BasicMarkdownContent`

### `features/user-lists/components/ListItem.tsx` — reaches 1010 surfaces

- [ ] `features/user-lists/components/ListItem.tsx:68` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description || item.help_text}`

### `features/user-lists/components/ListMetaHeader.tsx` — reaches 1010 surfaces

- [ ] `features/user-lists/components/ListMetaHeader.tsx:95` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{list.description}`

### `features/workflow-emit/GenericEmitRenderer.tsx` — reaches 12 surfaces

- [ ] `features/workflow-emit/GenericEmitRenderer.tsx:23` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### `features/workflow-runtime/components/SettledOutputBody.tsx` — reaches 1010 surfaces

- [ ] `features/workflow-runtime/components/SettledOutputBody.tsx:25` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### `features/workflow-runtime/components/readout-parts.tsx` — reaches 24 surfaces

- [ ] `features/workflow-runtime/components/readout-parts.tsx:29` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### `features/workflow-runtime/interrupt/InterruptQuestion.tsx` — reaches 24 surfaces

- [ ] `features/workflow-runtime/interrupt/InterruptQuestion.tsx:171` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{view.prompt}`

### `lib/entity-list/components/EntityListPage.tsx` — reaches 26 surfaces

- [ ] `lib/entity-list/components/EntityListPage.tsx:893` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{state.description}`

### `lib/field-formats/FieldFormatPicker.tsx` — reaches 1010 surfaces

- [ ] `lib/field-formats/FieldFormatPicker.tsx:412` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{f.description}`
- [ ] `lib/field-formats/FieldFormatPicker.tsx:429` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{f.description}`

### `lib/field-formats/FormattedFieldValue.tsx` — reaches 1010 surfaces

- [ ] `lib/field-formats/FormattedFieldValue.tsx:18` — **InlineMarkdownWithLinks** (tracked) — `@/components/mardown-display/blocks/links/InlineMarkdownWithLinks`

### `lib/guided-setup/components/GuidedChecklist.tsx` — reaches 15 surfaces

- [ ] `lib/guided-setup/components/GuidedChecklist.tsx:177` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{resolved.description}`

### `utils/markdown-processors/clean-markdown-to-text.ts` — reaches 1010 surfaces

- [ ] `utils/markdown-processors/clean-markdown-to-text.ts:71` — **cleanMarkdownPreview (regex markdown stripping)** (BANNED) — `definition of cleanMarkdownPreview`

## By surface

Each surface lists the legacy sites it reaches, EXCLUDING the shared files above.

### api /api/chat/email-response

- [ ] `lib/email/exportService.ts:2` — **marked** (BANNED) — `marked`

### api /api/export/email-table

- [ ] `lib/email/exportService.ts:2` — **marked** (BANNED) — `marked`

### api /api/public/email

- [ ] `lib/email/exportService.ts:2` — **marked** (BANNED) — `marked`

### api /api/sharing/email-link

- [ ] `lib/email/exportService.ts:2` — **marked** (BANNED) — `marked`

### layout /

- [ ] `components/audio/AudioModal.tsx:62` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<div pre-wrap>{text}`
- [ ] `components/debug/AgentExecutionDebugPanel.tsx:194` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<code pre-wrap>{content}`
- [ ] `components/debug/AgentExecutionDebugPanel.tsx:746` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{accumulatedText}`
- [ ] `components/debug/SystemPromptDebugModal.tsx:136` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<div pre-wrap>{selectedText || <span className="text-muted-foreground italic">No selectio…`
- [ ] `components/errors/ChunkRecoveryBootScript.tsx:82` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: SCRIPT }}`
- [ ] `components/official/review-deck/ReviewDeck.tsx:214` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{current.body}`
- [ ] `components/official/settings/primitives/SettingsRadioGroup.tsx:78` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{opt.description}`
- [ ] `features/agents/components/debug/SandboxFileViewer.tsx:144` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{content}`
- [ ] `features/audio/components/AudioRecoveryModal.tsx:266` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{localText}`
- [ ] `features/cloud-browser/components/Walkthrough.tsx:13` — **BasicMarkdownContent** (tracked) — `@/components/mardown-display/chat-markdown/BasicMarkdownContent`
- [ ] `features/cloud-browser/components/WrittenProgressFace.tsx:15` — **BasicMarkdownContent** (tracked) — `@/components/mardown-display/chat-markdown/BasicMarkdownContent`
- [ ] `features/connectors/ConnectorPromptCard.tsx:168` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{provider.prompt.body}`
- [ ] `features/mandates/components/MandateNotesPanel.tsx:245` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{note.body}`
- [ ] `features/marketing/seo/topical-map/proposals/ProposalReview.tsx:127` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{topic.description}`
- [ ] `features/marketing/seo/topical-map/views/HistoryView.tsx:376` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`
- [ ] `features/marketing/seo/topical-map/views/TextView.tsx:18` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/marketing/seo/topical-map/views/outline/TopicHoverCard.tsx:55` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{topic.description}`
- [ ] `features/marketing/seo/topical-map/views/table/columns.tsx:348` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.topic.description}`
- [ ] `features/notifications/components/InboxPanel.tsx:131` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.body}`
- [ ] `features/organizations/components/OrganizationCard.tsx:181` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{organization.description}`
- [ ] `features/settings/pages/FeedbackSettingsPage.tsx:566` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{item.description}`
- [ ] `features/settings/pages/FeedbackSettingsPage.tsx:668` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{item.description}`
- [ ] `features/settings/pages/FeedbackSettingsPage.tsx:757` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{msg.content}`
- [ ] `features/settings/pages/IntegrationsSettingsPage.tsx:897` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`
- [ ] `lib/sync/components/SyncBootScript.tsx:69` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: script }}`

### layout /notes

- [ ] `app/(core)/notes/layout.tsx:76` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: highlightStyles }}`
- [ ] `features/notes/components/mobile/MobileNoteEditor.tsx:16` — **RichDocument** (tracked) — `@/features/rich-document/RichDocument`
- [ ] `features/notes/components/mobile/MobileNoteEditor.tsx:21` — **TuiEditorContent** (BANNED) — `@/components/mardown-display/chat-markdown/tui/TuiEditorContent` (type-only)
- [ ] `features/notes/components/mobile/MobileNoteEditor.tsx:58` — **TuiEditorContent** (BANNED) — `@/components/mardown-display/chat-markdown/tui/TuiEditorContent`

### opener fullScreenEditor

- [ ] `features/overlays/openers/fullScreenEditor.tsx:33` — **FullScreenMarkdownEditor (16-tab editor)** (BANNED) — `@/components/mardown-display/chat-markdown/FullScreenMarkdownEditor` (type-only)

### overlay adminIndicator (Admin Indicator)

- [ ] `components/admin/debug/DebugModulePanel.tsx:70` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{debugModule.description}`
- [ ] `components/admin/state-analyzer/execution-inspector/ExecutionInstanceInspector.tsx:372` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{agentData.description}`

### overlay adminStateAnalyzer (State Analyzer (overlay))

- [ ] `components/admin/state-analyzer/execution-inspector/ExecutionInstanceInspector.tsx:372` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{agentData.description}`

### overlay adminStateAnalyzerWindow (State Analyzer)

- [ ] `components/admin/state-analyzer/execution-inspector/ExecutionInstanceInspector.tsx:372` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{agentData.description}`

### overlay agentAdminFindUsagesWindow (Find Usages (Admin))

- [ ] `features/agents/components/usages/UsageRowDetail.tsx:52` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{meta.description}`

### overlay agentAdminShortcutWindow (Create Shortcut)

- [ ] `features/agent-shortcuts/components/ShortcutQuickCreateBody.tsx:87` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{agent.description}`
- [ ] `features/agent-shortcuts/components/ShortcutQuickCreateBody.tsx:248` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{opt.description}`
- [ ] `features/agent-shortcuts/components/ShortcutQuickCreateBody.tsx:588` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{shortcut.description}`

### overlay agentAdvancedEditorWindow (Agent Advanced Editor)

- [ ] `features/agents/components/builder/message-builders/AddBlockButton.tsx:28` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/DecisionQuestionsEditor.tsx:33` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/MessageItem.tsx:60` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agents/components/builder/message-builders/MessageItem.tsx:43` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/MessageItem.tsx:45` — **MessageViewModeMenu (bespoke mode toggle)** (BANNED) — `@/features/agents/components/builder/message-builders/MessageViewModeMenu`
- [ ] `features/agents/components/builder/message-builders/MessageViewModeMenu.tsx:124` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{meta.description}`
- [ ] `features/agents/components/builder/message-builders/SpeechScriptEditor.tsx:60` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/system-instructions/FullPromptOptimizer.tsx:36` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agents/components/builder/message-builders/system-instructions/SystemMessage.tsx:29` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agents/components/builder/message-builders/system-instructions/SystemMessage.tsx:21` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/system-instructions/SystemMessage.tsx:25` — **MessageViewModeMenu (bespoke mode toggle)** (BANNED) — `@/features/agents/components/builder/message-builders/MessageViewModeMenu`
- [ ] `features/agents/components/builder/message-builders/system-instructions/SystemPromptOptimizer.tsx:51` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agents/components/tools-management/AgentBundlesPanel.tsx:469` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{bundle.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:1633` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tool.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:1853` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tool.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:2817` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:3309` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{selectedConfig.notes}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:3669` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:3784` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{pDef.description ?? "—"}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:3974` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tool.description}`
- [ ] `features/message-templates/components/SaveTemplateModal.tsx:31` — **hand-rolled AutoTextarea / AutoResizeTextarea** (BANNED) — `definition of AutoResizeTextarea`
- [ ] `features/message-templates/components/SaveTemplateModal.tsx:14` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/message-templates/components/TemplateBrowserModal.tsx:403` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{template.content}`
- [ ] `features/message-templates/components/TemplateBrowserModal.tsx:47` — **RichDocument** (tracked) — `@/features/rich-document/RichDocument`

### overlay agentAssistantMarkdownDebugWindow (MD Debug)

- [ ] `features/window-panels/windows/agents/AgentAssistantMarkdownDebugWindow.tsx:5` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### overlay agentConnectionsWindow (Agent Connections)

- [ ] `components/official/settings/primitives/SettingsRadioGroup.tsx:78` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{opt.description}`
- [ ] `features/agent-connections/components/sections/AgentsSection.tsx:128` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{agent.description ?? agent.id}`
- [ ] `features/agent-connections/components/sections/McpServersSection.tsx:261` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`
- [ ] `features/agent-connections/components/sections/McpServersSection.tsx:316` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tool.description}`
- [ ] `features/agent-connections/components/sections/OverviewSection.tsx:156` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{card.description}`
- [ ] `features/agent-connections/components/sections/RenderBlocksSection.tsx:316` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{def.description}`
- [ ] `features/skills/components/SkillDetailEditor.tsx:40` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/skills/components/SkillsBrowser.tsx:242` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{s.description}`

### overlay agentDebugWindow (Agent Debug)

- [ ] `features/window-panels/windows/agents/AgentDebugWindow.tsx:508` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{text}`

### overlay agentFindUsagesWindow (Find Usages)

- [ ] `features/agents/components/usages/UsageRowDetail.tsx:52` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{meta.description}`

### overlay agentSettingsWindow (Agent Settings)

- [ ] `features/surfaces/components/bind/BindingSuggestionsTab.tsx:403` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{proposal.notes}`

### overlay agentSkillsWindow (Agent Skills)

- [ ] `features/skills/components/SkillConfigPicker.tsx:480` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{skill.description || "No description provided."}`
- [ ] `features/skills/components/SkillDetailView.tsx:31` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/skills/components/SkillDetailView.tsx:138` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{skill.description || "No description provided."}`

### overlay agentTestCasesWindow (Test Cases)

- [ ] `features/agents/components/samples/TestCaseInputs.tsx:227` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{part.description}`

### overlay aiVoiceWindow (AI Voice)

- [ ] `features/audio/voice/VoicesList.tsx:232` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{voice.description}`
- [ ] `features/audio/voice/components/VoiceSelectionModal.tsx:240` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{voice.description || "No description available"}`

### overlay announcements (Announcements)

- [ ] `components/layout/AnnouncementExperience.tsx:33` — **renderAnnouncementMessage (regex link parser)** (BANNED) — `renderAnnouncementMessage ← @/utils/render-announcement-message`
- [ ] `utils/render-announcement-message.tsx:96` — **renderAnnouncementMessage (regex link parser)** (BANNED) — `definition of renderAnnouncementMessage`

### overlay approvalsWindow (Waiting on you)

- [ ] `features/approvals/ApprovalQueue.tsx:932` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{item.body}`

### overlay audioControlWindow (Media)

- [ ] `features/media-capture/components/CaptureItemActions.tsx:133` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<div pre-wrap>{transcript}`

### overlay canvasViewerWindow (Canvas Viewer)

- [ ] `features/canvas/shared/SharedCanvasView.tsx:189` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{canvas.description}`

### overlay cloudBrowserWindow

- [ ] `features/cloud-browser/components/Walkthrough.tsx:13` — **BasicMarkdownContent** (tracked) — `@/components/mardown-display/chat-markdown/BasicMarkdownContent`
- [ ] `features/cloud-browser/components/WrittenProgressFace.tsx:15` — **BasicMarkdownContent** (tracked) — `@/components/mardown-display/chat-markdown/BasicMarkdownContent`

### overlay codeWorkspaceWindow (Code Workspace)

- [ ] `features/code/views/extensions/ExtensionsPanel.tsx:115` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{tool.description}`
- [ ] `features/code/views/sandboxes/SandboxDiagnosticsPanel.tsx:976` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{fileContent || "(empty file)"}`

### overlay contentEditorListWindow (Content List Editor)

- [ ] `components/official/content-editor/ContentEditor.tsx:29` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `components/official/content-editor/ContentEditor.tsx:321` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{config.description}`
- [ ] `components/official/content-editor/ContentEditor.tsx:31` — **TuiEditorContent** (BANNED) — `@/components/mardown-display/chat-markdown/tui/TuiEditorContent` (type-only)
- [ ] `components/official/content-editor/ContentEditor.tsx:40` — **TuiEditorContent** (BANNED) — `@/components/mardown-display/chat-markdown/tui/TuiEditorContent`
- [ ] `features/html-pages/components/HtmlPreviewFullScreenEditor.tsx:10` — **TuiEditorContent** (BANNED) — `@/components/mardown-display/chat-markdown/tui/TuiEditorContent`
- [ ] `features/html-pages/components/tabs/MarkdownPreviewTab.tsx:4` — **RichDocument** (tracked) — `@/features/rich-document/RichDocument`
- [ ] `features/html-pages/components/tabs/MarkdownWysiwygTab.tsx:5` — **TuiEditorContent** (BANNED) — `@/components/mardown-display/chat-markdown/tui/TuiEditorContent`
- [ ] `features/window-panels/windows/content-editors/ContentEditorListWindow.tsx:14` — **components/official/content-editor/ContentEditor** (BANNED) — `@/components/official/content-editor/ContentEditor`

### overlay contentEditorWindow (Content Editor)

- [ ] `components/official/content-editor/ContentEditor.tsx:29` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `components/official/content-editor/ContentEditor.tsx:321` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{config.description}`
- [ ] `components/official/content-editor/ContentEditor.tsx:31` — **TuiEditorContent** (BANNED) — `@/components/mardown-display/chat-markdown/tui/TuiEditorContent` (type-only)
- [ ] `components/official/content-editor/ContentEditor.tsx:40` — **TuiEditorContent** (BANNED) — `@/components/mardown-display/chat-markdown/tui/TuiEditorContent`
- [ ] `features/html-pages/components/HtmlPreviewFullScreenEditor.tsx:10` — **TuiEditorContent** (BANNED) — `@/components/mardown-display/chat-markdown/tui/TuiEditorContent`
- [ ] `features/html-pages/components/tabs/MarkdownPreviewTab.tsx:4` — **RichDocument** (tracked) — `@/features/rich-document/RichDocument`
- [ ] `features/html-pages/components/tabs/MarkdownWysiwygTab.tsx:5` — **TuiEditorContent** (BANNED) — `@/components/mardown-display/chat-markdown/tui/TuiEditorContent`
- [ ] `features/window-panels/windows/content-editors/ContentEditorWindow.tsx:13` — **components/official/content-editor/ContentEditor** (BANNED) — `@/components/official/content-editor/ContentEditor`

### overlay contentEditorWorkspaceWindow (Content Workspace)

- [ ] `components/official/content-editor/ContentEditor.tsx:29` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `components/official/content-editor/ContentEditor.tsx:321` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{config.description}`
- [ ] `components/official/content-editor/ContentEditor.tsx:31` — **TuiEditorContent** (BANNED) — `@/components/mardown-display/chat-markdown/tui/TuiEditorContent` (type-only)
- [ ] `components/official/content-editor/ContentEditor.tsx:40` — **TuiEditorContent** (BANNED) — `@/components/mardown-display/chat-markdown/tui/TuiEditorContent`
- [ ] `components/official/content-editor/ContentEditorTabs.tsx:13` — **components/official/content-editor/ContentEditor** (BANNED) — `./ContentEditor`
- [ ] `components/official/content-editor/ContentEditorTabs.tsx:265` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{config.description}`
- [ ] `features/html-pages/components/HtmlPreviewFullScreenEditor.tsx:10` — **TuiEditorContent** (BANNED) — `@/components/mardown-display/chat-markdown/tui/TuiEditorContent`
- [ ] `features/html-pages/components/tabs/MarkdownPreviewTab.tsx:4` — **RichDocument** (tracked) — `@/features/rich-document/RichDocument`
- [ ] `features/html-pages/components/tabs/MarkdownWysiwygTab.tsx:5` — **TuiEditorContent** (BANNED) — `@/components/mardown-display/chat-markdown/tui/TuiEditorContent`

### overlay copySubsetWindow

- [ ] `components/agent-copy/copy-subset/CopySubsetWindow.tsx:231` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<span pre-wrap>{text || <span className="text-muted-foreground">—</span>}`

### overlay createProjectWindow (Create Project)

- [ ] `features/agents/components/smart/CreateWithAiTabs.tsx:272` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{tab.content}`

### overlay creatorHub (Creator Hub)

- [ ] `features/agents/components/debug/SandboxFileViewer.tsx:144` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{content}`
- [ ] `features/agents/components/observational-memory/components/MemoryStateInspector.tsx:473` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{text}`
- [ ] `features/agents/components/observational-memory/components/MemoryStateInspector.tsx:753` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{text}`
- [ ] `features/code/views/sandboxes/SandboxDiagnosticsPanel.tsx:976` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{fileContent || "(empty file)"}`

### overlay credentialVaultWindow (Vault)

- [ ] `features/secrets/components/VaultCreateDialog.tsx:1376` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{loginUrlDef?.description ?? "Where this login is used. Stored as plain, unencrypted m…`
- [ ] `features/secrets/components/VaultCreateDialog.tsx:1829` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{draft.def.description}`
- [ ] `features/secrets/components/VaultCreateDialog.tsx:1980` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{def.description}`
- [ ] `features/secrets/components/VaultHandlingControl.tsx:80` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{presentation.description}`
- [ ] `features/secrets/components/VaultItemDetail.tsx:2490` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{VAULT_LABELS.notes}`
- [ ] `features/secrets/components/VaultItemDetail.tsx:321` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{item.description}`
- [ ] `features/secrets/components/VaultItemDetail.tsx:859` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<dd pre-wrap>{attachment.description}`
- [ ] `features/secrets/components/VaultItemDetail.tsx:1270` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<span pre-wrap>{field.description}`
- [ ] `features/secrets/components/VaultItemDetail.tsx:2493` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{item.notes}`

### overlay executionInspectorWindow (Execution Inspector)

- [ ] `components/admin/state-analyzer/execution-inspector/ExecutionInstanceInspector.tsx:372` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{agentData.description}`

### overlay extractionCellEditorWindow (Extraction Cell Editor)

- [ ] `features/window-panels/windows/page-extraction/ExtractionCellEditorWindow.tsx:12` — **BasicContentEditor (split editor)** (BANNED) — `@/components/content-refine/BasicContentEditor`

### overlay flashcardStudyWindow (Flashcard Study)

- [ ] `features/flashcards/components/study/study-deck-parts.tsx:20` — **CardFaceContent** (tracked) — `@/components/mardown-display/blocks/flashcards/CardFaceContent`

### overlay googleAgendaWindow (Agenda)

- [ ] `features/connectors/ConnectorPromptCard.tsx:168` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{provider.prompt.body}`

### overlay googleContactsImportWindow (Import from Google Contacts)

- [ ] `features/connectors/import/GoogleContactsImportPanel.tsx:839` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{decision.explanation}`

### overlay hindsightFindingWindow (Hindsight Finding)

- [ ] `features/hindsight/components/DiscussPanel.tsx:35` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/hindsight/components/FindingCard.tsx:26` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/hindsight/components/ThreadMessageRow.tsx:13` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### overlay htmlPreviewBridge

- [ ] `features/html-pages/components/HtmlPreviewFullScreenEditor.tsx:10` — **TuiEditorContent** (BANNED) — `@/components/mardown-display/chat-markdown/tui/TuiEditorContent`
- [ ] `features/html-pages/components/tabs/MarkdownPreviewTab.tsx:4` — **RichDocument** (tracked) — `@/features/rich-document/RichDocument`
- [ ] `features/html-pages/components/tabs/MarkdownWysiwygTab.tsx:5` — **TuiEditorContent** (BANNED) — `@/components/mardown-display/chat-markdown/tui/TuiEditorContent`

### overlay impactBatchWindow (Change impact)

- [ ] `features/agents/components/samples/TestCaseInputs.tsx:227` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{part.description}`

### overlay keywordResearchWindow (Keyword Research)

- [ ] `features/marketing/seo/keyword-research/components/KeywordResearchLauncher.tsx:33` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### overlay keywordWindow (Keyword Intelligence)

- [ ] `features/marketing/seo/keyword/KeywordMeaningPanel.tsx:304` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{stamp.notes}`

### overlay listManagerWindow (List Manager)

- [ ] `features/user-lists/components/ListCard.tsx:130` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{list.description}`

### overlay mandateWindow (Mandates)

- [ ] `features/agents/agent-creators/interactive-builder/AgentGenerator.tsx:66` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agents/agent-creators/interactive-builder/AgentGenerator.tsx:622` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{mandate.summary}`
- [ ] `features/agents/agent-creators/interactive-builder/AgentJsonDisplay.tsx:37` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agents/agent-creators/interactive-builder/AgentJsonDisplay.tsx:315` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{data.description}`
- [ ] `features/agents/components/samples/TestCaseInputs.tsx:227` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{part.description}`
- [ ] `features/bindings/OfferedInventoryColumn.tsx:181` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{value.description}`
- [ ] `features/mandates/admin/MandateDetailPanel.tsx:1626` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{offer.description}`
- [ ] `features/mandates/admin/mandate-contract-cells.tsx:29` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<TooltipContent pre-wrap>{description}`
- [ ] `features/mandates/components/MandateNotesPanel.tsx:245` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{note.body}`
- [ ] `features/surfaces/components/bind/BindingSuggestionsTab.tsx:403` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{proposal.notes}`
- [ ] `features/surfaces/components/bind/WritePolicyEditor.tsx:183` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{target.description}`
- [ ] `features/workflow-runtime/listings/core/WorkflowDetailCard.tsx:171` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{workflow.description}`
- [ ] `features/workflow-runtime/listings/core/WorkflowSneakPeek.tsx:123` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{peek.description}`

### overlay markdownEditor (Markdown Editor (fullscreen))

- [ ] `components/mardown-display/markdown-classification/custom-views/common/MarkdownTextDisplay.tsx:5` — **react-markdown** (BANNED) — `react-markdown` (type-only)
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/AstRendererView.tsx:76` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{node.content}`
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/AstRendererView.tsx:188` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{node.content}`
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/AstRendererView.tsx:203` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{node.content}`
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/LsiKeywordView.tsx:683` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{section.description}`
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/ModernAstRenderer.tsx:74` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{node.content}`
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/ModernAstRenderer.tsx:219` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{node.content}`
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/ModernAstRenderer.tsx:235` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{node.content}`
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/TravelGuideView.tsx:173` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: formatText(item.text) }}`
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/TravelGuideView.tsx:183` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: formatText(subItem.text), }}`
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/TravelGuideView.tsx:215` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: formatText(header) }}`
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/TravelGuideView.tsx:235` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: formatText(cell) }}`
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/TravelGuideView.tsx:355` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: formatText(section.content) }}`
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/TravelGuideView.tsx:488` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: formatText(data.sections[0].content as string), }}`
- [ ] `components/mardown-display/markdown-classification/markdown-processor-util.ts:21` — **remark-* plugins** (BANNED) — `remark-parse`
- [ ] `components/mardown-display/markdown-classification/markdown-processor-util.ts:22` — **remark-* plugins** (BANNED) — `remark-gfm`
- [ ] `components/mardown-display/markdown-classification/parts/CodeComponent.tsx:5` — **react-markdown** (BANNED) — `react-markdown` (type-only)

### overlay markdownEditorWindow (Markdown Editor)

- [ ] `components/mardown-display/markdown-classification/custom-views/common/MarkdownTextDisplay.tsx:5` — **react-markdown** (BANNED) — `react-markdown` (type-only)
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/AstRendererView.tsx:76` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{node.content}`
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/AstRendererView.tsx:188` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{node.content}`
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/AstRendererView.tsx:203` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{node.content}`
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/LsiKeywordView.tsx:683` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{section.description}`
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/ModernAstRenderer.tsx:74` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{node.content}`
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/ModernAstRenderer.tsx:219` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{node.content}`
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/ModernAstRenderer.tsx:235` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{node.content}`
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/TravelGuideView.tsx:173` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: formatText(item.text) }}`
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/TravelGuideView.tsx:183` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: formatText(subItem.text), }}`
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/TravelGuideView.tsx:215` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: formatText(header) }}`
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/TravelGuideView.tsx:235` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: formatText(cell) }}`
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/TravelGuideView.tsx:355` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: formatText(section.content) }}`
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/TravelGuideView.tsx:488` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: formatText(data.sections[0].content as string), }}`
- [ ] `components/mardown-display/markdown-classification/markdown-processor-util.ts:21` — **remark-* plugins** (BANNED) — `remark-parse`
- [ ] `components/mardown-display/markdown-classification/markdown-processor-util.ts:22` — **remark-* plugins** (BANNED) — `remark-gfm`
- [ ] `components/mardown-display/markdown-classification/parts/CodeComponent.tsx:5` — **react-markdown** (BANNED) — `react-markdown` (type-only)

### overlay masterworkCheckupWindow (Final Checkup)

- [ ] `features/masterwork/checkup/CheckupWindow.tsx:19` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/masterwork/checkup/CheckupWindow.tsx:327` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{run.summary ?? "Nothing to change — your Rulebook holds up."}`

### overlay masterworkYourWordsWindow (Your words)

- [ ] `features/masterwork/record/ExpertRecordPage.tsx:66` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### overlay newsWindow (News)

- [ ] `features/news/components/NewsFloatingWorkspace.tsx:197` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{article.description}`

### overlay noteInfoWindow (Note Info)

- [ ] `components/mardown-display/chat-markdown/FullScreenMarkdownEditorBridge.tsx:45` — **FullScreenMarkdownEditor (16-tab editor)** (BANNED) — `@/components/mardown-display/chat-markdown/FullScreenMarkdownEditor` (type-only)
- [ ] `components/mardown-display/chat-markdown/FullScreenMarkdownEditorBridge.tsx:49` — **FullScreenMarkdownEditor (16-tab editor)** (BANNED) — `@/components/mardown-display/chat-markdown/FullScreenMarkdownEditor`

### overlay observationalMemoryWindow (Memory Inspector)

- [ ] `features/agents/components/observational-memory/components/MemoryStateInspector.tsx:473` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{text}`
- [ ] `features/agents/components/observational-memory/components/MemoryStateInspector.tsx:753` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{text}`

### overlay pdfExtractorWindow (PDF Extractor)

- [ ] `features/pdf-extractor/components/CopyPagesOverlay.tsx:776` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{copyAllTier.notes || "—"}`
- [ ] `features/pdf-extractor/components/CopyPagesOverlay.tsx:864` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{tier.notes || "—"}`
- [ ] `features/pdf-extractor/components/PdfAiContent.tsx:3` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/pdf-extractor/components/PdfExtractorWorkspace.tsx:949` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{content}`
- [ ] `features/pdf-extractor/components/SyncedPdfTextView.tsx:264` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{text || ( <span className="italic text-muted-foreground"> (no text on this…`

### overlay quickNotes (Quick Notes)

- [ ] `features/notes/components/mobile/MobileNoteEditor.tsx:16` — **RichDocument** (tracked) — `@/features/rich-document/RichDocument`
- [ ] `features/notes/components/mobile/MobileNoteEditor.tsx:21` — **TuiEditorContent** (BANNED) — `@/components/mardown-display/chat-markdown/tui/TuiEditorContent` (type-only)
- [ ] `features/notes/components/mobile/MobileNoteEditor.tsx:58` — **TuiEditorContent** (BANNED) — `@/components/mardown-display/chat-markdown/tui/TuiEditorContent`

### overlay quickScribe

- [ ] `features/transcript-studio/components/scribe/ActionSheet.tsx:76` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{item.description}`
- [ ] `features/transcript-studio/components/scribe/FullTranscriptDrawer.tsx:110` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{rawText || ( <span className="italic text-muted-foreground"> No transcript w…`
- [ ] `features/transcript-studio/components/scribe/FullTranscriptDrawer.tsx:170` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{cleanText || ( <span className="italic text-muted-foreground"> Not cleaned y…`
- [ ] `features/transcript-studio/components/scribe/ScribeCaptureScreen.tsx:76` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<div pre-wrap>{text || ( <span className="italic text-muted-foreground"> Speak — your wor…`
- [ ] `features/transcript-studio/components/scribe/SessionTranscriptViewer.tsx:143` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{text || ( <span className="italic text-muted-foreground"> {isClean ? "Nothin…`

### overlay quickTasks (Quick Tasks)

- [ ] `features/tasks/components/TaskDetailsPanel.tsx:793` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<div pre-wrap>{description || ( <span className="text-muted-foreground italic"> No descri…`

### overlay quickTasksWindow (Tasks)

- [ ] `features/tasks/components/TaskDetailsPanel.tsx:793` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<div pre-wrap>{description || ( <span className="text-muted-foreground italic"> No descri…`

### overlay quickUtilities (Utilities)

- [ ] `features/notes/components/mobile/MobileNoteEditor.tsx:16` — **RichDocument** (tracked) — `@/features/rich-document/RichDocument`
- [ ] `features/notes/components/mobile/MobileNoteEditor.tsx:21` — **TuiEditorContent** (BANNED) — `@/components/mardown-display/chat-markdown/tui/TuiEditorContent` (type-only)
- [ ] `features/notes/components/mobile/MobileNoteEditor.tsx:58` — **TuiEditorContent** (BANNED) — `@/components/mardown-display/chat-markdown/tui/TuiEditorContent`
- [ ] `features/tasks/components/TaskDetailsPanel.tsx:793` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<div pre-wrap>{description || ( <span className="text-muted-foreground italic"> No descri…`

### overlay referencePicker

- [ ] `features/surfaces/components/bind/BindingSuggestionsTab.tsx:403` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{proposal.notes}`

### overlay researchContextPreviewWindow (Context Preview)

- [ ] `features/window-panels/windows/text-sections/TextSectionsWindow.tsx:35` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/window-panels/windows/text-sections/TextSectionsWindow.tsx:284` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{shownContent}`

### overlay reviewWalkWindow

- [ ] `features/review-walk/components/TurnDiagnosis.tsx:38` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### overlay sandboxManagementWindow (Sandbox management)

- [ ] `features/code/views/sandboxes/SandboxDiagnosticsPanel.tsx:976` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{fileContent || "(empty file)"}`

### overlay siteDiscoveryWindow (Business discovery)

- [ ] `features/approvals/ApprovalQueue.tsx:932` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{item.body}`
- [ ] `features/marketing/seo/value-system/discovery/DiscoveryLadder.tsx:413` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{door.body}`

### overlay smartCodeEditorWindow (Smart Code Editor)

- [ ] `features/code-editor/agent-code-editor/components/parts/ReviewStage.tsx:23` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### overlay sourceInspectorWindow (Source inspector)

- [ ] `features/page-extraction/components/ChunkCard.tsx:32` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/page-extraction/components/ResultsTable.tsx:782` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<div pre-wrap>{text}`
- [ ] `features/rag/components/source-inspector/SourceInspectorPane.tsx:43` — **BasicMarkdownContent** (tracked) — `@/components/mardown-display/chat-markdown/BasicMarkdownContent`

### overlay surfaceContextInspector (Surface Context Admin)

- [ ] `features/surfaces/admin-detail/SurfaceAdminDetailPage.tsx:946` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{t.description}`
- [ ] `features/surfaces/admin-detail/SurfaceAdminDetailPage.tsx:1269` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<td>{child.description ?? "—"}`
- [ ] `features/surfaces/components/NewSurfaceDialog.tsx:213` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{t.description}`
- [ ] `features/surfaces/components/SurfaceValuesTable.tsx:176` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{display.description}`
- [ ] `features/tool-registry/shared/ToolSearchDialog.tsx:267` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{tool.description}`

### overlay surfaceContextWindow (Surface Context)

- [ ] `features/window-panels/windows/surfaces/SurfaceContextWindow.tsx:667` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{selected.declaration.description}`

### overlay taskQuickCreateWindow (Create Task)

- [ ] `features/agents/components/previews/ConversationHoverPreview.tsx:134` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{conv.description}`
- [ ] `features/agents/components/smart/CreateWithAiTabs.tsx:272` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{tab.content}`
- [ ] `features/tool-call-visualization/window-panel/ToolCallWindowPanel.tsx:624` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{activeTab?.content ?? null}`

### overlay topicalMapWindow (Topical map)

- [ ] `components/official/review-deck/ReviewDeck.tsx:214` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{current.body}`
- [ ] `features/marketing/seo/topical-map/proposals/ProposalReview.tsx:127` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{topic.description}`
- [ ] `features/marketing/seo/topical-map/views/HistoryView.tsx:376` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`
- [ ] `features/marketing/seo/topical-map/views/TextView.tsx:18` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/marketing/seo/topical-map/views/outline/TopicHoverCard.tsx:55` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{topic.description}`
- [ ] `features/marketing/seo/topical-map/views/table/columns.tsx:348` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.topic.description}`
- [ ] `features/window-panels/windows/marketing/TopicalMapWindow.tsx:275` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.description}`

### overlay transcriptStudioWindow (Transcript Studio)

- [ ] `features/transcript-studio/components/columns/ConceptsColumn.tsx:280` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{item.description}`
- [ ] `features/transcript-studio/components/columns/ModuleColumn.tsx:7` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/transcript-studio/components/settings/ModulePicker.tsx:56` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{m.description}`

### overlay userPreferences (Settings)

- [ ] `components/official/settings/primitives/SettingsRadioGroup.tsx:78` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{opt.description}`
- [ ] `components/official/settings/tree/SettingsDrawerNav.tsx:297` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{node.description}`
- [ ] `features/connectors/ConnectorPromptCard.tsx:168` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{provider.prompt.body}`
- [ ] `features/organizations/components/OrganizationCard.tsx:181` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{organization.description}`
- [ ] `features/settings/pages/FeedbackSettingsPage.tsx:566` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{item.description}`
- [ ] `features/settings/pages/FeedbackSettingsPage.tsx:668` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{item.description}`
- [ ] `features/settings/pages/FeedbackSettingsPage.tsx:757` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{msg.content}`
- [ ] `features/settings/pages/IntegrationsSettingsPage.tsx:897` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`

### overlay whatsappShellWindow (WhatsApp)

- [ ] `features/whatsapp-clone/chat-view/bubbles/ImageBubble.tsx:59` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{message.content}`
- [ ] `features/whatsapp-clone/chat-view/bubbles/SystemBubble.tsx:20` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{message.content}`
- [ ] `features/whatsapp-clone/chat-view/bubbles/VideoBubble.tsx:69` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{message.content}`

### route /_flash-cards

- [ ] `app/(transitional)/_flash-cards/ai/AiChatModal.tsx:18` — **MarkdownRenderer** (tracked) — `@/components/mardown-display/MarkdownRenderer`
- [ ] `app/(transitional)/_flash-cards/components/FlashcardDisplay.tsx:5` — **MarkdownRenderer** (tracked) — `@/components/mardown-display/MarkdownRenderer`
- [ ] `components/ui/chart.tsx:88` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: Object.entries(THEMES) .map( ([theme, prefix]) => ' ${…`

### route /_flashcard/[category]/[id]

- [ ] `app/(transitional)/_flash-cards/ai/AiChatModal.tsx:18` — **MarkdownRenderer** (tracked) — `@/components/mardown-display/MarkdownRenderer`
- [ ] `components/flashcard-app/-dev/display-all-in-one.tsx:5` — **MarkdownRenderer** (tracked) — `@/components/mardown-display/MarkdownRenderer`
- [ ] `components/flashcard-app/flashcard-display/flashcard-answer.tsx:1` — **MarkdownRenderer** (tracked) — `@/components/mardown-display/MarkdownRenderer`
- [ ] `components/flashcard-app/flashcard-display/flashcard-collapsible-section.tsx:2` — **MarkdownRenderer** (tracked) — `@/components/mardown-display/MarkdownRenderer`
- [ ] `components/ui/chart.tsx:88` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: Object.entries(THEMES) .map( ([theme, prefix]) => ' ${…`

### route /administration

- [ ] `app/(admin)/administration/AdminDashboardClient.tsx:166` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{item.description}`

### route /administration/agents/agent-apps

- [ ] `app/(admin)/administration/agents/agent-apps/page.tsx:299` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tile.description}`
- [ ] `features/agent-apps/components/layouts/AgentAppCard.tsx:38` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{app.description}`

### route /administration/agents/agent-apps/edit/[id]

- [ ] `features/agent-apps/components/AgentAppPublicRendererImpl.tsx:23` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agent-apps/components/shells/AgentAppFormToResultShell.tsx:25` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agent-apps/components/shells/AgentAppFullyCustomShell.tsx:33` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agent-apps/components/shells/AgentAppMarkdownStreamBridge.tsx:4` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agent-apps/components/shells/AgentAppWidgetShell.tsx:26` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### route /administration/agents/bundles

- [ ] `features/tool-registry/bundles/components/BundlesAdminPage.tsx:278` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{b.description}`
- [ ] `features/tool-registry/bundles/components/BundlesAdminPage.tsx:947` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{r.description}`

### route /administration/agents/executor-surfaces

- [ ] `features/tool-registry/executor-surfaces/components/ExecutorSurfaceDetailPanel.tsx:185` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{executor.description}`
- [ ] `features/tool-registry/shared/ToolSearchDialog.tsx:267` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{tool.description}`

### route /administration/agents/hindsight

- [ ] `features/hindsight/components/DiscussPanel.tsx:35` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/hindsight/components/FindingCard.tsx:26` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/hindsight/components/ReviewRow.tsx:85` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{review.summary}`
- [ ] `features/hindsight/components/ThreadMessageRow.tsx:13` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### route /administration/agents/mcp-servers

- [ ] `features/tool-registry/mcp-admin/components/McpServersAdminPage.tsx:689` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{server.description}`
- [ ] `features/tool-registry/mcp-admin/components/McpServersAdminPage.tsx:1064` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{c.notes}`

### route /administration/agents/mcp-tools

- [ ] `features/tool-call-visualization/admin/McpToolsManager.tsx:360` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{t.description}`

### route /administration/agents/mcp-tools/[toolId]

- [ ] `features/tool-call-visualization/admin/ToolTestSamplesViewer.tsx:522` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{modelFacingContent}`
- [ ] `features/tool-call-visualization/admin/mcp-tools/ToolViewPage.tsx:133` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tool.description || ( <span className="text-muted-foreground italic">No description</…`
- [ ] `features/tool-registry/tools-admin/components/RegistryTab.tsx:713` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{meta.description}`
- [ ] `features/tool-registry/tools-admin/components/RegistryTab.tsx:764` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{g.description}`

### route /administration/agents/mcp-tools/[toolId]/ui

- [ ] `features/tool-call-visualization/admin/ToolUiComponentEditor.tsx:722` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{imp.description}`
- [ ] `features/tool-call-visualization/admin/ToolUiComponentEditor.tsx:1117` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{imp.description}`
- [ ] `features/tool-call-visualization/admin/ToolUiComponentGenerator.tsx:49` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/tool-call-visualization/admin/ToolUiComponentGenerator.tsx:1170` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{selectedTool.description}`
- [ ] `features/tool-call-visualization/admin/ToolUiComponentGenerator.tsx:491` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{text}`
- [ ] `features/tool-call-visualization/admin/mcp-tools/ToolComponentPreview.tsx:40` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### route /administration/agents/relationships/directives

- [ ] `features/directive-catalog/components/DirectiveBuilderPanel.tsx:593` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{r.summary}`

### route /administration/agents/reports/agent-drift

- [ ] `features/agents/components/usages/UsageRowDetail.tsx:52` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{meta.description}`

### route /administration/agents/skills

- [ ] `features/skills/components/SkillDetailEditor.tsx:40` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/skills/components/SkillsBrowser.tsx:242` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{s.description}`

### route /administration/agents/system-agents

- [ ] `app/(admin)/administration/agents/system-agents/page.tsx:292` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tile.description}`
- [ ] `app/(admin)/administration/agents/system-agents/page.tsx:335` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{action.description}`

### route /administration/agents/system-agents/agents

- [ ] `features/agents/browse/columns.tsx:27` — **cleanMarkdownPreview (regex markdown stripping)** (BANNED) — `cleanMarkdownPreview ← @/utils/markdown-processors/clean-markdown-to-text`
- [ ] `features/agents/browse/components/AgentBrowseCards.tsx:35` — **cleanMarkdownPreview (regex markdown stripping)** (BANNED) — `cleanMarkdownPreview ← @/utils/markdown-processors/clean-markdown-to-text`

### route /administration/agents/system-agents/agents/[id]

- [ ] `features/agents/route/AgentViewContent.tsx:73` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agents/route/AgentViewContent.tsx:878` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{slot.description}`
- [ ] `features/agents/route/AgentViewContent.tsx:211` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{content || "—"}`
- [ ] `features/agents/route/AgentViewContent.tsx:65` — **RichDocument** (tracked) — `@/features/rich-document/RichDocument`

### route /administration/agents/system-agents/agents/[id]/apps

- [ ] `features/agent-apps/components/layouts/AgentAppCard.tsx:38` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{app.description}`

### route /administration/agents/system-agents/agents/[id]/build

- [ ] `features/agents/components/builder/message-builders/AddBlockButton.tsx:28` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/DecisionQuestionsEditor.tsx:33` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/MessageItem.tsx:60` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agents/components/builder/message-builders/MessageItem.tsx:43` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/MessageItem.tsx:45` — **MessageViewModeMenu (bespoke mode toggle)** (BANNED) — `@/features/agents/components/builder/message-builders/MessageViewModeMenu`
- [ ] `features/agents/components/builder/message-builders/MessageViewModeMenu.tsx:124` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{meta.description}`
- [ ] `features/agents/components/builder/message-builders/SpeechScriptEditor.tsx:60` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/system-instructions/FullPromptOptimizer.tsx:36` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agents/components/builder/message-builders/system-instructions/SystemMessage.tsx:29` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agents/components/builder/message-builders/system-instructions/SystemMessage.tsx:21` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/system-instructions/SystemMessage.tsx:25` — **MessageViewModeMenu (bespoke mode toggle)** (BANNED) — `@/features/agents/components/builder/message-builders/MessageViewModeMenu`
- [ ] `features/agents/components/builder/message-builders/system-instructions/SystemPromptOptimizer.tsx:51` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agents/components/tools-management/AgentBundlesPanel.tsx:469` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{bundle.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:1633` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tool.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:1853` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tool.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:2817` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:3309` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{selectedConfig.notes}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:3669` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:3784` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{pDef.description ?? "—"}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:3974` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tool.description}`
- [ ] `features/message-templates/components/SaveTemplateModal.tsx:31` — **hand-rolled AutoTextarea / AutoResizeTextarea** (BANNED) — `definition of AutoResizeTextarea`
- [ ] `features/message-templates/components/SaveTemplateModal.tsx:14` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/message-templates/components/TemplateBrowserModal.tsx:403` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{template.content}`
- [ ] `features/message-templates/components/TemplateBrowserModal.tsx:47` — **RichDocument** (tracked) — `@/features/rich-document/RichDocument`

### route /administration/agents/system-agents/agents/[id]/samples

- [ ] `features/agents/components/samples/TestCaseInputs.tsx:227` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{part.description}`

### route /administration/agents/system-agents/agents/[id]/shortcuts

- [ ] `features/agent-shortcuts/components/LinkAgentToShortcutModal.tsx:302` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{agent.description}`
- [ ] `features/agent-shortcuts/components/LinkAgentToShortcutModal.tsx:486` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{shortcut.description}`

### route /administration/agents/system-agents/agents/[id]/surfaces

- [ ] `features/surfaces/admin/columns/AgentColumn.tsx:63` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{agent.description}`
- [ ] `features/surfaces/admin/columns/AgentColumn.tsx:376` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{slot.description}`
- [ ] `features/surfaces/admin/columns/BindingColumn.tsx:506` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{surface.description}`
- [ ] `features/surfaces/admin/columns/SurfaceDetailsColumn.tsx:212` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{value.description}`
- [ ] `features/surfaces/components/bind/WritePolicyEditor.tsx:183` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{target.description}`

### route /administration/agents/system-agents/agents/[id]/surfaces/batch

- [ ] `features/surfaces/admin/columns/BindingColumn.tsx:506` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{surface.description}`
- [ ] `features/surfaces/components/bind/WritePolicyEditor.tsx:183` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{target.description}`

### route /administration/agents/system-agents/agents/new

- [ ] `app/(admin)/administration/agents/system-agents/agents/new/page.tsx:55` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{option.description}`

### route /administration/agents/system-agents/categories

- [ ] `features/agent-shortcuts/components/CategoryTree.tsx:225` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{node.description}`

### route /administration/agents/system-agents/content-blocks

- [ ] `components/admin/ContentBlocksManager.tsx:131` — **hand-rolled AutoTextarea / AutoResizeTextarea** (BANNED) — `definition of AutoResizeTextarea`
- [ ] `components/admin/ContentBlocksManager.tsx:83` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### route /administration/agents/system-agents/lineage

- [ ] `features/agents/components/agent-listings/AgentLineageTree.tsx:376` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{agent.description ?? "No description"}`

### route /administration/agents/system-agents/shortcuts

- [ ] `features/agent-shortcuts/components/ImportShortcutsBrowserModal.tsx:250` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{row.description}`
- [ ] `features/agent-shortcuts/components/ShortcutList.tsx:669` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{shortcut.description}`

### route /administration/agents/system-agents/shortcuts/all

- [ ] `features/agent-shortcuts/components/ShortcutDirectory.tsx:227` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{row.description}`

### route /administration/ai/ai-models

- [ ] `components/official/error-detail/ReplaceFailureBanner.tsx:23` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{explained.summary}`
- [ ] `features/agents/components/samples/TestCaseInputs.tsx:227` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{part.description}`
- [ ] `features/ai-models/components/controls/ControlRuleRow.tsx:231` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{row.setting.description}`

### route /administration/ai/ai-models/aliases

- [ ] `features/ai-models/components/aliases/AliasesContainer.tsx:258` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{item.notes || "—"}`
- [ ] `features/ai-models/components/aliases/AliasesContainer.tsx:487` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.notes}`

### route /administration/ai/ai-models/audit

- [ ] `components/official/error-detail/ReplaceFailureBanner.tsx:23` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{explained.summary}`
- [ ] `features/ai-models/components/controls/ControlRuleRow.tsx:231` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{row.setting.description}`

### route /administration/ai/ai-models/deprecated-audit

- [ ] `components/official/error-detail/ReplaceFailureBanner.tsx:23` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{explained.summary}`
- [ ] `features/agents/components/samples/TestCaseInputs.tsx:227` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{part.description}`

### route /administration/ai/ai-models/offerings

- [ ] `features/ai-models/components/ModelPricingEditor.tsx:236` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{opt.description}`

### route /administration/ai/ai-models/provider-sync

- [ ] `components/official/error-detail/ReplaceFailureBanner.tsx:23` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{explained.summary}`
- [ ] `features/ai-models/components/controls/ControlRuleRow.tsx:231` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{row.setting.description}`

### route /administration/ai/ai-models/settings

- [ ] `features/ai-models/components/settings/SettingTable.tsx:335` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{item.description || "—"}`

### route /administration/applications/catalogs

- [ ] `features/admin/applications/catalogs/components/AddFromLinkDialog.tsx:334` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{result.description}`
- [ ] `features/admin/applications/catalogs/components/CatalogEntryEditor.tsx:596` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{activeKindDef.description}`
- [ ] `features/admin/applications/catalogs/components/CatalogKindTable.tsx:413` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{def.description}`
- [ ] `features/admin/applications/catalogs/components/CatalogsClient.tsx:292` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.description || "—"}`

### route /administration/automation/scheduling/system-jobs

- [ ] `app/(admin)/administration/automation/scheduling/system-jobs/page.tsx:344` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{r.description}`

### route /administration/automation/scheduling/tasks

- [ ] `app/(admin)/administration/automation/scheduling/tasks/page.tsx:125` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{r.description}`

### route /administration/automation/scheduling/templates

- [ ] `app/(admin)/administration/automation/scheduling/templates/page.tsx:50` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{s.description}`

### route /administration/chat/cx-dashboard

- [ ] `components/ui/chart.tsx:88` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: Object.entries(THEMES) .map( ([theme, prefix]) => ' ${…`

### route /administration/chat/cx-dashboard/conversations/[id]

- [ ] `app/(admin)/administration/chat/cx-dashboard/conversations/[id]/conversation-detail-content.tsx:47` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### route /administration/chat/cx-dashboard/usage

- [ ] `components/ui/chart.tsx:88` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: Object.entries(THEMES) .map( ([theme, prefix]) => ' ${…`

### route /administration/compute/proof-runs

- [ ] `features/proof-runs/components/ProofRunsClient.tsx:146` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.summary}`
- [ ] `features/proof-runs/components/ProofRunsClient.tsx:577` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{scenario.description}`
- [ ] `features/proof-runs/components/ScenarioEditor.tsx:511` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{mandate.description}`

### route /administration/compute/resilience-lab

- [ ] `app/(admin)/administration/compute/resilience-lab/page.tsx:957` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{s.description}`

### route /administration/database

- [ ] `features/administration/database-hub/DatabaseHubLanding.tsx:204` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{section.description}`

### route /administration/database/data-integrity

- [ ] `app/(admin)/administration/database/data-integrity/page.tsx:256` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{row.description}`

### route /administration/database/enums

- [ ] `app/(admin)/administration/database/sql-functions/components/EnumDetail.tsx:269` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{enumType.description}`

### route /administration/database/relationships/planner

- [ ] `features/admin/relationships/access-planner/AccessPlannerImpl.tsx:1132` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{DISPOSITION_COPY[selectedTable.disposition].description}`

### route /administration/database/schema-visualizer-enhanced

- [ ] `components/matrx/resizable/DynamicResizableLayout.tsx:68` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{panel.content}`

### route /administration/database/sql-functions

- [ ] `app/(admin)/administration/database/sql-functions/components/SqlFunctionDetail.tsx:310` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{func.description}`

### route /administration/database/sql-queries

- [ ] `components/admin/query-history/query-history-overlay.tsx:384` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{query.description}`
- [ ] `features/notes/actions/CategoryNotesModal.tsx:367` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{note.content}`
- [ ] `features/notes/actions/CategoryNotesModal.tsx:553` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{note.content}`
- [ ] `features/notes/actions/CategoryNotesModal.tsx:428` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{selectedNote.content}`

### route /administration/documentation/feature-docs/view/[[...path]]

- [ ] `app/(admin)/administration/documentation/feature-docs/view/[[...path]]/page.tsx:5` — **BasicMarkdownContent** (tracked) — `@/components/mardown-display/chat-markdown/BasicMarkdownContent`

### route /administration/hr/jurisdiction-rules/[ruleId]

- [ ] `features/admin/hr/jurisdiction-rules/components/JurisdictionRuleDetailClient.tsx:413` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{ruleClass.description}`

### route /administration/knowledge/cms-agents

- [ ] `features/approvals/ApprovalQueue.tsx:932` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{item.body}`

### route /administration/knowledge/research-system

- [ ] `features/research/admin/AgentWiringDashboard.tsx:165` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{constant.description}`
- [ ] `features/research/admin/AgentWiringDashboard.tsx:229` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{AGENT_CONFIG_META[key].description}`
- [ ] `features/research/admin/TemplatesManager.tsx:167` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{template.description || "No description"}`
- [ ] `features/research/admin/TemplatesManager.tsx:781` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{AGENT_CONFIG_META[key].description}`

### route /administration/knowledge/seo-value-settings

- [ ] `features/marketing/seo/value-system/settings/AutonomyModesEditor.tsx:190` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{capability.description}`

### route /administration/mandates

- [ ] `features/mandates/admin/mandate-contract-cells.tsx:29` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<TooltipContent pre-wrap>{description}`

### route /administration/mandates/[mandateKey]

- [ ] `features/agents/agent-creators/interactive-builder/AgentGenerator.tsx:66` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agents/agent-creators/interactive-builder/AgentGenerator.tsx:622` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{mandate.summary}`
- [ ] `features/agents/agent-creators/interactive-builder/AgentJsonDisplay.tsx:37` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agents/agent-creators/interactive-builder/AgentJsonDisplay.tsx:315` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{data.description}`
- [ ] `features/agents/components/samples/TestCaseInputs.tsx:227` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{part.description}`
- [ ] `features/bindings/OfferedInventoryColumn.tsx:181` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{value.description}`
- [ ] `features/mandates/admin/MandateDetailPanel.tsx:1626` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{offer.description}`
- [ ] `features/mandates/admin/mandate-contract-cells.tsx:29` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<TooltipContent pre-wrap>{description}`
- [ ] `features/mandates/components/MandateNotesPanel.tsx:245` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{note.body}`
- [ ] `features/surfaces/components/bind/BindingSuggestionsTab.tsx:403` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{proposal.notes}`
- [ ] `features/surfaces/components/bind/WritePolicyEditor.tsx:183` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{target.description}`
- [ ] `features/workflow-runtime/listings/core/WorkflowDetailCard.tsx:171` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{workflow.description}`
- [ ] `features/workflow-runtime/listings/core/WorkflowSneakPeek.tsx:123` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{peek.description}`

### route /administration/marketing/run-console

- [ ] `features/marketing/seo/run-console/RunHistoryPanel.tsx:349` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{run.summary}`

### route /administration/marketing/seo-operations

- [ ] `features/admin/seo-operations/SeoOperationsClient.tsx:25` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/admin/seo-operations/SeoOperationsClient.tsx:630` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{spec.description}`
- [ ] `features/admin/seo-operations/SeoOperationsClient.tsx:250` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{row.description || "— no goal recorded —"}`

### route /administration/preview/one-binding-ui

- [ ] `app/(admin)/administration/preview/one-binding-ui/OneBindingUi.tsx:164` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{chosen.description}`
- [ ] `app/(admin)/administration/preview/one-binding-ui/OneBindingUi.tsx:320` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{v.description}`
- [ ] `app/(admin)/administration/preview/one-binding-ui/OneBindingUi.tsx:564` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{input.prompt || "What should we ask the user?"}`

### route /administration/preview/unified-management/batch

- [ ] `app/(admin)/administration/preview/unified-management/batch/TreatmentControls.tsx:158` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{m.description}`

### route /administration/preview/unified-management/places

- [ ] `app/(admin)/administration/preview/unified-management/places/CompletenessStrip.tsx:111` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{section.description}`
- [ ] `app/(admin)/administration/preview/unified-management/places/ManifestPanel.tsx:228` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{v.description}`
- [ ] `app/(admin)/administration/preview/unified-management/places/PlacesWorkspace.tsx:122` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{note.body}`

### route /administration/question-desk/[interviewId]

- [ ] `features/question-desk/components/QuestionScreen.tsx:178` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{body}`

### route /administration/reporting/reports

- [ ] `features/reports/components/ReportsLanding.tsx:50` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{report.description}`

### route /administration/scopes-context/system-context

- [ ] `features/admin/system-context/FeedConfigEditor.tsx:485` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{meta.description}`
- [ ] `features/admin/system-context/ItemDialogs.tsx:398` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{CLASS_META[itemClass].description}`
- [ ] `features/admin/system-context/PreviewDialog.tsx:87` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{e.description}`
- [ ] `features/admin/system-context/SystemContextConsole.tsx:287` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{row.description}`

### route /administration/shared-knowledge

- [ ] `features/admin/shared-knowledge/packs/PackBandsSection.tsx:290` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{b.description}`
- [ ] `features/admin/shared-knowledge/packs/PackBandsSection.tsx:291` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{b.notes}`
- [ ] `features/admin/shared-knowledge/packs/PackBandsSection.tsx:345` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{a.notes}`
- [ ] `features/admin/shared-knowledge/packs/PackMeaningSection.tsx:471` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`
- [ ] `features/admin/shared-knowledge/packs/PackMeaningSection.tsx:475` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.notes}`
- [ ] `features/admin/shared-knowledge/packs/PackTopicsSection.tsx:290` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{t.notes}`

### route /administration/ui/experimental-routes

- [ ] `app/(admin)/administration/ui/experimental-routes/page.tsx:132` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{section.description}`
- [ ] `app/(admin)/administration/ui/experimental-routes/page.tsx:171` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{route.description}`

### route /administration/ui/official-components

- [ ] `app/(admin)/administration/ui/official-components/page.tsx:276` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{component.description}`

### route /administration/ui/surfaces

- [ ] `features/surfaces/components/NewSurfaceDialog.tsx:213` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{t.description}`
- [ ] `features/surfaces/components/SurfaceCandidatesDialog.tsx:221` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{c.description}`
- [ ] `features/surfaces/components/SurfaceDetailPanel.tsx:269` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{surface.description || ( <em className="text-muted-foreground">no description</em> )}`
- [ ] `features/surfaces/components/SurfaceDetailPanel.tsx:333` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{tier.description}`
- [ ] `features/surfaces/components/SurfaceDetailPanel.tsx:354` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{READINESS_META[readinessBucketOf(surface)].description}`
- [ ] `features/surfaces/components/SurfaceValuesTable.tsx:176` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{display.description}`

### route /administration/ui/surfaces/[...name]

- [ ] `features/surfaces/admin-detail/SurfaceAdminDetailPage.tsx:946` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{t.description}`
- [ ] `features/surfaces/admin-detail/SurfaceAdminDetailPage.tsx:1269` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<td>{child.description ?? "—"}`
- [ ] `features/surfaces/components/NewSurfaceDialog.tsx:213` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{t.description}`
- [ ] `features/surfaces/components/SurfaceValuesTable.tsx:176` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{display.description}`
- [ ] `features/tool-registry/shared/ToolSearchDialog.tsx:267` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{tool.description}`

### route /administration/users/agent-review/[id]

- [ ] `features/admin/agent-review/components/AgentReviewWorkspace.tsx:623` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{item.description}`

### route /administration/users/announcements

- [ ] `features/admin/users/components/CreateAnnouncementDialog.tsx:146` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{type.description}`

### route /administration/users/change-policy

- [ ] `features/change-policy/components/AdminChangePolicyView.tsx:73` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{row.description}`

### route /administration/users/feedback

- [ ] `app/(admin)/administration/users/feedback/components/AnnouncementTable.tsx:25` — **renderAnnouncementMessage (regex link parser)** (BANNED) — `renderAnnouncementMessage ← @/utils/render-announcement-message`
- [ ] `app/(admin)/administration/users/feedback/components/CategoriesTab.tsx:420` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{category.description}`
- [ ] `app/(admin)/administration/users/feedback/components/CategoriesTab.tsx:488` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{item.description}`
- [ ] `app/(admin)/administration/users/feedback/components/CategoriesTab.tsx:619` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{cat.description}`
- [ ] `app/(admin)/administration/users/feedback/components/EditAnnouncementDialog.tsx:190` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{type.description}`
- [ ] `app/(admin)/administration/users/feedback/components/EditAnnouncementDialog.tsx:15` — **renderAnnouncementMessage (regex link parser)** (BANNED) — `renderAnnouncementMessage ← @/utils/render-announcement-message`
- [ ] `app/(admin)/administration/users/feedback/components/FeedbackDetailDialog.tsx:1166` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<div pre-wrap>{item.description}`
- [ ] `app/(admin)/administration/users/feedback/components/FeedbackDetailDialog.tsx:2151` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<div pre-wrap>{comment.content}`
- [ ] `app/(admin)/administration/users/feedback/components/FeedbackDetailDialog.tsx:2199` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<div pre-wrap>{item.description}`
- [ ] `app/(admin)/administration/users/feedback/components/FeedbackDetailDialog.tsx:2766` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{msg.content}`
- [ ] `app/(admin)/administration/users/feedback/components/FeedbackTable.tsx:539` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{r.description}`
- [ ] `app/(admin)/administration/users/feedback/components/RepoDiffProposalPanel.tsx:126` — **.split("\n").map(→ JSX) paragraph renderer** (review) — `proposal.unified_diff.split("\n").map((line, i) => ( <DiffLine key={i} line={line} /> ))`
- [ ] `features/admin/users/components/CreateAnnouncementDialog.tsx:146` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{type.description}`
- [ ] `utils/render-announcement-message.tsx:96` — **renderAnnouncementMessage (regex link parser)** (BANNED) — `definition of renderAnnouncementMessage`

### route /administration/users/invitations

- [ ] `features/admin/users/components/InvitationsTableClient.tsx:393` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{r.notes}`

### route /administration/users/preferences

- [ ] `features/admin/users/components/PreferencesTabClient.tsx:411` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{r.summary}`

### route /administration/utilities/content-blocks

- [ ] `components/admin/ContentBlocksManager.tsx:131` — **hand-rolled AutoTextarea / AutoResizeTextarea** (BANNED) — `definition of AutoResizeTextarea`
- [ ] `components/admin/ContentBlocksManager.tsx:83` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### route /administration/utilities/kind-registry/[kind]

- [ ] `features/code-editor/agent-code-editor/components/parts/ReviewStage.tsx:23` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/content-ir/admin/KindVariantsTab.tsx:290` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{variant.description}`

### route /administration/utilities/markdown-tester

- [ ] `components/admin/AudioTestModal.tsx:264` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<div pre-wrap>{speechText || ( <span className="text-muted-foreground italic"> No content…`
- [ ] `components/admin/MarkdownTester.tsx:16` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `components/admin/markdown-tester/BlockParserComparison.tsx:514` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.summary}`
- [ ] `components/admin/markdown-tester/SampleManager.tsx:387` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{sample.description}`

### route /administration/utilities/message-templates

- [ ] `features/message-templates/admin/MessageTemplateManager.tsx:94` — **hand-rolled AutoTextarea / AutoResizeTextarea** (BANNED) — `definition of AutoResizeTextarea`
- [ ] `features/message-templates/admin/MessageTemplateManager.tsx:73` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### route /administration/utilities/server-cache

- [ ] `components/admin/server-cache/ServerCacheManager.tsx:158` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`

### route /administration/utilities/taxonomy

- [ ] `features/admin/taxonomy/TaxonomyMap.tsx:66` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{domain.notes}`

### route /agent-apps/[id]

- [ ] `features/agent-apps/route/AgentAppOverviewContent.tsx:245` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{app.description}`
- [ ] `features/agent-apps/route/AgentAppOverviewContent.tsx:623` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{slot.description}`

### route /agent-apps/[id]/code

- [ ] `features/agent-apps/components/AgentAppPublicRendererImpl.tsx:23` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agent-apps/components/shells/AgentAppFormToResultShell.tsx:25` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agent-apps/components/shells/AgentAppFullyCustomShell.tsx:33` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agent-apps/components/shells/AgentAppMarkdownStreamBridge.tsx:4` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agent-apps/components/shells/AgentAppWidgetShell.tsx:26` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/code/views/extensions/ExtensionsPanel.tsx:115` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{tool.description}`
- [ ] `features/code/views/sandboxes/SandboxDiagnosticsPanel.tsx:976` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{fileContent || "(empty file)"}`

### route /agent-apps/[id]/run

- [ ] `features/agent-apps/components/AgentAppPublicRendererImpl.tsx:23` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agent-apps/components/shells/AgentAppFormToResultShell.tsx:25` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agent-apps/components/shells/AgentAppFullyCustomShell.tsx:33` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agent-apps/components/shells/AgentAppMarkdownStreamBridge.tsx:4` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agent-apps/components/shells/AgentAppWidgetShell.tsx:26` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### route /agent-apps/[id]/settings

- [ ] `features/agent-apps/components/builder/ShellPicker.tsx:48` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{meta.description}`
- [ ] `features/agent-apps/components/inputs/AgentAppCategoryPicker.tsx:196` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{opt.description}`

### route /agent-apps/new

- [ ] `features/agent-apps/components/AutoCreateAgentAppForm.tsx:55` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agent-apps/components/shells/AgentAppFormToResultShell.tsx:25` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agent-apps/components/shells/AgentAppWidgetShell.tsx:26` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### route /agent-apps/templates

- [ ] `app/(core)/agent-apps/templates/page.tsx:70` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{mode.description}`

### route /agent-apps/templates/[mode]

- [ ] `app/(core)/agent-apps/templates/[mode]/page.tsx:94` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{option.description}`

### route /agent-connections

- [ ] `features/agent-connections/components/sections/OverviewSection.tsx:156` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{card.description}`

### route /agent-connections/agents

- [ ] `features/agent-connections/components/sections/AgentsSection.tsx:128` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{agent.description ?? agent.id}`

### route /agent-connections/mcp-servers

- [ ] `features/agent-connections/components/sections/McpServersSection.tsx:261` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`
- [ ] `features/agent-connections/components/sections/McpServersSection.tsx:316` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tool.description}`

### route /agent-connections/preferences

- [ ] `components/official/settings/primitives/SettingsRadioGroup.tsx:78` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{opt.description}`

### route /agent-connections/render-blocks

- [ ] `features/agent-connections/components/sections/RenderBlocksSection.tsx:316` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{def.description}`

### route /agent-connections/skills

- [ ] `features/skills/components/SkillDetailEditor.tsx:40` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/skills/components/SkillsBrowser.tsx:242` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{s.description}`

### route /agents/[id]

- [ ] `features/agents/route/AgentViewContent.tsx:73` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agents/route/AgentViewContent.tsx:878` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{slot.description}`
- [ ] `features/agents/route/AgentViewContent.tsx:211` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{content || "—"}`
- [ ] `features/agents/route/AgentViewContent.tsx:65` — **RichDocument** (tracked) — `@/features/rich-document/RichDocument`

### route /agents/[id]/apps

- [ ] `features/agent-apps/components/layouts/AgentAppCard.tsx:38` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{app.description}`

### route /agents/[id]/build

- [ ] `features/agents/components/builder/message-builders/AddBlockButton.tsx:28` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/DecisionQuestionsEditor.tsx:33` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/MessageItem.tsx:60` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agents/components/builder/message-builders/MessageItem.tsx:43` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/MessageItem.tsx:45` — **MessageViewModeMenu (bespoke mode toggle)** (BANNED) — `@/features/agents/components/builder/message-builders/MessageViewModeMenu`
- [ ] `features/agents/components/builder/message-builders/MessageViewModeMenu.tsx:124` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{meta.description}`
- [ ] `features/agents/components/builder/message-builders/SpeechScriptEditor.tsx:60` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/system-instructions/FullPromptOptimizer.tsx:36` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agents/components/builder/message-builders/system-instructions/SystemMessage.tsx:29` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agents/components/builder/message-builders/system-instructions/SystemMessage.tsx:21` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/system-instructions/SystemMessage.tsx:25` — **MessageViewModeMenu (bespoke mode toggle)** (BANNED) — `@/features/agents/components/builder/message-builders/MessageViewModeMenu`
- [ ] `features/agents/components/builder/message-builders/system-instructions/SystemPromptOptimizer.tsx:51` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agents/components/tools-management/AgentBundlesPanel.tsx:469` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{bundle.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:1633` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tool.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:1853` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tool.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:2817` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:3309` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{selectedConfig.notes}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:3669` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:3784` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{pDef.description ?? "—"}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:3974` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tool.description}`
- [ ] `features/message-templates/components/SaveTemplateModal.tsx:31` — **hand-rolled AutoTextarea / AutoResizeTextarea** (BANNED) — `definition of AutoResizeTextarea`
- [ ] `features/message-templates/components/SaveTemplateModal.tsx:14` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/message-templates/components/TemplateBrowserModal.tsx:403` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{template.content}`
- [ ] `features/message-templates/components/TemplateBrowserModal.tsx:47` — **RichDocument** (tracked) — `@/features/rich-document/RichDocument`

### route /agents/[id]/hindsight

- [ ] `features/hindsight/components/DiscussPanel.tsx:35` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/hindsight/components/FindingCard.tsx:26` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/hindsight/components/ThreadMessageRow.tsx:13` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/hindsight/workspace/ReviewerChat.tsx:66` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{review.summary}`

### route /agents/[id]/shortcuts

- [ ] `features/agent-shortcuts/components/LinkAgentToShortcutModal.tsx:302` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{agent.description}`
- [ ] `features/agent-shortcuts/components/LinkAgentToShortcutModal.tsx:486` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{shortcut.description}`

### route /agents/[id]/shortcuts/[shortcutId]

- [ ] `features/surfaces/components/bind/WritePolicyEditor.tsx:183` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{target.description}`

### route /agents/[id]/shortcuts/new

- [ ] `features/surfaces/components/bind/WritePolicyEditor.tsx:183` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{target.description}`

### route /agents/[id]/surfaces

- [ ] `features/surfaces/admin/columns/AgentColumn.tsx:63` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{agent.description}`
- [ ] `features/surfaces/admin/columns/AgentColumn.tsx:376` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{slot.description}`
- [ ] `features/surfaces/admin/columns/BindingColumn.tsx:506` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{surface.description}`
- [ ] `features/surfaces/admin/columns/SurfaceDetailsColumn.tsx:212` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{value.description}`
- [ ] `features/surfaces/components/bind/WritePolicyEditor.tsx:183` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{target.description}`

### route /agents/[id]/surfaces/batch

- [ ] `features/surfaces/admin/columns/BindingColumn.tsx:506` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{surface.description}`
- [ ] `features/surfaces/components/bind/WritePolicyEditor.tsx:183` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{target.description}`

### route /agents/all

- [ ] `features/agents/browse/columns.tsx:27` — **cleanMarkdownPreview (regex markdown stripping)** (BANNED) — `cleanMarkdownPreview ← @/utils/markdown-processors/clean-markdown-to-text`
- [ ] `features/agents/browse/components/AgentBrowseCards.tsx:35` — **cleanMarkdownPreview (regex markdown stripping)** (BANNED) — `cleanMarkdownPreview ← @/utils/markdown-processors/clean-markdown-to-text`

### route /agents/battle/system-prompt

- [ ] `features/agents/components/builder/message-builders/AddBlockButton.tsx:28` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/DecisionQuestionsEditor.tsx:33` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/MessageViewModeMenu.tsx:124` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{meta.description}`
- [ ] `features/agents/components/builder/message-builders/SpeechScriptEditor.tsx:60` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/system-instructions/FullPromptOptimizer.tsx:36` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agents/components/builder/message-builders/system-instructions/SystemMessage.tsx:29` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agents/components/builder/message-builders/system-instructions/SystemMessage.tsx:21` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/system-instructions/SystemMessage.tsx:25` — **MessageViewModeMenu (bespoke mode toggle)** (BANNED) — `@/features/agents/components/builder/message-builders/MessageViewModeMenu`
- [ ] `features/agents/components/builder/message-builders/system-instructions/SystemPromptOptimizer.tsx:51` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/message-templates/components/SaveTemplateModal.tsx:31` — **hand-rolled AutoTextarea / AutoResizeTextarea** (BANNED) — `definition of AutoResizeTextarea`
- [ ] `features/message-templates/components/SaveTemplateModal.tsx:14` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/message-templates/components/TemplateBrowserModal.tsx:403` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{template.content}`
- [ ] `features/message-templates/components/TemplateBrowserModal.tsx:47` — **RichDocument** (tracked) — `@/features/rich-document/RichDocument`

### route /agents/battle/tools

- [ ] `features/agents/components/tools-management/AgentBundlesPanel.tsx:469` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{bundle.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:1633` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tool.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:1853` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tool.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:2817` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:3309` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{selectedConfig.notes}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:3669` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:3784` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{pDef.description ?? "—"}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:3974` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tool.description}`

### route /agents/battle/variations

- [ ] `features/agents/components/builder/message-builders/AddBlockButton.tsx:28` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/DecisionQuestionsEditor.tsx:33` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/MessageItem.tsx:60` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agents/components/builder/message-builders/MessageItem.tsx:43` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/MessageItem.tsx:45` — **MessageViewModeMenu (bespoke mode toggle)** (BANNED) — `@/features/agents/components/builder/message-builders/MessageViewModeMenu`
- [ ] `features/agents/components/builder/message-builders/MessageViewModeMenu.tsx:124` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{meta.description}`
- [ ] `features/agents/components/builder/message-builders/SpeechScriptEditor.tsx:60` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/system-instructions/FullPromptOptimizer.tsx:36` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agents/components/builder/message-builders/system-instructions/SystemMessage.tsx:29` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agents/components/builder/message-builders/system-instructions/SystemMessage.tsx:21` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/system-instructions/SystemMessage.tsx:25` — **MessageViewModeMenu (bespoke mode toggle)** (BANNED) — `@/features/agents/components/builder/message-builders/MessageViewModeMenu`
- [ ] `features/agents/components/builder/message-builders/system-instructions/SystemPromptOptimizer.tsx:51` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agents/components/tools-management/AgentBundlesPanel.tsx:469` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{bundle.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:1633` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tool.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:1853` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tool.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:2817` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:3309` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{selectedConfig.notes}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:3669` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:3784` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{pDef.description ?? "—"}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:3974` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tool.description}`
- [ ] `features/message-templates/components/SaveTemplateModal.tsx:31` — **hand-rolled AutoTextarea / AutoResizeTextarea** (BANNED) — `definition of AutoResizeTextarea`
- [ ] `features/message-templates/components/SaveTemplateModal.tsx:14` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/message-templates/components/TemplateBrowserModal.tsx:403` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{template.content}`
- [ ] `features/message-templates/components/TemplateBrowserModal.tsx:47` — **RichDocument** (tracked) — `@/features/rich-document/RichDocument`

### route /agents/categories

- [ ] `features/agent-shortcuts/components/CategoryTree.tsx:225` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{node.description}`

### route /agents/new

- [ ] `app/(core)/agents/new/page.tsx:122` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{option.description}`

### route /agents/new/builder

- [ ] `features/agents/agent-creators/interactive-builder/AgentBuilderPicker.tsx:75` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{option.description}`

### route /agents/new/builder/customizer

- [ ] `features/agents/agent-creators/chatbot-customizer/AIOptionComponents.tsx:144` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{item.description}`
- [ ] `features/agents/agent-creators/interactive-builder/ExperienceCustomizerBuilder.tsx:58` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{section.description}`

### route /agents/new/builder/tabs

- [ ] `features/agents/agent-creators/tabbed-builder/PreviewTab.tsx:49` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: highlightedPrompt.split('\n').join('<br>') }}`

### route /agents/new/generate

- [ ] `features/agents/agent-creators/interactive-builder/AgentGenerator.tsx:66` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agents/agent-creators/interactive-builder/AgentGenerator.tsx:622` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{mandate.summary}`
- [ ] `features/agents/agent-creators/interactive-builder/AgentJsonDisplay.tsx:37` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agents/agent-creators/interactive-builder/AgentJsonDisplay.tsx:315` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{data.description}`

### route /agents/new/studio

- [ ] `app/(core)/agents/new/studio/page.tsx:120` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{approach.body}`

### route /agents/orchestras/[conductorId]

- [ ] `features/agents/orchestras/components/ConductorInspector.tsx:78` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{agent.description}`
- [ ] `features/agents/orchestras/components/MemberInspector.tsx:193` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{meta.description}`
- [ ] `features/agents/orchestras/components/OrchestraBuilderCanvasImpl.tsx:124` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{agent?.description ?? "Presides over this Orchestra."}`
- [ ] `features/agents/orchestras/components/OrchestraMemberGrid.tsx:115` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{agent?.description ?? "Presides over this Orchestra."}`
- [ ] `features/agents/orchestras/components/OrchestraSettingsDialog.tsx:167` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{meta.description}`

### route /agents/shortcuts

- [ ] `features/agent-shortcuts/components/ShortcutList.tsx:669` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{shortcut.description}`

### route /agents/shortcuts/all

- [ ] `features/agent-shortcuts/components/ShortcutDirectory.tsx:227` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{row.description}`

### route /agents/templates/[id]

- [ ] `app/(core)/agents/templates/[id]/page.tsx:73` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{template.description}`

### route /appointment-reminder

- [ ] `app/(public)/appointment-reminder/AppointmentReminder.tsx:76` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{appointment.notes}`

### route /approvals

- [ ] `features/approvals/ApprovalQueue.tsx:932` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{item.body}`

### route /artifacts

- [ ] `features/artifacts/components/CmsArtifactList.tsx:280` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{artifact.description}`

### route /artifacts/[id]

- [ ] `features/artifacts/components/CmsArtifactDetail.tsx:281` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{artifact.description}`

### route /b/[bookingId]

- [ ] `app/(link)/b/[bookingId]/BookingPicker.tsx:216` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{thanks?.body ?? "We have sent a confirmation."}`

### route /c/[handle]

- [ ] `features/education/creators/components/CreatorLandingPage.tsx:168` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}`
- [ ] `features/education/creators/components/CreatorLandingPage.tsx:78` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`
- [ ] `features/education/creators/components/CreatorLandingPage.tsx:111` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`

### route /camera

- [ ] `features/media-capture/components/CaptureItemActions.tsx:133` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<div pre-wrap>{transcript}`
- [ ] `features/media-capture/components/CaptureReview.tsx:312` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{transcript}`

### route /canvas/discover

- [ ] `features/canvas/discovery/CanvasCard.tsx:110` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{canvas.description}`

### route /canvas/shared/[token]

- [ ] `features/canvas/shared/SharedCanvasView.tsx:189` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{canvas.description}`

### route /chat/[conversationId]

- [ ] `features/connectors/ConnectorPromptCard.tsx:168` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{provider.prompt.body}`

### route /chat/message-templates

- [ ] `features/message-templates/components/TemplateActionDrawer.tsx:85` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{template.content}`
- [ ] `features/message-templates/components/TemplateCard.tsx:96` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{template.content}`

### route /chat/message-templates/[id]

- [ ] `features/message-templates/components/TemplateViewPage.tsx:189` — **hand-rolled AutoTextarea / AutoResizeTextarea** (BANNED) — `definition of AutoTextarea`
- [ ] `features/message-templates/components/TemplateViewPage.tsx:375` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{template.content || ""}`

### route /chat/message-templates/edit/[id]

- [ ] `features/message-templates/components/TemplateEditor.tsx:64` — **hand-rolled AutoTextarea / AutoResizeTextarea** (BANNED) — `definition of AutoTextarea`

### route /chat/message-templates/new

- [ ] `features/message-templates/components/TemplateEditor.tsx:64` — **hand-rolled AutoTextarea / AutoResizeTextarea** (BANNED) — `definition of AutoTextarea`

### route /chat/new

- [ ] `features/connectors/ConnectorPromptCard.tsx:168` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{provider.prompt.body}`

### route /chat/voice

- [ ] `features/voice-agent/components/playground/ToolToggleList.tsx:65` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{tool.description}`

### route /chat/voice/playground

- [ ] `features/voice-agent/components/playground/ToolToggleList.tsx:65` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{tool.description}`

### route /cms/[siteId]/pages/[pageId]

- [ ] `features/marketing/components/pages/PageContentCard.tsx:21` — **MarkdownPreview** (tracked) — `@/features/files/components/core/FilePreview/previewers/MarkdownPreview`
- [ ] `features/marketing/components/pages/cards/PageBlockedChecksCard.tsx:179` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<li>{check.reasoning || check.itemKey}`
- [ ] `features/marketing/components/pages/cards/PageDraftContentCard.tsx:42` — **BasicContentEditor (split editor)** (BANNED) — `@/components/content-refine/BasicContentEditor`
- [ ] `features/marketing/content-plan/components/NodeStepRail.tsx:234` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{artifact.summary}`
- [ ] `features/marketing/content-plan/components/NodeStepRail.tsx:368` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{current.summary}`
- [ ] `features/marketing/content-plan/components/PageDraftEditor.tsx:616` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.summary}`

### route /cms/[siteId]/pages/new

- [ ] `features/marketing/components/pages/PageContentCard.tsx:21` — **MarkdownPreview** (tracked) — `@/features/files/components/core/FilePreview/previewers/MarkdownPreview`
- [ ] `features/marketing/components/pages/cards/PageBlockedChecksCard.tsx:179` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<li>{check.reasoning || check.itemKey}`
- [ ] `features/marketing/components/pages/cards/PageDraftContentCard.tsx:42` — **BasicContentEditor (split editor)** (BANNED) — `@/components/content-refine/BasicContentEditor`
- [ ] `features/marketing/content-plan/components/NodeStepRail.tsx:234` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{artifact.summary}`
- [ ] `features/marketing/content-plan/components/NodeStepRail.tsx:368` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{current.summary}`
- [ ] `features/marketing/content-plan/components/PageDraftEditor.tsx:616` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.summary}`

### route /code

- [ ] `features/code/views/extensions/ExtensionsPanel.tsx:115` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{tool.description}`
- [ ] `features/code/views/sandboxes/SandboxDiagnosticsPanel.tsx:976` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{fileContent || "(empty file)"}`

### route /commerce/drafts

- [ ] `features/commerce-review/components/DraftReviewQueue.tsx:234` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{item.reasoning}`

### route /commerce/intake/answer

- [ ] `features/commerce-intake/components/IntakeAnswerQueue.tsx:294` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{question.prompt}`

### route /commerce/triage

- [ ] `features/commerce-review/components/TriageQueue.tsx:242` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{item.notes}`

### route /connected-sources

- [ ] `features/connected-sources/components/BrowseEverything.tsx:181` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{report.summary}`

### route /context-items

- [ ] `features/scope-system/components/ContextItemsHub.tsx:795` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`

### route /crm/[partyId]

- [ ] `features/connectors/ConnectorPromptCard.tsx:168` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{provider.prompt.body}`
- [ ] `features/crm/components/record/JournalistIntelligenceCard.tsx:199` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{activity?.summary ?? "Not checked yet."}`
- [ ] `features/crm/components/record/JournalistIntelligenceCard.tsx:256` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{beat.summary}`

### route /crm/chasebox

- [ ] `features/crm/chasebox/components/ChaseboxDraftDialog.tsx:492` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{draft.body || "(this draft has no body)"}`
- [ ] `features/crm/chasebox/components/ChaseboxPage.tsx:265` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{meta.description}`

### route /crm/deals/[dealId]

- [ ] `features/crm/components/deals/DealRecordPage.tsx:384` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{deal.description}`

### route /crm/inbox

- [ ] `features/crm/components/outreach-lists/SingleSendDialog.tsx:292` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{draft.body}`

### route /crm/outreach-lists

- [ ] `features/crm/components/outreach-lists/OutreachListsPage.tsx:99` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.description}`

### route /crm/outreach-lists/[listId]

- [ ] `features/crm/components/outreach-lists/OutreachListDetailPage.tsx:506` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.notes ?? "—"}`
- [ ] `features/crm/components/outreach-lists/OutreachListDetailPage.tsx:675` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{list.description}`
- [ ] `features/crm/components/outreach-lists/SingleSendDialog.tsx:292` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{draft.body}`

### route /crm/outreach-lists/[listId]/dial

- [ ] `features/crm/components/outreach-lists/CallQueuePage.tsx:699` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{entry.member.notes}`
- [ ] `features/crm/components/outreach-lists/CallQueuePage.tsx:724` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{i.body}`

### route /crm/sending-identities

- [ ] `features/crm/components/sending-identities/AcceptSendingRulesDialog.tsx:87` — **.split("\n").map(→ JSX) paragraph renderer** (review) — `SENDING_RULES_TEXT.split("\n") .slice(2) .map((line) => line.replace(/^\d+\.\s*/, "")) .f…`

### route /d/[renderId]

- [ ] `app/(core)/d/[renderId]/page.tsx:25` — **RichDocument** (tracked) — `@/features/rich-document/RichDocument`

### route /dashboard

- [ ] `features/connectors/ConnectorPromptCard.tsx:168` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{provider.prompt.body}`
- [ ] `features/dashboard/components/DiscoverSection.tsx:34` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`

### route /data-v2/try-everything

- [ ] `features/unified-data/test-bench/TryEverythingScreen.tsx:70` — **RichDocument** (tracked) — `@/features/rich-document/RichDocument`

### route /developers/oauth

- [ ] `app/(public)/developers/oauth/page.tsx:267` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{scope.description}`

### route /documents

- [ ] `features/data-tables/components/DocumentListCard.tsx:49` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{doc.description}`
- [ ] `features/data-tables/components/DocumentsHubTable.tsx:595` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{doc.description || "—"}`

### route /education/audio-study/review

- [ ] `features/education/media/audio/components/AudioReviewSession.tsx:3` — **CardFaceContent** (tracked) — `@/components/mardown-display/blocks/flashcards/CardFaceContent`

### route /education/classes

- [ ] `features/education/classes/components/AccessModeField.tsx:60` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{ACCESS_MODES.find((m) => m.value === value)?.description}`

### route /education/classes/[classId]

- [ ] `features/education/classes/components/AccessModeField.tsx:60` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{ACCESS_MODES.find((m) => m.value === value)?.description}`
- [ ] `features/education/classes/components/ClassAccessPanel.tsx:118` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{modeMeta?.description}`
- [ ] `features/education/classes/components/ClassHubView.tsx:245` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{cls.description}`
- [ ] `features/education/classes/components/ClassHubView.tsx:406` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{state.description}`

### route /education/classes/join

- [ ] `features/education/classes/components/JoinClassView.tsx:129` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{preview.description}`

### route /education/exam-prep/[slug]

- [ ] `features/education/components/AxisDetail.tsx:128` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"), }}`
- [ ] `features/education/components/ExamCuratedLibrary.tsx:101` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{guide.summary}`
- [ ] `features/education/components/ExamHubActions.tsx:84` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{a.description}`
- [ ] `features/education/library/components/DeckCard.tsx:66` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{deck.description}`

### route /education/family/[studentId]

- [ ] `components/ui/chart.tsx:88` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: Object.entries(THEMES) .map( ([theme, prefix]) => ' ${…`

### route /education/fastfire

- [ ] `features/education/study/components/BatchReviewBlock.tsx:65` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/education/tutor/components/LiveHelpAnswerBlock.tsx:63` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{result.answer}`
- [ ] `features/flashcards/fast-fire/components/FastFireLiveCard.tsx:42` — **CardFaceContent** (tracked) — `@/components/mardown-display/blocks/flashcards/CardFaceContent`
- [ ] `features/flashcards/fast-fire/components/FastFireReviewPlaylist.tsx:22` — **CardFaceContent** (tracked) — `@/components/mardown-display/blocks/flashcards/CardFaceContent`
- [ ] `features/flashcards/fast-fire/components/FastFireScoreboard.tsx:30` — **CardFaceContent** (tracked) — `@/components/mardown-display/blocks/flashcards/CardFaceContent`
- [ ] `features/flashcards/fast-fire/components/FastFireSetPicker.tsx:191` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{set.description ?? dateLabel}`

### route /education/features/[slug]

- [ ] `features/education/components/AxisDetail.tsx:128` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"), }}`
- [ ] `features/education/components/ExamCuratedLibrary.tsx:101` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{guide.summary}`
- [ ] `features/education/components/ExamHubActions.tsx:84` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{a.description}`
- [ ] `features/education/library/components/DeckCard.tsx:66` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{deck.description}`

### route /education/flashcards

- [ ] `features/flashcards/components/home/FlashcardsHome.tsx:184` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{set.description}`

### route /education/flashcards/[setId]

- [ ] `features/flashcards/components/set-detail/IllustrateSetWindow.tsx:123` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{judgment.reasoning}`
- [ ] `features/flashcards/components/set-detail/MergeCardsDialog.tsx:29` — **CardFaceContent** (tracked) — `@/components/mardown-display/blocks/flashcards/CardFaceContent`
- [ ] `features/flashcards/components/set-detail/SetDetailView.tsx:82` — **CardFaceContent** (tracked) — `@/components/mardown-display/blocks/flashcards/CardFaceContent`
- [ ] `features/flashcards/components/set-detail/SetDetailView.tsx:818` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{data.set.description}`
- [ ] `features/flashcards/components/set-detail/SetDetailView.tsx:902` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{m.description}`
- [ ] `features/flashcards/components/set-detail/SetDetailView.tsx:916` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{m.description}`
- [ ] `features/flashcards/components/set-detail/SetDetailView.tsx:1372` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{mode.description}`
- [ ] `features/flashcards/components/set-detail/SetDetailView.tsx:1388` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{mode.description}`
- [ ] `features/flashcards/components/sharing/SetVisibilityControl.tsx:133` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{o.description}`

### route /education/flashcards/[setId]/edit

- [ ] `features/flashcards/components/editor/EditSetView.tsx:90` — **CardFaceContent** (tracked) — `@/components/mardown-display/blocks/flashcards/CardFaceContent`
- [ ] `features/flashcards/components/editor/EditSetView.tsx:49` — **ConfigurableMarkdownContent** (tracked) — `@/components/mardown-display/chat-markdown/ConfigurableMarkdownContent`
- [ ] `features/flashcards/components/sharing/SetVisibilityControl.tsx:133` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{o.description}`

### route /education/flashcards/[setId]/learn

- [ ] `features/education/study/components/BatchReviewBlock.tsx:65` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/education/tutor/components/LiveHelpAnswerBlock.tsx:63` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{result.answer}`
- [ ] `features/flashcards/components/study/CardDetailLayers.tsx:36` — **ConfigurableMarkdownContent** (tracked) — `@/components/mardown-display/chat-markdown/ConfigurableMarkdownContent`
- [ ] `features/flashcards/components/study/study-deck-parts.tsx:20` — **CardFaceContent** (tracked) — `@/components/mardown-display/blocks/flashcards/CardFaceContent`

### route /education/flashcards/[setId]/match

- [ ] `features/flashcards/components/study/MatchSurface.tsx:28` — **CardFaceContent** (tracked) — `@/components/mardown-display/blocks/flashcards/CardFaceContent`

### route /education/flashcards/[setId]/study

- [ ] `features/education/study/components/BatchReviewBlock.tsx:65` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/education/tutor/components/LiveHelpAnswerBlock.tsx:63` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{result.answer}`
- [ ] `features/flashcards/components/study/CardDetailLayers.tsx:36` — **ConfigurableMarkdownContent** (tracked) — `@/components/mardown-display/chat-markdown/ConfigurableMarkdownContent`
- [ ] `features/flashcards/components/study/study-deck-parts.tsx:20` — **CardFaceContent** (tracked) — `@/components/mardown-display/blocks/flashcards/CardFaceContent`

### route /education/flashcards/[setId]/test

- [ ] `features/flashcards/components/study/TestSurface.tsx:30` — **CardFaceContent** (tracked) — `@/components/mardown-display/blocks/flashcards/CardFaceContent`
- [ ] `features/flashcards/components/study/TestSurface.tsx:186` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{current.explanation}`

### route /education/flashcards/[setId]/write

- [ ] `features/flashcards/components/study/WriteSurface.tsx:40` — **CardFaceContent** (tracked) — `@/components/mardown-display/blocks/flashcards/CardFaceContent`

### route /education/flashcards/new

- [ ] `features/flashcards/components/create/LiveGenerationPreview.tsx:15` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### route /education/flashcards/new/from-source

- [ ] `features/flashcards/components/create/LiveGenerationPreview.tsx:15` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### route /education/flashcards/review

- [ ] `features/education/study/components/BatchReviewBlock.tsx:65` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/education/tutor/components/LiveHelpAnswerBlock.tsx:63` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{result.answer}`
- [ ] `features/flashcards/components/study/CardDetailLayers.tsx:36` — **ConfigurableMarkdownContent** (tracked) — `@/components/mardown-display/chat-markdown/ConfigurableMarkdownContent`
- [ ] `features/flashcards/components/study/study-deck-parts.tsx:20` — **CardFaceContent** (tracked) — `@/components/mardown-display/blocks/flashcards/CardFaceContent`

### route /education/flashcards/sessions/[sessionId]

- [ ] `features/education/study/components/BatchReviewBlock.tsx:65` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/education/study/components/SessionDetailView.tsx:549` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{label.answer}`

### route /education/flashcards/weak-areas

- [ ] `features/education/study/components/BatchReviewBlock.tsx:65` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/education/tutor/components/LiveHelpAnswerBlock.tsx:63` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{result.answer}`
- [ ] `features/flashcards/components/study/CardDetailLayers.tsx:36` — **ConfigurableMarkdownContent** (tracked) — `@/components/mardown-display/chat-markdown/ConfigurableMarkdownContent`
- [ ] `features/flashcards/components/study/study-deck-parts.tsx:20` — **CardFaceContent** (tracked) — `@/components/mardown-display/blocks/flashcards/CardFaceContent`

### route /education/game

- [ ] `features/education/engage/components/badges/BadgeShelf.tsx:47` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{def.description}`

### route /education/game/play/[roomId]

- [ ] `features/education/engage/components/play/PlaySurface.tsx:114` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{question.prompt}`

### route /education/game/solo

- [ ] `features/education/engage/components/play/PlaySurface.tsx:114` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{question.prompt}`

### route /education/grade-work

- [ ] `features/education/assessment/components/GradedAnswerBlock.tsx:79` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{graded.explanation}`

### route /education/kits/[sourceId]

- [ ] `features/education/kits/components/KitHub.tsx:510` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{stage.description}`

### route /education/learn/[...slug]

- [ ] `features/education/components/LearnArticle.tsx:68` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"), }}`
- [ ] `features/education/components/LearnArticle.tsx:96` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{doc.summary}`

### route /education/levels/[slug]

- [ ] `features/education/components/AxisDetail.tsx:128` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"), }}`
- [ ] `features/education/components/ExamCuratedLibrary.tsx:101` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{guide.summary}`
- [ ] `features/education/components/ExamHubActions.tsx:84` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{a.description}`
- [ ] `features/education/library/components/DeckCard.tsx:66` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{deck.description}`

### route /education/library

- [ ] `features/education/library/columns.tsx:44` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{row.description}`

### route /education/library/community

- [ ] `features/education/library/components/DeckCard.tsx:66` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{deck.description}`

### route /education/library/suggestions

- [ ] `features/education/library/components/OwnerSuggestionInbox.tsx:79` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{s.body}`

### route /education/media/[id]

- [ ] `features/education/media/mindmap/components/MindMapView.tsx:3` — **CardFaceContent** (tracked) — `@/components/mardown-display/blocks/flashcards/CardFaceContent`
- [ ] `features/education/media/mindmap/components/MindMapView.tsx:127` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{node.description}`
- [ ] `features/education/onboard/components/SummaryDetail.tsx:19` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### route /education/mind-maps/[id]

- [ ] `features/education/media/mindmap/components/MindMapView.tsx:3` — **CardFaceContent** (tracked) — `@/components/mardown-display/blocks/flashcards/CardFaceContent`
- [ ] `features/education/media/mindmap/components/MindMapView.tsx:127` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{node.description}`

### route /education/mind-maps/[id]/edit

- [ ] `features/education/media/mindmap/components/MindMapView.tsx:3` — **CardFaceContent** (tracked) — `@/components/mardown-display/blocks/flashcards/CardFaceContent`
- [ ] `features/education/media/mindmap/components/MindMapView.tsx:127` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{node.description}`

### route /education/notes/[id]

- [ ] `features/notes/components/mobile/MobileNoteEditor.tsx:16` — **RichDocument** (tracked) — `@/features/rich-document/RichDocument`
- [ ] `features/notes/components/mobile/MobileNoteEditor.tsx:21` — **TuiEditorContent** (BANNED) — `@/components/mardown-display/chat-markdown/tui/TuiEditorContent` (type-only)
- [ ] `features/notes/components/mobile/MobileNoteEditor.tsx:58` — **TuiEditorContent** (BANNED) — `@/components/mardown-display/chat-markdown/tui/TuiEditorContent`

### route /education/notes/[id]/edit

- [ ] `features/notes/components/mobile/MobileNoteEditor.tsx:16` — **RichDocument** (tracked) — `@/features/rich-document/RichDocument`
- [ ] `features/notes/components/mobile/MobileNoteEditor.tsx:21` — **TuiEditorContent** (BANNED) — `@/components/mardown-display/chat-markdown/tui/TuiEditorContent` (type-only)
- [ ] `features/notes/components/mobile/MobileNoteEditor.tsx:58` — **TuiEditorContent** (BANNED) — `@/components/mardown-display/chat-markdown/tui/TuiEditorContent`

### route /education/overview

- [ ] `features/education/library/columns.tsx:44` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{row.description}`

### route /education/practice-oral

- [ ] `features/education/spoken-practice/components/PracticeRunner.tsx:126` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{current.prompt}`
- [ ] `features/education/spoken-practice/components/PracticeRunner.tsx:277` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{pronunciation.notes}`
- [ ] `features/education/study/components/BatchReviewBlock.tsx:65` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`

### route /education/practice-tests

- [ ] `features/education/assessment/components/AssessmentHome.tsx:154` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{assessment.description}`

### route /education/practice-tests/[id]

- [ ] `features/education/assessment/components/AssessmentDetail.tsx:294` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{assessment.description}`
- [ ] `features/education/assessment/components/GradedAnswerBlock.tsx:79` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{graded.explanation}`
- [ ] `features/education/assessment/components/take/QuestionView.tsx:90` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.prompt}`

### route /education/practice-tests/[id]/results

- [ ] `features/education/assessment/components/AssessmentDetail.tsx:294` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{assessment.description}`
- [ ] `features/education/assessment/components/GradedAnswerBlock.tsx:79` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{graded.explanation}`
- [ ] `features/education/assessment/components/results/AssessmentResults.tsx:294` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.prompt}`
- [ ] `features/education/assessment/components/results/AssessmentResults.tsx:310` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.explanation}`
- [ ] `features/education/assessment/components/results/AssessmentResults.tsx:322` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{d.explanation}`
- [ ] `features/education/assessment/components/take/QuestionView.tsx:90` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.prompt}`

### route /education/progress

- [ ] `components/ui/chart.tsx:88` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: Object.entries(THEMES) .map( ([theme, prefix]) => ' ${…`

### route /education/quizzes

- [ ] `features/education/assessment/components/AssessmentHome.tsx:154` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{assessment.description}`

### route /education/quizzes/[id]

- [ ] `features/education/assessment/components/AssessmentDetail.tsx:294` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{assessment.description}`
- [ ] `features/education/assessment/components/GradedAnswerBlock.tsx:79` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{graded.explanation}`
- [ ] `features/education/assessment/components/take/QuestionView.tsx:90` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.prompt}`

### route /education/quizzes/[id]/results

- [ ] `features/education/assessment/components/AssessmentDetail.tsx:294` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{assessment.description}`
- [ ] `features/education/assessment/components/GradedAnswerBlock.tsx:79` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{graded.explanation}`
- [ ] `features/education/assessment/components/results/AssessmentResults.tsx:294` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.prompt}`
- [ ] `features/education/assessment/components/results/AssessmentResults.tsx:310` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.explanation}`
- [ ] `features/education/assessment/components/results/AssessmentResults.tsx:322` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{d.explanation}`
- [ ] `features/education/assessment/components/take/QuestionView.tsx:90` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.prompt}`

### route /education/study-aids/[slug]

- [ ] `features/education/components/AxisDetail.tsx:128` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"), }}`
- [ ] `features/education/components/ExamCuratedLibrary.tsx:101` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{guide.summary}`
- [ ] `features/education/components/ExamHubActions.tsx:84` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{a.description}`
- [ ] `features/education/library/components/DeckCard.tsx:66` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{deck.description}`

### route /education/study-guides

- [ ] `features/education/study-guides/components/StudyGuideReader.tsx:282` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{annotation.content}`
- [ ] `features/education/study-guides/components/StudyGuideReader.tsx:31` — **RichDocument** (tracked) — `@/features/rich-document/RichDocument`

### route /education/study-guides/[id]

- [ ] `features/education/study-guides/components/StudyGuideReader.tsx:282` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{annotation.content}`
- [ ] `features/education/study-guides/components/StudyGuideReader.tsx:31` — **RichDocument** (tracked) — `@/features/rich-document/RichDocument`

### route /education/subjects/[slug]

- [ ] `features/education/components/AxisDetail.tsx:128` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"), }}`
- [ ] `features/education/components/ExamCuratedLibrary.tsx:101` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{guide.summary}`
- [ ] `features/education/components/ExamHubActions.tsx:84` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{a.description}`
- [ ] `features/education/library/components/DeckCard.tsx:66` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{deck.description}`

### route /education/summaries/[id]

- [ ] `features/education/onboard/components/SummaryDetail.tsx:19` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### route /exports/[libraryId]

- [ ] `features/exports/components/SendToRulebookDialog.tsx:305` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{rulebook.description}`

### route /files/webhooks

- [ ] `features/files/webhooks/components/WebhooksManager.tsx:239` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{webhook.description}`

### route /free/zip-code-heatmap

- [ ] `app/(public)/free/zip-code-heatmap/components/ColorScaleSelector.tsx:105` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{SCALING_METHODS[options.scalingMethod].description}`
- [ ] `app/(public)/free/zip-code-heatmap/components/TableDataSource.tsx:296` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{table.description}`
- [ ] `app/(public)/free/zip-code-heatmap/components/ViewModeSelector.tsx:62` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{mode.description}`

### route /free/zip-code-heatmap/[id]

- [ ] `app/(public)/free/zip-code-heatmap/[id]/page.tsx:183` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{heatmap.description}`
- [ ] `app/(public)/free/zip-code-heatmap/components/ColorScaleSelector.tsx:105` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{SCALING_METHODS[options.scalingMethod].description}`

### route /hr

- [ ] `app/(core)/hr/page.tsx:106` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{door.description}`

### route /hr/me

- [ ] `features/hr/shared/EffectiveDatedForm.tsx:346` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{intent.prompt}`

### route /hr/me/timesheet

- [ ] `features/hr/time/shared/timing.tsx:194` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{note.body}`

### route /hr/people/[employeeId]

- [ ] `features/hr/shared/EffectiveDatedForm.tsx:346` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{intent.prompt}`

### route /hr/people/[employeeId]/[tab]

- [ ] `features/hr/shared/EffectiveDatedForm.tsx:346` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{intent.prompt}`

### route /hr/people/[employeeId]/c/[tabKey]

- [ ] `features/hr/shared/EffectiveDatedForm.tsx:346` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{intent.prompt}`

### route /hr/people/relations/[caseId]

- [ ] `features/hr/people/relations/components/CaseSurface.tsx:221` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{incident?.summary ?? action?.summary}`

### route /hr/settings/pay-groups

- [ ] `features/hr/shared/EffectiveDatedForm.tsx:346` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{intent.prompt}`

### route /hr/tasks

- [ ] `features/hr/tasks/components/HrTaskInbox.tsx:518` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{row.summary}`

### route /hr/time/periods/[periodId]

- [ ] `features/hr/exports/components/ExportRunPanel.tsx:133` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{format.notes}`

### route /hr/time/punches

- [ ] `features/hr/time/shared/timing.tsx:194` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{note.body}`

### route /hr/time/timesheets

- [ ] `features/hr/time/shared/timing.tsx:194` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{note.body}`

### route /hr/time/timesheets/[employmentId]

- [ ] `features/hr/time/shared/timing.tsx:194` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{note.body}`

### route /images/branded

- [ ] `features/image-manager/components/BrandedUploadTab.tsx:175` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{preset.description}`
- [ ] `features/image-manager/components/BrandedUploadTab.tsx:206` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{preset.description}`
- [ ] `features/image-manager/components/BrandedUploadTab.tsx:271` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{opt.description}`

### route /images/convert

- [ ] `features/image-studio/components/PresetCatalog.tsx:288` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{cat.description}`

### route /images/presets

- [ ] `features/image-studio/components/PresetCatalog.tsx:288` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{cat.description}`

### route /images/public-search

- [ ] `components/image/gallery/desktop/SimpleImageViewer.tsx:319` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{photos[imageIndex]?.description}`
- [ ] `components/image/unsplash/desktop/EnhancedImageViewer.tsx:314` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{photos[imageIndex]?.description || photos[imageIndex]?.alt_description}`
- [ ] `components/image/unsplash/mobile/MobileUnsplashViewer.tsx:216` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{photos[imageIndex]?.description || photos[imageIndex]?.alt_description || "No descrip…`

### route /images/studio

- [ ] `features/image-studio/components/PresetCatalog.tsx:288` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{cat.description}`

### route /images/tools

- [ ] `components/image/gallery/desktop/SimpleImageViewer.tsx:319` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{photos[imageIndex]?.description}`
- [ ] `components/image/unsplash/desktop/EnhancedImageViewer.tsx:314` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{photos[imageIndex]?.description || photos[imageIndex]?.alt_description}`
- [ ] `components/image/unsplash/mobile/MobileUnsplashViewer.tsx:216` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{photos[imageIndex]?.description || photos[imageIndex]?.alt_description || "No descrip…`
- [ ] `features/image-manager/components/BrandedUploadTab.tsx:175` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{preset.description}`
- [ ] `features/image-manager/components/BrandedUploadTab.tsx:206` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{preset.description}`
- [ ] `features/image-manager/components/BrandedUploadTab.tsx:271` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{opt.description}`
- [ ] `features/image-manager/components/ToolsTab.tsx:462` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tool.description}`
- [ ] `features/image-studio/components/PresetCatalog.tsx:288` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{cat.description}`

### route /import/ai-chats/[provider]

- [ ] `features/source-onboarding/components/SourceGuidePage.tsx:98` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{step.body}`

### route /invitations/organization/accept/[token]

- [ ] `app/(core)/invitations/organization/accept/[token]/page.tsx:329` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{invitation.organization.description}`

### route /invitations/project/accept/[token]

- [ ] `app/(core)/invitations/project/accept/[token]/page.tsx:237` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{invitation.project.description}`

### route /knowledge

- [ ] `features/knowledge/components/KnowledgeShowcasePage.tsx:316` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{c.description}`
- [ ] `features/knowledge/components/KnowledgeShowcasePage.tsx:442` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{step.description}`

### route /knowledge/extractions/[id]

- [ ] `features/page-extraction/data-review/ExtractionCellDisplay.tsx:14` — **BasicMarkdownContent** (tracked) — `@/components/mardown-display/chat-markdown/BasicMarkdownContent`

### route /knowledge/library-curate

- [ ] `features/admin/shared-knowledge/packs/PackBandsSection.tsx:290` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{b.description}`
- [ ] `features/admin/shared-knowledge/packs/PackBandsSection.tsx:291` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{b.notes}`
- [ ] `features/admin/shared-knowledge/packs/PackBandsSection.tsx:345` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{a.notes}`
- [ ] `features/admin/shared-knowledge/packs/PackMeaningSection.tsx:471` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`
- [ ] `features/admin/shared-knowledge/packs/PackMeaningSection.tsx:475` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.notes}`
- [ ] `features/admin/shared-knowledge/packs/PackTopicsSection.tsx:290` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{t.notes}`

### route /launchpad

- [ ] `features/launchpad/components/UserLaunchpad.tsx:373` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{group.description}`

### route /legal

- [ ] `features/legal/components/landing/LegalLanding.tsx:272` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{feature.description}`
- [ ] `features/legal/components/landing/LegalLanding.tsx:302` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{step.description}`
- [ ] `features/legal/components/landing/LegalLanding.tsx:406` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`

### route /legal/ca-wc

- [ ] `features/legal/wc/components/landing/CaWcLanding.tsx:305` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{feature.description}`
- [ ] `features/legal/wc/components/landing/CaWcLanding.tsx:380` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{feature.description}`
- [ ] `features/legal/wc/components/landing/CaWcLanding.tsx:433` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{step.description}`
- [ ] `features/legal/wc/components/landing/CaWcLanding.tsx:464` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`

### route /legal/ca-wc/utilities

- [ ] `app/(core)/legal/ca-wc/utilities/page.tsx:85` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{util.description}`

### route /lists

- [ ] `features/structured-lists/StructuredListLanding.tsx:199` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{f.description}`
- [ ] `features/structured-lists/StructuredListLanding.tsx:300` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{s.description}`

### route /mandates

- [ ] `features/mandates/browse/MandateBrowseCards.tsx:86` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{row.description}`
- [ ] `features/mandates/browse/useCoverageList.tsx:119` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{meta.description}`

### route /mandates/[mandateKey]

- [ ] `features/agents/agent-creators/interactive-builder/AgentGenerator.tsx:66` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agents/agent-creators/interactive-builder/AgentGenerator.tsx:622` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{mandate.summary}`
- [ ] `features/agents/agent-creators/interactive-builder/AgentJsonDisplay.tsx:37` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agents/agent-creators/interactive-builder/AgentJsonDisplay.tsx:315` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{data.description}`
- [ ] `features/bindings/OfferedInventoryColumn.tsx:181` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{value.description}`
- [ ] `features/mandates/components/MandateNotesPanel.tsx:245` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{note.body}`
- [ ] `features/surfaces/components/bind/BindingSuggestionsTab.tsx:403` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{proposal.notes}`
- [ ] `features/surfaces/components/bind/WritePolicyEditor.tsx:183` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{target.description}`
- [ ] `features/workflow-runtime/listings/core/WorkflowDetailCard.tsx:171` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{workflow.description}`
- [ ] `features/workflow-runtime/listings/core/WorkflowSneakPeek.tsx:123` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{peek.description}`

### route /maps

- [ ] `features/canvas/maps/columns.tsx:55` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.description}`

### route /markdown-studio

- [ ] `components/markdown-studio/AnalysisView.tsx:492` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.summary}`
- [ ] `components/markdown-studio/AnalysisView.tsx:607` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{text || "(empty)"}`
- [ ] `components/markdown-studio/PreviewPanel.tsx:11` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `components/markdown-studio/SampleLibrarySheet.tsx:207` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{sample.description}`

### route /marketing

- [ ] `features/marketing/components/brands/BrandEditorDialog.tsx:431` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{option.description}`

### route /marketing/[brandId]

- [ ] `features/marketing/components/brands/BrandEditorDialog.tsx:431` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{option.description}`
- [ ] `features/marketing/components/brands/BrandWorkspace.tsx:662` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{current.description}`

### route /marketing/[brandId]/ads

- [ ] `features/marketing/components/MarketingComingSoon.tsx:167` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{sibling.description}`

### route /marketing/[brandId]/content/map/[mapId]

- [ ] `components/official/review-deck/ReviewDeck.tsx:214` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{current.body}`
- [ ] `features/marketing/seo/topical-map/proposals/ProposalReview.tsx:127` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{topic.description}`
- [ ] `features/marketing/seo/topical-map/views/HistoryView.tsx:376` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`
- [ ] `features/marketing/seo/topical-map/views/TextView.tsx:18` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/marketing/seo/topical-map/views/outline/TopicHoverCard.tsx:55` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{topic.description}`
- [ ] `features/marketing/seo/topical-map/views/table/columns.tsx:348` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.topic.description}`

### route /marketing/[brandId]/content/map/[mapId]/graph

- [ ] `components/official/review-deck/ReviewDeck.tsx:214` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{current.body}`
- [ ] `features/marketing/seo/topical-map/proposals/ProposalReview.tsx:127` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{topic.description}`
- [ ] `features/marketing/seo/topical-map/views/HistoryView.tsx:376` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`
- [ ] `features/marketing/seo/topical-map/views/TextView.tsx:18` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/marketing/seo/topical-map/views/outline/TopicHoverCard.tsx:55` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{topic.description}`
- [ ] `features/marketing/seo/topical-map/views/table/columns.tsx:348` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.topic.description}`

### route /marketing/[brandId]/content/map/[mapId]/history

- [ ] `components/official/review-deck/ReviewDeck.tsx:214` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{current.body}`
- [ ] `features/marketing/seo/topical-map/proposals/ProposalReview.tsx:127` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{topic.description}`
- [ ] `features/marketing/seo/topical-map/views/HistoryView.tsx:376` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`
- [ ] `features/marketing/seo/topical-map/views/TextView.tsx:18` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/marketing/seo/topical-map/views/outline/TopicHoverCard.tsx:55` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{topic.description}`
- [ ] `features/marketing/seo/topical-map/views/table/columns.tsx:348` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.topic.description}`

### route /marketing/[brandId]/content/map/[mapId]/pages

- [ ] `components/official/review-deck/ReviewDeck.tsx:214` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{current.body}`
- [ ] `features/marketing/seo/topical-map/proposals/ProposalReview.tsx:127` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{topic.description}`
- [ ] `features/marketing/seo/topical-map/views/HistoryView.tsx:376` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`
- [ ] `features/marketing/seo/topical-map/views/TextView.tsx:18` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/marketing/seo/topical-map/views/outline/TopicHoverCard.tsx:55` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{topic.description}`
- [ ] `features/marketing/seo/topical-map/views/table/columns.tsx:348` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.topic.description}`

### route /marketing/[brandId]/content/map/[mapId]/table

- [ ] `components/official/review-deck/ReviewDeck.tsx:214` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{current.body}`
- [ ] `features/marketing/seo/topical-map/proposals/ProposalReview.tsx:127` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{topic.description}`
- [ ] `features/marketing/seo/topical-map/views/HistoryView.tsx:376` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`
- [ ] `features/marketing/seo/topical-map/views/TextView.tsx:18` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/marketing/seo/topical-map/views/outline/TopicHoverCard.tsx:55` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{topic.description}`
- [ ] `features/marketing/seo/topical-map/views/table/columns.tsx:348` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.topic.description}`

### route /marketing/[brandId]/content/map/[mapId]/text

- [ ] `components/official/review-deck/ReviewDeck.tsx:214` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{current.body}`
- [ ] `features/marketing/seo/topical-map/proposals/ProposalReview.tsx:127` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{topic.description}`
- [ ] `features/marketing/seo/topical-map/views/HistoryView.tsx:376` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`
- [ ] `features/marketing/seo/topical-map/views/TextView.tsx:18` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/marketing/seo/topical-map/views/outline/TopicHoverCard.tsx:55` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{topic.description}`
- [ ] `features/marketing/seo/topical-map/views/table/columns.tsx:348` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.topic.description}`

### route /marketing/[brandId]/content/plan/[siteId]

- [ ] `features/marketing/components/pages/PageContentCard.tsx:21` — **MarkdownPreview** (tracked) — `@/features/files/components/core/FilePreview/previewers/MarkdownPreview`
- [ ] `features/marketing/components/pages/cards/PageBlockedChecksCard.tsx:179` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<li>{check.reasoning || check.itemKey}`
- [ ] `features/marketing/components/pages/cards/PageDraftContentCard.tsx:42` — **BasicContentEditor (split editor)** (BANNED) — `@/components/content-refine/BasicContentEditor`
- [ ] `features/marketing/content-plan/components/NodeStepRail.tsx:234` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{artifact.summary}`
- [ ] `features/marketing/content-plan/components/NodeStepRail.tsx:368` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{current.summary}`
- [ ] `features/marketing/content-plan/components/PageDraftEditor.tsx:616` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.summary}`
- [ ] `features/marketing/content-plan/setup/components/EntityAttachSection.tsx:170` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{plan.notes}`
- [ ] `features/marketing/content-plan/setup/components/EntityAttachSection.tsx:186` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{plan.notes}`
- [ ] `features/marketing/content-plan/setup/components/PlanReviewSection.tsx:197` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/marketing/content-plan/setup/components/PlanReviewSection.tsx:238` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/marketing/content-plan/setup/components/PlanReviewSection.tsx:257` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/marketing/content-plan/setup/components/SetupShapeColumn.tsx:123` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{archetype.description}`

### route /marketing/[brandId]/content/plan/[siteId]/ai-runs

- [ ] `features/marketing/components/pages/PageContentCard.tsx:21` — **MarkdownPreview** (tracked) — `@/features/files/components/core/FilePreview/previewers/MarkdownPreview`
- [ ] `features/marketing/components/pages/cards/PageBlockedChecksCard.tsx:179` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<li>{check.reasoning || check.itemKey}`
- [ ] `features/marketing/components/pages/cards/PageDraftContentCard.tsx:42` — **BasicContentEditor (split editor)** (BANNED) — `@/components/content-refine/BasicContentEditor`
- [ ] `features/marketing/content-plan/components/NodeStepRail.tsx:234` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{artifact.summary}`
- [ ] `features/marketing/content-plan/components/NodeStepRail.tsx:368` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{current.summary}`
- [ ] `features/marketing/content-plan/components/PageDraftEditor.tsx:616` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.summary}`
- [ ] `features/marketing/content-plan/setup/components/EntityAttachSection.tsx:170` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{plan.notes}`
- [ ] `features/marketing/content-plan/setup/components/EntityAttachSection.tsx:186` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{plan.notes}`
- [ ] `features/marketing/content-plan/setup/components/PlanReviewSection.tsx:197` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/marketing/content-plan/setup/components/PlanReviewSection.tsx:238` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/marketing/content-plan/setup/components/PlanReviewSection.tsx:257` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/marketing/content-plan/setup/components/SetupShapeColumn.tsx:123` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{archetype.description}`

### route /marketing/[brandId]/content/plan/[siteId]/brief

- [ ] `features/marketing/components/pages/PageContentCard.tsx:21` — **MarkdownPreview** (tracked) — `@/features/files/components/core/FilePreview/previewers/MarkdownPreview`
- [ ] `features/marketing/components/pages/cards/PageBlockedChecksCard.tsx:179` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<li>{check.reasoning || check.itemKey}`
- [ ] `features/marketing/components/pages/cards/PageDraftContentCard.tsx:42` — **BasicContentEditor (split editor)** (BANNED) — `@/components/content-refine/BasicContentEditor`
- [ ] `features/marketing/content-plan/components/NodeStepRail.tsx:234` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{artifact.summary}`
- [ ] `features/marketing/content-plan/components/NodeStepRail.tsx:368` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{current.summary}`
- [ ] `features/marketing/content-plan/components/PageDraftEditor.tsx:616` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.summary}`
- [ ] `features/marketing/content-plan/setup/components/EntityAttachSection.tsx:170` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{plan.notes}`
- [ ] `features/marketing/content-plan/setup/components/EntityAttachSection.tsx:186` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{plan.notes}`
- [ ] `features/marketing/content-plan/setup/components/PlanReviewSection.tsx:197` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/marketing/content-plan/setup/components/PlanReviewSection.tsx:238` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/marketing/content-plan/setup/components/PlanReviewSection.tsx:257` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/marketing/content-plan/setup/components/SetupShapeColumn.tsx:123` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{archetype.description}`

### route /marketing/[brandId]/content/plan/[siteId]/entities

- [ ] `features/marketing/components/pages/PageContentCard.tsx:21` — **MarkdownPreview** (tracked) — `@/features/files/components/core/FilePreview/previewers/MarkdownPreview`
- [ ] `features/marketing/components/pages/cards/PageBlockedChecksCard.tsx:179` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<li>{check.reasoning || check.itemKey}`
- [ ] `features/marketing/components/pages/cards/PageDraftContentCard.tsx:42` — **BasicContentEditor (split editor)** (BANNED) — `@/components/content-refine/BasicContentEditor`
- [ ] `features/marketing/content-plan/components/NodeStepRail.tsx:234` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{artifact.summary}`
- [ ] `features/marketing/content-plan/components/NodeStepRail.tsx:368` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{current.summary}`
- [ ] `features/marketing/content-plan/components/PageDraftEditor.tsx:616` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.summary}`
- [ ] `features/marketing/content-plan/setup/components/EntityAttachSection.tsx:170` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{plan.notes}`
- [ ] `features/marketing/content-plan/setup/components/EntityAttachSection.tsx:186` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{plan.notes}`
- [ ] `features/marketing/content-plan/setup/components/PlanReviewSection.tsx:197` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/marketing/content-plan/setup/components/PlanReviewSection.tsx:238` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/marketing/content-plan/setup/components/PlanReviewSection.tsx:257` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/marketing/content-plan/setup/components/SetupShapeColumn.tsx:123` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{archetype.description}`

### route /marketing/[brandId]/content/plan/[siteId]/map

- [ ] `features/marketing/components/pages/PageContentCard.tsx:21` — **MarkdownPreview** (tracked) — `@/features/files/components/core/FilePreview/previewers/MarkdownPreview`
- [ ] `features/marketing/components/pages/cards/PageBlockedChecksCard.tsx:179` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<li>{check.reasoning || check.itemKey}`
- [ ] `features/marketing/components/pages/cards/PageDraftContentCard.tsx:42` — **BasicContentEditor (split editor)** (BANNED) — `@/components/content-refine/BasicContentEditor`
- [ ] `features/marketing/content-plan/components/NodeStepRail.tsx:234` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{artifact.summary}`
- [ ] `features/marketing/content-plan/components/NodeStepRail.tsx:368` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{current.summary}`
- [ ] `features/marketing/content-plan/components/PageDraftEditor.tsx:616` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.summary}`
- [ ] `features/marketing/content-plan/setup/components/EntityAttachSection.tsx:170` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{plan.notes}`
- [ ] `features/marketing/content-plan/setup/components/EntityAttachSection.tsx:186` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{plan.notes}`
- [ ] `features/marketing/content-plan/setup/components/PlanReviewSection.tsx:197` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/marketing/content-plan/setup/components/PlanReviewSection.tsx:238` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/marketing/content-plan/setup/components/PlanReviewSection.tsx:257` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/marketing/content-plan/setup/components/SetupShapeColumn.tsx:123` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{archetype.description}`

### route /marketing/[brandId]/content/plan/[siteId]/setup

- [ ] `features/marketing/components/pages/PageContentCard.tsx:21` — **MarkdownPreview** (tracked) — `@/features/files/components/core/FilePreview/previewers/MarkdownPreview`
- [ ] `features/marketing/components/pages/cards/PageBlockedChecksCard.tsx:179` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<li>{check.reasoning || check.itemKey}`
- [ ] `features/marketing/components/pages/cards/PageDraftContentCard.tsx:42` — **BasicContentEditor (split editor)** (BANNED) — `@/components/content-refine/BasicContentEditor`
- [ ] `features/marketing/content-plan/components/NodeStepRail.tsx:234` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{artifact.summary}`
- [ ] `features/marketing/content-plan/components/NodeStepRail.tsx:368` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{current.summary}`
- [ ] `features/marketing/content-plan/components/PageDraftEditor.tsx:616` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.summary}`
- [ ] `features/marketing/content-plan/setup/components/EntityAttachSection.tsx:170` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{plan.notes}`
- [ ] `features/marketing/content-plan/setup/components/EntityAttachSection.tsx:186` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{plan.notes}`
- [ ] `features/marketing/content-plan/setup/components/PlanReviewSection.tsx:197` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/marketing/content-plan/setup/components/PlanReviewSection.tsx:238` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/marketing/content-plan/setup/components/PlanReviewSection.tsx:257` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/marketing/content-plan/setup/components/SetupShapeColumn.tsx:123` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{archetype.description}`

### route /marketing/[brandId]/content/plan/[siteId]/table

- [ ] `features/marketing/components/pages/PageContentCard.tsx:21` — **MarkdownPreview** (tracked) — `@/features/files/components/core/FilePreview/previewers/MarkdownPreview`
- [ ] `features/marketing/components/pages/cards/PageBlockedChecksCard.tsx:179` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<li>{check.reasoning || check.itemKey}`
- [ ] `features/marketing/components/pages/cards/PageDraftContentCard.tsx:42` — **BasicContentEditor (split editor)** (BANNED) — `@/components/content-refine/BasicContentEditor`
- [ ] `features/marketing/content-plan/components/NodeStepRail.tsx:234` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{artifact.summary}`
- [ ] `features/marketing/content-plan/components/NodeStepRail.tsx:368` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{current.summary}`
- [ ] `features/marketing/content-plan/components/PageDraftEditor.tsx:616` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.summary}`
- [ ] `features/marketing/content-plan/setup/components/EntityAttachSection.tsx:170` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{plan.notes}`
- [ ] `features/marketing/content-plan/setup/components/EntityAttachSection.tsx:186` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{plan.notes}`
- [ ] `features/marketing/content-plan/setup/components/PlanReviewSection.tsx:197` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/marketing/content-plan/setup/components/PlanReviewSection.tsx:238` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/marketing/content-plan/setup/components/PlanReviewSection.tsx:257` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/marketing/content-plan/setup/components/SetupShapeColumn.tsx:123` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{archetype.description}`

### route /marketing/[brandId]/content/studio

- [ ] `features/marketing/components/MarketingComingSoon.tsx:167` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{sibling.description}`

### route /marketing/[brandId]/email

- [ ] `features/marketing/front-doors/MarketingDoorBoard.tsx:75` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{door.description}`

### route /marketing/[brandId]/identity

- [ ] `app/(core)/marketing/[brandId]/identity/page.tsx:119` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{room.description}`

### route /marketing/[brandId]/identity/audience

- [ ] `features/marketing/components/MarketingComingSoon.tsx:167` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{sibling.description}`

### route /marketing/[brandId]/identity/guidelines

- [ ] `features/approvals/ApprovalQueue.tsx:932` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{item.body}`

### route /marketing/[brandId]/identity/knowledge

- [ ] `features/approvals/ApprovalQueue.tsx:932` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{item.body}`
- [ ] `features/marketing/seo/value-system/discovery/DiscoveryLadder.tsx:413` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{door.body}`

### route /marketing/[brandId]/identity/media

- [ ] `features/marketing/components/media/BrandAssetDetail.tsx:169` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{asset.notes}`
- [ ] `features/marketing/components/media/GenerateMediaView.tsx:254` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`
- [ ] `features/marketing/components/media/StockSourcesView.tsx:492` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{photo.description || photo.alt_description || "Untitled photo"}`

### route /marketing/[brandId]/identity/media/generate

- [ ] `features/marketing/components/media/BrandAssetDetail.tsx:169` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{asset.notes}`
- [ ] `features/marketing/components/media/GenerateMediaView.tsx:254` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`
- [ ] `features/marketing/components/media/StockSourcesView.tsx:492` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{photo.description || photo.alt_description || "Untitled photo"}`

### route /marketing/[brandId]/identity/media/research

- [ ] `features/marketing/components/media/BrandAssetDetail.tsx:169` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{asset.notes}`
- [ ] `features/marketing/components/media/GenerateMediaView.tsx:254` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`
- [ ] `features/marketing/components/media/StockSourcesView.tsx:492` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{photo.description || photo.alt_description || "Untitled photo"}`

### route /marketing/[brandId]/identity/media/sources

- [ ] `features/marketing/components/media/BrandAssetDetail.tsx:169` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{asset.notes}`
- [ ] `features/marketing/components/media/GenerateMediaView.tsx:254` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`
- [ ] `features/marketing/components/media/StockSourcesView.tsx:492` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{photo.description || photo.alt_description || "Untitled photo"}`

### route /marketing/[brandId]/identity/offerings

- [ ] `features/approvals/ApprovalQueue.tsx:932` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{item.body}`

### route /marketing/[brandId]/intelligence/competitors

- [ ] `features/marketing/competitors/CompetitorAutopsyWorkspace.tsx:1265` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{latestArtifact.summary}`
- [ ] `features/marketing/competitors/CompetitorIdentification.tsx:272` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{result.description}`

### route /marketing/[brandId]/intelligence/competitors/competitors

- [ ] `features/marketing/competitors/CompetitorAutopsyWorkspace.tsx:1265` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{latestArtifact.summary}`
- [ ] `features/marketing/competitors/CompetitorIdentification.tsx:272` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{result.description}`

### route /marketing/[brandId]/intelligence/competitors/evidence

- [ ] `features/marketing/competitors/CompetitorAutopsyWorkspace.tsx:1265` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{latestArtifact.summary}`
- [ ] `features/marketing/competitors/CompetitorIdentification.tsx:272` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{result.description}`

### route /marketing/[brandId]/intelligence/competitors/history

- [ ] `features/marketing/competitors/CompetitorAutopsyWorkspace.tsx:1265` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{latestArtifact.summary}`
- [ ] `features/marketing/competitors/CompetitorIdentification.tsx:272` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{result.description}`

### route /marketing/[brandId]/intelligence/competitors/opportunities

- [ ] `features/marketing/competitors/CompetitorAutopsyWorkspace.tsx:1265` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{latestArtifact.summary}`
- [ ] `features/marketing/competitors/CompetitorIdentification.tsx:272` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{result.description}`

### route /marketing/[brandId]/intelligence/competitors/review

- [ ] `features/marketing/competitors/CompetitorAutopsyWorkspace.tsx:1265` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{latestArtifact.summary}`
- [ ] `features/marketing/competitors/CompetitorIdentification.tsx:272` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{result.description}`

### route /marketing/[brandId]/intelligence/monitoring

- [ ] `features/marketing/front-doors/MarketingDoorBoard.tsx:75` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{door.description}`

### route /marketing/[brandId]/intelligence/reputation

- [ ] `features/marketing/front-doors/MarketingDoorBoard.tsx:75` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{door.description}`

### route /marketing/[brandId]/intelligence/reputation/[siteId]

- [ ] `features/marketing/components/reputation/ReputationWorkspace.tsx:352` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{row.summary}`

### route /marketing/[brandId]/intelligence/reputation/[siteId]/cases

- [ ] `features/marketing/components/reputation/ReputationWorkspace.tsx:352` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{row.summary}`

### route /marketing/[brandId]/intelligence/reputation/[siteId]/evidence

- [ ] `features/marketing/components/reputation/ReputationWorkspace.tsx:352` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{row.summary}`

### route /marketing/[brandId]/intelligence/reputation/[siteId]/narratives

- [ ] `features/marketing/components/reputation/ReputationWorkspace.tsx:352` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{row.summary}`

### route /marketing/[brandId]/intelligence/reputation/[siteId]/publications

- [ ] `features/marketing/components/reputation/ReputationWorkspace.tsx:352` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{row.summary}`

### route /marketing/[brandId]/locations

- [ ] `features/marketing/local/EndowmentPortfolioPanel.tsx:100` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{match.platform.notes}`
- [ ] `features/marketing/local/EndowmentPortfolioPanel.tsx:452` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{artifact.description}`

### route /marketing/[brandId]/locations/[locationId]

- [ ] `features/marketing/local/EndowmentPortfolioPanel.tsx:100` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{match.platform.notes}`
- [ ] `features/marketing/local/EndowmentPortfolioPanel.tsx:452` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{artifact.description}`

### route /marketing/[brandId]/planning/calendar

- [ ] `features/marketing/components/MarketingComingSoon.tsx:167` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{sibling.description}`

### route /marketing/[brandId]/planning/initiatives

- [ ] `features/marketing/initiatives/columns.tsx:38` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{r.description}`

### route /marketing/[brandId]/planning/initiatives/[id]

- [ ] `features/marketing/initiatives/InitiativeDetail.tsx:100` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{row.description}`

### route /marketing/[brandId]/pr

- [ ] `features/marketing/pr/components/StoryAngleQueue.tsx:293` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{angle.summary}`

### route /marketing/[brandId]/pr/outreach

- [ ] `features/marketing/front-doors/MarketingDoorBoard.tsx:75` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{door.description}`

### route /marketing/[brandId]/seo/[siteId]/ai-visibility

- [ ] `features/marketing/seo/ai-visibility/AiVisibilityWorkspace.tsx:17` — **BasicMarkdownContent** (tracked) — `@/components/mardown-display/chat-markdown/BasicMarkdownContent`

### route /marketing/[brandId]/seo/[siteId]/ai-visibility/[view]

- [ ] `features/marketing/seo/ai-visibility/AiVisibilityWorkspace.tsx:17` — **BasicMarkdownContent** (tracked) — `@/components/mardown-display/chat-markdown/BasicMarkdownContent`

### route /marketing/[brandId]/seo/[siteId]/automations

- [ ] `features/marketing/seo/run-console/RunHistoryPanel.tsx:349` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{run.summary}`

### route /marketing/[brandId]/seo/[siteId]/automations/history

- [ ] `features/marketing/seo/run-console/RunHistoryPanel.tsx:349` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{run.summary}`

### route /marketing/[brandId]/seo/[siteId]/automations/proposals

- [ ] `features/marketing/seo/run-console/RunHistoryPanel.tsx:349` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{run.summary}`

### route /marketing/[brandId]/seo/[siteId]/automations/unplaced

- [ ] `features/marketing/seo/run-console/RunHistoryPanel.tsx:349` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{run.summary}`

### route /marketing/[brandId]/seo/[siteId]/backlinks

- [ ] `features/marketing/components/backlinks/SerpProspectsTab.tsx:634` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{promoter.summary}`
- [ ] `features/marketing/components/backlinks/SerpProspectsTab.tsx:860` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{variant.explanation}`

### route /marketing/[brandId]/seo/[siteId]/backlinks/anchors

- [ ] `features/marketing/components/backlinks/SerpProspectsTab.tsx:634` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{promoter.summary}`
- [ ] `features/marketing/components/backlinks/SerpProspectsTab.tsx:860` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{variant.explanation}`

### route /marketing/[brandId]/seo/[siteId]/backlinks/changes

- [ ] `features/marketing/components/backlinks/SerpProspectsTab.tsx:634` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{promoter.summary}`
- [ ] `features/marketing/components/backlinks/SerpProspectsTab.tsx:860` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{variant.explanation}`

### route /marketing/[brandId]/seo/[siteId]/backlinks/competitors

- [ ] `features/marketing/components/backlinks/SerpProspectsTab.tsx:634` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{promoter.summary}`
- [ ] `features/marketing/components/backlinks/SerpProspectsTab.tsx:860` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{variant.explanation}`

### route /marketing/[brandId]/seo/[siteId]/backlinks/coverage

- [ ] `features/marketing/components/backlinks/SerpProspectsTab.tsx:634` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{promoter.summary}`
- [ ] `features/marketing/components/backlinks/SerpProspectsTab.tsx:860` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{variant.explanation}`

### route /marketing/[brandId]/seo/[siteId]/backlinks/domains

- [ ] `features/marketing/components/backlinks/SerpProspectsTab.tsx:634` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{promoter.summary}`
- [ ] `features/marketing/components/backlinks/SerpProspectsTab.tsx:860` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{variant.explanation}`

### route /marketing/[brandId]/seo/[siteId]/backlinks/insights

- [ ] `features/marketing/components/backlinks/SerpProspectsTab.tsx:634` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{promoter.summary}`
- [ ] `features/marketing/components/backlinks/SerpProspectsTab.tsx:860` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{variant.explanation}`

### route /marketing/[brandId]/seo/[siteId]/backlinks/links

- [ ] `features/marketing/components/backlinks/SerpProspectsTab.tsx:634` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{promoter.summary}`
- [ ] `features/marketing/components/backlinks/SerpProspectsTab.tsx:860` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{variant.explanation}`

### route /marketing/[brandId]/seo/[siteId]/backlinks/pages

- [ ] `features/marketing/components/backlinks/SerpProspectsTab.tsx:634` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{promoter.summary}`
- [ ] `features/marketing/components/backlinks/SerpProspectsTab.tsx:860` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{variant.explanation}`

### route /marketing/[brandId]/seo/[siteId]/backlinks/prospects

- [ ] `features/marketing/components/backlinks/SerpProspectsTab.tsx:634` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{promoter.summary}`
- [ ] `features/marketing/components/backlinks/SerpProspectsTab.tsx:860` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{variant.explanation}`

### route /marketing/[brandId]/seo/[siteId]/capabilities

- [ ] `features/marketing/seo/capabilities/SeoCapabilitiesWorkspace.tsx:148` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{copy.description}`
- [ ] `features/marketing/seo/capabilities/SeoCapabilitiesWorkspace.tsx:166` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{capability.description}`

### route /marketing/[brandId]/seo/[siteId]/findings

- [ ] `features/marketing/components/analysis/FindingsTable.tsx:150` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{row.reasoning ?? "Re-run the analysis to capture the explanation."}`

### route /marketing/[brandId]/seo/[siteId]/findings/[findingId]

- [ ] `features/marketing/components/analysis/FindingDetail.tsx:484` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{data.item.description}`
- [ ] `features/marketing/components/analysis/FindingRemedyCard.tsx:153` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{resolved.explanation}`
- [ ] `features/marketing/components/analysis/FindingRemedyCard.tsx:168` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{resolved.remedy.summary}`
- [ ] `features/marketing/components/analysis/FindingRemedyCard.tsx:194` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{resolved.remedy.summary}`

### route /marketing/[brandId]/seo/[siteId]/growth-loop

- [ ] `features/growth-loop/run/components/LoopHistoryFeed.tsx:313` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{quality.reasoning}`

### route /marketing/[brandId]/seo/[siteId]/keywords/research

- [ ] `features/marketing/seo/keyword-research/components/KeywordResearchLauncher.tsx:33` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### route /marketing/[brandId]/seo/[siteId]/keywords/value

- [ ] `features/approvals/ApprovalQueue.tsx:932` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{item.body}`
- [ ] `features/marketing/seo/value-system/workbench/MeaningPanel.tsx:394` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{meta.description ?? "No description yet."}`
- [ ] `features/marketing/seo/value-system/workbench/MeaningPanel.tsx:678` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{value.notes}`
- [ ] `features/marketing/seo/value-system/workbench/session/TrialPanel.tsx:955` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{card.proposal.notes}`

### route /marketing/[brandId]/seo/[siteId]/keywords/value/dimensions

- [ ] `features/marketing/seo/value-system/dimensions/DimensionCard.tsx:256` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{value.description}`
- [ ] `features/marketing/seo/value-system/dimensions/DimensionCard.tsx:614` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{dimension.description}`

### route /marketing/[brandId]/seo/[siteId]/keywords/value/packs

- [ ] `features/marketing/seo/value-system/packs/GeoPlacesStep.tsx:140` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{area.notes}`
- [ ] `features/marketing/seo/value-system/packs/PackReview.tsx:1196` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{band.description}`
- [ ] `features/marketing/seo/value-system/packs/StarterPackCatalog.tsx:408` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{pack.summary}`
- [ ] `features/marketing/seo/value-system/packs/StarterPackCatalog.tsx:413` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{pack.description}`

### route /marketing/[brandId]/seo/[siteId]/keywords/value/rules

- [ ] `features/marketing/seo/value-system/rules/MeaningRulesWorkbench.tsx:334` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{band.description ?? "No description yet."}`

### route /marketing/[brandId]/seo/[siteId]/keywords/value/settings

- [ ] `features/marketing/seo/value-system/settings/AutonomyModesEditor.tsx:190` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{capability.description}`

### route /marketing/[brandId]/seo/[siteId]/performance

- [ ] `components/ui/chart.tsx:88` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: Object.entries(THEMES) .map( ([theme, prefix]) => ' ${…`

### route /marketing/[brandId]/seo/[siteId]/search-console

- [ ] `features/marketing/search-console/components/insights/InsightsTab.tsx:268` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{activeMeta.description}`
- [ ] `features/marketing/search-console/components/new-pages/NewPagesTab.tsx:209` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.tracking.notes}`

### route /marketing/[brandId]/seo/[siteId]/search-console/digs

- [ ] `features/marketing/search-console/components/insights/InsightsTab.tsx:268` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{activeMeta.description}`
- [ ] `features/marketing/search-console/components/new-pages/NewPagesTab.tsx:209` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.tracking.notes}`

### route /marketing/[brandId]/seo/[siteId]/search-console/insights

- [ ] `features/marketing/search-console/components/insights/InsightsTab.tsx:268` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{activeMeta.description}`
- [ ] `features/marketing/search-console/components/new-pages/NewPagesTab.tsx:209` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.tracking.notes}`

### route /marketing/[brandId]/seo/[siteId]/search-console/new-pages

- [ ] `features/marketing/search-console/components/insights/InsightsTab.tsx:268` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{activeMeta.description}`
- [ ] `features/marketing/search-console/components/new-pages/NewPagesTab.tsx:209` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.tracking.notes}`

### route /marketing/[brandId]/seo/[siteId]/search-console/watchlist

- [ ] `features/marketing/search-console/components/insights/InsightsTab.tsx:268` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{activeMeta.description}`
- [ ] `features/marketing/search-console/components/new-pages/NewPagesTab.tsx:209` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.tracking.notes}`

### route /marketing/[brandId]/seo/[siteId]/valuation

- [ ] `features/marketing/link-valuation/components/LinkValuationWorkspace.tsx:249` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{config.description}`
- [ ] `features/marketing/link-valuation/components/TuningPanel.tsx:279` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{group.description}`

### route /marketing/[brandId]/settings

- [ ] `features/marketing/seo/value-system/settings/AutonomyModesEditor.tsx:190` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{capability.description}`

### route /marketing/[brandId]/socials

- [ ] `features/marketing/components/MarketingComingSoon.tsx:167` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{sibling.description}`

### route /marketing/[brandId]/websites/[siteId]

- [ ] `features/marketing/components/site/SiteOverview.tsx:758` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{site.description}`

### route /marketing/[brandId]/websites/[siteId]/crawls/[crawlId]/reports

- [ ] `features/marketing/components/crawls/CrawlReportsIndex.tsx:158` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{report.description}`

### route /marketing/[brandId]/websites/[siteId]/crawls/[crawlId]/reports/[reportKey]

- [ ] `features/marketing/components/crawls/CrawlReportWorkspace.tsx:1167` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{report.description}`

### route /marketing/[brandId]/websites/[siteId]/media

- [ ] `features/marketing/components/media/BrandAssetDetail.tsx:169` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{asset.notes}`
- [ ] `features/marketing/components/media/SiteVideosView.tsx:408` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{meta.description}`

### route /marketing/[brandId]/websites/[siteId]/media/standards

- [ ] `features/marketing/components/media/BrandAssetDetail.tsx:169` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{asset.notes}`
- [ ] `features/marketing/components/media/SiteVideosView.tsx:408` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{meta.description}`

### route /marketing/[brandId]/websites/[siteId]/media/videos

- [ ] `features/marketing/components/media/BrandAssetDetail.tsx:169` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{asset.notes}`
- [ ] `features/marketing/components/media/SiteVideosView.tsx:408` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{meta.description}`

### route /marketing/[brandId]/websites/[siteId]/pages/[pageId]

- [ ] `features/marketing/components/pages/PageContentCard.tsx:21` — **MarkdownPreview** (tracked) — `@/features/files/components/core/FilePreview/previewers/MarkdownPreview`
- [ ] `features/marketing/components/pages/cards/PageBlockedChecksCard.tsx:179` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<li>{check.reasoning || check.itemKey}`
- [ ] `features/marketing/components/pages/cards/PageDraftContentCard.tsx:42` — **BasicContentEditor (split editor)** (BANNED) — `@/components/content-refine/BasicContentEditor`
- [ ] `features/marketing/content-plan/components/NodeStepRail.tsx:234` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{artifact.summary}`
- [ ] `features/marketing/content-plan/components/NodeStepRail.tsx:368` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{current.summary}`
- [ ] `features/marketing/content-plan/components/PageDraftEditor.tsx:616` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.summary}`

### route /marketing/[brandId]/websites/[siteId]/pages/[pageId]/snapshots/[snapshotId]

- [ ] `features/marketing/components/pages/SnapshotArtifacts.tsx:14` — **MarkdownPreview** (tracked) — `@/features/files/components/core/FilePreview/previewers/MarkdownPreview`

### route /marketing/[brandId]/websites/[siteId]/settings

- [ ] `features/marketing/search-console/intake/SiteIntakeWizard.tsx:520` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{group.reasoning}`

### route /marketing/[brandId]/websites/[siteId]/settings/access

- [ ] `features/marketing/search-console/intake/SiteIntakeWizard.tsx:520` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{group.reasoning}`

### route /marketing/[brandId]/websites/[siteId]/settings/intake

- [ ] `features/marketing/search-console/intake/SiteIntakeWizard.tsx:520` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{group.reasoning}`

### route /marketing/[brandId]/websites/[siteId]/settings/integrations

- [ ] `features/marketing/search-console/intake/SiteIntakeWizard.tsx:520` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{group.reasoning}`

### route /marketing/ai-visibility/runs/[runId]

- [ ] `features/marketing/seo/ai-visibility/AiVisibilityReport.tsx:4` — **react-markdown** (BANNED) — `react-markdown`
- [ ] `features/marketing/seo/ai-visibility/AiVisibilityReport.tsx:5` — **remark-* plugins** (BANNED) — `remark-gfm`

### route /marketing/brands

- [ ] `features/marketing/components/brands/BrandEditorDialog.tsx:431` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{option.description}`

### route /marketing/brands/new-website

- [ ] `features/marketing/components/sites/NewSiteForm.tsx:230` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{option.body}`

### route /marketing/operations/approvals

- [ ] `features/approvals/ApprovalQueue.tsx:932` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{item.body}`

### route /marketing/operations/automations

- [ ] `features/marketing/seo/run-console/RunHistoryPanel.tsx:349` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{run.summary}`

### route /marketing/operations/automations/history

- [ ] `features/marketing/seo/run-console/RunHistoryPanel.tsx:349` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{run.summary}`

### route /marketing/operations/automations/proposals

- [ ] `features/marketing/seo/run-console/RunHistoryPanel.tsx:349` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{run.summary}`

### route /marketing/operations/automations/unplaced

- [ ] `features/marketing/seo/run-console/RunHistoryPanel.tsx:349` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{run.summary}`

### route /marketing/operations/capabilities

- [ ] `features/marketing/seo/capabilities/SeoCapabilitiesWorkspace.tsx:148` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{copy.description}`
- [ ] `features/marketing/seo/capabilities/SeoCapabilitiesWorkspace.tsx:166` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{capability.description}`

### route /marketing/reports/search-console

- [ ] `features/marketing/search-console/components/insights/InsightsTab.tsx:268` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{activeMeta.description}`
- [ ] `features/marketing/search-console/components/new-pages/NewPagesTab.tsx:209` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.tracking.notes}`

### route /marketing/reports/search-console/digs

- [ ] `features/marketing/search-console/components/insights/InsightsTab.tsx:268` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{activeMeta.description}`
- [ ] `features/marketing/search-console/components/new-pages/NewPagesTab.tsx:209` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.tracking.notes}`

### route /marketing/reports/search-console/insights

- [ ] `features/marketing/search-console/components/insights/InsightsTab.tsx:268` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{activeMeta.description}`
- [ ] `features/marketing/search-console/components/new-pages/NewPagesTab.tsx:209` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.tracking.notes}`

### route /marketing/reports/search-console/new-pages

- [ ] `features/marketing/search-console/components/insights/InsightsTab.tsx:268` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{activeMeta.description}`
- [ ] `features/marketing/search-console/components/new-pages/NewPagesTab.tsx:209` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.tracking.notes}`

### route /marketing/reports/search-console/watchlist

- [ ] `features/marketing/search-console/components/insights/InsightsTab.tsx:268` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{activeMeta.description}`
- [ ] `features/marketing/search-console/components/new-pages/NewPagesTab.tsx:209` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.tracking.notes}`

### route /marketing/tools

- [ ] `features/marketing/components/brands/BrandEditorDialog.tsx:431` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{option.description}`

### route /marketing/tools/youtube

- [ ] `features/marketing/discovery/youtube/YouTubeDiscovery.tsx:983` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{video.description || "No description supplied."}`
- [ ] `features/marketing/discovery/youtube/YouTubeVideoPreview.tsx:59` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{video.description || "No description supplied."}`

### route /marketing/tools/youtube/videos/[videoId]

- [ ] `features/marketing/discovery/youtube/YouTubeVideoPreview.tsx:59` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{video.description || "No description supplied."}`

### route /marketing/topical-maps/[mapId]

- [ ] `app/(core)/marketing/topical-maps/[mapId]/page.tsx:123` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{map.description}`
- [ ] `components/official/review-deck/ReviewDeck.tsx:214` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{current.body}`
- [ ] `features/marketing/seo/topical-map/proposals/ProposalReview.tsx:127` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{topic.description}`
- [ ] `features/marketing/seo/topical-map/views/HistoryView.tsx:376` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`
- [ ] `features/marketing/seo/topical-map/views/TextView.tsx:18` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/marketing/seo/topical-map/views/outline/TopicHoverCard.tsx:55` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{topic.description}`
- [ ] `features/marketing/seo/topical-map/views/table/columns.tsx:348` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.topic.description}`

### route /masterwork/[id]

- [ ] `components/ui/chart.tsx:88` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: Object.entries(THEMES) .map( ([theme, prefix]) => ' ${…`
- [ ] `features/masterwork/components/detail/RuleMove.tsx:76` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{precondition.summary}`
- [ ] `features/masterwork/components/detail/RulebookDetailPage.tsx:2488` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{rulebook.description}`

### route /masterwork/[id]/masterworks

- [ ] `features/masterwork/components/masterworks/AuditionDialog.tsx:584` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{verdict.summary}`
- [ ] `features/masterwork/components/masterworks/CompareTwoDialog.tsx:356` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{verdict.summary}`
- [ ] `features/masterwork/components/masterworks/CompareTwoDialog.tsx:413` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{arm.reasoning}`
- [ ] `features/masterwork/components/masterworks/MasterworksPage.tsx:532` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{masterwork.description}`

### route /masterwork/[id]/plan

- [ ] `components/ui/chart.tsx:88` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: Object.entries(THEMES) .map( ([theme, prefix]) => ' ${…`
- [ ] `features/masterwork/capture-plan/CapturePlanPage.tsx:897` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{body}`

### route /masterwork/[id]/probe

- [ ] `features/masterwork/probe/BadExampleProbe.tsx:40` — **RichDocument** (tracked) — `@/features/rich-document/RichDocument`

### route /masterwork/[id]/record

- [ ] `features/masterwork/record/ExpertRecordPage.tsx:66` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### route /masterwork/[id]/sort

- [ ] `features/masterwork/sorting/SortingTablePage.tsx:1203` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{question.prompt}`

### route /masterwork/[id]/teach-back

- [ ] `features/masterwork/teach-back/TeachBack.tsx:814` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{round.explanation}`
- [ ] `features/masterwork/teach-back/TeachBack.tsx:617` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{current.explanation}`

### route /masterwork/[id]/triad

- [ ] `features/masterwork/triad/TriadGamePage.tsx:584` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{card.prompt}`

### route /masterwork/all

- [ ] `features/masterwork/browse/columns.tsx:93` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{row.description}`
- [ ] `features/masterwork/browse/components/MasterworkBrowseCards.tsx:24` — **cleanMarkdownPreview (regex markdown stripping)** (BANNED) — `cleanMarkdownPreview ← @/utils/markdown-processors/clean-markdown-to-text`
- [ ] `features/masterwork/browse/components/MasterworkBrowseRows.tsx:89` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.description}`

### route /masterwork/encore/[id]

- [ ] `features/masterwork/components/masterworks/AuditionDialog.tsx:584` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{verdict.summary}`
- [ ] `features/masterwork/components/masterworks/CompareTwoDialog.tsx:356` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{verdict.summary}`
- [ ] `features/masterwork/components/masterworks/CompareTwoDialog.tsx:413` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{arm.reasoning}`
- [ ] `features/masterwork/components/masterworks/MasterworksPage.tsx:532` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{masterwork.description}`

### route /masterwork/vision-interview/[sessionId]

- [ ] `features/vision-interview/components/DeliverablePane.tsx:17` — **RichDocument** (tracked) — `@/features/rich-document/RichDocument`
- [ ] `features/vision-interview/components/DocumentPane.tsx:25` — **RichDocument** (tracked) — `@/features/rich-document/RichDocument`
- [ ] `features/vision-interview/components/ExpertFeedSection.tsx:137` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{turn.content}`
- [ ] `features/vision-interview/components/FinishInterviewDialog.tsx:221` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<div pre-wrap>{interrupt.prompt}`
- [ ] `features/vision-interview/components/LiveTurnCard.tsx:20` — **BasicMarkdownContent** (tracked) — `@/components/mardown-display/chat-markdown/BasicMarkdownContent`
- [ ] `features/vision-interview/components/TurnCard.tsx:17` — **RichDocument** (tracked) — `@/features/rich-document/RichDocument`

### route /matrx-extend-demo

- [ ] `app/(public)/matrx-extend-demo/page.tsx:69` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}`

### route /news

- [ ] `app/(transitional)/news/NewsCard.tsx:80` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{article.description}`

### route /notifications

- [ ] `features/notifications/components/InboxPanel.tsx:131` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.body}`

### route /oauth/consent

- [ ] `app/oauth/consent/ConsentClient.tsx:701` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{info.description}`

### route /organizations

- [ ] `app/(core)/organizations/page.tsx:252` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{org.description}`

### route /organizations/[orgId]

- [ ] `features/organizations/components/OrgWorkspace.tsx:432` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{organization.description}`
- [ ] `features/scope-system/components/NewScopeInline.tsx:398` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`
- [ ] `features/scope-system/components/TemplateGalleryDrawer.tsx:506` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{template.description}`
- [ ] `features/scope-system/components/TemplateGalleryDrawer.tsx:642` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{template.description}`

### route /organizations/[orgId]/context-items

- [ ] `features/scope-system/components/ContextItemsHub.tsx:795` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`

### route /organizations/[orgId]/org-2

- [ ] `features/organizations/components/OrgWorkspace.tsx:432` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{organization.description}`
- [ ] `features/scope-system/components/NewScopeInline.tsx:398` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`
- [ ] `features/scope-system/components/TemplateGalleryDrawer.tsx:506` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{template.description}`
- [ ] `features/scope-system/components/TemplateGalleryDrawer.tsx:642` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{template.description}`

### route /organizations/[orgId]/performance-reviews

- [ ] `features/employee-performance-reviews/components/PerformanceReviewApp.tsx:593` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: reportHtml }}`
- [ ] `features/employee-performance-reviews/components/PerformanceReviewApp.tsx:908` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: reportHtml }}`
- [ ] `features/employee-performance-reviews/components/PerformanceReviewApp.tsx:864` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{opt.description}`
- [ ] `features/employee-performance-reviews/components/review-form-components.tsx:221` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<span pre-wrap>{text}`

### route /organizations/[orgId]/resources/[kind]

- [ ] `features/organizations/components/OrgResourceDetail.tsx:269` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`

### route /organizations/[orgId]/scopes

- [ ] `features/scopes/components/management/NewScopeInline.tsx:356` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`
- [ ] `features/scopes/components/management/TemplateGalleryDrawer.tsx:510` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{template.description}`
- [ ] `features/scopes/components/management/TemplateGalleryDrawer.tsx:646` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{template.description}`

### route /organizations/[orgId]/scopes/[typeId]

- [ ] `features/scope-system/components/NewScopeInline.tsx:398` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`
- [ ] `features/scope-system/components/ScopesList.tsx:312` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{scopeType.description}`
- [ ] `features/scope-system/components/ScopesList.tsx:742` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`

### route /organizations/[orgId]/scopes/[typeId]/[scopeId]

- [ ] `features/scope-system/components/EditScopeValueSheet.tsx:233` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.description}`
- [ ] `features/scope-system/components/ScopeDetailEditor.tsx:337` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{scope.description}`
- [ ] `features/scope-system/components/ScopeFieldInput.tsx:320` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{row.description}`

### route /organizations/[orgId]/scopes/[typeId]/[scopeId]/[itemId]

- [ ] `features/scope-system/components/EditScopeValueSheet.tsx:233` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.description}`
- [ ] `features/scope-system/components/ScopeFieldInput.tsx:320` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{row.description}`
- [ ] `features/scope-system/components/ScopeItemDetail.tsx:205` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`

### route /organizations/[orgId]/scopes/[typeId]/[scopeId]/context-items

- [ ] `features/scope-system/components/EditScopeValueSheet.tsx:233` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.description}`
- [ ] `features/scope-system/components/ScopeFieldInput.tsx:320` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{row.description}`

### route /organizations/[orgId]/scopes/[typeId]/context-items

- [ ] `features/scope-system/components/ContextItemsHub.tsx:795` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`

### route /organizations/[orgId]/scopes/[typeId]/context-items/[itemId]

- [ ] `features/scope-system/components/ContextItemHub.tsx:171` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`
- [ ] `features/scope-system/components/EditScopeValueSheet.tsx:233` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.description}`
- [ ] `features/scope-system/components/ScopeFieldInput.tsx:320` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{row.description}`

### route /organizations/[orgId]/settings

- [ ] `features/secrets/components/VaultCreateDialog.tsx:1376` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{loginUrlDef?.description ?? "Where this login is used. Stored as plain, unencrypted m…`
- [ ] `features/secrets/components/VaultCreateDialog.tsx:1829` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{draft.def.description}`
- [ ] `features/secrets/components/VaultCreateDialog.tsx:1980` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{def.description}`
- [ ] `features/secrets/components/VaultHandlingControl.tsx:80` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{presentation.description}`
- [ ] `features/secrets/components/VaultItemDetail.tsx:2490` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{VAULT_LABELS.notes}`
- [ ] `features/secrets/components/VaultItemDetail.tsx:321` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{item.description}`
- [ ] `features/secrets/components/VaultItemDetail.tsx:859` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<dd pre-wrap>{attachment.description}`
- [ ] `features/secrets/components/VaultItemDetail.tsx:1270` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<span pre-wrap>{field.description}`
- [ ] `features/secrets/components/VaultItemDetail.tsx:2493` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{item.notes}`

### route /organizations/[orgId]/settings/change-policy

- [ ] `features/change-policy/components/ChangePolicySurface.tsx:356` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.description}`

### route /organizations/[orgId]/settings/keyword-value

- [ ] `features/marketing/seo/value-system/settings/AutonomyModesEditor.tsx:190` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{capability.description}`

### route /organizations/[orgId]/settings/mandates

- [ ] `features/mandates/browse/MandateBrowseCards.tsx:86` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{row.description}`
- [ ] `features/mandates/browse/useCoverageList.tsx:119` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{meta.description}`

### route /organizations/[orgId]/settings/mandates/[mandateKey]

- [ ] `features/agents/agent-creators/interactive-builder/AgentGenerator.tsx:66` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agents/agent-creators/interactive-builder/AgentGenerator.tsx:622` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{mandate.summary}`
- [ ] `features/agents/agent-creators/interactive-builder/AgentJsonDisplay.tsx:37` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agents/agent-creators/interactive-builder/AgentJsonDisplay.tsx:315` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{data.description}`
- [ ] `features/bindings/OfferedInventoryColumn.tsx:181` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{value.description}`
- [ ] `features/mandates/components/MandateNotesPanel.tsx:245` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{note.body}`
- [ ] `features/surfaces/components/bind/BindingSuggestionsTab.tsx:403` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{proposal.notes}`
- [ ] `features/surfaces/components/bind/WritePolicyEditor.tsx:183` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{target.description}`
- [ ] `features/workflow-runtime/listings/core/WorkflowDetailCard.tsx:171` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{workflow.description}`
- [ ] `features/workflow-runtime/listings/core/WorkflowSneakPeek.tsx:123` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{peek.description}`

### route /organizations/[orgId]/settings/scopes

- [ ] `features/agent-context/components/scope-admin/ScopeInstancePanel.tsx:275` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{node.description}`
- [ ] `features/scope-system/components/TemplateGalleryDrawer.tsx:506` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{template.description}`
- [ ] `features/scope-system/components/TemplateGalleryDrawer.tsx:642` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{template.description}`

### route /organizations/[orgId]/shortcuts

- [ ] `app/(core)/organizations/[orgId]/shortcuts/page.tsx:183` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tile.description}`

### route /organizations/[orgId]/shortcuts/categories

- [ ] `features/agent-shortcuts/components/CategoryTree.tsx:225` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{node.description}`

### route /organizations/[orgId]/shortcuts/edit/[id]

- [ ] `app/(core)/organizations/[orgId]/shortcuts/edit/[id]/page.tsx:173` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{resolved.description}`

### route /organizations/[orgId]/shortcuts/shortcuts

- [ ] `features/agent-shortcuts/components/ShortcutList.tsx:669` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{shortcut.description}`

### route /p/[slug]

- [ ] `features/agent-apps/components/AgentAppPublicRendererImpl.tsx:23` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agent-apps/components/shells/AgentAppFormToResultShell.tsx:25` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agent-apps/components/shells/AgentAppFullyCustomShell.tsx:33` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agent-apps/components/shells/AgentAppMarkdownStreamBridge.tsx:4` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agent-apps/components/shells/AgentAppWidgetShell.tsx:26` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### route /p/e/[resourceType]/[id]

- [ ] `app/(public)/p/e/[resourceType]/[id]/PublicResourceView.tsx:8` — **react-markdown** (BANNED) — `react-markdown`
- [ ] `app/(public)/p/e/[resourceType]/[id]/PublicResourceView.tsx:9` — **remark-* plugins** (BANNED) — `remark-gfm`
- [ ] `app/(public)/p/e/[resourceType]/[id]/PublicResourceView.tsx:42` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{resource.description}`
- [ ] `app/(public)/p/e/[resourceType]/[id]/PublicResourceView.tsx:119` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{resource.description}`

### route /podcast/[slug]

- [ ] `features/podcasts/components/player/EpisodeShowNotes.tsx:16` — **BasicMarkdownContent** (tracked) — `@/components/mardown-display/chat-markdown/BasicMarkdownContent`
- [ ] `features/podcasts/components/player/PodcastEpisodePage.tsx:142` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{episode.description}`
- [ ] `features/podcasts/components/player/PodcastEpisodePage.tsx:258` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{episode.description}`
- [ ] `features/podcasts/components/player/PodcastShowPage.tsx:127` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{show.description}`
- [ ] `features/podcasts/components/player/PodcastShowPage.tsx:233` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{ep.description}`

### route /podcast/[slug]/blog

- [ ] `features/podcasts/components/player/PodcastBlogPage.tsx:20` — **BasicMarkdownContent** (tracked) — `@/components/mardown-display/chat-markdown/BasicMarkdownContent`

### route /podcast/studio/create

- [ ] `features/content-ir/react/actions/KindRequestDialog.tsx:23` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### route /podcast/studio/create-dense

- [ ] `features/content-ir/react/actions/KindRequestDialog.tsx:23` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### route /podcast/studio/create-sharp

- [ ] `features/content-ir/react/actions/KindRequestDialog.tsx:23` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### route /podcast/studio/run-a

- [ ] `app/(core)/podcast/studio/run-a/_components/RunViewA.tsx:186` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{state.description}`

### route /podcast/studio/run-b

- [ ] `app/(core)/podcast/studio/run-b/_components/EpisodeReveal.tsx:55` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{state.description}`

### route /podcast/studio/run-c

- [ ] `app/(core)/podcast/studio/run-c/_components/StreamingResults.tsx:43` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{state.description}`

### route /podcast/studio/run-d

- [ ] `app/(core)/podcast/studio/run-d/_components/AssetStage.tsx:42` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{state.description}`
- [ ] `app/(core)/podcast/studio/run-d/_components/AssetStage.tsx:197` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{body}`
- [ ] `app/(core)/podcast/studio/run-d/_components/FinishedEpisode.tsx:66` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{state.description}`

### route /podcast/studio/run-dense/[id]

- [ ] `features/podcasts/generator/components/AssetCard.tsx:186` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{slot.prompt || "Preparing…"}`
- [ ] `features/podcasts/generator/components/MetadataHero.tsx:40` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{state.description}`

### route /podcast/studio/run-e

- [ ] `app/(core)/podcast/studio/run-e/_components/FinishedPlayer.tsx:90` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{state.description}`
- [ ] `app/(core)/podcast/studio/run-e/_components/StageMonitor.tsx:179` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{state.description}`
- [ ] `app/(core)/podcast/studio/run-e/_components/StageMonitor.tsx:146` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{text}`

### route /podcast/studio/run-f

- [ ] `app/(core)/podcast/studio/run-f/_components/FinishedEpisode.tsx:57` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{state.description}`
- [ ] `app/(core)/podcast/studio/run-f/_components/FinishedEpisode.tsx:159` — **.split("\n").map(→ JSX) paragraph renderer** (review) — `script.split("\n").filter(Boolean).map((line, i) => { const [speaker, ...rest] = line.spl…`

### route /podcast/studio/run-refine/[id]

- [ ] `app/(core)/podcast/studio/run-refine/[id]/_components/ProductionStage.tsx:216` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{moment.prompt || "A fresh visual for your episode."}`
- [ ] `features/podcasts/generator/components/AssetCard.tsx:186` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{slot.prompt || "Preparing…"}`
- [ ] `features/podcasts/generator/components/MetadataHero.tsx:40` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{state.description}`

### route /podcast/studio/run-reimagine/[id]

- [ ] `features/podcasts/generator/components/AssetCard.tsx:186` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{slot.prompt || "Preparing…"}`
- [ ] `features/podcasts/generator/components/MetadataHero.tsx:40` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{state.description}`

### route /podcast/studio/run-sharp/[id]

- [ ] `features/podcasts/generator/components/AssetCard.tsx:186` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{slot.prompt || "Preparing…"}`
- [ ] `features/podcasts/generator/components/MetadataHero.tsx:40` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{state.description}`

### route /podcast/studio/run/[id]

- [ ] `features/podcasts/generator/components/AssetCard.tsx:186` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{slot.prompt || "Preparing…"}`
- [ ] `features/podcasts/generator/components/MetadataHero.tsx:40` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{state.description}`
- [ ] `features/podcasts/studio/components/EpisodeContentStudio.tsx:27` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### route /portal/c/[slug]/r/[recordId]

- [ ] `features/portals/PortalCommentThread.tsx:79` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{comment.body}`

### route /pricing

- [ ] `features/pricing/education/EducationPricing.tsx:192` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{premium?.description ?? "Unlimited AI generation across every study tool."}`

### route /print

- [ ] `features/print/hub/PrintHub.tsx:36` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{group.description}`

### route /print/education

- [ ] `features/print/sections/EducationSection.tsx:84` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{variant.description}`

### route /print/exams

- [ ] `features/print/sections/ExamSection.tsx:70` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{SAMPLE_PRACTICE_TEST.instructions}`
- [ ] `features/print/sections/ExamSection.tsx:76` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{question.prompt}`
- [ ] `features/print/sections/ExamSection.tsx:103` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{variant.description}`
- [ ] `features/print/sections/ExamSection.tsx:146` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{setting.description}`

### route /print/flashcards

- [ ] `features/print/sections/FlashcardsSection.tsx:57` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{variant.description}`

### route /print/order

- [ ] `features/print/order/PricePanel.tsx:323` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{entry.description ?? "Discount"}`

### route /projects

- [ ] `features/projects/components/ProjectsHub.tsx:1887` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{project.description}`

### route /projects/[projectId]

- [ ] `features/projects/components/ProjectInlineEditors.tsx:342` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<span pre-wrap>{project.description}`

### route /projects/[projectId]/settings

- [ ] `features/projects/components/ProjectInlineEditors.tsx:342` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<span pre-wrap>{project.description}`

### route /projects/new

- [ ] `features/agents/components/smart/CreateWithAiTabs.tsx:272` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{tab.content}`

### route /rag

- [ ] `features/rag/components/data-stores/LibraryCatalogPane.tsx:92` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{it.description}`

### route /rag/data-stores

- [ ] `features/rag/components/data-stores/DataStoresPage.tsx:318` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{store.description}`
- [ ] `features/rag/components/data-stores/DataStoresPage.tsx:858` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{s.description}`
- [ ] `features/rag/components/data-stores/DataStoresPage.tsx:1071` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<td>{m.notes ?? "—"}`

### route /rag/library

- [ ] `features/rag/components/library/LibraryDocDetailSheet.tsx:1604` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{text || <span className="italic text-muted-foreground">(empty)</span>}`

### route /rag/library-catalog

- [ ] `features/rag/components/library-catalog/LibraryCatalogPage.tsx:569` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{item.description}`
- [ ] `features/rag/components/library-catalog/LibraryCatalogPage.tsx:661` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`
- [ ] `features/rag/components/library-catalog/PackDetailPanel.tsx:245` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`
- [ ] `features/rag/components/library-catalog/RulebookDetailPanel.tsx:248` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`

### route /rag/search

- [ ] `features/rag/components/search/RagPageReferences.tsx:17` — **BasicMarkdownContent** (tracked) — `@/components/mardown-display/chat-markdown/BasicMarkdownContent`
- [ ] `features/rag/components/search/RagPageReferences.tsx:1064` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{group.description}`
- [ ] `features/rag/components/search/RagReviewRepairWorkspace.tsx:25` — **BasicMarkdownContent** (tracked) — `@/components/mardown-display/chat-markdown/BasicMarkdownContent`
- [ ] `features/rag/components/search/RagSearchExperience.tsx:2238` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{assembledPrompt}`

### route /reports

- [ ] `features/reports/components/ReportsLanding.tsx:50` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{report.description}`

### route /reports/agent-drift

- [ ] `features/agents/components/usages/UsageRowDetail.tsx:52` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{meta.description}`

### route /request-access/thank-you

- [ ] `app/(public)/request-access/thank-you/page.tsx:83` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{step.description}`

### route /research

- [ ] `features/research/components/landing/ResearchLanding.tsx:109` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{feature.description}`
- [ ] `features/research/components/landing/ResearchLanding.tsx:134` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{step.description}`

### route /research/topics

- [ ] `features/research/components/landing/TopicList.tsx:131` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{topic.description}`

### route /research/topics/[topicId]

- [ ] `app/(core)/research/topics/[topicId]/page.tsx:20` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}`
- [ ] `features/agents/components/smart/CreateWithAiTabs.tsx:272` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{tab.content}`
- [ ] `features/research/components/init/AutonomySelector.tsx:54` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{config.description}`
- [ ] `features/research/components/overview/live-pipeline/ui/StreamingTextPanel.tsx:6` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/research/components/overview/pipeline-graph/AutonomyControl.tsx:138` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{opt.description}`
- [ ] `features/research/components/overview/pipeline-graph/ProviderControl.tsx:133` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{opt.description}`

### route /research/topics/[topicId]/agents

- [ ] `features/research/components/agents/AgentRoleCard.tsx:204` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{role.description}`
- [ ] `features/research/components/agents/GoogleBackgroundAgentCard.tsx:13` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### route /research/topics/[topicId]/analysis

- [ ] `components/markdown.tsx:6` — **MarkdownStream** (tracked) — `./MarkdownStream`
- [ ] `features/research/components/analysis/AnalysisList.tsx:26` — **MarkdownStream** (tracked) — `@/components/markdown` via `components/markdown.tsx`

### route /research/topics/[topicId]/context

- [ ] `features/research/components/resources/BundleBar.tsx:107` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{b.description}`

### route /research/topics/[topicId]/document

- [ ] `features/research/components/document/DocumentViewer.tsx:30` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### route /research/topics/[topicId]/keywords

- [ ] `features/research/components/keywords/KeywordManager.tsx:606` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{source.description}`

### route /research/topics/[topicId]/keywords/[keywordId]

- [ ] `features/research/components/keywords/KeywordDetailView.tsx:19` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### route /research/topics/[topicId]/outputs

- [ ] `features/podcasts/generator/components/AssetCard.tsx:186` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{slot.prompt || "Preparing…"}`
- [ ] `features/research/components/outputs/OutputsStudio.tsx:40` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/research/components/outputs/OutputsStudio.tsx:359` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{def.description}`

### route /research/topics/[topicId]/settings

- [ ] `features/agents/components/smart/CreateWithAiTabs.tsx:272` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{tab.content}`
- [ ] `features/research/components/init/AutonomySelector.tsx:54` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{config.description}`

### route /research/topics/[topicId]/sources

- [ ] `features/research/components/sources/SourceList.tsx:595` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{source.description}`
- [ ] `features/research/components/sources/SourceList.tsx:1654` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{source.description}`

### route /research/topics/[topicId]/sources/[sourceId]

- [ ] `components/markdown.tsx:6` — **MarkdownStream** (tracked) — `./MarkdownStream`
- [ ] `features/research/components/analysis/AnalysisCard.tsx:17` — **MarkdownStream** (tracked) — `@/components/markdown` via `components/markdown.tsx`
- [ ] `features/research/components/sources/ContentViewer.tsx:114` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{content.content}`
- [ ] `features/research/components/sources/SourceDetail.tsx:93` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/research/components/sources/SourceDetail.tsx:1518` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{typedSource.description}`

### route /research/topics/[topicId]/synthesis

- [ ] `components/markdown.tsx:6` — **MarkdownStream** (tracked) — `./MarkdownStream`
- [ ] `features/research/components/synthesis/SynthesisList.tsx:30` — **MarkdownStream** (tracked) — `@/components/markdown` via `components/markdown.tsx`
- [ ] `features/research/components/synthesis/SynthesisVersionHistory.tsx:6` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### route /research/topics/[topicId]/tags

- [ ] `features/research/components/tags/TagManager.tsx:266` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tag.description}`

### route /research/topics/[topicId]/tags/[tagId]

- [ ] `features/research/components/consolidation/ConsolidationView.tsx:10` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### route /research/topics/[topicId]/tasks

- [ ] `features/research/components/tasks/TasksView.tsx:691` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{meta.description}`

### route /research/topics/[topicId]/youtube

- [ ] `features/marketing/discovery/youtube/YouTubeDiscovery.tsx:983` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{video.description || "No description supplied."}`
- [ ] `features/marketing/discovery/youtube/YouTubeVideoPreview.tsx:59` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{video.description || "No description supplied."}`
- [ ] `features/research/components/youtube/ResearchYouTubePage.tsx:321` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{video.description || "No description supplied."}`

### route /research/topics/new

- [ ] `features/research/components/init/TemplatePicker.tsx:75` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{template.description}`

### route /s/[token]

- [ ] `features/canvas/shared/SharedCanvasView.tsx:189` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{canvas.description}`
- [ ] `features/marketing/seo/ai-visibility/AiVisibilityReport.tsx:4` — **react-markdown** (BANNED) — `react-markdown`
- [ ] `features/marketing/seo/ai-visibility/AiVisibilityReport.tsx:5` — **remark-* plugins** (BANNED) — `remark-gfm`
- [ ] `features/sharing/lenses/default-renderers.tsx:15` — **react-markdown** (BANNED) — `react-markdown`
- [ ] `features/sharing/lenses/default-renderers.tsx:16` — **remark-* plugins** (BANNED) — `remark-gfm`
- [ ] `features/sharing/lenses/file-lens.tsx:254` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{card.body}`

### route /sandbox/[id]

- [ ] `features/code/views/sandboxes/SandboxDiagnosticsPanel.tsx:976` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{fileContent || "(empty file)"}`

### route /schedules

- [ ] `features/scheduling/components/list/ScheduleRow.tsx:137` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{task.description}`

### route /schedules/[id]

- [ ] `features/scheduling/components/detail/ScheduleDetail.tsx:394` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{task.description}`
- [ ] `features/scheduling/components/detail/SpecCard.tsx:131` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{task.prompt}`

### route /schedules/[id]/edit

- [ ] `features/scheduling/components/form/ScheduleForm.tsx:520` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{meta.description}`

### route /schedules/new

- [ ] `features/scheduling/components/form/ScheduleForm.tsx:520` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{meta.description}`

### route /scopes/templates

- [ ] `features/scopes/components/management/TemplatesGalleryPanel.tsx:161` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{t.description}`

### route /scraper

- [ ] `components/image/gallery/desktop/SimpleImageViewer.tsx:319` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{photos[imageIndex]?.description}`
- [ ] `components/image/unsplash/desktop/EnhancedImageViewer.tsx:314` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{photos[imageIndex]?.description || photos[imageIndex]?.alt_description}`
- [ ] `components/image/unsplash/mobile/MobileUnsplashViewer.tsx:216` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{photos[imageIndex]?.description || photos[imageIndex]?.alt_description || "No descrip…`
- [ ] `components/official/PageTemplate.tsx:138` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{tab.content}`
- [ ] `features/scraper/parts/OrganizedContent.tsx:60` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.content}`
- [ ] `features/scraper/parts/SimplifiedView.tsx:106` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.content}`
- [ ] `features/scraper/parts/agent-analysis/FactChecker.tsx:37` — **MarkdownRenderer** (tracked) — `@/components/mardown-display/MarkdownRenderer`

### route /scraper/quick

- [ ] `components/image/gallery/desktop/SimpleImageViewer.tsx:319` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{photos[imageIndex]?.description}`
- [ ] `components/image/unsplash/desktop/EnhancedImageViewer.tsx:314` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{photos[imageIndex]?.description || photos[imageIndex]?.alt_description}`
- [ ] `components/image/unsplash/mobile/MobileUnsplashViewer.tsx:216` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{photos[imageIndex]?.description || photos[imageIndex]?.alt_description || "No descrip…`
- [ ] `components/official/PageTemplate.tsx:138` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{tab.content}`
- [ ] `features/scraper/parts/OrganizedContent.tsx:60` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.content}`
- [ ] `features/scraper/parts/SimplifiedView.tsx:106` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.content}`
- [ ] `features/scraper/parts/agent-analysis/FactChecker.tsx:37` — **MarkdownRenderer** (tracked) — `@/components/mardown-display/MarkdownRenderer`

### route /scraper/search-and-scrape

- [ ] `components/image/gallery/desktop/SimpleImageViewer.tsx:319` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{photos[imageIndex]?.description}`
- [ ] `components/image/unsplash/desktop/EnhancedImageViewer.tsx:314` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{photos[imageIndex]?.description || photos[imageIndex]?.alt_description}`
- [ ] `components/image/unsplash/mobile/MobileUnsplashViewer.tsx:216` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{photos[imageIndex]?.description || photos[imageIndex]?.alt_description || "No descrip…`
- [ ] `components/official/PageTemplate.tsx:138` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{tab.content}`
- [ ] `features/scraper/parts/OrganizedContent.tsx:60` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.content}`
- [ ] `features/scraper/parts/SimplifiedView.tsx:106` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.content}`
- [ ] `features/scraper/parts/agent-analysis/FactChecker.tsx:37` — **MarkdownRenderer** (tracked) — `@/components/mardown-display/MarkdownRenderer`

### route /seo

- [ ] `app/(public)/seo/page.tsx:190` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tool.description}`
- [ ] `components/seo/JsonLd.tsx:27` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c"), }}`

### route /seo/ai-visibility

- [ ] `components/seo/JsonLd.tsx:27` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c"), }}`
- [ ] `features/marketing/seo/ai-visibility/AiVisibilityReport.tsx:4` — **react-markdown** (BANNED) — `react-markdown`
- [ ] `features/marketing/seo/ai-visibility/AiVisibilityReport.tsx:5` — **remark-* plugins** (BANNED) — `remark-gfm`

### route /seo/metadata

- [ ] `components/seo/JsonLd.tsx:27` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c"), }}`

### route /seo/page-audit

- [ ] `components/seo/JsonLd.tsx:27` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c"), }}`

### route /seo/robots-tester

- [ ] `components/seo/JsonLd.tsx:27` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c"), }}`
- [ ] `features/marketing/seo/public-tools/RobotsTesterTool.tsx:288` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{primaryCheck.explanation}`
- [ ] `features/marketing/seo/public-tools/RobotsTesterTool.tsx:363` — **.split("\n").map(→ JSX) paragraph renderer** (review) — `result.raw_robots_txt.split("\n").map((line, index) => { const lineNumber = index + 1; re…`

### route /seo/social-preview

- [ ] `components/seo/JsonLd.tsx:27` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c"), }}`

### route /seo/structured-data

- [ ] `components/seo/JsonLd.tsx:27` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c"), }}`

### route /settings/feedback

- [ ] `features/settings/pages/FeedbackSettingsPage.tsx:566` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{item.description}`
- [ ] `features/settings/pages/FeedbackSettingsPage.tsx:668` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{item.description}`
- [ ] `features/settings/pages/FeedbackSettingsPage.tsx:757` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{msg.content}`

### route /settings/integrations

- [ ] `features/connectors/ConnectorPromptCard.tsx:168` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{provider.prompt.body}`
- [ ] `features/settings/pages/IntegrationsSettingsPage.tsx:897` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`

### route /settings/organizations

- [ ] `features/organizations/components/OrganizationCard.tsx:181` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{organization.description}`

### route /shapes/[kind]

- [ ] `features/content-ir/studio/components/ShapeOwnerEditor.tsx:314` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{ SHAPE_VISIBILITIES.find( (option) => option.value === visibility, )?.description }`

### route /shapes/[kind]/examples

- [ ] `features/content-ir/studio/components/ShapeOwnerEditor.tsx:314` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{ SHAPE_VISIBILITIES.find( (option) => option.value === visibility, )?.description }`

### route /shapes/[kind]/gate

- [ ] `features/content-ir/studio/components/ShapeOwnerEditor.tsx:314` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{ SHAPE_VISIBILITIES.find( (option) => option.value === visibility, )?.description }`

### route /shapes/[kind]/inputs

- [ ] `features/content-ir/studio/components/ShapeOwnerEditor.tsx:314` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{ SHAPE_VISIBILITIES.find( (option) => option.value === visibility, )?.description }`

### route /shapes/[kind]/instances

- [ ] `features/content-ir/studio/components/ShapeOwnerEditor.tsx:314` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{ SHAPE_VISIBILITIES.find( (option) => option.value === visibility, )?.description }`

### route /shapes/[kind]/schema

- [ ] `features/content-ir/studio/components/ShapeOwnerEditor.tsx:314` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{ SHAPE_VISIBILITIES.find( (option) => option.value === visibility, )?.description }`

### route /shapes/[kind]/stream

- [ ] `features/content-ir/studio/components/ShapeOwnerEditor.tsx:314` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{ SHAPE_VISIBILITIES.find( (option) => option.value === visibility, )?.description }`

### route /shapes/[kind]/table

- [ ] `features/content-ir/studio/components/ShapeOwnerEditor.tsx:314` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{ SHAPE_VISIBILITIES.find( (option) => option.value === visibility, )?.description }`

### route /shapes/[kind]/template

- [ ] `features/content-ir/studio/components/ShapeOwnerEditor.tsx:314` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{ SHAPE_VISIBILITIES.find( (option) => option.value === visibility, )?.description }`

### route /shapes/[kind]/test

- [ ] `features/content-ir/studio/components/ShapeOwnerEditor.tsx:314` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{ SHAPE_VISIBILITIES.find( (option) => option.value === visibility, )?.description }`

### route /shapes/new

- [ ] `features/content-ir/studio/components/NewShapeClient.tsx:162` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{option.description}`
- [ ] `features/content-ir/studio/components/NewShapeClient.tsx:492` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{asset.description}`

### route /sign/[token]

- [ ] `app/(link)/sign/[token]/SignRunner.tsx:139` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<article pre-wrap>{request.body}`

### route /surfaces/[...name]

- [ ] `features/surfaces/components/hub/SurfaceHubDetailPage.tsx:378` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{resolved.role.description}`

### route /tasks/new

- [ ] `features/agents/components/previews/ConversationHoverPreview.tsx:134` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{conv.description}`
- [ ] `features/agents/components/smart/CreateWithAiTabs.tsx:272` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{tab.content}`

### route /tools/pdf-extractor

- [ ] `features/page-extraction/components/ChunkCard.tsx:32` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/page-extraction/components/ResultsTable.tsx:782` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<div pre-wrap>{text}`
- [ ] `features/pdf-extractor/components/CopyPagesOverlay.tsx:776` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{copyAllTier.notes || "—"}`
- [ ] `features/pdf-extractor/components/CopyPagesOverlay.tsx:864` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{tier.notes || "—"}`
- [ ] `features/pdf-extractor/components/PdfAiContent.tsx:3` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/pdf-extractor/studio/PdfStudioMobile.tsx:700` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{fallbackText || "(no extracted text)"}`
- [ ] `features/pdf-extractor/studio/PdfStudioMobile.tsx:722` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{fallbackText || "(no extracted text)"}`
- [ ] `features/pdf-extractor/studio/PdfStudioMobile.tsx:748` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{text || ( <span className="italic text-muted-foreground"> (no text on this…`
- [ ] `features/pdf-extractor/studio/PdfStudioReader.tsx:2099` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{doc.content ?? "(no extracted text)"}`

### route /tools/pdf-extractor/[id]

- [ ] `features/page-extraction/components/ChunkCard.tsx:32` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/page-extraction/components/ResultsTable.tsx:782` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<div pre-wrap>{text}`
- [ ] `features/pdf-extractor/components/CopyPagesOverlay.tsx:776` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{copyAllTier.notes || "—"}`
- [ ] `features/pdf-extractor/components/CopyPagesOverlay.tsx:864` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{tier.notes || "—"}`
- [ ] `features/pdf-extractor/components/PdfAiContent.tsx:3` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/pdf-extractor/studio/PdfStudioMobile.tsx:700` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{fallbackText || "(no extracted text)"}`
- [ ] `features/pdf-extractor/studio/PdfStudioMobile.tsx:722` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{fallbackText || "(no extracted text)"}`
- [ ] `features/pdf-extractor/studio/PdfStudioMobile.tsx:748` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{text || ( <span className="italic text-muted-foreground"> (no text on this…`
- [ ] `features/pdf-extractor/studio/PdfStudioReader.tsx:2099` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{doc.content ?? "(no extracted text)"}`

### route /tools/product-capture

- [ ] `features/product-capture/components/ItemSwipeRow.tsx:151` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{row.notes}`

### route /tools/product-capture/all

- [ ] `features/product-capture/components/AllItemsTable.tsx:273` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.notes}`
- [ ] `features/product-capture/components/ItemSwipeRow.tsx:151` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{row.notes}`

### route /tools/product-capture/answer

- [ ] `features/product-capture/components/pipeline/AnswerQueue.tsx:293` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{question.prompt}`

### route /tools/product-capture/instant

- [ ] `features/product-capture/components/ItemSwipeRow.tsx:151` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{row.notes}`

### route /tools/product-capture/manage

- [ ] `features/product-capture/components/pipeline/QuestionsPanel.tsx:143` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{question.prompt}`

### route /transcripts

- [ ] `features/transcripts/browse/TranscriptBrowseCards.tsx:88` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{row.description}`
- [ ] `features/transcripts/browse/columns.tsx:332` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.description}`

### route /transcripts/new

- [ ] `app/(core)/transcripts/new/page.tsx:110` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{opt.description}`

### route /transcripts/processor

- [ ] `features/transcripts/components/TranscriptViewer.tsx:609` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{activeTranscript.description}`
- [ ] `features/transcripts/components/TranscriptsSidebar.tsx:318` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{transcript.description}`

### route /transcripts/scribe

- [ ] `features/transcript-studio/components/scribe/ActionSheet.tsx:76` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{item.description}`

### route /transcripts/scribe/[sessionId]

- [ ] `features/transcript-studio/components/scribe/ActionSheet.tsx:76` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{item.description}`
- [ ] `features/transcript-studio/components/scribe/FullTranscriptDrawer.tsx:110` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{rawText || ( <span className="italic text-muted-foreground"> No transcript w…`
- [ ] `features/transcript-studio/components/scribe/FullTranscriptDrawer.tsx:170` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{cleanText || ( <span className="italic text-muted-foreground"> Not cleaned y…`
- [ ] `features/transcript-studio/components/scribe/ScribeCaptureScreen.tsx:76` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<div pre-wrap>{text || ( <span className="italic text-muted-foreground"> Speak — your wor…`
- [ ] `features/transcript-studio/components/scribe/SessionTranscriptViewer.tsx:143` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{text || ( <span className="italic text-muted-foreground"> {isClean ? "Nothin…`

### route /transcripts/scribe/unsorted

- [ ] `features/transcript-studio/components/scribe/ActionSheet.tsx:76` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{item.description}`
- [ ] `features/transcript-studio/components/scribe/FullTranscriptDrawer.tsx:110` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{rawText || ( <span className="italic text-muted-foreground"> No transcript w…`
- [ ] `features/transcript-studio/components/scribe/FullTranscriptDrawer.tsx:170` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{cleanText || ( <span className="italic text-muted-foreground"> Not cleaned y…`

### route /transcripts/studio

- [ ] `features/transcript-studio/components/columns/ConceptsColumn.tsx:280` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{item.description}`
- [ ] `features/transcript-studio/components/columns/ModuleColumn.tsx:7` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/transcript-studio/components/settings/ModulePicker.tsx:56` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{m.description}`

### route /user-settings/[[...path]]

- [ ] `components/official/settings/primitives/SettingsRadioGroup.tsx:78` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{opt.description}`
- [ ] `features/connectors/ConnectorPromptCard.tsx:168` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{provider.prompt.body}`
- [ ] `features/organizations/components/OrganizationCard.tsx:181` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{organization.description}`
- [ ] `features/settings/pages/FeedbackSettingsPage.tsx:566` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{item.description}`
- [ ] `features/settings/pages/FeedbackSettingsPage.tsx:668` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{item.description}`
- [ ] `features/settings/pages/FeedbackSettingsPage.tsx:757` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{msg.content}`
- [ ] `features/settings/pages/IntegrationsSettingsPage.tsx:897` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`

### route /vault

- [ ] `features/secrets/components/VaultCreateDialog.tsx:1376` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{loginUrlDef?.description ?? "Where this login is used. Stored as plain, unencrypted m…`
- [ ] `features/secrets/components/VaultCreateDialog.tsx:1829` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{draft.def.description}`
- [ ] `features/secrets/components/VaultCreateDialog.tsx:1980` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{def.description}`
- [ ] `features/secrets/components/VaultHandlingControl.tsx:80` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{presentation.description}`
- [ ] `features/secrets/components/VaultItemDetail.tsx:2490` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{VAULT_LABELS.notes}`
- [ ] `features/secrets/components/VaultItemDetail.tsx:321` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{item.description}`
- [ ] `features/secrets/components/VaultItemDetail.tsx:859` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<dd pre-wrap>{attachment.description}`
- [ ] `features/secrets/components/VaultItemDetail.tsx:1270` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<span pre-wrap>{field.description}`
- [ ] `features/secrets/components/VaultItemDetail.tsx:2493` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{item.notes}`

### route /vault/[itemId]

- [ ] `features/secrets/components/VaultCreateDialog.tsx:1376` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{loginUrlDef?.description ?? "Where this login is used. Stored as plain, unencrypted m…`
- [ ] `features/secrets/components/VaultCreateDialog.tsx:1829` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{draft.def.description}`
- [ ] `features/secrets/components/VaultCreateDialog.tsx:1980` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{def.description}`
- [ ] `features/secrets/components/VaultHandlingControl.tsx:80` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{presentation.description}`
- [ ] `features/secrets/components/VaultItemDetail.tsx:2490` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{VAULT_LABELS.notes}`
- [ ] `features/secrets/components/VaultItemDetail.tsx:321` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{item.description}`
- [ ] `features/secrets/components/VaultItemDetail.tsx:859` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<dd pre-wrap>{attachment.description}`
- [ ] `features/secrets/components/VaultItemDetail.tsx:1270` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<span pre-wrap>{field.description}`
- [ ] `features/secrets/components/VaultItemDetail.tsx:2493` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{item.notes}`

### route /vault/authenticator

- [ ] `features/secrets/components/VaultCreateDialog.tsx:1376` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{loginUrlDef?.description ?? "Where this login is used. Stored as plain, unencrypted m…`
- [ ] `features/secrets/components/VaultCreateDialog.tsx:1829` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{draft.def.description}`
- [ ] `features/secrets/components/VaultCreateDialog.tsx:1980` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{def.description}`
- [ ] `features/secrets/components/VaultHandlingControl.tsx:80` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{presentation.description}`

### route /voice/playground

- [ ] `features/audio/voice/VoicesList.tsx:232` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{voice.description}`
- [ ] `features/audio/voice/components/VoiceSelectionModal.tsx:240` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{voice.description || "No description available"}`

### route /war-room/[id]

- [ ] `features/projects/components/ProjectInlineEditors.tsx:342` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<span pre-wrap>{project.description}`
- [ ] `features/transcript-studio/components/scribe/ActionSheet.tsx:76` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{item.description}`

### route /war-room/all

- [ ] `features/war-room/components/all/SessionCard.tsx:154` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{session.description}`

### route /welcome

- [ ] `app/(core)/welcome/WelcomeClient.tsx:167` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{option.description}`

### route /why-ai-matrx

- [ ] `app/(public)/why-ai-matrx/page.tsx:261` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{beat.body}`

### route /work/conversations/[conversationId]

- [ ] `features/ai-work/analysis/ConversationAnalyzePanel.tsx:124` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{kind.description}`
- [ ] `features/ai-work/components/ProviderConversationTranscript.tsx:19` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/ai-work/components/ProviderConversationTranscript.tsx:397` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{conversation.description}`

### route /work/new

- [ ] `features/ai-work/compose/components/DestinationStep.tsx:83` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{destination.summary}`

### route /workbooks

- [ ] `app/(core)/workbooks/page.tsx:588` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{wb.description}`

### route /workflows/[id]

- [ ] `features/workflow-runtime/components/ReadoutView.tsx:41` — **RichDocument** (tracked) — `@/features/rich-document/RichDocument`
- [ ] `features/workflow-runtime/interrupt/RunDecisions.tsx:94` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{answer}`

### route /workflows/[id]/design

- [ ] `features/workflow-runtime/components/ReadoutView.tsx:41` — **RichDocument** (tracked) — `@/features/rich-document/RichDocument`

### route /workflows/all

- [ ] `features/workflow-runtime/browse/columns.tsx:22` — **cleanMarkdownPreview (regex markdown stripping)** (BANNED) — `cleanMarkdownPreview ← @/utils/markdown-processors/clean-markdown-to-text`
- [ ] `features/workflow-runtime/browse/components/WorkflowBrowseCards.tsx:30` — **cleanMarkdownPreview (regex markdown stripping)** (BANNED) — `cleanMarkdownPreview ← @/utils/markdown-processors/clean-markdown-to-text`

### route /workflows/bakeoff

- [ ] `app/(core)/workflows/bakeoff/page.tsx:131` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{row.description}`

### route /workflows/battle

- [ ] `features/workflow-comparison/components/ArmSetupCard.tsx:165` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{c.description}`

### route /workflows/runs/[runId]

- [ ] `features/workflow-runtime/components/ReadoutView.tsx:41` — **RichDocument** (tracked) — `@/features/rich-document/RichDocument`
- [ ] `features/workflow-runtime/interrupt/RunDecisions.tsx:94` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{answer}`

## Reached by no surface

No route, overlay or opener imports these (dead code, test-only, or loaded by a string registry the graph cannot see).

- [ ] `app/(admin)/administration/ui/official-components/component-displays/content-editor.tsx:6` — **components/official/content-editor/ContentEditor** (BANNED) — `@/components/official/content-editor/ContentEditor`
- [ ] `app/(admin)/administration/ui/official-components/component-displays/image-asset-uploader.tsx:207` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{PRESETS.find((p) => p.preset === preset)?.description}`
- [ ] `app/(admin)/administration/ui/official-components/parts/ComponentHeader.tsx:148` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{component.description}`
- [ ] `app/(dev)/demos/agent-cards/page.dev.tsx:499` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{entry.summary}`
- [ ] `app/(dev)/demos/api-tests/agent/AgentTestClient.tsx:765` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{liveText}`
- [ ] `app/(dev)/demos/api-tests/block-processing/BlockProcessingClient.tsx:14` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `app/(dev)/demos/api-tests/block-processing/BlockProcessingClient.tsx:581` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{rawOutputText}`
- [ ] `app/(dev)/demos/api-tests/matrx-ai/agent-demo/AgentDemoClient.tsx:964` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{requestBody}`
- [ ] `app/(dev)/demos/api-tests/matrx-ai/conversation-demo/ConversationDemoClient.tsx:152` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{turn.content}`
- [ ] `app/(dev)/demos/api-tests/matrx-ai/conversation-demo/ConversationDemoClient.tsx:178` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<div pre-wrap>{turn.content}`
- [ ] `app/(dev)/demos/api-tests/matrx-ai/dynamic-api/DynamicApiClient.tsx:1197` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{responseBody || (!isRunning ? "No response yet." : "")}`
- [ ] `app/(dev)/demos/api-tests/matrx-ai/tools-demo/ToolsDemoClient.tsx:501` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{selectedTool.description}`
- [ ] `app/(dev)/demos/api-tests/matrx-ai/tools-demo/ToolsDemoClient.tsx:526` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{param.description}`
- [ ] `app/(dev)/demos/api-tests/pdf-extract/PdfExtractClient.tsx:353` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{textContent}`
- [ ] `app/(dev)/demos/api-tests/tool-testing/components/ArgumentForm.tsx:325` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{param.description}`
- [ ] `app/(dev)/demos/api-tests/tool-testing/components/ResultsPanel.tsx:537` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{finalPayload.output.model_facing_result.content}`
- [ ] `app/(dev)/demos/api-tests/tool-testing/components/ToolListSidebar.tsx:146` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tool.description}`
- [ ] `app/(dev)/demos/canonical-flashcards-refine/page.dev.tsx:324` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<div pre-wrap>{faceText}`
- [ ] `app/(dev)/demos/canonical-flashcards-reimagine/page.dev.tsx:598` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{presentationCopy[presentation].description}`
- [ ] `app/(dev)/demos/canonical-flashcards/page.dev.tsx:246` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{variant.description}`
- [ ] `app/(dev)/demos/context-menu/_components/ContextMenuHubClient.tsx:154` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{page.description}`
- [ ] `app/(dev)/demos/context-menu/launch-inspector/page.dev.tsx:797` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{latestText}`
- [ ] `app/(dev)/demos/context-menu/surface-mappings/page.dev.tsx:413` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{group.description}`
- [ ] `app/(dev)/demos/dashboard/components/QuickActions.tsx:54` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{action.description}`
- [ ] `app/(dev)/demos/dashboard/components/RecentActivity.tsx:83` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`
- [ ] `app/(dev)/demos/diff-gallery/page.dev.tsx:130` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{seg.content}`
- [ ] `app/(dev)/demos/diff-gallery/page.dev.tsx:104` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<span pre-wrap>{l.content || " "}`
- [ ] `app/(dev)/demos/general/fetch-react/HtmlDisplay.tsx:39` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: html }}`
- [ ] `app/(dev)/demos/general/voice/debate-assistant/debate-page.tsx:135` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{message.content}`
- [ ] `app/(dev)/demos/glass-lab/_components/VariantPicker.tsx:144` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{v.description}`
- [ ] `app/(dev)/demos/header-demo/HeaderDemoClient.tsx:280` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{v.description}`
- [ ] `app/(dev)/demos/kind-directives/page.dev.tsx:23` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `app/(dev)/demos/lists-explorer/page.dev.tsx:77` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{route.description}`
- [ ] `app/(dev)/demos/local-tools/page.dev.tsx:251` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{page.description}`
- [ ] `app/(dev)/demos/local-tools/scraper/page.dev.tsx:444` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{r.description}`
- [ ] `app/(dev)/demos/scraper/_components/ResponseViewer.tsx:401` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{diagnosticsText}`
- [ ] `app/(dev)/demos/scraper/page.dev.tsx:63` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{demo.description}`
- [ ] `app/(dev)/demos/scraper/quick-scrape/page.dev.tsx:52` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{content}`
- [ ] `app/(dev)/demos/scraper/search/page.dev.tsx:71` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description || item.snippet}`
- [ ] `app/(dev)/demos/settings-tree/page.dev.tsx:209` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{node.description}`
- [ ] `app/(dev)/demos/tests/direct-chat-test/DirectChatClient.tsx:16` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `app/(dev)/demos/tests/extension-bridge/ConnectionPanels.tsx:349` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<pre>{healthResult.body}`
- [ ] `app/(dev)/demos/tests/google-apis/pagespeed/components/CategoryDetails.tsx:91` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{audit.description}`
- [ ] `app/(dev)/demos/tests/google-apis/pagespeed/components/CategoryDetails.tsx:110` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{category.description}`
- [ ] `app/(dev)/demos/tests/google-apis/pagespeed/components/PageSpeedForm.tsx:143` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{category.description}`
- [ ] `app/(dev)/demos/tests/integrations/option-two/BusinessIntegrations.tsx:257` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{integration.description}`
- [ ] `app/(dev)/demos/tests/integrations/simple/IntegrationPortal.tsx:220` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{integration.description}`
- [ ] `app/(dev)/demos/tests/markdown-tests/tui-tests/page.dev.tsx:4` — **TuiEditorContent** (BANNED) — `@/components/mardown-display/chat-markdown/tui/TuiEditorContent`
- [ ] `app/(dev)/demos/tests/markdown-tests/tui-tests/page.dev.tsx:5` — **TuiEditorContent** (BANNED) — `@/components/mardown-display/chat-markdown/tui/TuiEditorContent` (type-only)
- [ ] `app/(dev)/demos/tests/matrx-local/DownloadEndpointCard.tsx:117` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{endpoint.description}`
- [ ] `app/(dev)/demos/tests/matrx-local/EndpointCard.tsx:33` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{endpoint.description}`
- [ ] `app/(dev)/demos/tests/sms/components/ConversationsList.tsx:247` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{msg.body}`
- [ ] `app/(dev)/demos/tests/utility-function-tests/create-table-templates/page.dev.tsx:377` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{selectedTemplate.description}`
- [ ] `app/(dev)/demos/tests/utility-function-tests/smart-executor-demo/page.dev.tsx:99` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{comp.description}`
- [ ] `app/(dev)/demos/tool-viz/in-action/page.dev.tsx:57` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `app/(transitional)/_flash-cards/ai/AiMessaging.tsx:72` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{msg.content}`
- [ ] `components/ai/AiChatModal.tsx:18` — **MarkdownRenderer** (tracked) — `@/components/mardown-display/MarkdownRenderer`
- [ ] `components/ai/AiMessaging.tsx:72` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{msg.content}`
- [ ] `components/animated/demos/feature-sections/simple-feature-with-gradient.tsx:18` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{feature.description}`
- [ ] `components/brokers/output/AnimatedEventComponent.tsx:82` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`
- [ ] `components/brokers/output/EventComponent.tsx:50` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`
- [ ] `components/generic-table/GenericDataTable.tsx:414` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{emptyState.description}`
- [ ] `components/mardown-display/chat-markdown/analyzer/analyzer-options/DynamicViewerTester.tsx:241` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{option.description}`
- [ ] `components/mardown-display/chat-markdown/analyzer/analyzer-options/FlatSectionViewer.tsx:10` — **BasicMarkdownContent** (tracked) — `../../BasicMarkdownContent`
- [ ] `components/mardown-display/chat-markdown/analyzer/analyzer-options/FlatSectionViewer.tsx:129` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{section.summary}`
- [ ] `components/mardown-display/chat-markdown/analyzer/analyzer-options/FlatSectionViewer.tsx:224` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{selectedSection.content}`
- [ ] `components/mardown-display/chat-markdown/analyzer/analyzer-options/IntelligentViewer.tsx:18` — **BasicMarkdownContent** (tracked) — `../../BasicMarkdownContent`
- [ ] `components/mardown-display/chat-markdown/analyzer/analyzer-options/IntelligentViewer.tsx:513` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{recommendation.reasoning}`
- [ ] `components/mardown-display/markdown-classification/usePrepareMarkdownForRendering.ts:27` — **remark-* plugins** (BANNED) — `remark-parse`
- [ ] `components/mardown-display/markdown-classification/usePrepareMarkdownForRendering.ts:28` — **remark-* plugins** (BANNED) — `remark-gfm`
- [ ] `components/markdown-core/markdown-core-types.ts:1` — **react-markdown** (BANNED) — `react-markdown` (type-only)
- [ ] `components/matrx/matrx-collapsible/collapsible-group.tsx:70` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{item.content}`
- [ ] `components/matrx/matrx-record-list/basic-record-edit-list.tsx:126` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{item.content}`
- [ ] `components/matrx/matrx-record-list/basic-record-list.tsx:145` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{item.content}`
- [ ] `components/matrx/matrx-record-list/unified-record-list.tsx:170` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{item.content}`
- [ ] `components/matrx/navigation/NextNavCardFull.tsx:145` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<CardDescription pre-wrap>{item.description}`
- [ ] `components/message-display/MarkdownWithPlugins.tsx:5` — **react-markdown** (BANNED) — `react-markdown` (type-only)
- [ ] `components/message-display/MessageContentDisplay.tsx:10` — **react-markdown** (BANNED) — `react-markdown` (type-only)
- [ ] `components/modals/TextActionResultModal.tsx:127` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<div pre-wrap>{originalText}`
- [ ] `components/modals/TextActionResultModal.tsx:140` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<div pre-wrap>{originalText}`
- [ ] `components/official/HelpIcon.tsx:126` — **.split("\n").map(→ JSX) paragraph renderer** (review) — `processedText.split('\n').map((line, index) => ( <React.Fragment key={index}> {index > 0 …`
- [ ] `components/official/content-editor/ContentEditorStack.tsx:5` — **components/official/content-editor/ContentEditor** (BANNED) — `./ContentEditor`
- [ ] `components/official/mobile-action-bar/MobileFilterDrawer.tsx:153` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{field.description}`
- [ ] `components/official/processor-extractor/path-management/BookmarkManager.tsx:167` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{bookmark.description}`
- [ ] `components/rich-text-editor/MarkdownDualDisplay.tsx:151` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: markdown }}`
- [ ] `components/rich-text-editor/MarkdownDualDisplay.tsx:8` — **@remirror/* (installed, unused)** (BANNED) — `@remirror/react`
- [ ] `components/rich-text-editor/RemirrorEditor.tsx:8` — **@remirror/* (installed, unused)** (BANNED) — `@remirror/react`
- [ ] `components/ts-function-registry/AppletBuilder.tsx:318` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{param.description}`
- [ ] `components/ts-function-registry/AppletFunctionPicker.tsx:152` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{param.description}`
- [ ] `components/ts-function-registry/AppletFunctionPicker.tsx:253` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{selectedFunction.metadata.description}`
- [ ] `components/ts-function-registry/AppletRunner.tsx:98` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{step.description}`
- [ ] `components/ts-function-registry/AppletRunner.tsx:137` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{applet.description}`
- [ ] `components/ui/cards/apple-cards-carousel.tsx:241` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{card.content}`
- [ ] `features/agent-apps/sample-code/apps/fact-checker-hooked.tsx:27` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agent-apps/sample-code/apps/fact-checker.tsx:11` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agent-apps/sample-code/apps/flashcard-generator.tsx:7` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/agent-settings/components/ToolSelectorPanel.tsx:121` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{tool.description}`
- [ ] `features/agents/components/agent-widgets/chat-assistant/AssistantMessageCard.tsx:4` — **RichDocument** (tracked) — `@/features/rich-document/RichDocument`
- [ ] `features/agents/components/agent-widgets/chat-assistant/UserMessageCard.tsx:13` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<p pre-wrap>{content}`
- [ ] `features/agents/components/assignment-demo/AgentAssignmentsDemo.tsx:129` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{mode.description}`
- [ ] `features/agents/components/run-controls/SimpleRunSettings/CapabilityGrid.tsx:95` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{capability.description}`
- [ ] `features/audio/voice/VoiceModal.tsx:112` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{voice.description}`
- [ ] `features/canvas/core/CanvasRenderer.tsx:494` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: data.html || data }}`
- [ ] `features/canvas/core/SavedCanvasItems.tsx:199` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`
- [ ] `features/code-editor/agent-code-editor/components/parts/ProcessingOverlay.tsx:13` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/code-editor/components/AICodeEditor.tsx:30` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/code-editor/components/AICodeEditor.tsx:455` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<div pre-wrap>{streamingText}`
- [ ] `features/content-ir/sandbox/runtime/FrameMarkdown.tsx:27` — **react-markdown** (BANNED) — `react-markdown`
- [ ] `features/content-ir/sandbox/runtime/FrameMarkdown.tsx:28` — **remark-* plugins** (BANNED) — `remark-gfm`
- [ ] `features/cx-chat/components/messages/AssistantMessage.tsx:22` — **AssistantActionBar (both copies)** (BANNED) — `./AssistantActionBar`
- [ ] `features/cx-chat/components/messages/AssistantMessage.tsx:12` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/cx-chat/components/messages/AssistantMessage.tsx:190` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{message.content || "An error occurred"}`
- [ ] `features/cx-chat/components/messages/MessageList.tsx:203` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{message.content}`
- [ ] `features/cx-chat/components/messages/MessageOptionsMenu.tsx:11` — **messageActionRegistry (chat, both copies)** (BANNED) — `../../actions/messageActionRegistry`
- [ ] `features/cx-chat/components/messages/UserMessage.tsx:333` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<div pre-wrap>{textContent}`
- [ ] `features/cx-conversation/AssistantMessage.tsx:22` — **AssistantActionBar (both copies)** (BANNED) — `@/features/cx-chat/components/messages/AssistantActionBar`
- [ ] `features/cx-conversation/AssistantMessage.tsx:12` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/cx-conversation/AssistantMessage.tsx:190` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{message.content || "An error occurred"}`
- [ ] `features/cx-conversation/MessageList.tsx:210` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{message.content}`
- [ ] `features/cx-conversation/UserMessage.tsx:333` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<div pre-wrap>{textContent}`
- [ ] `features/cx-dashboard/components/CxDashboardRedirect.tsx:46` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{link.description}`
- [ ] `features/html-pages/components/tabs/MarkdownSplitViewTab.tsx:5` — **TuiEditorContent** (BANNED) — `@/components/mardown-display/chat-markdown/tui/TuiEditorContent`
- [ ] `features/legal/wc/pd-ratings/components/landing/PdRatingsCalculatorLanding.tsx:242` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tool.description}`
- [ ] `features/legal/wc/pd-ratings/components/landing/PdRatingsCalculatorLanding.tsx:269` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{step.description}`
- [ ] `features/legal/wc/pd-ratings/components/landing/PdRatingsCalculatorLanding.tsx:300` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`
- [ ] `features/masterwork/home/MasterworkHomePage.tsx:404` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{rb.description}`
- [ ] `features/math/components/MathGo.tsx:5` — **katex (direct)** (BANNED) — `katex/dist/katex.min.css`
- [ ] `features/math/components/MathGo.tsx:6` — **react-katex** (BANNED) — `react-katex`
- [ ] `features/math/components/MathGo.tsx:119` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{step.explanation}`
- [ ] `features/math/components/MathProblemG.tsx:5` — **katex (direct)** (BANNED) — `katex/dist/katex.min.css`
- [ ] `features/math/components/MathProblemG.tsx:6` — **react-katex** (BANNED) — `react-katex`
- [ ] `features/math/components/MathProblemG.tsx:226` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{step.explanation}`
- [ ] `features/message-templates/components/TemplatePreviewDrawer.tsx:83` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<pre pre-wrap>{template.content || ""}`
- [ ] `features/notes/components/NoteEditor.tsx:42` — **RichDocument** (tracked) — `@/features/rich-document/RichDocument`
- [ ] `features/notes/components/NoteEditor.tsx:51` — **TuiEditorContent** (BANNED) — `@/components/mardown-display/chat-markdown/tui/TuiEditorContent` (type-only)
- [ ] `features/notes/components/NoteEditor.tsx:57` — **TuiEditorContent** (BANNED) — `@/components/mardown-display/chat-markdown/tui/TuiEditorContent`
- [ ] `features/pricing/components/PricingGrid.tsx:95` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{PLAN_CATEGORIES[category].description}`
- [ ] `features/pricing/components/industry/IndustryUpgrade.tsx:159` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{u.body}`
- [ ] `features/pricing/components/industry/IndustryUpgrade.tsx:174` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{cfg.quote.body}`
- [ ] `features/projects/components/ProjectCard.tsx:143` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{project.description}`
- [ ] `features/rag/components/library/ProcessingProgressDialog.tsx:376` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{s.description}`
- [ ] `features/scope-system/components/ScopeTypeCard.tsx:65` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{scopeType.description}`
- [ ] `features/scraper/parts/tabs/images/SEOImageViewer.tsx:258` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{currentMetadata.description}`
- [ ] `features/surfaces/components/AgentSurfacesPanel.tsx:589` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{surface.description}`
- [ ] `features/surfaces/components/AgentSurfacesPanel.tsx:1191` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{s.description}`
- [ ] `features/surfaces/components/ValueMappingEditor.tsx:524` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{selected.description}`
- [ ] `features/surfaces/components/ValueMappingEditor.tsx:652` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{offered.description}`
- [ ] `features/text-diff/components/DiffHistory.tsx:289` — **whitespace-pre-wrap / pre-line on a content field** (review) — `<div pre-wrap>{version.content}`
- [ ] `features/user-lists/components/ListItemsTableView.tsx:98` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{item.description}`
- [ ] `features/user-lists/components/ListItemsTableView.tsx:192` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{list.description}`
- [ ] `features/user-lists/components/ListMetaModal.tsx:66` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{list.description}`
- [ ] `features/user-lists/components/ListsTableView.tsx:109` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{item.description}`
- [ ] `features/user-lists/components/MobileListGrid.tsx:63` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{list.description}`
