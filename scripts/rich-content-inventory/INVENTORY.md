# Rich content legacy inventory

GENERATED — never edit by hand. Regenerate with `pnpm rich-content:inventory` (reads the import graph through the TypeScript compiler API; aliases and re-exports followed). Registry: `scripts/rich-content-inventory/registry.ts`. Plan: `common-docs/projects/rich-content-unification/PLAN.md` §7. BANNED rows are guarded by `pnpm check:rich-content-legacy` (shrink-only `baseline.json`); tracked rows are today's entry points; review rows are heuristics.

## Headline

| Category | Status | Pieces | Sites | Files |
|---|---|---:|---:|---:|
| document-generator | banned | 6 | 0 | 0 |
| hand-rolled-helper | banned | 4 | 0 | 0 |
| hand-rolled-textarea | banned | 1 | 1 | 1 |
| legacy-actions | banned | 2 | 0 | 0 |
| legacy-editor | banned | 6 | 14 | 13 |
| markdown-package | banned | 7 | 11 | 8 |
| prompt-editor | banned | 2 | 7 | 5 |
| raw-content-render | banned | 1 | 1 | 1 |
| raw-content-render | review | 2 | 666 | 541 |
| raw-html | review | 1 | 34 | 25 |
| renderer-entry-point | tracked | 7 | 44 | 44 |
| **total** | | 39 | 778 | 627 |

Files scanned: 15836. Surfaces reached: 1292. Unresolved local code imports (broken or generated paths the graph cannot follow): 3.

## Pieces

| Piece | Category | Status | Files | Sites | Replacement |
|---|---|---|---:|---:|---|
| react-markdown | markdown-package | banned | 6 | 6 | Render through the ONE markdown core: `BasicMarkdownContent` / `MarkdownStream` (components/markdown-core/MarkdownCore → MarkdownCoreImpl is the only react-markdown/remark/rehype/katex edge). Target: `<RichContent source level>` — rich-content-unification PLAN §3.1–3.2. Never import the package directly. |
| remark-* plugins | markdown-package | banned | 3 | 5 | Render through the ONE markdown core: `BasicMarkdownContent` / `MarkdownStream` (components/markdown-core/MarkdownCore → MarkdownCoreImpl is the only react-markdown/remark/rehype/katex edge). Target: `<RichContent source level>` — rich-content-unification PLAN §3.1–3.2. Never import the package directly. |
| rehype-* plugins | markdown-package | banned | 0 | 0 | Render through the ONE markdown core: `BasicMarkdownContent` / `MarkdownStream` (components/markdown-core/MarkdownCore → MarkdownCoreImpl is the only react-markdown/remark/rehype/katex edge). Target: `<RichContent source level>` — rich-content-unification PLAN §3.1–3.2. Never import the package directly. |
| katex (direct) | markdown-package | banned | 0 | 0 | Render through the ONE markdown core: `BasicMarkdownContent` / `MarkdownStream` (components/markdown-core/MarkdownCore → MarkdownCoreImpl is the only react-markdown/remark/rehype/katex edge). Target: `<RichContent source level>` — rich-content-unification PLAN §3.1–3.2. Never import the package directly. |
| react-katex | markdown-package | banned | 0 | 0 | Render through the ONE markdown core: `BasicMarkdownContent` / `MarkdownStream` (components/markdown-core/MarkdownCore → MarkdownCoreImpl is the only react-markdown/remark/rehype/katex edge). Target: `<RichContent source level>` — rich-content-unification PLAN §3.1–3.2. Never import the package directly. |
| marked | markdown-package | banned | 0 | 0 | Render through the ONE markdown core: `BasicMarkdownContent` / `MarkdownStream` (components/markdown-core/MarkdownCore → MarkdownCoreImpl is the only react-markdown/remark/rehype/katex edge). Target: `<RichContent source level>` — rich-content-unification PLAN §3.1–3.2. Never import the package directly. |
| markdown-it | markdown-package | banned | 0 | 0 | Render through the ONE markdown core: `BasicMarkdownContent` / `MarkdownStream` (components/markdown-core/MarkdownCore → MarkdownCoreImpl is the only react-markdown/remark/rehype/katex edge). Target: `<RichContent source level>` — rich-content-unification PLAN §3.1–3.2. Never import the package directly. |
| docx (direct Word generator) | document-generator | banned | 0 | 0 | THE ONE DOCUMENT EXPORTER is `@ai-matrx/print/document` (RC-B10): `exportDocument(markdown, "docx" \| "pdf" \| "epub" \| "html" \| "markdown")` — one parsed tree, native Word with sections/TOC/captions/page numbers. Build markdown (settings in its frontmatter) and call it; a missing capability is added IN the package, never here. |
| html-docx-js / html-to-docx (HTML→Word) | document-generator | banned | 0 | 0 | THE ONE DOCUMENT EXPORTER is `@ai-matrx/print/document` (RC-B10): `exportDocument(markdown, "docx" \| "pdf" \| "epub" \| "html" \| "markdown")` — one parsed tree, native Word with sections/TOC/captions/page numbers. Build markdown (settings in its frontmatter) and call it; a missing capability is added IN the package, never here. |
| docxtemplater / pizzip | document-generator | banned | 0 | 0 | THE ONE DOCUMENT EXPORTER is `@ai-matrx/print/document` (RC-B10): `exportDocument(markdown, "docx" \| "pdf" \| "epub" \| "html" \| "markdown")` — one parsed tree, native Word with sections/TOC/captions/page numbers. Build markdown (settings in its frontmatter) and call it; a missing capability is added IN the package, never here. |
| epub-gen / epub generators | document-generator | banned | 0 | 0 | THE ONE DOCUMENT EXPORTER is `@ai-matrx/print/document` (RC-B10): `exportDocument(markdown, "docx" \| "pdf" \| "epub" \| "html" \| "markdown")` — one parsed tree, native Word with sections/TOC/captions/page numbers. Build markdown (settings in its frontmatter) and call it; a missing capability is added IN the package, never here. |
| hand-rolled DOCX builder (buildDocxFromHtml / altChunk) | document-generator | banned | 0 | 0 | THE ONE DOCUMENT EXPORTER is `@ai-matrx/print/document` (RC-B10): `exportDocument(markdown, "docx" \| "pdf" \| "epub" \| "html" \| "markdown")` — one parsed tree, native Word with sections/TOC/captions/page numbers. Build markdown (settings in its frontmatter) and call it; a missing capability is added IN the package, never here. |
| app-side math conversion before the document exporter | document-generator | banned | 0 | 0 | Hand the markdown to `@ai-matrx/print/document` as-is: it lifts math with the core's one dialect (`@ai-matrx/content-ir/source`) and typesets it in every format (verify-RC-B10 F2). |
| @toast-ui/* (Toast UI editor) | legacy-editor | banned | 0 | 0 | THE ONE EDITOR (Tiptap 3 visual + CodeMirror 6 source, save = splice) — rich-content-unification PLAN §3.5–3.6. Until it lands, add NO new consumer: extend the surface's existing editor call site instead of adding a new one. |
| TuiEditorContent | legacy-editor | banned | 0 | 0 | THE ONE EDITOR (Tiptap 3 visual + CodeMirror 6 source, save = splice) — rich-content-unification PLAN §3.5–3.6. Until it lands, add NO new consumer: extend the surface's existing editor call site instead of adding a new one. |
| @remirror/* (installed, unused) | legacy-editor | banned | 2 | 2 | THE ONE EDITOR (Tiptap 3 visual + CodeMirror 6 source, save = splice) — rich-content-unification PLAN §3.5–3.6. Until it lands, add NO new consumer: extend the surface's existing editor call site instead of adding a new one. |
| FullScreenMarkdownEditor (16-tab editor) | legacy-editor | banned | 3 | 4 | THE ONE EDITOR (Tiptap 3 visual + CodeMirror 6 source, save = splice) — rich-content-unification PLAN §3.5–3.6. Until it lands, add NO new consumer: extend the surface's existing editor call site instead of adding a new one. |
| BasicContentEditor (split editor) | legacy-editor | banned | 3 | 3 | THE ONE EDITOR (Tiptap 3 visual + CodeMirror 6 source, save = splice) — rich-content-unification PLAN §3.5–3.6. Until it lands, add NO new consumer: extend the surface's existing editor call site instead of adding a new one. |
| components/official/content-editor/ContentEditor | legacy-editor | banned | 5 | 5 | THE ONE EDITOR (Tiptap 3 visual + CodeMirror 6 source, save = splice) — rich-content-unification PLAN §3.5–3.6. Until it lands, add NO new consumer: extend the surface's existing editor call site instead of adding a new one. |
| messageActionRegistry (chat, both copies) | legacy-actions | banned | 0 | 0 | Register the action in the ONE action registry: features/rich-document/actions/provider.ts (the rich-document provider of the Alchemy action registry, ALC-15) (rich-content-unification PLAN §3.10). The chat registry and both AssistantActionBar copies are being deleted. |
| AssistantActionBar (both copies) | legacy-actions | banned | 0 | 0 | Register the action in the ONE action registry: features/rich-document/actions/provider.ts (the rich-document provider of the Alchemy action registry, ALC-15) (rich-content-unification PLAN §3.10). The chat registry and both AssistantActionBar copies are being deleted. |
| HighlightedText (prompt {{var}} contentEditable) | prompt-editor | banned | 5 | 5 | The one editor's CodeMirror 6 source mode with {{variable}} highlighting (rich-content-unification PLAN §3.5). Do not extend the hand-rolled contentEditable prompt pieces. |
| MessageViewModeMenu (bespoke mode toggle) | prompt-editor | banned | 2 | 2 | The one editor's CodeMirror 6 source mode with {{variable}} highlighting (rich-content-unification PLAN §3.5). Do not extend the hand-rolled contentEditable prompt pieces. |
| cleanMarkdownPreview (regex markdown stripping) | hand-rolled-helper | banned | 0 | 0 | Render the preview at the inline level through the markdown core (`BasicMarkdownContent`; target `<RichContent level="inline">`, PLAN §3.1) instead of stripping markdown with regexes. |
| renderAnnouncementMessage (regex link parser) | hand-rolled-helper | banned | 0 | 0 | Render the message through the markdown core at the inline level: `<RichContent level="inline">` (PLAN §3.1). |
| a second inline markdown renderer (InlineMarkdownWithLinks / applyInlineMarkdownHtmlFormatting) | hand-rolled-helper | banned | 0 | 0 | Render inline markdown (table cells, titles, labels) through the ONE core: `<RichContent level="inline" source isStreaming>` — math, links, code and the stream heal come with it. |
| hand-rolled AutoTextarea / AutoResizeTextarea | hand-rolled-textarea | banned | 1 | 1 | Use `ProTextarea` (components/official/ProTextarea.tsx) — it auto-grows and carries dictation, cleanup and agent actions. Never hand-roll another auto-resizing textarea. |
| MarkdownStream | renderer-entry-point | tracked | 17 | 17 | Current entry point — keep using it; it is absorbed by `<RichContent source level>` at cutover (PLAN §3.1). |
| BasicMarkdownContent | renderer-entry-point | tracked | 0 | 0 | Current entry point — keep using it; it is absorbed by `<RichContent source level>` at cutover (PLAN §3.1). |
| ConfigurableMarkdownContent | renderer-entry-point | tracked | 0 | 0 | Current entry point — keep using it; it is absorbed by `<RichContent source level>` at cutover (PLAN §3.1). |
| MarkdownRenderer | renderer-entry-point | tracked | 8 | 8 | Current entry point — keep using it; it is absorbed by `<RichContent source level>` at cutover (PLAN §3.1). |
| CardFaceContent | renderer-entry-point | tracked | 16 | 16 | Current entry point — keep using it; it is absorbed by `<RichContent source level>` at cutover (PLAN §3.1). |
| RichDocument | renderer-entry-point | tracked | 0 | 0 | Current entry point — keep using it; it is absorbed by `<RichContent source level>` at cutover (PLAN §3.1). |
| MarkdownPreview | renderer-entry-point | tracked | 3 | 3 | Current entry point — keep using it; it is absorbed by `<RichContent source level>` at cutover (PLAN §3.1). |
| dangerouslySetInnerHTML | raw-html | review | 25 | 34 | Rich text renders through the markdown core; HTML-origin bodies go through the HTML-sanitizing path (PLAN §2). |
| {x.content\|body\|description\|prompt\|reasoning\|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td> | raw-content-render | review | 536 | 659 | If the field can hold markdown, render it through the core at the right level (PLAN §3.1). |
| .split("\n").map(→ JSX) paragraph renderer | raw-content-render | review | 7 | 7 | Paragraphs come from the markdown core, never a hand split on newlines (PLAN §3.1). |
| whitespace-pre-wrap / pre-line on a content field | raw-content-render | banned | 1 | 1 | pre-wrap shows markdown source; render it through the core instead: `<RichContent source level="inline\|standard\|full">` (one-line previews: `<RichContentPreview>`) — PLAN §3.1. |
| a markdown-link regex in a component file (hand-rolled markdown parsing for display) | hand-rolled-helper | banned | 0 | 0 | Never parse markdown links with a regex to build JSX (the announcement parser class): render the text through `<RichContent source level>` — the core handles links, emphasis, code and math (PLAN §3.1). |

## Top surfaces (by their OWN legacy sites — shared files excluded)

| Surface | Own files | Own banned | Own tracked | Own review | All banned (incl. shared) |
|---|---:|---:|---:|---:|---:|
| overlay agentAdvancedEditorWindow (Agent Advanced Editor) | 10 | 7 | 0 | 12 | 9 |
| route /administration/agents/system-agents/agents/[id]/build | 10 | 7 | 0 | 12 | 9 |
| route /agents/[id]/build | 10 | 7 | 0 | 12 | 9 |
| route /agents/battle/variations | 10 | 7 | 0 | 12 | 9 |
| route /agents/battle/variations/[setId] | 10 | 7 | 0 | 12 | 9 |
| route /agents/battle/system-prompt | 6 | 5 | 0 | 2 | 6 |
| route /agents/battle/system-prompt/[setId] | 6 | 5 | 0 | 2 | 6 |
| route /administration/utilities/markdown-tester | 10 | 4 | 2 | 10 | 5 |
| route /markdown-studio | 10 | 4 | 2 | 10 | 5 |
| overlay markdownEditor (Markdown Editor (fullscreen)) | 6 | 4 | 0 | 7 | 5 |
| overlay markdownEditorWindow (Markdown Editor) | 6 | 4 | 0 | 7 | 5 |
| overlay noteInfoWindow (Note Info) | 1 | 2 | 0 | 0 | 3 |
| route /marketing/[brandId]/content/plan/[siteId] | 8 | 1 | 1 | 10 | 3 |
| route /marketing/[brandId]/content/plan/[siteId]/ai-runs | 8 | 1 | 1 | 10 | 3 |
| route /marketing/[brandId]/content/plan/[siteId]/brief | 8 | 1 | 1 | 10 | 3 |
| route /marketing/[brandId]/content/plan/[siteId]/entities | 8 | 1 | 1 | 10 | 3 |
| route /marketing/[brandId]/content/plan/[siteId]/map | 8 | 1 | 1 | 10 | 3 |
| route /marketing/[brandId]/content/plan/[siteId]/setup | 8 | 1 | 1 | 10 | 3 |
| route /marketing/[brandId]/content/plan/[siteId]/table | 8 | 1 | 1 | 10 | 3 |
| route /cms/[siteId]/pages/[pageId] | 5 | 1 | 1 | 4 | 2 |
| route /cms/[siteId]/pages/new | 5 | 1 | 1 | 4 | 2 |
| route /marketing/[brandId]/websites/[siteId]/pages/[pageId] | 5 | 1 | 1 | 4 | 2 |
| overlay contentEditorWorkspaceWindow (Content Workspace) | 2 | 1 | 0 | 2 | 2 |
| overlay contentEditorListWindow (Content List Editor) | 2 | 1 | 0 | 1 | 2 |
| overlay contentEditorWindow (Content Editor) | 2 | 1 | 0 | 1 | 2 |
| route /administration/agents/system-agents/content-blocks | 1 | 1 | 1 | 0 | 2 |
| route /administration/utilities/content-blocks | 1 | 1 | 1 | 0 | 2 |
| opener fullScreenEditor | 1 | 1 | 0 | 0 | 1 |
| overlay creatorHub (Creator Hub) | 1 | 1 | 0 | 0 | 2 |
| overlay extractionCellEditorWindow (Extraction Cell Editor) | 1 | 1 | 0 | 0 | 2 |
| layout / | 54 | 0 | 4 | 66 | 2 |
| route /s/[token] | 18 | 0 | 1 | 29 | 1 |
| route /artifacts/[id] | 12 | 0 | 0 | 21 | 1 |
| overlay canvasViewerWindow (Canvas Viewer) | 11 | 0 | 0 | 20 | 1 |
| route /canvas/shared/[token] | 11 | 0 | 0 | 20 | 1 |
| route /board/[id] | 13 | 0 | 4 | 11 | 2 |
| route /meet/[slug] | 13 | 0 | 4 | 11 | 2 |
| route /knowledge/hub | 10 | 0 | 0 | 10 | 1 |
| overlay userPreferences (Settings) | 7 | 0 | 0 | 8 | 1 |
| route /agents/battle/tools | 2 | 0 | 0 | 8 | 1 |
| route /agents/battle/tools/[setId] | 2 | 0 | 0 | 8 | 1 |
| route /education/flashcards/[setId] | 6 | 0 | 4 | 4 | 1 |
| route /education/flashcards/[setId]/learn | 5 | 0 | 1 | 7 | 1 |
| route /education/flashcards/[setId]/study | 5 | 0 | 1 | 7 | 1 |
| route /education/flashcards/review | 5 | 0 | 1 | 7 | 1 |
| route /education/flashcards/weak-areas | 5 | 0 | 1 | 7 | 1 |
| route /images/tools | 6 | 0 | 0 | 8 | 1 |
| route /knowledge/transcripts/[id] | 8 | 0 | 0 | 8 | 1 |
| route /p/e/[resourceType]/[id] | 5 | 0 | 1 | 7 | 1 |
| route /administration/users/feedback | 5 | 0 | 0 | 7 | 1 |

## Shared files — reach more than 10 surfaces (convert once, every surface benefits)

### `components/MarkdownStreamImpl.tsx` — reaches 1119 surfaces

- [ ] `components/MarkdownStreamImpl.tsx:9` — **MarkdownStream** (tracked) — `./MarkdownStream` (type-only)

### `components/mardown-display/MarkdownRenderer.tsx` — reaches 18 surfaces

- [ ] `components/mardown-display/MarkdownRenderer.tsx:12` — **react-markdown** (BANNED) — `react-markdown` (type-only)

### `components/mardown-display/blocks/flashcards/FlashcardItem.tsx` — reaches 17 surfaces

- [ ] `components/mardown-display/blocks/flashcards/FlashcardItem.tsx:6` — **CardFaceContent** (tracked) — `./CardFaceContent`

### `components/mardown-display/chat-markdown/EnhancedChatMarkdown.tsx` — reaches 1119 surfaces

- [ ] `components/mardown-display/chat-markdown/EnhancedChatMarkdown.tsx:46` — **FullScreenMarkdownEditor (16-tab editor)** (BANNED) — `./FullScreenMarkdownEditor`
- [ ] `components/mardown-display/chat-markdown/EnhancedChatMarkdown.tsx:1212` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{block?.content || "[Render error]"}`

### `components/mardown-display/chat-markdown/analyzer/analyzer-options/SectionViewerWithSidebar.tsx` — reaches 1119 surfaces

- [ ] `components/mardown-display/chat-markdown/analyzer/analyzer-options/SectionViewerWithSidebar.tsx:71` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: content }}`
- [ ] `components/mardown-display/chat-markdown/analyzer/analyzer-options/SectionViewerWithSidebar.tsx:82` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: content }}`

### `components/mardown-display/chat-markdown/analyzer/analyzer-options/lines-viewer.tsx` — reaches 1119 surfaces

- [ ] `components/mardown-display/chat-markdown/analyzer/analyzer-options/lines-viewer.tsx:129` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: content }}`
- [ ] `components/mardown-display/chat-markdown/analyzer/analyzer-options/lines-viewer.tsx:141` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: content }}`
- [ ] `components/mardown-display/chat-markdown/analyzer/analyzer-options/lines-viewer.tsx:237` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: content }}`
- [ ] `components/mardown-display/chat-markdown/analyzer/analyzer-options/lines-viewer.tsx:246` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: content }}`

### `components/mardown-display/chat-markdown/analyzer/analyzer-options/section-viewer-V2.tsx` — reaches 1119 surfaces

- [ ] `components/mardown-display/chat-markdown/analyzer/analyzer-options/section-viewer-V2.tsx:160` — **.split("\n").map(→ JSX) paragraph renderer** (review) — `item.split('\n').map((row, rowIndex) => ( <tr key={rowIndex} className="border-b border-b…`

### `components/mardown-display/chat-markdown/analyzer/analyzer-options/sections-viewer.tsx` — reaches 1119 surfaces

- [ ] `components/mardown-display/chat-markdown/analyzer/analyzer-options/sections-viewer.tsx:198` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: safeContent }}`
- [ ] `components/mardown-display/chat-markdown/analyzer/analyzer-options/sections-viewer.tsx:209` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: safeContent }}`

### `components/matrx/MatrxSplit.tsx` — reaches 1119 surfaces

- [ ] `components/matrx/MatrxSplit.tsx:11` — **MarkdownStream** (tracked) — `@/components/MarkdownStream` (type-only)

### `components/official/FullScreenOverlay.tsx` — reaches 1119 surfaces

- [ ] `components/official/FullScreenOverlay.tsx:547` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{selectedTab.content}`

### `components/official/item/ItemMenu.tsx` — reaches 1119 surfaces

- [ ] `components/official/item/ItemMenu.tsx:504` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{resolved.header.description}`

### `components/official/item/ItemMenuDrawer.tsx` — reaches 1119 surfaces

- [ ] `components/official/item/ItemMenuDrawer.tsx:106` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{config.header.description}`

### `components/official/json-explorer/BookmarksDialog.tsx` — reaches 1119 surfaces

- [ ] `components/official/json-explorer/BookmarksDialog.tsx:51` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{bookmark.description}`

### `components/official/processor-extractor/path-management/UnifiedBookmarkManager.tsx` — reaches 1119 surfaces

- [ ] `components/official/processor-extractor/path-management/UnifiedBookmarkManager.tsx:399` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{bookmark.description}`

### `components/seo/JsonLd.tsx` — reaches 12 surfaces

- [ ] `components/seo/JsonLd.tsx:27` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c"), }}`

### `features/access-gate/components/AccessDenied.tsx` — reaches 1119 surfaces

- [ ] `features/access-gate/components/AccessDenied.tsx:506` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{s.description}`

### `features/admin/components/AdminDomainSection.tsx` — reaches 16 surfaces

- [ ] `features/admin/components/AdminDomainSection.tsx:73` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{destination.description}`

### `features/agent-shortcuts/components/AgentVersionPicker.tsx` — reaches 11 surfaces

- [ ] `features/agent-shortcuts/components/AgentVersionPicker.tsx:322` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{agent.description}`

### `features/agent-shortcuts/components/ShortcutContextsPicker.tsx` — reaches 16 surfaces

- [ ] `features/agent-shortcuts/components/ShortcutContextsPicker.tsx:101` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{meta.description}`

### `features/agents/components/agent-listings/AgentSneakPeekModal.tsx` — reaches 1119 surfaces

- [ ] `features/agents/components/agent-listings/AgentSneakPeekModal.tsx:676` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{outputSchema.description}`
- [ ] `features/agents/components/agent-listings/AgentSneakPeekModal.tsx:702` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{field.description}`

### `features/agents/components/samples/TestCaseInputs.tsx` — reaches 11 surfaces

- [ ] `features/agents/components/samples/TestCaseInputs.tsx:227` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{part.description}`

### `features/approvals/kinds/contact-import.tsx` — reaches 1119 surfaces

- [ ] `features/approvals/kinds/contact-import.tsx:278` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<td>{row.explanation ?? (row.values.length > 0 ? 'Value from Google Contacts: ${row.value…`

### `features/approvals/kinds/task-import.tsx` — reaches 1119 surfaces

- [ ] `features/approvals/kinds/task-import.tsx:94` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{row.notes}`

### `features/assists/components/AssistActionTextEditor.tsx` — reaches 1119 surfaces

- [ ] `features/assists/components/AssistActionTextEditor.tsx:97` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{definition.description}`

### `features/assists/components/AssistCard.tsx` — reaches 1119 surfaces

- [ ] `features/assists/components/AssistCard.tsx:312` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{assist.reasoning}`

### `features/auth/components/module-landing/ModuleLanding.tsx` — reaches 40 surfaces

- [ ] `features/auth/components/module-landing/ModuleLanding.tsx:221` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{feature.description}`
- [ ] `features/auth/components/module-landing/ModuleLanding.tsx:256` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{step.description}`

### `features/content-ir/studio/components/KindExampleManager.tsx` — reaches 11 surfaces

- [ ] `features/content-ir/studio/components/KindExampleManager.tsx:257` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{row.description}`

### `features/education/trust/components/VerifyAgainstSourceButton.tsx` — reaches 16 surfaces

- [ ] `features/education/trust/components/VerifyAgainstSourceButton.tsx:211` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{result.explanation}`

### `features/files/components/core/FilePreview/PreviewerSwitch.tsx` — reaches 19 surfaces

- [ ] `features/files/components/core/FilePreview/PreviewerSwitch.tsx:52` — **MarkdownPreview** (tracked) — `./previewers/MarkdownPreview`

### `features/flashcards/fast-fire/components/AnswerGradeBlock.tsx` — reaches 19 surfaces

- [ ] `features/flashcards/fast-fire/components/AnswerGradeBlock.tsx:91` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{grade.verdict.explanation}`
- [ ] `features/flashcards/fast-fire/components/AnswerGradeBlock.tsx:100` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{grade.transcript}`

### `features/flashcards/fast-fire/voice-test/SingleCardVoiceTest.tsx` — reaches 17 surfaces

- [ ] `features/flashcards/fast-fire/voice-test/SingleCardVoiceTest.tsx:3` — **CardFaceContent** (tracked) — `@/components/mardown-display/blocks/flashcards/CardFaceContent`

### `features/flashcards/fast-fire/voice-test/VoiceTestAudioSetup.tsx` — reaches 17 surfaces

- [ ] `features/flashcards/fast-fire/voice-test/VoiceTestAudioSetup.tsx:3` — **CardFaceContent** (tracked) — `@/components/mardown-display/blocks/flashcards/CardFaceContent`

### `features/marketing/seo/topical-map/components/TopicalMapHomeCard.tsx` — reaches 14 surfaces

- [ ] `features/marketing/seo/topical-map/components/TopicalMapHomeCard.tsx:93` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{map.description ?? "No description"}`

### `features/marketing/seo/topical-map/panel/sections/IdentitySection.tsx` — reaches 1119 surfaces

- [ ] `features/marketing/seo/topical-map/panel/sections/IdentitySection.tsx:162` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{topic.description}`

### `features/marketing/seo/topical-map/proposals/MapTopicProposalView.tsx` — reaches 16 surfaces

- [ ] `features/marketing/seo/topical-map/proposals/MapTopicProposalView.tsx:127` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{proposal.summary}`

### `features/marketing/seo/value-system/workbench/RulingDialog.tsx` — reaches 43 surfaces

- [ ] `features/marketing/seo/value-system/workbench/RulingDialog.tsx:137` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{meta.description}`

### `features/marketing/strategy/components/StrategyBriefWorkspace.tsx` — reaches 14 surfaces

- [ ] `features/marketing/strategy/components/StrategyBriefWorkspace.tsx:33` — **MarkdownRenderer** (tracked) — `@/components/mardown-display/MarkdownRenderer`

### `features/matrx-envelope/directives/createProjectWithTasks/CreateProjectWithTasksRenderer.tsx` — reaches 1119 surfaces

- [ ] `features/matrx-envelope/directives/createProjectWithTasks/CreateProjectWithTasksRenderer.tsx:80` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{task.description}`
- [ ] `features/matrx-envelope/directives/createProjectWithTasks/CreateProjectWithTasksRenderer.tsx:124` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{task.description}`

### `features/notes/components/CreateFolderDialog.tsx` — reaches 1119 surfaces

- [ ] `features/notes/components/CreateFolderDialog.tsx:171` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{category.description}`

### `features/notes/components/cleanup/CleanupOptionsPopover.tsx` — reaches 1119 surfaces

- [ ] `features/notes/components/cleanup/CleanupOptionsPopover.tsx:163` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{CLEANUP_REGION_OPERATION_META.find((m) => m.id === regionOp) ?.description}`
- [ ] `features/notes/components/cleanup/CleanupOptionsPopover.tsx:204` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{m.description}`

### `features/pdf/components/PdfSurfaceSwitcher.tsx` — reaches 15 surfaces

- [ ] `features/pdf/components/PdfSurfaceSwitcher.tsx:138` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{surface.description}`

### `features/rag/components/data-stores/DataStoreBindPanel.tsx` — reaches 15 surfaces

- [ ] `features/rag/components/data-stores/DataStoreBindPanel.tsx:186` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{s.description}`

### `features/resource-manager/resource-picker/TasksResourcePicker.tsx` — reaches 1119 surfaces

- [ ] `features/resource-manager/resource-picker/TasksResourcePicker.tsx:172` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{task.description}`

### `features/scope-system/components/forms/ContextItemSettingsForm.tsx` — reaches 12 surfaces

- [ ] `features/scope-system/components/forms/ContextItemSettingsForm.tsx:455` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{FETCH_HINT_CONFIG[fetchHint].description}`
- [ ] `features/scope-system/components/forms/ContextItemSettingsForm.tsx:482` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{SENSITIVITY_CONFIG[sensitivity].description}`

### `features/scopes/components/active-context/binding-target/BindingTargetPicker.tsx` — reaches 24 surfaces

- [ ] `features/scopes/components/active-context/binding-target/BindingTargetPicker.tsx:240` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{RUNG_COPY[rung].description}`
- [ ] `features/scopes/components/active-context/binding-target/BindingTargetPicker.tsx:262` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{copy.description}`

### `features/scopes/components/reference/ContextValueInput.tsx` — reaches 22 surfaces

- [ ] `features/scopes/components/reference/ContextValueInput.tsx:44` — **BasicContentEditor (split editor)** (BANNED) — `@/components/content-refine/BasicContentEditor`

### `features/shell/components/header/RouteModeNav.tsx` — reaches 1163 surfaces

- [ ] `features/shell/components/header/RouteModeNav.tsx:458` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{item.description}`
- [ ] `features/shell/components/header/RouteModeNav.tsx:532` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{item.description}`

### `features/shell/components/header/ServerRenderedHeaderSlot.tsx` — reaches 1229 surfaces

- [ ] `features/shell/components/header/ServerRenderedHeaderSlot.tsx:305` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: HEADER_GHOST_SCRIPT }}`

### `features/shell/components/header/templates/MobilePanelShell.tsx` — reaches 35 surfaces

- [ ] `features/shell/components/header/templates/MobilePanelShell.tsx:221` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{panel.content}`
- [ ] `features/shell/components/header/templates/MobilePanelShell.tsx:285` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{p.content}`
- [ ] `features/shell/components/header/templates/MobilePanelShell.tsx:338` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{p.content}`

### `features/spaces/editor/inline.tsx` — reaches 1119 surfaces

- [ ] `features/spaces/editor/inline.tsx:91` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{live.description}`

### `features/spaces/editor/stored-blocks.tsx` — reaches 1119 surfaces

- [ ] `features/spaces/editor/stored-blocks.tsx:194` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{card.description}`

### `features/surfaces/components/bind/WritePolicyEditor.tsx` — reaches 15 surfaces

- [ ] `features/surfaces/components/bind/WritePolicyEditor.tsx:184` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{target.description}`

### `features/transcript-studio/components/scribe/ActionSheet.tsx` — reaches 1119 surfaces

- [ ] `features/transcript-studio/components/scribe/ActionSheet.tsx:76` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{item.description}`

### `features/workflow-runtime/interrupt/InterruptQuestion.tsx` — reaches 44 surfaces

- [ ] `features/workflow-runtime/interrupt/InterruptQuestion.tsx:195` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{view.prompt}`

### `features/workflow-runtime/listings/core/WorkflowDetailCard.tsx` — reaches 23 surfaces

- [ ] `features/workflow-runtime/listings/core/WorkflowDetailCard.tsx:172` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{workflow.description}`

### `features/workflow-runtime/listings/core/WorkflowSneakPeek.tsx` — reaches 23 surfaces

- [ ] `features/workflow-runtime/listings/core/WorkflowSneakPeek.tsx:125` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{peek.description}`

### `lib/code-runtime/stored-scope.ts` — reaches 1119 surfaces

- [ ] `lib/code-runtime/stored-scope.ts:32` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### `lib/entity-list/components/EntityListPage.tsx` — reaches 45 surfaces

- [ ] `lib/entity-list/components/EntityListPage.tsx:1569` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: NO_ROOM_CSS }}`
- [ ] `lib/entity-list/components/EntityListPage.tsx:1572` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: noRoomScript(pageConfig.columns) }}`
- [ ] `lib/entity-list/components/EntityListPage.tsx:1658` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{state.description}`

### `lib/entity-list/components/ReservedSlot.tsx` — reaches 45 surfaces

- [ ] `lib/entity-list/components/ReservedSlot.tsx:37` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: reserveSlotScript(surfaceKey, name) }}`

### `lib/guided-setup/components/GuidedChecklist.tsx` — reaches 15 surfaces

- [ ] `lib/guided-setup/components/GuidedChecklist.tsx:178` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{resolved.description}`

## By surface

Each surface lists the legacy sites it reaches, EXCLUDING the shared files above.

### layout /

- [ ] `components/errors/ChunkRecoveryBootScript.tsx:82` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: SCRIPT }}`
- [ ] `components/mardown-display/blocks/agent-result/AgentResultBlock.tsx:60` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `components/mardown-display/blocks/applet-build-result/AppletBuildResultBlock.tsx:43` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{data.description}`
- [ ] `components/mardown-display/blocks/comparison/ComparisonTableBlock.tsx:590` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{comparison.description}`
- [ ] `components/mardown-display/blocks/cooking-recipes/cookingRecipeDisplay.tsx:554` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{step.description}`
- [ ] `components/mardown-display/blocks/cooking-recipes/cookingRecipeDisplay.tsx:582` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{recipe.notes}`
- [ ] `components/mardown-display/blocks/decision-tree/DecisionTreeBlock.tsx:399` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{node.description}`
- [ ] `components/mardown-display/blocks/decision-tree/DecisionTreeBlock.tsx:448` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{node.description}`
- [ ] `components/mardown-display/blocks/decision-tree/DecisionTreeBlock.tsx:593` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{decisionTree.description}`
- [ ] `components/mardown-display/blocks/decision-tree/DecisionTreeBlock.tsx:778` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{currentNode.description}`
- [ ] `components/mardown-display/blocks/inline-decision/InlineDecisionBlock.tsx:130` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{decision.prompt}`
- [ ] `components/mardown-display/blocks/map/MapCanvas.tsx:133` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{m.description}`
- [ ] `components/mardown-display/blocks/masterwork-unfolding/CaseDisclosureBlock.tsx:158` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{data.answer}`
- [ ] `components/mardown-display/blocks/masterwork/MasterworkResultBlock.tsx:45` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `components/mardown-display/blocks/media-chapters/MediaChaptersBlock.tsx:115` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{chapter.summary}`
- [ ] `components/mardown-display/blocks/media-io/MediaAssetBlock.tsx:208` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<pre>{data.transcript}`
- [ ] `components/mardown-display/blocks/media-io/PodcastEpisodeBlock.tsx:164` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{data.description}`
- [ ] `components/mardown-display/blocks/memory-aid/MemoryAidBlock.tsx:178` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{controls.editor.content}`
- [ ] `components/mardown-display/blocks/memory-aid/MemoryAidBlock.tsx:225` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{controls.editor.content}`
- [ ] `components/mardown-display/blocks/memory-aid/MemoryAidBlock.tsx:249` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{controls.editor.content}`
- [ ] `components/mardown-display/blocks/memory-aid/MemoryAidBlock.tsx:292` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{controls.editor.content}`
- [ ] `components/mardown-display/blocks/memory-aid/MemoryHintBlock.tsx:89` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{hint.explanation}`
- [ ] `components/mardown-display/blocks/page-pipeline/PlanPageResearchBlock.tsx:184` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{source.notes}`
- [ ] `components/mardown-display/blocks/presentations/PresentationExportMenu.tsx:445` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{capabilities.pdf.description}`
- [ ] `components/mardown-display/blocks/presentations/PresentationExportMenu.tsx:464` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{capabilities.html.description}`
- [ ] `components/mardown-display/blocks/presentations/PresentationExportMenu.tsx:483` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{capabilities.powerpoint.description}`
- [ ] `components/mardown-display/blocks/presentations/PresentationExportMenu.tsx:527` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{capabilities.googleSlides.description}`
- [ ] `components/mardown-display/blocks/presentations/Slideshow.tsx:239` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{p.description}`
- [ ] `components/mardown-display/blocks/progress/ProgressTrackerBlock.tsx:411` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tracker.description}`
- [ ] `components/mardown-display/blocks/research/ResearchBlock.tsx:560` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{theme.description}`
- [ ] `components/mardown-display/blocks/resources/ResourceCollectionBlock.tsx:333` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{collection.description}`
- [ ] `components/mardown-display/blocks/resources/ResourceCollectionBlock.tsx:497` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{resource.description}`
- [ ] `components/mardown-display/blocks/result-kinds/PickListBlock.tsx:85` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{choice.description}`
- [ ] `components/mardown-display/blocks/scraper-kinds/ScrapedPageBlock.tsx:362` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<pre>{active.body}`
- [ ] `components/mardown-display/blocks/seo-package/SeoPackageBlock.tsx:265` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.answer}`
- [ ] `components/mardown-display/blocks/spaces-results/SpacesResultBlocks.tsx:74` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{data.summary || "Your Space is ready."}`
- [ ] `components/mardown-display/blocks/spaces-results/SpacesResultBlocks.tsx:108` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{data.summary}`
- [ ] `components/mardown-display/blocks/study-notes/StudyNotesBlock.tsx:74` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{section.summary}`
- [ ] `components/mardown-display/blocks/timeline/TimelineBlock.tsx:418` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{event.description}`
- [ ] `components/mardown-display/blocks/troubleshooting/TroubleshootingBlock.tsx:399` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{troubleshooting.description}`
- [ ] `components/mardown-display/blocks/troubleshooting/TroubleshootingBlock.tsx:605` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{step.description}`
- [ ] `components/mardown-display/blocks/troubleshooting/TroubleshootingLoadingVisualization.tsx:108` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{step.description}`
- [ ] `components/mardown-display/blocks/video-prompt-options/VideoPromptOptionsBlock.tsx:178` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{variation.prompt}`
- [ ] `components/official/review-deck/ReviewDeck.tsx:223` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{current.body}`
- [ ] `components/official/settings/primitives/SettingsRadioGroup.tsx:78` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{opt.description}`
- [ ] `features/admin/system-context/SystemContextPreview.tsx:69` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{e.description}`
- [ ] `features/agents/components/schema-proposal/CreateShapeDialog.tsx:481` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{choice.description}`
- [ ] `features/agents/decision-questions/DecisionQuestionsTranscriptView.tsx:52` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{q.instructions}`
- [ ] `features/canvas/core/SavedCanvasItemCard.tsx:158` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`
- [ ] `features/chat-tool-renderers/renderers/dataset/DatasetInline.tsx:124` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{ds.description}`
- [ ] `features/chat-tool-renderers/renderers/knowledge-browse/KnowledgeStoreInline.tsx:149` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{store.description}`
- [ ] `features/chat-tool-renderers/renderers/knowledge-browse/KnowledgeStoreInline.tsx:168` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{m.notes}`
- [ ] `features/chat-tool-renderers/renderers/knowledge-browse/KnowledgeStoresInline.tsx:73` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{store.description}`
- [ ] `features/connectors/ConnectorPromptCard.tsx:164` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{provider.prompt.body}`
- [ ] `features/connectors/IntegrationDirectory.tsx:564` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{item.description}`
- [ ] `features/connectors/IntegrationDirectory.tsx:662` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{item.description}`
- [ ] `features/data-tables/pick-lists/components/ListItem.tsx:68` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description || item.help_text}`
- [ ] `features/files/blocks/image/UnifiedImageBlockRenderer.tsx:760` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{option.description}`
- [ ] `features/files/blocks/image/UnifiedImageBlockRenderer.tsx:786` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{option.description}`
- [ ] `features/marketing/seo/topical-map/proposals/ProposalReview.tsx:128` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{topic.description}`
- [ ] `features/marketing/seo/topical-map/views/HistoryView.tsx:375` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`
- [ ] `features/marketing/seo/topical-map/views/table/columns.tsx:347` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.topic.description}`
- [ ] `features/organizations/components/OrganizationCard.tsx:178` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{organization.description}`
- [ ] `features/rich-content-host/app-bindings.tsx:38` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/rich-content-host/domain-block-dispatch.tsx:234` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{decisionData.prompt || "Decision loading..."}`
- [ ] `features/settings/pages/FeedbackSettingsPage.tsx:596` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{item.description}`
- [ ] `features/settings/pages/IntegrationsSettingsPage.tsx:1179` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`
- [ ] `features/shell/components/BoardEmbedBootScript.tsx:18` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: SCRIPT }}`
- [ ] `lib/sync/components/SyncBootScript.tsx:73` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: script }}`
- [ ] `providers/chatMarkdownRegistration.ts:10` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### layout /notes

- [ ] `app/(core)/notes/layout.tsx:83` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: highlightStyles }}`

### opener fullScreenEditor

- [ ] `features/overlays/openers/fullScreenEditor.tsx:33` — **FullScreenMarkdownEditor (16-tab editor)** (BANNED) — `@/components/mardown-display/chat-markdown/FullScreenMarkdownEditor` (type-only)

### overlay adminIndicator (Admin Indicator)

- [ ] `components/admin/debug/DebugModulePanel.tsx:70` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{debugModule.description}`
- [ ] `components/admin/state-analyzer/execution-inspector/ExecutionInstanceInspector.tsx:379` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{agentData.description}`

### overlay adminStateAnalyzer (State Analyzer (overlay))

- [ ] `components/admin/state-analyzer/execution-inspector/ExecutionInstanceInspector.tsx:379` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{agentData.description}`

### overlay adminStateAnalyzerWindow (State Analyzer)

- [ ] `components/admin/state-analyzer/execution-inspector/ExecutionInstanceInspector.tsx:379` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{agentData.description}`

### overlay agentAdminFindUsagesWindow (Find Usages (Admin))

- [ ] `features/agents/components/usages/UsageRowDetail.tsx:52` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{meta.description}`

### overlay agentAdminShortcutWindow (Create Shortcut)

- [ ] `features/agent-shortcuts/components/ShortcutQuickCreateBody.tsx:87` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{agent.description}`
- [ ] `features/agent-shortcuts/components/ShortcutQuickCreateBody.tsx:248` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{opt.description}`
- [ ] `features/agent-shortcuts/components/ShortcutQuickCreateBody.tsx:584` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{shortcut.description}`

### overlay agentAdvancedEditorWindow (Agent Advanced Editor)

- [ ] `features/agents/components/builder/message-builders/AddBlockButton.tsx:28` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/DecisionQuestionsEditor.tsx:41` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/MessageItem.tsx:45` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/MessageItem.tsx:47` — **MessageViewModeMenu (bespoke mode toggle)** (BANNED) — `@/features/agents/components/builder/message-builders/MessageViewModeMenu`
- [ ] `features/agents/components/builder/message-builders/MessageViewModeMenu.tsx:135` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{meta.description}`
- [ ] `features/agents/components/builder/message-builders/SpeechScriptEditor.tsx:60` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/system-instructions/SystemMessage.tsx:23` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/system-instructions/SystemMessage.tsx:27` — **MessageViewModeMenu (bespoke mode toggle)** (BANNED) — `@/features/agents/components/builder/message-builders/MessageViewModeMenu`
- [ ] `features/agents/components/settings-management/AgentSettingsCore.tsx:345` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: colored }}`
- [ ] `features/agents/components/settings-management/AgentSettingsCore.tsx:353` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: colored }}`
- [ ] `features/agents/components/tools-management/AgentBundlesPanel.tsx:448` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{bundle.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:1732` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tool.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:1949` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tool.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:2919` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:3415` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{selectedConfig.notes}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:3780` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:3895` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{pDef.description ?? "—"}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:4088` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tool.description}`
- [ ] `features/message-templates/components/TemplateBrowserModal.tsx:413` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{template.content}`

### overlay agentConnectionsWindow (Agent Connections)

- [ ] `components/official/settings/primitives/SettingsRadioGroup.tsx:78` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{opt.description}`
- [ ] `features/agent-connections/components/sections/AgentsSection.tsx:145` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{agent.description ?? agent.id}`
- [ ] `features/agent-connections/components/sections/McpServersSection.tsx:264` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`
- [ ] `features/agent-connections/components/sections/McpServersSection.tsx:315` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tool.description}`
- [ ] `features/agent-connections/components/sections/OverviewSection.tsx:151` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{card.description}`
- [ ] `features/agent-connections/components/sections/RenderBlocksSection.tsx:409` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{def.description}`

### overlay agentFindUsagesWindow (Find Usages)

- [ ] `features/agents/components/usages/UsageRowDetail.tsx:52` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{meta.description}`

### overlay agentSettingsWindow (Agent Settings)

- [ ] `features/surfaces/components/bind/BindingSuggestionsTab.tsx:408` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{proposal.notes}`

### overlay aiVoiceWindow (AI Voice)

- [ ] `features/audio/voice/VoicesList.tsx:235` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{voice.description}`
- [ ] `features/audio/voice/components/VoiceSelectionModal.tsx:237` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{voice.description || "No description available"}`

### overlay approvalsWindow (Waiting on you)

- [ ] `features/approvals/ApprovalQueue.tsx:939` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{item.body}`

### overlay canvasViewerWindow (Canvas Viewer)

- [ ] `components/mardown-display/blocks/comparison/ComparisonTableBlock.tsx:590` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{comparison.description}`
- [ ] `components/mardown-display/blocks/cooking-recipes/cookingRecipeDisplay.tsx:554` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{step.description}`
- [ ] `components/mardown-display/blocks/cooking-recipes/cookingRecipeDisplay.tsx:582` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{recipe.notes}`
- [ ] `components/mardown-display/blocks/decision-tree/DecisionTreeBlock.tsx:399` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{node.description}`
- [ ] `components/mardown-display/blocks/decision-tree/DecisionTreeBlock.tsx:448` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{node.description}`
- [ ] `components/mardown-display/blocks/decision-tree/DecisionTreeBlock.tsx:593` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{decisionTree.description}`
- [ ] `components/mardown-display/blocks/decision-tree/DecisionTreeBlock.tsx:778` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{currentNode.description}`
- [ ] `components/mardown-display/blocks/map/MapCanvas.tsx:133` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{m.description}`
- [ ] `components/mardown-display/blocks/presentations/PresentationExportMenu.tsx:445` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{capabilities.pdf.description}`
- [ ] `components/mardown-display/blocks/presentations/PresentationExportMenu.tsx:464` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{capabilities.html.description}`
- [ ] `components/mardown-display/blocks/presentations/PresentationExportMenu.tsx:483` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{capabilities.powerpoint.description}`
- [ ] `components/mardown-display/blocks/presentations/PresentationExportMenu.tsx:527` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{capabilities.googleSlides.description}`
- [ ] `components/mardown-display/blocks/presentations/Slideshow.tsx:239` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{p.description}`
- [ ] `components/mardown-display/blocks/progress/ProgressTrackerBlock.tsx:411` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tracker.description}`
- [ ] `components/mardown-display/blocks/research/ResearchBlock.tsx:560` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{theme.description}`
- [ ] `components/mardown-display/blocks/resources/ResourceCollectionBlock.tsx:333` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{collection.description}`
- [ ] `components/mardown-display/blocks/resources/ResourceCollectionBlock.tsx:497` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{resource.description}`
- [ ] `components/mardown-display/blocks/timeline/TimelineBlock.tsx:418` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{event.description}`
- [ ] `components/mardown-display/blocks/troubleshooting/TroubleshootingBlock.tsx:399` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{troubleshooting.description}`
- [ ] `components/mardown-display/blocks/troubleshooting/TroubleshootingBlock.tsx:605` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{step.description}`

### overlay codeWorkspaceWindow (Code Workspace)

- [ ] `features/code/views/extensions/ExtensionsPanel.tsx:116` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{tool.description}`

### overlay contentEditorListWindow (Content List Editor)

- [ ] `components/official/content-editor/ContentEditor.tsx:321` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{config.description}`
- [ ] `features/window-panels/windows/content-editors/ContentEditorListWindow.tsx:14` — **components/official/content-editor/ContentEditor** (BANNED) — `@/components/official/content-editor/ContentEditor`

### overlay contentEditorWindow (Content Editor)

- [ ] `components/official/content-editor/ContentEditor.tsx:321` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{config.description}`
- [ ] `features/window-panels/windows/content-editors/ContentEditorWindow.tsx:13` — **components/official/content-editor/ContentEditor** (BANNED) — `@/components/official/content-editor/ContentEditor`

### overlay contentEditorWorkspaceWindow (Content Workspace)

- [ ] `components/official/content-editor/ContentEditor.tsx:321` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{config.description}`
- [ ] `components/official/content-editor/ContentEditorTabs.tsx:13` — **components/official/content-editor/ContentEditor** (BANNED) — `./ContentEditor`
- [ ] `components/official/content-editor/ContentEditorTabs.tsx:259` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{config.description}`

### overlay creatorHub (Creator Hub)

- [ ] `features/agents/components/run-controls/PayloadTab.tsx:121` — **whitespace-pre-wrap / pre-line on a content field** (BANNED) — `<pre pre-wrap>{text}`

### overlay credentialVaultWindow (Vault)

- [ ] `features/secrets/components/VaultCreateDialog.tsx:1350` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{loginUrlDef?.description ?? "Where this login is used. Stored as plain, unencrypted m…`
- [ ] `features/secrets/components/VaultCreateDialog.tsx:1790` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{draft.def.description}`
- [ ] `features/secrets/components/VaultCreateDialog.tsx:1939` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{def.description}`
- [ ] `features/secrets/components/VaultHandlingControl.tsx:80` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{presentation.description}`
- [ ] `features/secrets/components/VaultItemDetail.tsx:2517` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{VAULT_LABELS.notes}`

### overlay executionInspectorWindow (Execution Inspector)

- [ ] `components/admin/state-analyzer/execution-inspector/ExecutionInstanceInspector.tsx:379` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{agentData.description}`

### overlay extractionCellEditorWindow (Extraction Cell Editor)

- [ ] `features/window-panels/windows/page-extraction/ExtractionCellEditorWindow.tsx:12` — **BasicContentEditor (split editor)** (BANNED) — `@/components/content-refine/BasicContentEditor`

### overlay flashcardStudyWindow (Flashcard Study)

- [ ] `features/flashcards/components/study/study-deck-parts.tsx:20` — **CardFaceContent** (tracked) — `@/components/mardown-display/blocks/flashcards/CardFaceContent`

### overlay googleAgendaWindow (Agenda)

- [ ] `features/connectors/ConnectorPromptCard.tsx:164` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{provider.prompt.body}`
- [ ] `features/google-workspace/calendar/CalendarCreateReview.tsx:470` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{calendar.summary}`
- [ ] `features/google-workspace/calendar/CalendarCreateReview.tsx:477` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{saved.request.summary}`
- [ ] `features/google-workspace/calendar/CalendarCreateReview.tsx:528` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{saved.request.summary}`
- [ ] `features/google-workspace/calendar/CalendarEventChangeReview.tsx:556` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{calendar.summary}`
- [ ] `features/google-workspace/calendar/SelectedCalendarReview.tsx:156` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{result.calendar.summary}`

### overlay googleContactsImportWindow (Import from Google Contacts)

- [ ] `features/connectors/import/GoogleContactsImportPanel.tsx:848` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{decision.explanation}`

### overlay googleTasksImportWindow (Import from Google Tasks)

- [ ] `features/connectors/import/GoogleTasksWriteControls.tsx:276` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{createRecovery.request.notes}`

### overlay keywordResearchWindow (Keyword Research)

- [ ] `features/marketing/seo/keyword-research/components/KeywordResearchLauncher.tsx:33` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### overlay keywordWindow (Keyword Intelligence)

- [ ] `features/marketing/seo/keyword/KeywordMeaningPanel.tsx:303` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{stamp.notes}`

### overlay linkRecordSheet

- [ ] `features/rich-document/annotations/LinkRecordOverlay.tsx:116` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{words.description}`

### overlay listManagerWindow (List Manager)

- [ ] `features/data-tables/pick-lists/components/ListCard.tsx:130` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{list.description}`

### overlay liveIntegrationsWindow (Live Integrations)

- [ ] `features/connectors/ConnectorPromptCard.tsx:164` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{provider.prompt.body}`
- [ ] `features/connectors/IntegrationDirectory.tsx:564` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{item.description}`
- [ ] `features/connectors/IntegrationDirectory.tsx:662` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{item.description}`
- [ ] `features/settings/pages/IntegrationsSettingsPage.tsx:1179` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`

### overlay mandateWindow (Mandates)

- [ ] `features/agents/agent-creators/interactive-builder/AgentGenerator.tsx:779` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{mandate.summary}`
- [ ] `features/agents/agent-creators/interactive-builder/AgentJsonDisplay.tsx:317` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{data.description}`
- [ ] `features/bindings/OfferedInventoryColumn.tsx:183` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{value.description}`
- [ ] `features/mandates/admin/MandateDetailPanel.tsx:1652` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{offer.description}`
- [ ] `features/surfaces/components/bind/BindingSuggestionsTab.tsx:408` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{proposal.notes}`

### overlay mandateWindowNext (Mandates (new))

- [ ] `features/agents/agent-creators/interactive-builder/AgentGenerator.tsx:779` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{mandate.summary}`
- [ ] `features/agents/agent-creators/interactive-builder/AgentJsonDisplay.tsx:317` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{data.description}`
- [ ] `features/bindings/OfferedInventoryColumn.tsx:183` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{value.description}`
- [ ] `features/mandates/admin/MandateDetailPanel.tsx:1652` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{offer.description}`
- [ ] `features/surfaces/components/bind/BindingSuggestionsTab.tsx:408` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{proposal.notes}`

### overlay markdownEditor (Markdown Editor (fullscreen))

- [ ] `components/mardown-display/markdown-classification/custom-views/common/MarkdownTextDisplay.tsx:5` — **react-markdown** (BANNED) — `react-markdown` (type-only)
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/AstRendererView.tsx:76` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{node.content}`
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/AstRendererView.tsx:188` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{node.content}`
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/AstRendererView.tsx:203` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{node.content}`
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/LsiKeywordView.tsx:668` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{section.description}`
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/ModernAstRenderer.tsx:74` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{node.content}`
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/ModernAstRenderer.tsx:219` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{node.content}`
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/ModernAstRenderer.tsx:235` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{node.content}`
- [ ] `components/mardown-display/markdown-classification/markdown-processor-util.ts:21` — **remark-* plugins** (BANNED) — `remark-parse`
- [ ] `components/mardown-display/markdown-classification/markdown-processor-util.ts:22` — **remark-* plugins** (BANNED) — `remark-gfm`
- [ ] `components/mardown-display/markdown-classification/parts/CodeComponent.tsx:4` — **react-markdown** (BANNED) — `react-markdown` (type-only)

### overlay markdownEditorWindow (Markdown Editor)

- [ ] `components/mardown-display/markdown-classification/custom-views/common/MarkdownTextDisplay.tsx:5` — **react-markdown** (BANNED) — `react-markdown` (type-only)
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/AstRendererView.tsx:76` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{node.content}`
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/AstRendererView.tsx:188` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{node.content}`
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/AstRendererView.tsx:203` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{node.content}`
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/LsiKeywordView.tsx:668` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{section.description}`
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/ModernAstRenderer.tsx:74` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{node.content}`
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/ModernAstRenderer.tsx:219` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{node.content}`
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/ModernAstRenderer.tsx:235` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{node.content}`
- [ ] `components/mardown-display/markdown-classification/markdown-processor-util.ts:21` — **remark-* plugins** (BANNED) — `remark-parse`
- [ ] `components/mardown-display/markdown-classification/markdown-processor-util.ts:22` — **remark-* plugins** (BANNED) — `remark-gfm`
- [ ] `components/mardown-display/markdown-classification/parts/CodeComponent.tsx:4` — **react-markdown** (BANNED) — `react-markdown` (type-only)

### overlay masterworkCheckupWindow (Final Checkup)

- [ ] `features/masterwork/checkup/CheckupWindow.tsx:18` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/masterwork/checkup/CheckupWindow.tsx:328` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{run.summary ?? "Nothing to change — your Rulebook holds up."}`

### overlay newsWindow (News)

- [ ] `features/news/components/NewsFloatingWorkspace.tsx:195` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{article.description}`

### overlay noteInfoWindow (Note Info)

- [ ] `components/mardown-display/chat-markdown/FullScreenMarkdownEditorBridge.tsx:44` — **FullScreenMarkdownEditor (16-tab editor)** (BANNED) — `@/components/mardown-display/chat-markdown/FullScreenMarkdownEditor` (type-only)
- [ ] `components/mardown-display/chat-markdown/FullScreenMarkdownEditorBridge.tsx:48` — **FullScreenMarkdownEditor (16-tab editor)** (BANNED) — `@/components/mardown-display/chat-markdown/FullScreenMarkdownEditor`

### overlay pdfExtractorWindow (PDF Extractor)

- [ ] `features/pdf-extractor/components/CopyPagesOverlay.tsx:773` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{copyAllTier.notes || "—"}`
- [ ] `features/pdf-extractor/components/CopyPagesOverlay.tsx:859` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{tier.notes || "—"}`

### overlay pickListManagerWindow (Pick lists)

- [ ] `features/data-tables/pick-lists/components/PickListsIndex.tsx:226` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{list.description}`

### overlay siteDiscoveryWindow (Business discovery)

- [ ] `features/approvals/ApprovalQueue.tsx:939` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{item.body}`
- [ ] `features/marketing/seo/value-system/discovery/DiscoveryLadder.tsx:413` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{door.body}`

### overlay sourceInspectorWindow (Source inspector)

- [ ] `features/pdf-extractor/studio/PdfStudioReader.tsx:2145` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<pre>{doc.content ?? "(no extracted text)"}`

### overlay surfaceAgentBindWindow (Add Agent to Surface)

- [ ] `features/surfaces/components/bind/BindingSuggestionsTab.tsx:408` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{proposal.notes}`

### overlay surfaceContextInspector (Surface Context Admin)

- [ ] `features/surfaces/admin-detail/SurfaceAdminDetailPage.tsx:920` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{t.description}`
- [ ] `features/surfaces/admin-detail/SurfaceAdminDetailPage.tsx:1234` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<td>{child.description ?? "—"}`
- [ ] `features/surfaces/components/NewSurfaceDialog.tsx:265` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{t.description}`
- [ ] `features/surfaces/components/SurfaceValuesTable.tsx:193` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{display.description}`
- [ ] `features/tool-registry/shared/ToolSearchDialog.tsx:270` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{tool.description}`

### overlay topicalMapWindow (Topical map)

- [ ] `components/official/review-deck/ReviewDeck.tsx:223` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{current.body}`
- [ ] `features/marketing/seo/topical-map/proposals/ProposalReview.tsx:128` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{topic.description}`
- [ ] `features/marketing/seo/topical-map/views/HistoryView.tsx:375` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`
- [ ] `features/marketing/seo/topical-map/views/table/columns.tsx:347` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.topic.description}`
- [ ] `features/window-panels/windows/marketing/TopicalMapWindow.tsx:245` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.description}`

### overlay transcriptStudioWindow (Transcript Studio)

- [ ] `features/transcript-studio/components/columns/ConceptsColumn.tsx:301` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{item.description}`
- [ ] `features/transcript-studio/components/settings/ModulePicker.tsx:56` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{m.description}`

### overlay userPreferences (Settings)

- [ ] `components/official/settings/primitives/SettingsRadioGroup.tsx:78` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{opt.description}`
- [ ] `components/official/settings/tree/SettingsDrawerNav.tsx:324` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{node.description}`
- [ ] `features/connectors/ConnectorPromptCard.tsx:164` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{provider.prompt.body}`
- [ ] `features/connectors/IntegrationDirectory.tsx:564` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{item.description}`
- [ ] `features/connectors/IntegrationDirectory.tsx:662` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{item.description}`
- [ ] `features/organizations/components/OrganizationCard.tsx:178` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{organization.description}`
- [ ] `features/settings/pages/FeedbackSettingsPage.tsx:596` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{item.description}`
- [ ] `features/settings/pages/IntegrationsSettingsPage.tsx:1179` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`

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

- [ ] `app/(admin)/administration/AdminDashboardClient.tsx:167` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{item.description}`

### route /administration/agents/agent-apps

- [ ] `app/(admin)/administration/agents/agent-apps/page.tsx:306` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tile.description}`

### route /administration/agents/bundles

- [ ] `features/tool-registry/bundles/components/BundlesAdminPage.tsx:277` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{b.description}`
- [ ] `features/tool-registry/bundles/components/BundlesAdminPage.tsx:933` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{r.description}`

### route /administration/agents/executor-surfaces

- [ ] `features/tool-registry/executor-surfaces/components/ExecutorSurfaceDetailPanel.tsx:197` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{executor.description}`
- [ ] `features/tool-registry/shared/ToolSearchDialog.tsx:270` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{tool.description}`

### route /administration/agents/mcp-servers

- [ ] `features/tool-registry/mcp-admin/components/McpServersAdminPage.tsx:704` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{server.description}`
- [ ] `features/tool-registry/mcp-admin/components/McpServersAdminPage.tsx:1086` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{c.notes}`

### route /administration/agents/mcp-tools

- [ ] `features/tool-call-visualization/admin/McpToolsManager.tsx:366` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{t.description}`

### route /administration/agents/mcp-tools/[toolId]

- [ ] `features/tool-call-visualization/admin/mcp-tools/ToolViewPage.tsx:137` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tool.description || ( <span className="text-muted-foreground italic">No description</…`
- [ ] `features/tool-registry/tools-admin/components/RegistryTab.tsx:706` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{meta.description}`
- [ ] `features/tool-registry/tools-admin/components/RegistryTab.tsx:752` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{g.description}`

### route /administration/agents/mcp-tools/[toolId]/ui

- [ ] `features/tool-call-visualization/admin/ToolUiComponentEditor.tsx:723` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{imp.description}`
- [ ] `features/tool-call-visualization/admin/ToolUiComponentEditor.tsx:1107` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{imp.description}`
- [ ] `features/tool-call-visualization/admin/ToolUiComponentGenerator.tsx:1169` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{selectedTool.description}`

### route /administration/agents/reports/agent-drift

- [ ] `features/agents/components/usages/UsageRowDetail.tsx:52` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{meta.description}`

### route /administration/agents/system-agents

- [ ] `app/(admin)/administration/agents/system-agents/page.tsx:291` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tile.description}`
- [ ] `app/(admin)/administration/agents/system-agents/page.tsx:330` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{action.description}`

### route /administration/agents/system-agents/agents/[id]

- [ ] `features/agents/route/AgentViewContent.tsx:944` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{slot.description}`

### route /administration/agents/system-agents/agents/[id]/build

- [ ] `features/agents/components/builder/message-builders/AddBlockButton.tsx:28` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/DecisionQuestionsEditor.tsx:41` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/MessageItem.tsx:45` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/MessageItem.tsx:47` — **MessageViewModeMenu (bespoke mode toggle)** (BANNED) — `@/features/agents/components/builder/message-builders/MessageViewModeMenu`
- [ ] `features/agents/components/builder/message-builders/MessageViewModeMenu.tsx:135` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{meta.description}`
- [ ] `features/agents/components/builder/message-builders/SpeechScriptEditor.tsx:60` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/system-instructions/SystemMessage.tsx:23` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/system-instructions/SystemMessage.tsx:27` — **MessageViewModeMenu (bespoke mode toggle)** (BANNED) — `@/features/agents/components/builder/message-builders/MessageViewModeMenu`
- [ ] `features/agents/components/settings-management/AgentSettingsCore.tsx:345` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: colored }}`
- [ ] `features/agents/components/settings-management/AgentSettingsCore.tsx:353` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: colored }}`
- [ ] `features/agents/components/tools-management/AgentBundlesPanel.tsx:448` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{bundle.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:1732` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tool.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:1949` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tool.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:2919` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:3415` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{selectedConfig.notes}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:3780` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:3895` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{pDef.description ?? "—"}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:4088` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tool.description}`
- [ ] `features/message-templates/components/TemplateBrowserModal.tsx:413` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{template.content}`

### route /administration/agents/system-agents/agents/[id]/shortcuts

- [ ] `features/agent-shortcuts/components/LinkAgentToShortcutModal.tsx:313` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{agent.description}`
- [ ] `features/agent-shortcuts/components/LinkAgentToShortcutModal.tsx:524` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{shortcut.description}`

### route /administration/agents/system-agents/agents/[id]/shortcuts/[shortcutId]

- [ ] `features/agent-shortcuts/components/DefaultContextPolicyValuesEditor.tsx:92` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{slot.description}`

### route /administration/agents/system-agents/agents/[id]/shortcuts/new

- [ ] `features/agent-shortcuts/components/DefaultContextPolicyValuesEditor.tsx:92` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{slot.description}`

### route /administration/agents/system-agents/agents/[id]/surfaces

- [ ] `features/surfaces/admin/columns/AgentColumn.tsx:63` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{agent.description}`
- [ ] `features/surfaces/admin/columns/AgentColumn.tsx:376` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{slot.description}`
- [ ] `features/surfaces/admin/columns/BindingColumn.tsx:498` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{surface.description}`
- [ ] `features/surfaces/admin/columns/SurfaceDetailsColumn.tsx:234` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{value.description}`

### route /administration/agents/system-agents/agents/[id]/surfaces/batch

- [ ] `features/surfaces/admin/columns/BindingColumn.tsx:498` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{surface.description}`

### route /administration/agents/system-agents/agents/[id]/widgets

- [ ] `features/agents/components/settings-management/AgentSettingsCore.tsx:345` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: colored }}`
- [ ] `features/agents/components/settings-management/AgentSettingsCore.tsx:353` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: colored }}`

### route /administration/agents/system-agents/agents/new

- [ ] `app/(admin)/administration/agents/system-agents/agents/new/page.tsx:54` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{option.description}`

### route /administration/agents/system-agents/categories

- [ ] `features/agent-shortcuts/components/CategoryTree.tsx:223` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{node.description}`

### route /administration/agents/system-agents/content-blocks

- [ ] `components/admin/ContentBlocksManager.tsx:138` — **hand-rolled AutoTextarea / AutoResizeTextarea** (BANNED) — `definition of AutoResizeTextarea`
- [ ] `components/admin/ContentBlocksManager.tsx:102` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### route /administration/agents/system-agents/edit/[id]

- [ ] `features/agent-shortcuts/components/DefaultContextPolicyValuesEditor.tsx:92` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{slot.description}`

### route /administration/agents/system-agents/lineage

- [ ] `features/agents/components/agent-listings/AgentLineageTree.tsx:408` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{agent.description ?? "No description"}`

### route /administration/agents/system-agents/shortcuts

- [ ] `features/agent-shortcuts/components/DefaultContextPolicyValuesEditor.tsx:92` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{slot.description}`
- [ ] `features/agent-shortcuts/components/ImportShortcutsBrowserModal.tsx:254` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{row.description}`
- [ ] `features/agent-shortcuts/components/ShortcutList.tsx:665` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{shortcut.description}`

### route /administration/agents/system-agents/shortcuts/all

- [ ] `features/agent-shortcuts/components/ShortcutDirectory.tsx:224` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{row.description}`

### route /administration/ai/ai-models

- [ ] `components/official/error-detail/ReplaceFailureBanner.tsx:24` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{explained.summary}`
- [ ] `features/ai-models/components/controls/ControlRuleRow.tsx:232` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{row.setting.description}`

### route /administration/ai/ai-models/aliases

- [ ] `features/ai-models/components/aliases/AliasesContainer.tsx:261` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{item.notes || "—"}`
- [ ] `features/ai-models/components/aliases/AliasesContainer.tsx:455` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.notes}`

### route /administration/ai/ai-models/audit

- [ ] `components/official/error-detail/ReplaceFailureBanner.tsx:24` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{explained.summary}`
- [ ] `features/ai-models/components/controls/ControlRuleRow.tsx:232` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{row.setting.description}`

### route /administration/ai/ai-models/deprecated-audit

- [ ] `components/official/error-detail/ReplaceFailureBanner.tsx:24` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{explained.summary}`

### route /administration/ai/ai-models/offerings

- [ ] `features/ai-models/components/ModelPricingEditor.tsx:233` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{opt.description}`

### route /administration/ai/ai-models/provider-sync

- [ ] `components/official/error-detail/ReplaceFailureBanner.tsx:24` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{explained.summary}`
- [ ] `features/ai-models/components/controls/ControlRuleRow.tsx:232` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{row.setting.description}`

### route /administration/ai/ai-models/settings

- [ ] `features/ai-models/components/settings/SettingTable.tsx:316` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{item.description || "—"}`

### route /administration/applications/catalogs

- [ ] `features/admin/applications/catalogs/components/AddFromLinkDialog.tsx:335` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{result.description}`
- [ ] `features/admin/applications/catalogs/components/CatalogEntryEditor.tsx:599` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{activeKindDef.description}`
- [ ] `features/admin/applications/catalogs/components/CatalogKindTable.tsx:413` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{def.description}`
- [ ] `features/admin/applications/catalogs/components/CatalogsClient.tsx:301` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.description || "—"}`

### route /administration/automation/scheduling/system-jobs

- [ ] `app/(admin)/administration/automation/scheduling/system-jobs/page.tsx:351` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{r.description}`

### route /administration/automation/scheduling/tasks

- [ ] `app/(admin)/administration/automation/scheduling/tasks/page.tsx:119` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{r.description}`

### route /administration/automation/scheduling/tasks/[id]

- [ ] `features/scheduling/components/detail/ScheduleDetail.tsx:557` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{task.description}`
- [ ] `features/scheduling/components/detail/SpecCard.tsx:131` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<pre>{task.prompt}`

### route /administration/automation/scheduling/templates

- [ ] `app/(admin)/administration/automation/scheduling/templates/page.tsx:49` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{s.description}`

### route /administration/automation/workflow-runs

- [ ] `components/official/drill-explorer/DrillExplorerHeadline.tsx:36` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<li>{fact.content}`

### route /administration/chat/cx-dashboard

- [ ] `components/ui/chart.tsx:88` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: Object.entries(THEMES) .map( ([theme, prefix]) => ' ${…`

### route /administration/compute/proof-runs

- [ ] `features/proof-runs/components/ProofRunsClient.tsx:147` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.summary}`
- [ ] `features/proof-runs/components/ProofRunsClient.tsx:572` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{scenario.description}`
- [ ] `features/proof-runs/components/ScenarioEditor.tsx:511` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{mandate.description}`

### route /administration/compute/resilience-lab

- [ ] `app/(admin)/administration/compute/resilience-lab/page.tsx:933` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{s.description}`

### route /administration/database

- [ ] `features/administration/database-hub/DatabaseHubLanding.tsx:204` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{section.description}`

### route /administration/database/data-integrity

- [ ] `app/(admin)/administration/database/data-integrity/page.tsx:272` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{row.description}`

### route /administration/database/enums

- [ ] `app/(admin)/administration/database/sql-functions/components/EnumDetail.tsx:269` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{enumType.description}`

### route /administration/database/relationships/planner

- [ ] `features/admin/relationships/access-planner/AccessPlannerImpl.tsx:1162` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{DISPOSITION_COPY[selectedTable.disposition].description}`

### route /administration/database/schema-visualizer-enhanced

- [ ] `components/matrx/resizable/DynamicResizableLayout.tsx:68` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{panel.content}`

### route /administration/database/sql-functions

- [ ] `app/(admin)/administration/database/sql-functions/components/SqlFunctionDetail.tsx:313` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{func.description}`

### route /administration/database/sql-queries

- [ ] `components/admin/query-history/query-history-overlay.tsx:392` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{query.description}`
- [ ] `features/notes/actions/CategoryNotesModal.tsx:370` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{note.content}`
- [ ] `features/notes/actions/CategoryNotesModal.tsx:547` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{note.content}`

### route /administration/hr/jurisdiction-rules/[ruleId]

- [ ] `features/admin/hr/jurisdiction-rules/components/JurisdictionRuleDetailClient.tsx:411` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{ruleClass.description}`

### route /administration/intelligence/mandates/[mandateKey]

- [ ] `features/agents/agent-creators/interactive-builder/AgentGenerator.tsx:779` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{mandate.summary}`
- [ ] `features/agents/agent-creators/interactive-builder/AgentJsonDisplay.tsx:317` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{data.description}`
- [ ] `features/bindings/OfferedInventoryColumn.tsx:183` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{value.description}`
- [ ] `features/mandates/admin/MandateDetailPanel.tsx:1652` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{offer.description}`
- [ ] `features/surfaces/components/bind/BindingSuggestionsTab.tsx:408` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{proposal.notes}`

### route /administration/intelligence/mandates/support/[mandateId]

- [ ] `features/agents/agent-creators/interactive-builder/AgentGenerator.tsx:779` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{mandate.summary}`
- [ ] `features/agents/agent-creators/interactive-builder/AgentJsonDisplay.tsx:317` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{data.description}`
- [ ] `features/bindings/OfferedInventoryColumn.tsx:183` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{value.description}`
- [ ] `features/mandates/admin/MandateDetailPanel.tsx:1652` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{offer.description}`
- [ ] `features/surfaces/components/bind/BindingSuggestionsTab.tsx:408` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{proposal.notes}`

### route /administration/knowledge/cms-agents

- [ ] `features/approvals/ApprovalQueue.tsx:939` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{item.body}`

### route /administration/knowledge/kg-cost

- [ ] `components/official/drill-explorer/DrillExplorerHeadline.tsx:36` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<li>{fact.content}`

### route /administration/knowledge/kg-cost/explore

- [ ] `components/official/drill-explorer/DrillExplorerHeadline.tsx:36` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<li>{fact.content}`

### route /administration/knowledge/research-system

- [ ] `features/research/admin/AgentWiringDashboard.tsx:178` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{constant.description}`
- [ ] `features/research/admin/AgentWiringDashboard.tsx:243` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{AGENT_CONFIG_META[key].description}`
- [ ] `features/research/admin/TemplatesManager.tsx:178` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{template.description || "No description"}`
- [ ] `features/research/admin/TemplatesManager.tsx:815` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{AGENT_CONFIG_META[key].description}`

### route /administration/knowledge/search-lab

- [ ] `features/rag/components/search/RagPageReferences.tsx:1069` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{group.description}`

### route /administration/knowledge/seo-value-settings

- [ ] `features/marketing/seo/value-system/settings/AutonomyModesEditor.tsx:191` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{capability.description}`

### route /administration/marketing/run-console

- [ ] `features/marketing/seo/run-console/RunHistoryPanel.tsx:359` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{run.summary}`

### route /administration/marketing/seo-operations

- [ ] `features/admin/seo-operations/SeoOperationsClient.tsx:630` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{spec.description}`

### route /administration/preview/one-binding-ui

- [ ] `app/(admin)/administration/preview/one-binding-ui/OneBindingUi.tsx:156` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{chosen.description}`
- [ ] `app/(admin)/administration/preview/one-binding-ui/OneBindingUi.tsx:311` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{v.description}`
- [ ] `app/(admin)/administration/preview/one-binding-ui/OneBindingUi.tsx:554` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{input.prompt || "What should we ask the user?"}`

### route /administration/preview/unified-management/batch

- [ ] `app/(admin)/administration/preview/unified-management/batch/TreatmentControls.tsx:158` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{m.description}`

### route /administration/preview/unified-management/places

- [ ] `app/(admin)/administration/preview/unified-management/places/CompletenessStrip.tsx:110` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{section.description}`
- [ ] `app/(admin)/administration/preview/unified-management/places/ManifestPanel.tsx:228` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{v.description}`
- [ ] `app/(admin)/administration/preview/unified-management/places/PlacesWorkspace.tsx:122` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{note.body}`

### route /administration/reporting/reports

- [ ] `features/reports/components/ReportsLanding.tsx:50` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{report.description}`

### route /administration/scopes-context/organizations/[orgId]

- [ ] `features/agent-context/components/scope-admin/ScopeInstancePanel.tsx:283` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{node.description}`

### route /administration/scopes-context/system-context

- [ ] `features/admin/system-context/FeedConfigEditor.tsx:480` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{meta.description}`
- [ ] `features/admin/system-context/ItemDialogs.tsx:409` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{CLASS_META[itemClass].description}`
- [ ] `features/admin/system-context/SystemContextConsole.tsx:309` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{row.description}`
- [ ] `features/admin/system-context/SystemContextPreview.tsx:69` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{e.description}`

### route /administration/shared-knowledge

- [ ] `features/admin/shared-knowledge/packs/PackBandsSection.tsx:283` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{b.description}`
- [ ] `features/admin/shared-knowledge/packs/PackBandsSection.tsx:284` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{b.notes}`
- [ ] `features/admin/shared-knowledge/packs/PackBandsSection.tsx:338` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{a.notes}`
- [ ] `features/admin/shared-knowledge/packs/PackMeaningSection.tsx:465` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`
- [ ] `features/admin/shared-knowledge/packs/PackMeaningSection.tsx:469` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.notes}`
- [ ] `features/admin/shared-knowledge/packs/PackTopicsSection.tsx:321` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{t.notes}`

### route /administration/ui/experimental-routes

- [ ] `app/(admin)/administration/ui/experimental-routes/page.tsx:131` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{section.description}`
- [ ] `app/(admin)/administration/ui/experimental-routes/page.tsx:170` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{route.description}`

### route /administration/ui/official-components

- [ ] `app/(admin)/administration/ui/official-components/page.tsx:277` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{component.description}`

### route /administration/ui/surfaces

- [ ] `features/surfaces/components/NewSurfaceDialog.tsx:265` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{t.description}`
- [ ] `features/surfaces/components/SurfaceCandidatesDialog.tsx:223` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{c.description}`
- [ ] `features/surfaces/components/SurfaceDetailPanel.tsx:264` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{surface.description || ( <em className="text-muted-foreground">no description</em> )}`
- [ ] `features/surfaces/components/SurfaceDetailPanel.tsx:322` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{tier.description}`
- [ ] `features/surfaces/components/SurfaceDetailPanel.tsx:334` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{READINESS_META[readinessBucketOf(surface)].description}`
- [ ] `features/surfaces/components/SurfaceValuesTable.tsx:193` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{display.description}`

### route /administration/ui/surfaces/[...name]

- [ ] `features/surfaces/admin-detail/SurfaceAdminDetailPage.tsx:920` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{t.description}`
- [ ] `features/surfaces/admin-detail/SurfaceAdminDetailPage.tsx:1234` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<td>{child.description ?? "—"}`
- [ ] `features/surfaces/components/NewSurfaceDialog.tsx:265` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{t.description}`
- [ ] `features/surfaces/components/SurfaceValuesTable.tsx:193` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{display.description}`
- [ ] `features/tool-registry/shared/ToolSearchDialog.tsx:270` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{tool.description}`

### route /administration/usage

- [ ] `components/official/drill-explorer/DrillExplorerHeadline.tsx:36` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<li>{fact.content}`

### route /administration/users/agent-review/[id]

- [ ] `features/admin/agent-review/components/AgentReviewWorkspace.tsx:609` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{item.description}`

### route /administration/users/announcements

- [ ] `features/admin/users/components/CreateAnnouncementDialog.tsx:146` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{type.description}`

### route /administration/users/change-policy

- [ ] `features/change-policy/components/AdminChangePolicyView.tsx:74` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{row.description}`

### route /administration/users/feedback

- [ ] `app/(admin)/administration/users/feedback/components/CategoriesTab.tsx:436` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{category.description}`
- [ ] `app/(admin)/administration/users/feedback/components/CategoriesTab.tsx:504` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{item.description}`
- [ ] `app/(admin)/administration/users/feedback/components/CategoriesTab.tsx:635` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{cat.description}`
- [ ] `app/(admin)/administration/users/feedback/components/EditAnnouncementDialog.tsx:191` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{type.description}`
- [ ] `app/(admin)/administration/users/feedback/components/FeedbackTable.tsx:533` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{r.description}`
- [ ] `app/(admin)/administration/users/feedback/components/RepoDiffProposalPanel.tsx:133` — **.split("\n").map(→ JSX) paragraph renderer** (review) — `proposal.unified_diff.split("\n").map((line, i) => ( <DiffLine key={i} line={line} /> ))`
- [ ] `features/admin/users/components/CreateAnnouncementDialog.tsx:146` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{type.description}`

### route /administration/users/invitations

- [ ] `features/admin/users/components/InvitationsTableClient.tsx:412` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{r.notes}`

### route /administration/users/meetings/[id]

- [ ] `features/meet/components/record/ActivityLogPanel.tsx:160` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{question.answer}`

### route /administration/users/preferences

- [ ] `features/admin/users/components/PreferencesTabClient.tsx:448` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{r.summary}`

### route /administration/utilities/content-blocks

- [ ] `components/admin/ContentBlocksManager.tsx:138` — **hand-rolled AutoTextarea / AutoResizeTextarea** (BANNED) — `definition of AutoResizeTextarea`
- [ ] `components/admin/ContentBlocksManager.tsx:102` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### route /administration/utilities/kind-registry/[kind]

- [ ] `features/content-ir/admin/KindVariantsTab.tsx:287` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{variant.description}`

### route /administration/utilities/markdown-tester

- [ ] `components/mardown-display/markdown-classification/custom-views/common/MarkdownTextDisplay.tsx:5` — **react-markdown** (BANNED) — `react-markdown` (type-only)
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/AstRendererView.tsx:76` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{node.content}`
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/AstRendererView.tsx:188` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{node.content}`
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/AstRendererView.tsx:203` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{node.content}`
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/LsiKeywordView.tsx:668` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{section.description}`
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/ModernAstRenderer.tsx:74` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{node.content}`
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/ModernAstRenderer.tsx:219` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{node.content}`
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/ModernAstRenderer.tsx:235` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{node.content}`
- [ ] `components/mardown-display/markdown-classification/markdown-processor-util.ts:21` — **remark-* plugins** (BANNED) — `remark-parse`
- [ ] `components/mardown-display/markdown-classification/markdown-processor-util.ts:22` — **remark-* plugins** (BANNED) — `remark-gfm`
- [ ] `components/mardown-display/markdown-classification/parts/CodeComponent.tsx:4` — **react-markdown** (BANNED) — `react-markdown` (type-only)
- [ ] `components/markdown-studio/AnalysisView.tsx:602` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.summary}`
- [ ] `components/markdown-studio/SampleLibrarySheet.tsx:244` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{sample.description}`
- [ ] `components/markdown-studio/SampleLibrarySheet.tsx:372` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{sample.description}`
- [ ] `components/markdown-studio/lab/BlockProcessingPanel.tsx:13` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `components/markdown-studio/lab/ServerEventInspector.tsx:28` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### route /administration/utilities/message-templates

- [ ] `features/message-templates/admin/MessageTemplateManager.tsx:77` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### route /administration/utilities/server-cache

- [ ] `components/admin/server-cache/ServerCacheManager.tsx:155` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`

### route /administration/utilities/taxonomy

- [ ] `features/admin/taxonomy/TaxonomyMap.tsx:66` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{domain.notes}`

### route /agent-apps/[id]

- [ ] `features/agent-apps/route/AgentAppOverviewContent.tsx:74` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{app.description}`

### route /agent-apps/[id]/code

- [ ] `features/code/views/extensions/ExtensionsPanel.tsx:116` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{tool.description}`

### route /agent-apps/[id]/settings

- [ ] `features/agent-apps/components/inputs/AgentAppCategoryPicker.tsx:204` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{opt.description}`

### route /agent-connections

- [ ] `features/agent-connections/components/sections/OverviewSection.tsx:151` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{card.description}`

### route /agent-connections/agents

- [ ] `features/agent-connections/components/sections/AgentsSection.tsx:145` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{agent.description ?? agent.id}`

### route /agent-connections/mcp-servers

- [ ] `features/agent-connections/components/sections/McpServersSection.tsx:264` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`
- [ ] `features/agent-connections/components/sections/McpServersSection.tsx:315` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tool.description}`

### route /agent-connections/preferences

- [ ] `components/official/settings/primitives/SettingsRadioGroup.tsx:78` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{opt.description}`

### route /agent-connections/render-blocks

- [ ] `features/agent-connections/components/sections/RenderBlocksSection.tsx:409` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{def.description}`

### route /agents/[id]

- [ ] `features/agents/route/AgentViewContent.tsx:944` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{slot.description}`

### route /agents/[id]/answers

- [ ] `features/agents/decision-review/components/ReviewQueue.tsx:431` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{selected.instructions ?? "Question text not recorded"}`

### route /agents/[id]/build

- [ ] `features/agents/components/builder/message-builders/AddBlockButton.tsx:28` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/DecisionQuestionsEditor.tsx:41` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/MessageItem.tsx:45` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/MessageItem.tsx:47` — **MessageViewModeMenu (bespoke mode toggle)** (BANNED) — `@/features/agents/components/builder/message-builders/MessageViewModeMenu`
- [ ] `features/agents/components/builder/message-builders/MessageViewModeMenu.tsx:135` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{meta.description}`
- [ ] `features/agents/components/builder/message-builders/SpeechScriptEditor.tsx:60` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/system-instructions/SystemMessage.tsx:23` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/system-instructions/SystemMessage.tsx:27` — **MessageViewModeMenu (bespoke mode toggle)** (BANNED) — `@/features/agents/components/builder/message-builders/MessageViewModeMenu`
- [ ] `features/agents/components/settings-management/AgentSettingsCore.tsx:345` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: colored }}`
- [ ] `features/agents/components/settings-management/AgentSettingsCore.tsx:353` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: colored }}`
- [ ] `features/agents/components/tools-management/AgentBundlesPanel.tsx:448` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{bundle.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:1732` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tool.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:1949` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tool.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:2919` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:3415` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{selectedConfig.notes}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:3780` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:3895` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{pDef.description ?? "—"}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:4088` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tool.description}`
- [ ] `features/message-templates/components/TemplateBrowserModal.tsx:413` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{template.content}`

### route /agents/[id]/shortcuts

- [ ] `features/agent-shortcuts/components/LinkAgentToShortcutModal.tsx:313` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{agent.description}`
- [ ] `features/agent-shortcuts/components/LinkAgentToShortcutModal.tsx:524` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{shortcut.description}`

### route /agents/[id]/shortcuts/old/edit/[shortcutId]

- [ ] `features/agent-shortcuts/components/DefaultContextPolicyValuesEditor.tsx:92` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{slot.description}`

### route /agents/[id]/shortcuts/old/new

- [ ] `features/agent-shortcuts/components/DefaultContextPolicyValuesEditor.tsx:92` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{slot.description}`

### route /agents/[id]/surfaces

- [ ] `features/surfaces/admin/columns/AgentColumn.tsx:63` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{agent.description}`
- [ ] `features/surfaces/admin/columns/AgentColumn.tsx:376` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{slot.description}`
- [ ] `features/surfaces/admin/columns/BindingColumn.tsx:498` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{surface.description}`
- [ ] `features/surfaces/admin/columns/SurfaceDetailsColumn.tsx:234` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{value.description}`

### route /agents/[id]/surfaces/batch

- [ ] `features/surfaces/admin/columns/BindingColumn.tsx:498` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{surface.description}`

### route /agents/[id]/widgets

- [ ] `features/agents/components/settings-management/AgentSettingsCore.tsx:345` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: colored }}`
- [ ] `features/agents/components/settings-management/AgentSettingsCore.tsx:353` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: colored }}`

### route /agents/battle/system-prompt

- [ ] `features/agents/components/builder/message-builders/AddBlockButton.tsx:28` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/DecisionQuestionsEditor.tsx:41` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/MessageViewModeMenu.tsx:135` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{meta.description}`
- [ ] `features/agents/components/builder/message-builders/SpeechScriptEditor.tsx:60` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/system-instructions/SystemMessage.tsx:23` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/system-instructions/SystemMessage.tsx:27` — **MessageViewModeMenu (bespoke mode toggle)** (BANNED) — `@/features/agents/components/builder/message-builders/MessageViewModeMenu`
- [ ] `features/message-templates/components/TemplateBrowserModal.tsx:413` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{template.content}`

### route /agents/battle/system-prompt/[setId]

- [ ] `features/agents/components/builder/message-builders/AddBlockButton.tsx:28` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/DecisionQuestionsEditor.tsx:41` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/MessageViewModeMenu.tsx:135` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{meta.description}`
- [ ] `features/agents/components/builder/message-builders/SpeechScriptEditor.tsx:60` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/system-instructions/SystemMessage.tsx:23` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/system-instructions/SystemMessage.tsx:27` — **MessageViewModeMenu (bespoke mode toggle)** (BANNED) — `@/features/agents/components/builder/message-builders/MessageViewModeMenu`
- [ ] `features/message-templates/components/TemplateBrowserModal.tsx:413` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{template.content}`

### route /agents/battle/tools

- [ ] `features/agents/components/tools-management/AgentBundlesPanel.tsx:448` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{bundle.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:1732` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tool.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:1949` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tool.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:2919` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:3415` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{selectedConfig.notes}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:3780` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:3895` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{pDef.description ?? "—"}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:4088` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tool.description}`

### route /agents/battle/tools/[setId]

- [ ] `features/agents/components/tools-management/AgentBundlesPanel.tsx:448` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{bundle.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:1732` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tool.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:1949` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tool.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:2919` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:3415` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{selectedConfig.notes}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:3780` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:3895` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{pDef.description ?? "—"}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:4088` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tool.description}`

### route /agents/battle/tuning

- [ ] `features/agents/components/settings-management/AgentSettingsCore.tsx:345` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: colored }}`
- [ ] `features/agents/components/settings-management/AgentSettingsCore.tsx:353` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: colored }}`

### route /agents/battle/tuning/[setId]

- [ ] `features/agents/components/settings-management/AgentSettingsCore.tsx:345` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: colored }}`
- [ ] `features/agents/components/settings-management/AgentSettingsCore.tsx:353` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: colored }}`

### route /agents/battle/variations

- [ ] `features/agents/components/builder/message-builders/AddBlockButton.tsx:28` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/DecisionQuestionsEditor.tsx:41` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/MessageItem.tsx:45` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/MessageItem.tsx:47` — **MessageViewModeMenu (bespoke mode toggle)** (BANNED) — `@/features/agents/components/builder/message-builders/MessageViewModeMenu`
- [ ] `features/agents/components/builder/message-builders/MessageViewModeMenu.tsx:135` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{meta.description}`
- [ ] `features/agents/components/builder/message-builders/SpeechScriptEditor.tsx:60` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/system-instructions/SystemMessage.tsx:23` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/system-instructions/SystemMessage.tsx:27` — **MessageViewModeMenu (bespoke mode toggle)** (BANNED) — `@/features/agents/components/builder/message-builders/MessageViewModeMenu`
- [ ] `features/agents/components/settings-management/AgentSettingsCore.tsx:345` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: colored }}`
- [ ] `features/agents/components/settings-management/AgentSettingsCore.tsx:353` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: colored }}`
- [ ] `features/agents/components/tools-management/AgentBundlesPanel.tsx:448` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{bundle.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:1732` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tool.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:1949` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tool.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:2919` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:3415` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{selectedConfig.notes}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:3780` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:3895` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{pDef.description ?? "—"}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:4088` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tool.description}`
- [ ] `features/message-templates/components/TemplateBrowserModal.tsx:413` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{template.content}`

### route /agents/battle/variations/[setId]

- [ ] `features/agents/components/builder/message-builders/AddBlockButton.tsx:28` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/DecisionQuestionsEditor.tsx:41` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/MessageItem.tsx:45` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/MessageItem.tsx:47` — **MessageViewModeMenu (bespoke mode toggle)** (BANNED) — `@/features/agents/components/builder/message-builders/MessageViewModeMenu`
- [ ] `features/agents/components/builder/message-builders/MessageViewModeMenu.tsx:135` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{meta.description}`
- [ ] `features/agents/components/builder/message-builders/SpeechScriptEditor.tsx:60` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/system-instructions/SystemMessage.tsx:23` — **HighlightedText (prompt {{var}} contentEditable)** (BANNED) — `@/features/agents/components/variables-management/HighlightedText`
- [ ] `features/agents/components/builder/message-builders/system-instructions/SystemMessage.tsx:27` — **MessageViewModeMenu (bespoke mode toggle)** (BANNED) — `@/features/agents/components/builder/message-builders/MessageViewModeMenu`
- [ ] `features/agents/components/settings-management/AgentSettingsCore.tsx:345` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: colored }}`
- [ ] `features/agents/components/settings-management/AgentSettingsCore.tsx:353` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: colored }}`
- [ ] `features/agents/components/tools-management/AgentBundlesPanel.tsx:448` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{bundle.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:1732` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tool.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:1949` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tool.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:2919` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:3415` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{selectedConfig.notes}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:3780` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:3895` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{pDef.description ?? "—"}`
- [ ] `features/agents/components/tools-management/AgentToolsManager.tsx:4088` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tool.description}`
- [ ] `features/message-templates/components/TemplateBrowserModal.tsx:413` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{template.content}`

### route /agents/categories

- [ ] `features/agent-shortcuts/components/CategoryTree.tsx:223` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{node.description}`

### route /agents/new

- [ ] `app/(core)/agents/new/page.tsx:122` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{option.description}`

### route /agents/new/builder

- [ ] `features/agents/agent-creators/interactive-builder/AgentBuilderPicker.tsx:75` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{option.description}`

### route /agents/new/builder/customizer

- [ ] `features/agents/agent-creators/chatbot-customizer/AIOptionComponents.tsx:144` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{item.description}`
- [ ] `features/agents/agent-creators/interactive-builder/ExperienceCustomizerBuilder.tsx:58` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{section.description}`

### route /agents/new/builder/tabs

- [ ] `features/agents/agent-creators/tabbed-builder/PreviewTab.tsx:55` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: highlightedPrompt.split('\n').join('<br>') }}`

### route /agents/new/generate

- [ ] `features/agents/agent-creators/interactive-builder/AgentGenerator.tsx:779` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{mandate.summary}`
- [ ] `features/agents/agent-creators/interactive-builder/AgentJsonDisplay.tsx:317` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{data.description}`

### route /agents/new/studio

- [ ] `app/(core)/agents/new/studio/page.tsx:120` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{approach.body}`

### route /agents/orchestras/[conductorId]

- [ ] `components/official/org-chart/OrgChart.tsx:1006` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{kind.description}`
- [ ] `features/agents/orchestras/components/ConductorInspector.tsx:77` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{agent.description}`
- [ ] `features/agents/orchestras/components/MemberInspector.tsx:197` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{meta.description}`
- [ ] `features/agents/orchestras/components/OrchestraBuilderCanvasImpl.tsx:146` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{agent?.description ?? "Presides over this Orchestra."}`
- [ ] `features/agents/orchestras/components/OrchestraMemberGrid.tsx:116` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{agent?.description ?? "Presides over this Orchestra."}`
- [ ] `features/agents/orchestras/components/OrchestraSettingsDialog.tsx:167` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{meta.description}`

### route /agents/org-chart

- [ ] `components/official/org-chart/OrgChart.tsx:1006` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{kind.description}`

### route /agents/shortcuts

- [ ] `features/agent-shortcuts/components/ShortcutList.tsx:665` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{shortcut.description}`

### route /agents/shortcuts/all

- [ ] `features/agent-shortcuts/components/ShortcutDirectory.tsx:224` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{row.description}`

### route /agents/shortcuts/edit/[id]

- [ ] `features/agent-shortcuts/components/DefaultContextPolicyValuesEditor.tsx:92` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{slot.description}`

### route /agents/shortcuts/new

- [ ] `features/agent-shortcuts/components/DefaultContextPolicyValuesEditor.tsx:92` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{slot.description}`

### route /agents/templates/[id]

- [ ] `app/(core)/agents/templates/[id]/page.tsx:78` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{template.description}`

### route /applets/[slug]

- [ ] `features/marketing/applets/AppletIntroPage.tsx:95` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{applet.description}`
- [ ] `features/templates/components/InstalledTemplate.tsx:244` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{s.body}`

### route /appointment-reminder

- [ ] `app/(public)/appointment-reminder/AppointmentReminder.tsx:76` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{appointment.notes}`

### route /approvals

- [ ] `features/approvals/ApprovalQueue.tsx:939` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{item.body}`

### route /artifacts

- [ ] `features/artifacts/components/CmsArtifactList.tsx:347` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{artifact.description || "—"}`

### route /artifacts/[id]

- [ ] `components/mardown-display/blocks/comparison/ComparisonTableBlock.tsx:590` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{comparison.description}`
- [ ] `components/mardown-display/blocks/cooking-recipes/cookingRecipeDisplay.tsx:554` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{step.description}`
- [ ] `components/mardown-display/blocks/cooking-recipes/cookingRecipeDisplay.tsx:582` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{recipe.notes}`
- [ ] `components/mardown-display/blocks/decision-tree/DecisionTreeBlock.tsx:399` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{node.description}`
- [ ] `components/mardown-display/blocks/decision-tree/DecisionTreeBlock.tsx:448` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{node.description}`
- [ ] `components/mardown-display/blocks/decision-tree/DecisionTreeBlock.tsx:593` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{decisionTree.description}`
- [ ] `components/mardown-display/blocks/decision-tree/DecisionTreeBlock.tsx:778` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{currentNode.description}`
- [ ] `components/mardown-display/blocks/map/MapCanvas.tsx:133` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{m.description}`
- [ ] `components/mardown-display/blocks/presentations/PresentationExportMenu.tsx:445` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{capabilities.pdf.description}`
- [ ] `components/mardown-display/blocks/presentations/PresentationExportMenu.tsx:464` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{capabilities.html.description}`
- [ ] `components/mardown-display/blocks/presentations/PresentationExportMenu.tsx:483` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{capabilities.powerpoint.description}`
- [ ] `components/mardown-display/blocks/presentations/PresentationExportMenu.tsx:527` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{capabilities.googleSlides.description}`
- [ ] `components/mardown-display/blocks/presentations/Slideshow.tsx:239` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{p.description}`
- [ ] `components/mardown-display/blocks/progress/ProgressTrackerBlock.tsx:411` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tracker.description}`
- [ ] `components/mardown-display/blocks/research/ResearchBlock.tsx:560` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{theme.description}`
- [ ] `components/mardown-display/blocks/resources/ResourceCollectionBlock.tsx:333` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{collection.description}`
- [ ] `components/mardown-display/blocks/resources/ResourceCollectionBlock.tsx:497` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{resource.description}`
- [ ] `components/mardown-display/blocks/timeline/TimelineBlock.tsx:418` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{event.description}`
- [ ] `components/mardown-display/blocks/troubleshooting/TroubleshootingBlock.tsx:399` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{troubleshooting.description}`
- [ ] `components/mardown-display/blocks/troubleshooting/TroubleshootingBlock.tsx:605` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{step.description}`
- [ ] `features/artifacts/components/CmsArtifactDetail.tsx:510` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{artifact.description}`

### route /board/[id]

- [ ] `features/education/kits/components/KitHub.tsx:805` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{stage.description}`
- [ ] `features/flashcards/components/create/LiveGenerationPreview.tsx:15` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/flashcards/components/set-detail/DeckCardViews.tsx:44` — **CardFaceContent** (tracked) — `@/components/mardown-display/blocks/flashcards/CardFaceContent`
- [ ] `features/flashcards/components/set-detail/IllustrateSetWindow.tsx:139` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{judgment.reasoning}`
- [ ] `features/flashcards/components/set-detail/MergeCardsDialog.tsx:29` — **CardFaceContent** (tracked) — `@/components/mardown-display/blocks/flashcards/CardFaceContent`
- [ ] `features/flashcards/components/set-detail/SetDetailView.tsx:110` — **CardFaceContent** (tracked) — `@/components/mardown-display/blocks/flashcards/CardFaceContent`
- [ ] `features/flashcards/components/set-detail/SetDetailView.tsx:1230` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{m.description}`
- [ ] `features/flashcards/components/set-detail/SetDetailView.tsx:1438` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{data.set.description}`
- [ ] `features/meet/components/record/ActivityLogPanel.tsx:160` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{question.answer}`
- [ ] `features/research/components/init/TemplatePicker.tsx:85` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{template.description}`
- [ ] `features/resource-manager/source-input/components/SourceCard.tsx:190` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{DELIVERY_WORDS.context.summary}`
- [ ] `features/scope-system/components/EditScopeValueSheet.tsx:236` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.description}`
- [ ] `features/scope-system/components/NewScopeInline.tsx:395` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`
- [ ] `features/scope-system/components/ScopeDetailEditor.tsx:357` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{scope.description}`
- [ ] `features/scope-system/components/ScopeFieldInput.tsx:320` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{row.description}`

### route /c/[handle]

- [ ] `features/education/creators/components/CreatorLandingPage.tsx:174` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}`

### route /canvas/discover

- [ ] `features/canvas/discovery/CanvasCard.tsx:109` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{canvas.description}`

### route /canvas/shared/[token]

- [ ] `components/mardown-display/blocks/comparison/ComparisonTableBlock.tsx:590` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{comparison.description}`
- [ ] `components/mardown-display/blocks/cooking-recipes/cookingRecipeDisplay.tsx:554` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{step.description}`
- [ ] `components/mardown-display/blocks/cooking-recipes/cookingRecipeDisplay.tsx:582` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{recipe.notes}`
- [ ] `components/mardown-display/blocks/decision-tree/DecisionTreeBlock.tsx:399` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{node.description}`
- [ ] `components/mardown-display/blocks/decision-tree/DecisionTreeBlock.tsx:448` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{node.description}`
- [ ] `components/mardown-display/blocks/decision-tree/DecisionTreeBlock.tsx:593` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{decisionTree.description}`
- [ ] `components/mardown-display/blocks/decision-tree/DecisionTreeBlock.tsx:778` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{currentNode.description}`
- [ ] `components/mardown-display/blocks/map/MapCanvas.tsx:133` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{m.description}`
- [ ] `components/mardown-display/blocks/presentations/PresentationExportMenu.tsx:445` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{capabilities.pdf.description}`
- [ ] `components/mardown-display/blocks/presentations/PresentationExportMenu.tsx:464` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{capabilities.html.description}`
- [ ] `components/mardown-display/blocks/presentations/PresentationExportMenu.tsx:483` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{capabilities.powerpoint.description}`
- [ ] `components/mardown-display/blocks/presentations/PresentationExportMenu.tsx:527` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{capabilities.googleSlides.description}`
- [ ] `components/mardown-display/blocks/presentations/Slideshow.tsx:239` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{p.description}`
- [ ] `components/mardown-display/blocks/progress/ProgressTrackerBlock.tsx:411` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tracker.description}`
- [ ] `components/mardown-display/blocks/research/ResearchBlock.tsx:560` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{theme.description}`
- [ ] `components/mardown-display/blocks/resources/ResourceCollectionBlock.tsx:333` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{collection.description}`
- [ ] `components/mardown-display/blocks/resources/ResourceCollectionBlock.tsx:497` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{resource.description}`
- [ ] `components/mardown-display/blocks/timeline/TimelineBlock.tsx:418` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{event.description}`
- [ ] `components/mardown-display/blocks/troubleshooting/TroubleshootingBlock.tsx:399` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{troubleshooting.description}`
- [ ] `components/mardown-display/blocks/troubleshooting/TroubleshootingBlock.tsx:605` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{step.description}`

### route /chat/message-templates

- [ ] `features/message-templates/components/TemplateCard.tsx:95` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{template.content}`

### route /cms/[siteId]/pages/[pageId]

- [ ] `features/marketing/components/pages/PageContentCard.tsx:21` — **MarkdownPreview** (tracked) — `@/features/files/components/core/FilePreview/previewers/MarkdownPreview`
- [ ] `features/marketing/components/pages/cards/PageBlockedChecksCard.tsx:179` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<li>{check.reasoning || check.itemKey}`
- [ ] `features/marketing/components/pages/cards/PageDraftContentCard.tsx:43` — **BasicContentEditor (split editor)** (BANNED) — `@/components/content-refine/BasicContentEditor`
- [ ] `features/marketing/content-plan/components/NodeStepRail.tsx:237` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{artifact.summary}`
- [ ] `features/marketing/content-plan/components/NodeStepRail.tsx:379` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{current.summary}`
- [ ] `features/marketing/content-plan/components/PageDraftEditor.tsx:615` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.summary}`

### route /cms/[siteId]/pages/new

- [ ] `features/marketing/components/pages/PageContentCard.tsx:21` — **MarkdownPreview** (tracked) — `@/features/files/components/core/FilePreview/previewers/MarkdownPreview`
- [ ] `features/marketing/components/pages/cards/PageBlockedChecksCard.tsx:179` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<li>{check.reasoning || check.itemKey}`
- [ ] `features/marketing/components/pages/cards/PageDraftContentCard.tsx:43` — **BasicContentEditor (split editor)** (BANNED) — `@/components/content-refine/BasicContentEditor`
- [ ] `features/marketing/content-plan/components/NodeStepRail.tsx:237` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{artifact.summary}`
- [ ] `features/marketing/content-plan/components/NodeStepRail.tsx:379` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{current.summary}`
- [ ] `features/marketing/content-plan/components/PageDraftEditor.tsx:615` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.summary}`

### route /code

- [ ] `features/code/views/extensions/ExtensionsPanel.tsx:116` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{tool.description}`

### route /commerce/intake/answer

- [ ] `features/commerce-intake/components/IntakeAnswerQueue.tsx:282` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{question.prompt}`

### route /compare/old/data-stores

- [ ] `features/rag/components/data-stores/DataStoresPage.tsx:379` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{store.description}`
- [ ] `features/rag/components/data-stores/DataStoresPage.tsx:923` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{s.description}`
- [ ] `features/rag/components/data-stores/DataStoresPage.tsx:1135` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<td>{m.notes ?? "—"}`

### route /compare/old/knowledge-home

- [ ] `app/(core)/compare/old/_restored/LibraryCatalogPane.tsx:93` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{it.description}`

### route /compare/old/library-catalog

- [ ] `features/rag/components/library-catalog/LibraryCatalogPage.tsx:613` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{item.description}`
- [ ] `features/rag/components/library-catalog/LibraryCatalogPage.tsx:694` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`
- [ ] `features/rag/components/library-catalog/PackDetailPanel.tsx:246` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`
- [ ] `features/rag/components/library-catalog/RulebookDetailPanel.tsx:262` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`

### route /compare/old/transcripts

- [ ] `features/transcripts/browse/TranscriptBrowseCards.tsx:88` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{row.description}`
- [ ] `features/transcripts/browse/columns.tsx:334` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.description}`

### route /connected-sources

- [ ] `features/connected-sources/components/ReadResultsDialog.tsx:151` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{c.content}`
- [ ] `features/connected-sources/components/ReadResultsDialog.tsx:164` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<li>{r.content}`

### route /context-items

- [ ] `features/scope-system/components/ContextItemsHub.tsx:853` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`

### route /crm/[partyId]

- [ ] `features/connectors/ConnectorPromptCard.tsx:164` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{provider.prompt.body}`
- [ ] `features/crm/components/record/JournalistIntelligenceCard.tsx:229` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{activity?.summary ?? "Not checked yet."}`
- [ ] `features/crm/components/record/JournalistIntelligenceCard.tsx:285` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{beat.summary}`

### route /crm/chasebox

- [ ] `features/crm/chasebox/components/ChaseboxDraftDialog.tsx:509` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<pre>{draft.body || "(this draft has no body)"}`
- [ ] `features/crm/chasebox/components/ChaseboxPage.tsx:301` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{meta.description}`

### route /crm/inbox

- [ ] `features/crm/components/outreach-lists/SingleSendDialog.tsx:437` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<pre>{draft.body}`
- [ ] `features/crm/pre-send-check/PreSendCheckPanel.tsx:15` — **MarkdownRenderer** (tracked) — `@/components/mardown-display/MarkdownRenderer`

### route /crm/outreach-lists

- [ ] `features/crm/components/outreach-lists/OutreachListsPage.tsx:118` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.description}`

### route /crm/outreach-lists/[listId]

- [ ] `features/crm/components/outreach-lists/OutreachListDetailPage.tsx:506` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.notes ?? "—"}`
- [ ] `features/crm/components/outreach-lists/OutreachListDetailPage.tsx:738` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{list.description}`
- [ ] `features/crm/components/outreach-lists/SingleSendDialog.tsx:437` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<pre>{draft.body}`
- [ ] `features/crm/pre-send-check/PreSendCheckPanel.tsx:15` — **MarkdownRenderer** (tracked) — `@/components/mardown-display/MarkdownRenderer`

### route /crm/outreach-lists/[listId]/dial

- [ ] `features/crm/components/outreach-lists/CallQueuePage.tsx:688` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{entry.member.notes}`
- [ ] `features/crm/components/outreach-lists/CallQueuePage.tsx:713` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{i.body}`

### route /crm/sending-identities

- [ ] `features/crm/components/sending-identities/AcceptSendingRulesDialog.tsx:88` — **.split("\n").map(→ JSX) paragraph renderer** (review) — `SENDING_RULES_TEXT.split("\n") .slice(2) .map((line) => line.replace(/^\d+\.\s*/, "")) .f…`

### route /dashboard

- [ ] `features/connectors/ConnectorPromptCard.tsx:164` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{provider.prompt.body}`
- [ ] `features/dashboard/components/DiscoverSection.tsx:34` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`

### route /decisions/review

- [ ] `features/agents/decision-review/components/ReviewQueue.tsx:431` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{selected.instructions ?? "Question text not recorded"}`

### route /developers/oauth

- [ ] `app/(public)/developers/oauth/page.tsx:267` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{scope.description}`

### route /documents

- [ ] `features/documents/components/DocumentListCard.tsx:49` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{doc.description}`
- [ ] `features/documents/components/DocumentsHubTable.tsx:56` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{doc.description || "—"}`

### route /education/audio-study/review

- [ ] `features/education/media/audio/components/AudioReviewSession.tsx:3` — **CardFaceContent** (tracked) — `@/components/mardown-display/blocks/flashcards/CardFaceContent`

### route /education/classes

- [ ] `features/education/classes/components/AccessModeField.tsx:60` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{ACCESS_MODES.find((m) => m.value === value)?.description}`

### route /education/classes/[classId]

- [ ] `features/education/classes/components/AccessModeField.tsx:60` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{ACCESS_MODES.find((m) => m.value === value)?.description}`
- [ ] `features/education/classes/components/ClassAccessPanel.tsx:116` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{modeMeta?.description}`
- [ ] `features/education/classes/components/ClassHubView.tsx:502` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{cls.description}`
- [ ] `features/education/classes/components/ClassHubView.tsx:654` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{state.description}`
- [ ] `features/resource-manager/source-input/components/SourceCard.tsx:190` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{DELIVERY_WORDS.context.summary}`

### route /education/classes/join

- [ ] `features/education/classes/components/JoinClassView.tsx:131` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{preview.description}`

### route /education/exam-prep/[slug]

- [ ] `features/education/components/AxisDetail.tsx:121` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"), }}`
- [ ] `features/education/components/ExamHubActions.tsx:84` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{a.description}`
- [ ] `features/education/library/components/DeckCard.tsx:76` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{deck.description}`

### route /education/family/[studentId]

- [ ] `components/ui/chart.tsx:88` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: Object.entries(THEMES) .map( ([theme, prefix]) => ' ${…`

### route /education/fastfire

- [ ] `features/education/study/components/BatchReviewBlock.tsx:65` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/education/tutor/components/LiveHelpAnswerBlock.tsx:63` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{result.answer}`
- [ ] `features/flashcards/fast-fire/components/FastFireLiveCard.tsx:46` — **CardFaceContent** (tracked) — `@/components/mardown-display/blocks/flashcards/CardFaceContent`
- [ ] `features/flashcards/fast-fire/components/FastFireReviewPlaylist.tsx:22` — **CardFaceContent** (tracked) — `@/components/mardown-display/blocks/flashcards/CardFaceContent`
- [ ] `features/flashcards/fast-fire/components/FastFireScoreboard.tsx:30` — **CardFaceContent** (tracked) — `@/components/mardown-display/blocks/flashcards/CardFaceContent`
- [ ] `features/flashcards/fast-fire/components/FastFireSetPicker.tsx:189` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{set.description ?? dateLabel}`

### route /education/features/[slug]

- [ ] `features/education/components/AxisDetail.tsx:121` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"), }}`
- [ ] `features/education/components/ExamHubActions.tsx:84` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{a.description}`
- [ ] `features/education/library/components/DeckCard.tsx:76` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{deck.description}`

### route /education/flashcards/[setId]

- [ ] `features/flashcards/components/create/LiveGenerationPreview.tsx:15` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/flashcards/components/set-detail/DeckCardViews.tsx:44` — **CardFaceContent** (tracked) — `@/components/mardown-display/blocks/flashcards/CardFaceContent`
- [ ] `features/flashcards/components/set-detail/IllustrateSetWindow.tsx:139` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{judgment.reasoning}`
- [ ] `features/flashcards/components/set-detail/MergeCardsDialog.tsx:29` — **CardFaceContent** (tracked) — `@/components/mardown-display/blocks/flashcards/CardFaceContent`
- [ ] `features/flashcards/components/set-detail/SetDetailView.tsx:110` — **CardFaceContent** (tracked) — `@/components/mardown-display/blocks/flashcards/CardFaceContent`
- [ ] `features/flashcards/components/set-detail/SetDetailView.tsx:1230` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{m.description}`
- [ ] `features/flashcards/components/set-detail/SetDetailView.tsx:1438` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{data.set.description}`
- [ ] `features/resource-manager/source-input/components/SourceCard.tsx:190` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{DELIVERY_WORDS.context.summary}`

### route /education/flashcards/[setId]/edit

- [ ] `features/flashcards/components/editor/EditSetView.tsx:90` — **CardFaceContent** (tracked) — `@/components/mardown-display/blocks/flashcards/CardFaceContent`

### route /education/flashcards/[setId]/learn

- [ ] `components/mardown-display/blocks/memory-aid/MemoryAidBlock.tsx:178` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{controls.editor.content}`
- [ ] `components/mardown-display/blocks/memory-aid/MemoryAidBlock.tsx:225` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{controls.editor.content}`
- [ ] `components/mardown-display/blocks/memory-aid/MemoryAidBlock.tsx:249` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{controls.editor.content}`
- [ ] `components/mardown-display/blocks/memory-aid/MemoryAidBlock.tsx:292` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{controls.editor.content}`
- [ ] `components/mardown-display/blocks/memory-aid/MemoryHintBlock.tsx:89` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{hint.explanation}`
- [ ] `features/education/study/components/BatchReviewBlock.tsx:65` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/education/tutor/components/LiveHelpAnswerBlock.tsx:63` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{result.answer}`
- [ ] `features/flashcards/components/study/study-deck-parts.tsx:20` — **CardFaceContent** (tracked) — `@/components/mardown-display/blocks/flashcards/CardFaceContent`

### route /education/flashcards/[setId]/match

- [ ] `components/mardown-display/blocks/flashcards/CardFaceBlock.tsx:16` — **CardFaceContent** (tracked) — `./CardFaceContent`

### route /education/flashcards/[setId]/sessions

- [ ] `components/ui/chart.tsx:88` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: Object.entries(THEMES) .map( ([theme, prefix]) => ' ${…`
- [ ] `features/flashcards/components/set-detail/DeckProgressView.tsx:59` — **CardFaceContent** (tracked) — `@/components/mardown-display/blocks/flashcards/CardFaceContent`

### route /education/flashcards/[setId]/study

- [ ] `components/mardown-display/blocks/memory-aid/MemoryAidBlock.tsx:178` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{controls.editor.content}`
- [ ] `components/mardown-display/blocks/memory-aid/MemoryAidBlock.tsx:225` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{controls.editor.content}`
- [ ] `components/mardown-display/blocks/memory-aid/MemoryAidBlock.tsx:249` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{controls.editor.content}`
- [ ] `components/mardown-display/blocks/memory-aid/MemoryAidBlock.tsx:292` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{controls.editor.content}`
- [ ] `components/mardown-display/blocks/memory-aid/MemoryHintBlock.tsx:89` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{hint.explanation}`
- [ ] `features/education/study/components/BatchReviewBlock.tsx:65` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/education/tutor/components/LiveHelpAnswerBlock.tsx:63` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{result.answer}`
- [ ] `features/flashcards/components/study/study-deck-parts.tsx:20` — **CardFaceContent** (tracked) — `@/components/mardown-display/blocks/flashcards/CardFaceContent`

### route /education/flashcards/[setId]/test

- [ ] `components/mardown-display/blocks/flashcards/CardFaceBlock.tsx:16` — **CardFaceContent** (tracked) — `./CardFaceContent`
- [ ] `features/flashcards/components/study/TestSurface.tsx:258` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{current.explanation}`

### route /education/flashcards/[setId]/write

- [ ] `components/mardown-display/blocks/flashcards/CardFaceBlock.tsx:16` — **CardFaceContent** (tracked) — `./CardFaceContent`

### route /education/flashcards/new

- [ ] `features/flashcards/components/create/LiveGenerationPreview.tsx:15` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/resource-manager/source-input/components/SourceCard.tsx:190` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{DELIVERY_WORDS.context.summary}`

### route /education/flashcards/review

- [ ] `components/mardown-display/blocks/memory-aid/MemoryAidBlock.tsx:178` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{controls.editor.content}`
- [ ] `components/mardown-display/blocks/memory-aid/MemoryAidBlock.tsx:225` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{controls.editor.content}`
- [ ] `components/mardown-display/blocks/memory-aid/MemoryAidBlock.tsx:249` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{controls.editor.content}`
- [ ] `components/mardown-display/blocks/memory-aid/MemoryAidBlock.tsx:292` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{controls.editor.content}`
- [ ] `components/mardown-display/blocks/memory-aid/MemoryHintBlock.tsx:89` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{hint.explanation}`
- [ ] `features/education/study/components/BatchReviewBlock.tsx:65` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/education/tutor/components/LiveHelpAnswerBlock.tsx:63` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{result.answer}`
- [ ] `features/flashcards/components/study/study-deck-parts.tsx:20` — **CardFaceContent** (tracked) — `@/components/mardown-display/blocks/flashcards/CardFaceContent`

### route /education/flashcards/sessions/[sessionId]

- [ ] `features/education/study/components/BatchReviewBlock.tsx:65` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/education/study/components/SessionDetailView.tsx:562` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{label.answer}`

### route /education/flashcards/weak-areas

- [ ] `components/mardown-display/blocks/memory-aid/MemoryAidBlock.tsx:178` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{controls.editor.content}`
- [ ] `components/mardown-display/blocks/memory-aid/MemoryAidBlock.tsx:225` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{controls.editor.content}`
- [ ] `components/mardown-display/blocks/memory-aid/MemoryAidBlock.tsx:249` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{controls.editor.content}`
- [ ] `components/mardown-display/blocks/memory-aid/MemoryAidBlock.tsx:292` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{controls.editor.content}`
- [ ] `components/mardown-display/blocks/memory-aid/MemoryHintBlock.tsx:89` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{hint.explanation}`
- [ ] `features/education/study/components/BatchReviewBlock.tsx:65` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/education/tutor/components/LiveHelpAnswerBlock.tsx:63` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{result.answer}`
- [ ] `features/flashcards/components/study/study-deck-parts.tsx:20` — **CardFaceContent** (tracked) — `@/components/mardown-display/blocks/flashcards/CardFaceContent`

### route /education/game

- [ ] `features/education/engage/components/badges/BadgeShelf.tsx:47` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{def.description}`

### route /education/game/play/[roomId]

- [ ] `features/education/engage/components/play/PlaySurface.tsx:111` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{question.prompt}`

### route /education/game/solo

- [ ] `features/education/engage/components/play/PlaySurface.tsx:111` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{question.prompt}`

### route /education/kits/[sourceId]

- [ ] `features/education/kits/components/KitHub.tsx:805` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{stage.description}`

### route /education/kits/new

- [ ] `features/resource-manager/source-input/components/SourceCard.tsx:190` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{DELIVERY_WORDS.context.summary}`

### route /education/learn/[...slug]

- [ ] `features/education/components/LearnArticle.tsx:62` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"), }}`

### route /education/levels/[slug]

- [ ] `features/education/components/AxisDetail.tsx:121` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"), }}`
- [ ] `features/education/components/ExamHubActions.tsx:84` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{a.description}`
- [ ] `features/education/library/components/DeckCard.tsx:76` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{deck.description}`

### route /education/library

- [ ] `features/education/library/columns.tsx:44` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{row.description}`

### route /education/library/community

- [ ] `features/education/library/components/DeckCard.tsx:76` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{deck.description}`

### route /education/media/[id]

- [ ] `components/mardown-display/blocks/memory-aid/MemoryAidBlock.tsx:178` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{controls.editor.content}`
- [ ] `components/mardown-display/blocks/memory-aid/MemoryAidBlock.tsx:225` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{controls.editor.content}`
- [ ] `components/mardown-display/blocks/memory-aid/MemoryAidBlock.tsx:249` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{controls.editor.content}`
- [ ] `components/mardown-display/blocks/memory-aid/MemoryAidBlock.tsx:292` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{controls.editor.content}`
- [ ] `features/education/media/mindmap/components/MindMapView.tsx:3` — **CardFaceContent** (tracked) — `@/components/mardown-display/blocks/flashcards/CardFaceContent`
- [ ] `features/education/media/mindmap/components/MindMapView.tsx:116` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{node.description}`
- [ ] `features/education/media/mindmap/components/MindMapView.tsx:195` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{node.description}`

### route /education/memory/[id]

- [ ] `components/mardown-display/blocks/memory-aid/MemoryAidBlock.tsx:178` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{controls.editor.content}`
- [ ] `components/mardown-display/blocks/memory-aid/MemoryAidBlock.tsx:225` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{controls.editor.content}`
- [ ] `components/mardown-display/blocks/memory-aid/MemoryAidBlock.tsx:249` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{controls.editor.content}`
- [ ] `components/mardown-display/blocks/memory-aid/MemoryAidBlock.tsx:292` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{controls.editor.content}`

### route /education/memory/[id]/edit

- [ ] `components/mardown-display/blocks/memory-aid/MemoryAidBlock.tsx:178` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{controls.editor.content}`
- [ ] `components/mardown-display/blocks/memory-aid/MemoryAidBlock.tsx:225` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{controls.editor.content}`
- [ ] `components/mardown-display/blocks/memory-aid/MemoryAidBlock.tsx:249` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{controls.editor.content}`
- [ ] `components/mardown-display/blocks/memory-aid/MemoryAidBlock.tsx:292` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{controls.editor.content}`

### route /education/mind-maps/[id]

- [ ] `features/education/media/mindmap/components/MindMapView.tsx:3` — **CardFaceContent** (tracked) — `@/components/mardown-display/blocks/flashcards/CardFaceContent`
- [ ] `features/education/media/mindmap/components/MindMapView.tsx:116` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{node.description}`
- [ ] `features/education/media/mindmap/components/MindMapView.tsx:195` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{node.description}`

### route /education/mind-maps/[id]/edit

- [ ] `features/education/media/mindmap/components/MindMapView.tsx:3` — **CardFaceContent** (tracked) — `@/components/mardown-display/blocks/flashcards/CardFaceContent`
- [ ] `features/education/media/mindmap/components/MindMapView.tsx:116` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{node.description}`
- [ ] `features/education/media/mindmap/components/MindMapView.tsx:195` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{node.description}`

### route /education/overview

- [ ] `features/education/library/columns.tsx:44` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{row.description}`

### route /education/practice-oral

- [ ] `features/education/spoken-practice/components/PracticeRunner.tsx:117` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{current.prompt}`
- [ ] `features/education/spoken-practice/components/PracticeRunner.tsx:266` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{pronunciation.notes}`
- [ ] `features/education/study/components/BatchReviewBlock.tsx:65` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`

### route /education/practice-tests/[id]

- [ ] `features/education/assessment/components/AssessmentDetail.tsx:309` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{assessment.description}`

### route /education/practice-tests/[id]/results

- [ ] `features/education/assessment/components/AssessmentDetail.tsx:309` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{assessment.description}`
- [ ] `features/education/assessment/components/results/AssessmentResults.tsx:303` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.prompt}`
- [ ] `features/education/assessment/components/results/AssessmentResults.tsx:319` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.explanation}`
- [ ] `features/education/assessment/components/results/AssessmentResults.tsx:331` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{d.explanation}`

### route /education/progress

- [ ] `components/ui/chart.tsx:88` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: Object.entries(THEMES) .map( ([theme, prefix]) => ' ${…`

### route /education/quizzes/[id]

- [ ] `features/education/assessment/components/AssessmentDetail.tsx:309` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{assessment.description}`

### route /education/quizzes/[id]/results

- [ ] `features/education/assessment/components/AssessmentDetail.tsx:309` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{assessment.description}`
- [ ] `features/education/assessment/components/results/AssessmentResults.tsx:303` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.prompt}`
- [ ] `features/education/assessment/components/results/AssessmentResults.tsx:319` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.explanation}`
- [ ] `features/education/assessment/components/results/AssessmentResults.tsx:331` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{d.explanation}`

### route /education/start

- [ ] `features/resource-manager/source-input/components/SourceCard.tsx:190` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{DELIVERY_WORDS.context.summary}`

### route /education/study-aids/[slug]

- [ ] `features/education/components/AxisDetail.tsx:121` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"), }}`
- [ ] `features/education/components/ExamHubActions.tsx:84` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{a.description}`
- [ ] `features/education/library/components/DeckCard.tsx:76` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{deck.description}`

### route /education/subjects/[slug]

- [ ] `features/education/components/AxisDetail.tsx:121` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"), }}`
- [ ] `features/education/components/ExamHubActions.tsx:84` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{a.description}`
- [ ] `features/education/library/components/DeckCard.tsx:76` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{deck.description}`

### route /exports/[libraryId]

- [ ] `features/exports/components/SendToRulebookDialog.tsx:307` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{rulebook.description}`

### route /files/webhooks

- [ ] `features/files/webhooks/components/WebhooksManager.tsx:258` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{webhook.description}`

### route /free/zip-code-heatmap

- [ ] `app/(public)/free/zip-code-heatmap/components/ColorScaleSelector.tsx:105` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{SCALING_METHODS[options.scalingMethod].description}`
- [ ] `app/(public)/free/zip-code-heatmap/components/TableDataSource.tsx:253` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{table.description}`
- [ ] `app/(public)/free/zip-code-heatmap/components/ViewModeSelector.tsx:62` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{mode.description}`

### route /free/zip-code-heatmap/[id]

- [ ] `app/(public)/free/zip-code-heatmap/[id]/page.tsx:183` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{heatmap.description}`
- [ ] `app/(public)/free/zip-code-heatmap/components/ColorScaleSelector.tsx:105` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{SCALING_METHODS[options.scalingMethod].description}`

### route /google-other-contacts-review

- [ ] `features/google-workspace/OtherContactsReview.tsx:305` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{field.explanation || "The server did not return an explanation for this field."}`

### route /google-workspace-review

- [ ] `features/connected-sources/components/ReadResultsDialog.tsx:151` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{c.content}`
- [ ] `features/connected-sources/components/ReadResultsDialog.tsx:164` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<li>{r.content}`

### route /hr

- [ ] `app/(core)/hr/page.tsx:106` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{door.description}`

### route /hr/me

- [ ] `features/hr/shared/EffectiveDatedForm.tsx:347` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{intent.prompt}`

### route /hr/me/timesheet

- [ ] `features/hr/time/shared/timing.tsx:194` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{note.body}`

### route /hr/people/[employeeId]

- [ ] `features/hr/shared/EffectiveDatedForm.tsx:347` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{intent.prompt}`

### route /hr/people/[employeeId]/[tab]

- [ ] `features/hr/shared/EffectiveDatedForm.tsx:347` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{intent.prompt}`

### route /hr/people/[employeeId]/c/[tabKey]

- [ ] `features/hr/shared/EffectiveDatedForm.tsx:347` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{intent.prompt}`

### route /hr/settings/pay-groups

- [ ] `features/hr/shared/EffectiveDatedForm.tsx:347` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{intent.prompt}`

### route /hr/tasks

- [ ] `features/hr/tasks/components/HrTaskInbox.tsx:529` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{row.summary}`

### route /hr/time/periods/[periodId]

- [ ] `features/hr/exports/components/ExportRunPanel.tsx:130` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{format.notes}`

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

- [ ] `components/image/gallery/desktop/SimpleImageViewer.tsx:306` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{photos[imageIndex]?.description}`
- [ ] `components/image/unsplash/desktop/EnhancedImageViewer.tsx:299` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{photos[imageIndex]?.description || photos[imageIndex]?.alt_description}`
- [ ] `components/image/unsplash/mobile/MobileUnsplashViewer.tsx:203` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{photos[imageIndex]?.description || photos[imageIndex]?.alt_description || "No descrip…`

### route /images/studio

- [ ] `features/image-studio/components/PresetCatalog.tsx:288` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{cat.description}`

### route /images/tools

- [ ] `components/image/gallery/desktop/SimpleImageViewer.tsx:306` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{photos[imageIndex]?.description}`
- [ ] `components/image/unsplash/desktop/EnhancedImageViewer.tsx:299` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{photos[imageIndex]?.description || photos[imageIndex]?.alt_description}`
- [ ] `components/image/unsplash/mobile/MobileUnsplashViewer.tsx:203` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{photos[imageIndex]?.description || photos[imageIndex]?.alt_description || "No descrip…`
- [ ] `features/image-manager/components/BrandedUploadTab.tsx:175` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{preset.description}`
- [ ] `features/image-manager/components/BrandedUploadTab.tsx:206` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{preset.description}`
- [ ] `features/image-manager/components/BrandedUploadTab.tsx:271` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{opt.description}`
- [ ] `features/image-manager/components/ToolsTab.tsx:459` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tool.description}`
- [ ] `features/image-studio/components/PresetCatalog.tsx:288` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{cat.description}`

### route /import/ai-chats/[provider]

- [ ] `features/source-onboarding/components/SourceGuidePage.tsx:98` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{step.body}`

### route /invitations/organization/accept/[token]

- [ ] `app/(core)/invitations/organization/accept/[token]/page.tsx:339` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{invitation.organization.description}`

### route /invitations/project/accept/[token]

- [ ] `app/(core)/invitations/project/accept/[token]/page.tsx:246` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{invitation.project.description}`

### route /knowledge

- [ ] `features/knowledge/components/KnowledgeShowcasePage.tsx:321` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{c.description}`
- [ ] `features/knowledge/components/KnowledgeShowcasePage.tsx:447` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{step.description}`

### route /knowledge/about

- [ ] `features/knowledge/components/KnowledgeShowcasePage.tsx:321` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{c.description}`
- [ ] `features/knowledge/components/KnowledgeShowcasePage.tsx:447` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{step.description}`

### route /knowledge/data-stores

- [ ] `features/rag/components/data-stores/DataStoresPage.tsx:379` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{store.description}`
- [ ] `features/rag/components/data-stores/DataStoresPage.tsx:923` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{s.description}`
- [ ] `features/rag/components/data-stores/DataStoresPage.tsx:1135` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<td>{m.notes ?? "—"}`

### route /knowledge/hub

- [ ] `components/image/gallery/desktop/SimpleImageViewer.tsx:306` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{photos[imageIndex]?.description}`
- [ ] `components/image/unsplash/desktop/EnhancedImageViewer.tsx:299` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{photos[imageIndex]?.description || photos[imageIndex]?.alt_description}`
- [ ] `components/image/unsplash/mobile/MobileUnsplashViewer.tsx:203` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{photos[imageIndex]?.description || photos[imageIndex]?.alt_description || "No descrip…`
- [ ] `components/official/PageTemplate.tsx:138` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{tab.content}`
- [ ] `features/knowledge/ask/AskPanel.tsx:350` — **.split("\n").map(→ JSX) paragraph renderer** (review) — `answer.split("\n").map((raw, li) => { const heading = /^\s*#{1,6}\s+/.test(raw); const li…`
- [ ] `features/pdf-extractor/studio/PdfStudioReader.tsx:2145` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<pre>{doc.content ?? "(no extracted text)"}`
- [ ] `features/scraper/parts/OrganizedContent.tsx:60` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.content}`
- [ ] `features/scraper/parts/SimplifiedView.tsx:105` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.content}`
- [ ] `features/transcripts/browse/columns.tsx:334` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.description}`
- [ ] `features/transcripts/components/TranscriptViewer.tsx:611` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{activeTranscript.description}`

### route /knowledge/library-catalog

- [ ] `features/rag/components/library-catalog/LibraryCatalogPage.tsx:613` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{item.description}`
- [ ] `features/rag/components/library-catalog/LibraryCatalogPage.tsx:694` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`
- [ ] `features/rag/components/library-catalog/PackDetailPanel.tsx:246` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`
- [ ] `features/rag/components/library-catalog/RulebookDetailPanel.tsx:262` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`

### route /knowledge/library-curate

- [ ] `features/admin/shared-knowledge/packs/PackBandsSection.tsx:283` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{b.description}`
- [ ] `features/admin/shared-knowledge/packs/PackBandsSection.tsx:284` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{b.notes}`
- [ ] `features/admin/shared-knowledge/packs/PackBandsSection.tsx:338` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{a.notes}`
- [ ] `features/admin/shared-knowledge/packs/PackMeaningSection.tsx:465` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`
- [ ] `features/admin/shared-knowledge/packs/PackMeaningSection.tsx:469` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.notes}`
- [ ] `features/admin/shared-knowledge/packs/PackTopicsSection.tsx:321` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{t.notes}`

### route /knowledge/search

- [ ] `features/rag/components/search/RagPageReferences.tsx:1069` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{group.description}`

### route /knowledge/sources/[id]

- [ ] `components/image/gallery/desktop/SimpleImageViewer.tsx:306` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{photos[imageIndex]?.description}`
- [ ] `components/image/unsplash/desktop/EnhancedImageViewer.tsx:299` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{photos[imageIndex]?.description || photos[imageIndex]?.alt_description}`
- [ ] `components/image/unsplash/mobile/MobileUnsplashViewer.tsx:203` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{photos[imageIndex]?.description || photos[imageIndex]?.alt_description || "No descrip…`
- [ ] `components/official/PageTemplate.tsx:138` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{tab.content}`
- [ ] `features/pdf-extractor/studio/PdfStudioReader.tsx:2145` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<pre>{doc.content ?? "(no extracted text)"}`
- [ ] `features/scraper/parts/OrganizedContent.tsx:60` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.content}`
- [ ] `features/scraper/parts/SimplifiedView.tsx:105` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.content}`

### route /knowledge/transcripts/[id]

- [ ] `components/image/gallery/desktop/SimpleImageViewer.tsx:306` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{photos[imageIndex]?.description}`
- [ ] `components/image/unsplash/desktop/EnhancedImageViewer.tsx:299` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{photos[imageIndex]?.description || photos[imageIndex]?.alt_description}`
- [ ] `components/image/unsplash/mobile/MobileUnsplashViewer.tsx:203` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{photos[imageIndex]?.description || photos[imageIndex]?.alt_description || "No descrip…`
- [ ] `components/official/PageTemplate.tsx:138` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{tab.content}`
- [ ] `features/pdf-extractor/studio/PdfStudioReader.tsx:2145` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<pre>{doc.content ?? "(no extracted text)"}`
- [ ] `features/scraper/parts/OrganizedContent.tsx:60` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.content}`
- [ ] `features/scraper/parts/SimplifiedView.tsx:105` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.content}`
- [ ] `features/transcripts/components/TranscriptViewer.tsx:611` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{activeTranscript.description}`

### route /launchpad

- [ ] `features/launchpad/components/UserLaunchpad.tsx:370` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{group.description}`

### route /legal

- [ ] `features/legal/components/landing/LegalLanding.tsx:271` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{feature.description}`
- [ ] `features/legal/components/landing/LegalLanding.tsx:301` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{step.description}`
- [ ] `features/legal/components/landing/LegalLanding.tsx:405` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`

### route /legal/ca-wc

- [ ] `features/legal/wc/components/landing/CaWcLanding.tsx:304` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{feature.description}`
- [ ] `features/legal/wc/components/landing/CaWcLanding.tsx:379` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{feature.description}`
- [ ] `features/legal/wc/components/landing/CaWcLanding.tsx:432` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{step.description}`
- [ ] `features/legal/wc/components/landing/CaWcLanding.tsx:463` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`

### route /legal/ca-wc/utilities

- [ ] `app/(core)/legal/ca-wc/utilities/page.tsx:82` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{util.description}`

### route /make

- [ ] `features/templates/components/InstalledTemplate.tsx:244` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{s.body}`

### route /mandates

- [ ] `features/mandates/browse/MandateBrowseCards.tsx:87` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{row.description}`
- [ ] `features/mandates/browse/useCoverageList.tsx:119` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{meta.description}`

### route /mandates/[mandateKey]

- [ ] `features/agents/agent-creators/interactive-builder/AgentGenerator.tsx:779` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{mandate.summary}`
- [ ] `features/agents/agent-creators/interactive-builder/AgentJsonDisplay.tsx:317` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{data.description}`
- [ ] `features/bindings/OfferedInventoryColumn.tsx:183` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{value.description}`
- [ ] `features/surfaces/components/bind/BindingSuggestionsTab.tsx:408` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{proposal.notes}`

### route /mandates/record-preview/[mandateKey]

- [ ] `features/agents/agent-creators/interactive-builder/AgentGenerator.tsx:779` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{mandate.summary}`
- [ ] `features/agents/agent-creators/interactive-builder/AgentJsonDisplay.tsx:317` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{data.description}`
- [ ] `features/bindings/OfferedInventoryColumn.tsx:183` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{value.description}`
- [ ] `features/mandates/admin/MandateDetailPanel.tsx:1652` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{offer.description}`
- [ ] `features/surfaces/components/bind/BindingSuggestionsTab.tsx:408` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{proposal.notes}`

### route /maps

- [ ] `features/canvas/maps/columns.tsx:55` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.description}`

### route /markdown-studio

- [ ] `components/mardown-display/markdown-classification/custom-views/common/MarkdownTextDisplay.tsx:5` — **react-markdown** (BANNED) — `react-markdown` (type-only)
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/AstRendererView.tsx:76` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{node.content}`
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/AstRendererView.tsx:188` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{node.content}`
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/AstRendererView.tsx:203` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{node.content}`
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/LsiKeywordView.tsx:668` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{section.description}`
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/ModernAstRenderer.tsx:74` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{node.content}`
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/ModernAstRenderer.tsx:219` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{node.content}`
- [ ] `components/mardown-display/markdown-classification/custom-views/view-components/ModernAstRenderer.tsx:235` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{node.content}`
- [ ] `components/mardown-display/markdown-classification/markdown-processor-util.ts:21` — **remark-* plugins** (BANNED) — `remark-parse`
- [ ] `components/mardown-display/markdown-classification/markdown-processor-util.ts:22` — **remark-* plugins** (BANNED) — `remark-gfm`
- [ ] `components/mardown-display/markdown-classification/parts/CodeComponent.tsx:4` — **react-markdown** (BANNED) — `react-markdown` (type-only)
- [ ] `components/markdown-studio/AnalysisView.tsx:602` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.summary}`
- [ ] `components/markdown-studio/SampleLibrarySheet.tsx:244` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{sample.description}`
- [ ] `components/markdown-studio/SampleLibrarySheet.tsx:372` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{sample.description}`
- [ ] `components/markdown-studio/lab/BlockProcessingPanel.tsx:13` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `components/markdown-studio/lab/ServerEventInspector.tsx:28` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### route /marketing/[brandId]

- [ ] `features/marketing/components/brands/BrandWorkspace.tsx:669` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{current.description}`

### route /marketing/[brandId]/ads

- [ ] `features/marketing/components/MarketingComingSoon.tsx:167` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{sibling.description}`

### route /marketing/[brandId]/content/map/[mapId]

- [ ] `components/official/review-deck/ReviewDeck.tsx:223` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{current.body}`
- [ ] `features/marketing/seo/topical-map/proposals/ProposalReview.tsx:128` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{topic.description}`
- [ ] `features/marketing/seo/topical-map/views/HistoryView.tsx:375` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`
- [ ] `features/marketing/seo/topical-map/views/table/columns.tsx:347` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.topic.description}`

### route /marketing/[brandId]/content/map/[mapId]/graph

- [ ] `components/official/review-deck/ReviewDeck.tsx:223` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{current.body}`
- [ ] `features/marketing/seo/topical-map/proposals/ProposalReview.tsx:128` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{topic.description}`
- [ ] `features/marketing/seo/topical-map/views/HistoryView.tsx:375` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`
- [ ] `features/marketing/seo/topical-map/views/table/columns.tsx:347` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.topic.description}`

### route /marketing/[brandId]/content/map/[mapId]/history

- [ ] `components/official/review-deck/ReviewDeck.tsx:223` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{current.body}`
- [ ] `features/marketing/seo/topical-map/proposals/ProposalReview.tsx:128` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{topic.description}`
- [ ] `features/marketing/seo/topical-map/views/HistoryView.tsx:375` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`
- [ ] `features/marketing/seo/topical-map/views/table/columns.tsx:347` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.topic.description}`

### route /marketing/[brandId]/content/map/[mapId]/pages

- [ ] `components/official/review-deck/ReviewDeck.tsx:223` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{current.body}`
- [ ] `features/marketing/seo/topical-map/proposals/ProposalReview.tsx:128` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{topic.description}`
- [ ] `features/marketing/seo/topical-map/views/HistoryView.tsx:375` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`
- [ ] `features/marketing/seo/topical-map/views/table/columns.tsx:347` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.topic.description}`

### route /marketing/[brandId]/content/map/[mapId]/table

- [ ] `components/official/review-deck/ReviewDeck.tsx:223` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{current.body}`
- [ ] `features/marketing/seo/topical-map/proposals/ProposalReview.tsx:128` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{topic.description}`
- [ ] `features/marketing/seo/topical-map/views/HistoryView.tsx:375` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`
- [ ] `features/marketing/seo/topical-map/views/table/columns.tsx:347` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.topic.description}`

### route /marketing/[brandId]/content/map/[mapId]/text

- [ ] `components/official/review-deck/ReviewDeck.tsx:223` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{current.body}`
- [ ] `features/marketing/seo/topical-map/proposals/ProposalReview.tsx:128` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{topic.description}`
- [ ] `features/marketing/seo/topical-map/views/HistoryView.tsx:375` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`
- [ ] `features/marketing/seo/topical-map/views/table/columns.tsx:347` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.topic.description}`

### route /marketing/[brandId]/content/plan/[siteId]

- [ ] `features/marketing/components/pages/PageContentCard.tsx:21` — **MarkdownPreview** (tracked) — `@/features/files/components/core/FilePreview/previewers/MarkdownPreview`
- [ ] `features/marketing/components/pages/cards/PageBlockedChecksCard.tsx:179` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<li>{check.reasoning || check.itemKey}`
- [ ] `features/marketing/components/pages/cards/PageDraftContentCard.tsx:43` — **BasicContentEditor (split editor)** (BANNED) — `@/components/content-refine/BasicContentEditor`
- [ ] `features/marketing/content-plan/components/NodeStepRail.tsx:237` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{artifact.summary}`
- [ ] `features/marketing/content-plan/components/NodeStepRail.tsx:379` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{current.summary}`
- [ ] `features/marketing/content-plan/components/PageDraftEditor.tsx:615` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.summary}`
- [ ] `features/marketing/content-plan/setup/components/EntityAttachSection.tsx:169` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{plan.notes}`
- [ ] `features/marketing/content-plan/setup/components/EntityAttachSection.tsx:185` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{plan.notes}`
- [ ] `features/marketing/content-plan/setup/components/PlanReviewSection.tsx:195` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/marketing/content-plan/setup/components/PlanReviewSection.tsx:236` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/marketing/content-plan/setup/components/PlanReviewSection.tsx:255` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/marketing/content-plan/setup/components/SetupShapeColumn.tsx:125` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{archetype.description}`

### route /marketing/[brandId]/content/plan/[siteId]/ai-runs

- [ ] `features/marketing/components/pages/PageContentCard.tsx:21` — **MarkdownPreview** (tracked) — `@/features/files/components/core/FilePreview/previewers/MarkdownPreview`
- [ ] `features/marketing/components/pages/cards/PageBlockedChecksCard.tsx:179` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<li>{check.reasoning || check.itemKey}`
- [ ] `features/marketing/components/pages/cards/PageDraftContentCard.tsx:43` — **BasicContentEditor (split editor)** (BANNED) — `@/components/content-refine/BasicContentEditor`
- [ ] `features/marketing/content-plan/components/NodeStepRail.tsx:237` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{artifact.summary}`
- [ ] `features/marketing/content-plan/components/NodeStepRail.tsx:379` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{current.summary}`
- [ ] `features/marketing/content-plan/components/PageDraftEditor.tsx:615` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.summary}`
- [ ] `features/marketing/content-plan/setup/components/EntityAttachSection.tsx:169` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{plan.notes}`
- [ ] `features/marketing/content-plan/setup/components/EntityAttachSection.tsx:185` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{plan.notes}`
- [ ] `features/marketing/content-plan/setup/components/PlanReviewSection.tsx:195` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/marketing/content-plan/setup/components/PlanReviewSection.tsx:236` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/marketing/content-plan/setup/components/PlanReviewSection.tsx:255` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/marketing/content-plan/setup/components/SetupShapeColumn.tsx:125` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{archetype.description}`

### route /marketing/[brandId]/content/plan/[siteId]/brief

- [ ] `features/marketing/components/pages/PageContentCard.tsx:21` — **MarkdownPreview** (tracked) — `@/features/files/components/core/FilePreview/previewers/MarkdownPreview`
- [ ] `features/marketing/components/pages/cards/PageBlockedChecksCard.tsx:179` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<li>{check.reasoning || check.itemKey}`
- [ ] `features/marketing/components/pages/cards/PageDraftContentCard.tsx:43` — **BasicContentEditor (split editor)** (BANNED) — `@/components/content-refine/BasicContentEditor`
- [ ] `features/marketing/content-plan/components/NodeStepRail.tsx:237` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{artifact.summary}`
- [ ] `features/marketing/content-plan/components/NodeStepRail.tsx:379` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{current.summary}`
- [ ] `features/marketing/content-plan/components/PageDraftEditor.tsx:615` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.summary}`
- [ ] `features/marketing/content-plan/setup/components/EntityAttachSection.tsx:169` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{plan.notes}`
- [ ] `features/marketing/content-plan/setup/components/EntityAttachSection.tsx:185` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{plan.notes}`
- [ ] `features/marketing/content-plan/setup/components/PlanReviewSection.tsx:195` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/marketing/content-plan/setup/components/PlanReviewSection.tsx:236` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/marketing/content-plan/setup/components/PlanReviewSection.tsx:255` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/marketing/content-plan/setup/components/SetupShapeColumn.tsx:125` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{archetype.description}`

### route /marketing/[brandId]/content/plan/[siteId]/entities

- [ ] `features/marketing/components/pages/PageContentCard.tsx:21` — **MarkdownPreview** (tracked) — `@/features/files/components/core/FilePreview/previewers/MarkdownPreview`
- [ ] `features/marketing/components/pages/cards/PageBlockedChecksCard.tsx:179` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<li>{check.reasoning || check.itemKey}`
- [ ] `features/marketing/components/pages/cards/PageDraftContentCard.tsx:43` — **BasicContentEditor (split editor)** (BANNED) — `@/components/content-refine/BasicContentEditor`
- [ ] `features/marketing/content-plan/components/NodeStepRail.tsx:237` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{artifact.summary}`
- [ ] `features/marketing/content-plan/components/NodeStepRail.tsx:379` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{current.summary}`
- [ ] `features/marketing/content-plan/components/PageDraftEditor.tsx:615` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.summary}`
- [ ] `features/marketing/content-plan/setup/components/EntityAttachSection.tsx:169` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{plan.notes}`
- [ ] `features/marketing/content-plan/setup/components/EntityAttachSection.tsx:185` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{plan.notes}`
- [ ] `features/marketing/content-plan/setup/components/PlanReviewSection.tsx:195` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/marketing/content-plan/setup/components/PlanReviewSection.tsx:236` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/marketing/content-plan/setup/components/PlanReviewSection.tsx:255` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/marketing/content-plan/setup/components/SetupShapeColumn.tsx:125` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{archetype.description}`

### route /marketing/[brandId]/content/plan/[siteId]/map

- [ ] `features/marketing/components/pages/PageContentCard.tsx:21` — **MarkdownPreview** (tracked) — `@/features/files/components/core/FilePreview/previewers/MarkdownPreview`
- [ ] `features/marketing/components/pages/cards/PageBlockedChecksCard.tsx:179` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<li>{check.reasoning || check.itemKey}`
- [ ] `features/marketing/components/pages/cards/PageDraftContentCard.tsx:43` — **BasicContentEditor (split editor)** (BANNED) — `@/components/content-refine/BasicContentEditor`
- [ ] `features/marketing/content-plan/components/NodeStepRail.tsx:237` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{artifact.summary}`
- [ ] `features/marketing/content-plan/components/NodeStepRail.tsx:379` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{current.summary}`
- [ ] `features/marketing/content-plan/components/PageDraftEditor.tsx:615` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.summary}`
- [ ] `features/marketing/content-plan/setup/components/EntityAttachSection.tsx:169` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{plan.notes}`
- [ ] `features/marketing/content-plan/setup/components/EntityAttachSection.tsx:185` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{plan.notes}`
- [ ] `features/marketing/content-plan/setup/components/PlanReviewSection.tsx:195` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/marketing/content-plan/setup/components/PlanReviewSection.tsx:236` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/marketing/content-plan/setup/components/PlanReviewSection.tsx:255` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/marketing/content-plan/setup/components/SetupShapeColumn.tsx:125` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{archetype.description}`

### route /marketing/[brandId]/content/plan/[siteId]/setup

- [ ] `features/marketing/components/pages/PageContentCard.tsx:21` — **MarkdownPreview** (tracked) — `@/features/files/components/core/FilePreview/previewers/MarkdownPreview`
- [ ] `features/marketing/components/pages/cards/PageBlockedChecksCard.tsx:179` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<li>{check.reasoning || check.itemKey}`
- [ ] `features/marketing/components/pages/cards/PageDraftContentCard.tsx:43` — **BasicContentEditor (split editor)** (BANNED) — `@/components/content-refine/BasicContentEditor`
- [ ] `features/marketing/content-plan/components/NodeStepRail.tsx:237` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{artifact.summary}`
- [ ] `features/marketing/content-plan/components/NodeStepRail.tsx:379` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{current.summary}`
- [ ] `features/marketing/content-plan/components/PageDraftEditor.tsx:615` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.summary}`
- [ ] `features/marketing/content-plan/setup/components/EntityAttachSection.tsx:169` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{plan.notes}`
- [ ] `features/marketing/content-plan/setup/components/EntityAttachSection.tsx:185` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{plan.notes}`
- [ ] `features/marketing/content-plan/setup/components/PlanReviewSection.tsx:195` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/marketing/content-plan/setup/components/PlanReviewSection.tsx:236` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/marketing/content-plan/setup/components/PlanReviewSection.tsx:255` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/marketing/content-plan/setup/components/SetupShapeColumn.tsx:125` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{archetype.description}`

### route /marketing/[brandId]/content/plan/[siteId]/table

- [ ] `features/marketing/components/pages/PageContentCard.tsx:21` — **MarkdownPreview** (tracked) — `@/features/files/components/core/FilePreview/previewers/MarkdownPreview`
- [ ] `features/marketing/components/pages/cards/PageBlockedChecksCard.tsx:179` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<li>{check.reasoning || check.itemKey}`
- [ ] `features/marketing/components/pages/cards/PageDraftContentCard.tsx:43` — **BasicContentEditor (split editor)** (BANNED) — `@/components/content-refine/BasicContentEditor`
- [ ] `features/marketing/content-plan/components/NodeStepRail.tsx:237` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{artifact.summary}`
- [ ] `features/marketing/content-plan/components/NodeStepRail.tsx:379` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{current.summary}`
- [ ] `features/marketing/content-plan/components/PageDraftEditor.tsx:615` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.summary}`
- [ ] `features/marketing/content-plan/setup/components/EntityAttachSection.tsx:169` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{plan.notes}`
- [ ] `features/marketing/content-plan/setup/components/EntityAttachSection.tsx:185` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{plan.notes}`
- [ ] `features/marketing/content-plan/setup/components/PlanReviewSection.tsx:195` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/marketing/content-plan/setup/components/PlanReviewSection.tsx:236` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/marketing/content-plan/setup/components/PlanReviewSection.tsx:255` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/marketing/content-plan/setup/components/SetupShapeColumn.tsx:125` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{archetype.description}`

### route /marketing/[brandId]/content/studio

- [ ] `features/marketing/components/MarketingComingSoon.tsx:167` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{sibling.description}`

### route /marketing/[brandId]/email

- [ ] `features/marketing/front-doors/MarketingDoorBoard.tsx:75` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{door.description}`

### route /marketing/[brandId]/identity

- [ ] `app/(core)/marketing/[brandId]/identity/page.tsx:126` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{room.description}`

### route /marketing/[brandId]/identity/audience

- [ ] `features/marketing/components/MarketingComingSoon.tsx:167` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{sibling.description}`

### route /marketing/[brandId]/identity/guidelines

- [ ] `features/approvals/ApprovalQueue.tsx:939` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{item.body}`

### route /marketing/[brandId]/identity/knowledge

- [ ] `features/approvals/ApprovalQueue.tsx:939` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{item.body}`
- [ ] `features/marketing/seo/value-system/discovery/DiscoveryLadder.tsx:413` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{door.body}`

### route /marketing/[brandId]/identity/media

- [ ] `features/marketing/components/media/GenerateMediaView.tsx:269` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`
- [ ] `features/marketing/components/media/StockSourcesView.tsx:492` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{photo.description || photo.alt_description || "Untitled photo"}`

### route /marketing/[brandId]/identity/media/generate

- [ ] `features/marketing/components/media/GenerateMediaView.tsx:269` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`
- [ ] `features/marketing/components/media/StockSourcesView.tsx:492` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{photo.description || photo.alt_description || "Untitled photo"}`

### route /marketing/[brandId]/identity/media/research

- [ ] `features/marketing/components/media/GenerateMediaView.tsx:269` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`
- [ ] `features/marketing/components/media/StockSourcesView.tsx:492` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{photo.description || photo.alt_description || "Untitled photo"}`

### route /marketing/[brandId]/identity/media/sources

- [ ] `features/marketing/components/media/GenerateMediaView.tsx:269` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`
- [ ] `features/marketing/components/media/StockSourcesView.tsx:492` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{photo.description || photo.alt_description || "Untitled photo"}`

### route /marketing/[brandId]/identity/offerings

- [ ] `features/approvals/ApprovalQueue.tsx:939` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{item.body}`

### route /marketing/[brandId]/intelligence/competitors

- [ ] `features/marketing/competitors/CompetitorAutopsyWorkspace.tsx:1280` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{latestArtifact.summary}`
- [ ] `features/marketing/competitors/CompetitorIdentification.tsx:273` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{result.description}`

### route /marketing/[brandId]/intelligence/competitors/competitors

- [ ] `features/marketing/competitors/CompetitorAutopsyWorkspace.tsx:1280` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{latestArtifact.summary}`
- [ ] `features/marketing/competitors/CompetitorIdentification.tsx:273` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{result.description}`

### route /marketing/[brandId]/intelligence/competitors/evidence

- [ ] `features/marketing/competitors/CompetitorAutopsyWorkspace.tsx:1280` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{latestArtifact.summary}`
- [ ] `features/marketing/competitors/CompetitorIdentification.tsx:273` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{result.description}`

### route /marketing/[brandId]/intelligence/competitors/history

- [ ] `features/marketing/competitors/CompetitorAutopsyWorkspace.tsx:1280` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{latestArtifact.summary}`
- [ ] `features/marketing/competitors/CompetitorIdentification.tsx:273` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{result.description}`

### route /marketing/[brandId]/intelligence/competitors/opportunities

- [ ] `features/marketing/competitors/CompetitorAutopsyWorkspace.tsx:1280` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{latestArtifact.summary}`
- [ ] `features/marketing/competitors/CompetitorIdentification.tsx:273` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{result.description}`

### route /marketing/[brandId]/intelligence/competitors/review

- [ ] `features/marketing/competitors/CompetitorAutopsyWorkspace.tsx:1280` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{latestArtifact.summary}`
- [ ] `features/marketing/competitors/CompetitorIdentification.tsx:273` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{result.description}`

### route /marketing/[brandId]/intelligence/monitoring

- [ ] `features/marketing/front-doors/MarketingDoorBoard.tsx:75` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{door.description}`

### route /marketing/[brandId]/intelligence/reputation

- [ ] `features/marketing/front-doors/MarketingDoorBoard.tsx:75` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{door.description}`

### route /marketing/[brandId]/intelligence/reputation/[siteId]

- [ ] `features/marketing/components/reputation/ReputationWorkspace.tsx:370` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{row.summary}`

### route /marketing/[brandId]/intelligence/reputation/[siteId]/cases

- [ ] `features/marketing/components/reputation/ReputationWorkspace.tsx:370` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{row.summary}`

### route /marketing/[brandId]/intelligence/reputation/[siteId]/evidence

- [ ] `features/marketing/components/reputation/ReputationWorkspace.tsx:370` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{row.summary}`

### route /marketing/[brandId]/intelligence/reputation/[siteId]/narratives

- [ ] `features/marketing/components/reputation/ReputationWorkspace.tsx:370` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{row.summary}`

### route /marketing/[brandId]/intelligence/reputation/[siteId]/publications

- [ ] `features/marketing/components/reputation/ReputationWorkspace.tsx:370` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{row.summary}`

### route /marketing/[brandId]/locations

- [ ] `features/marketing/local/EndowmentPortfolioPanel.tsx:101` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{match.platform.notes}`
- [ ] `features/marketing/local/EndowmentPortfolioPanel.tsx:453` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{artifact.description}`

### route /marketing/[brandId]/locations/[locationId]

- [ ] `features/marketing/local/EndowmentPortfolioPanel.tsx:101` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{match.platform.notes}`
- [ ] `features/marketing/local/EndowmentPortfolioPanel.tsx:453` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{artifact.description}`

### route /marketing/[brandId]/locations/[locationId]/grid

- [ ] `components/mardown-display/blocks/map/MapCanvas.tsx:133` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{m.description}`

### route /marketing/[brandId]/planning/initiatives

- [ ] `features/marketing/initiatives/columns.tsx:38` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{r.description}`

### route /marketing/[brandId]/planning/initiatives/[id]

- [ ] `features/marketing/initiatives/InitiativeDetail.tsx:115` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{row.description}`

### route /marketing/[brandId]/pr

- [ ] `features/marketing/pr/components/StoryAngleQueue.tsx:307` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{angle.summary}`

### route /marketing/[brandId]/pr/outreach

- [ ] `features/marketing/front-doors/MarketingDoorBoard.tsx:75` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{door.description}`

### route /marketing/[brandId]/seo/[siteId]/ai-visibility/[view]

- [ ] `features/marketing/seo/ai-visibility/panels/AiVisibilityPanelsView.tsx:193` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{status.explanation}`
- [ ] `features/marketing/seo/ai-visibility/panels/GateReviewCard.tsx:615` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{card.summary}`
- [ ] `features/marketing/seo/ai-visibility/panels/PanelDesignSection.tsx:117` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<pre>{content.data.content}`

### route /marketing/[brandId]/seo/[siteId]/automations

- [ ] `features/marketing/seo/run-console/RunHistoryPanel.tsx:359` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{run.summary}`

### route /marketing/[brandId]/seo/[siteId]/automations/history

- [ ] `features/marketing/seo/run-console/RunHistoryPanel.tsx:359` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{run.summary}`

### route /marketing/[brandId]/seo/[siteId]/automations/proposals

- [ ] `features/marketing/seo/run-console/RunHistoryPanel.tsx:359` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{run.summary}`

### route /marketing/[brandId]/seo/[siteId]/automations/unplaced

- [ ] `features/marketing/seo/run-console/RunHistoryPanel.tsx:359` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{run.summary}`

### route /marketing/[brandId]/seo/[siteId]/backlinks

- [ ] `features/marketing/components/backlinks/SerpProspectsTab.tsx:633` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{promoter.summary}`
- [ ] `features/marketing/components/backlinks/SerpProspectsTab.tsx:857` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{variant.explanation}`

### route /marketing/[brandId]/seo/[siteId]/backlinks/anchors

- [ ] `features/marketing/components/backlinks/SerpProspectsTab.tsx:633` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{promoter.summary}`
- [ ] `features/marketing/components/backlinks/SerpProspectsTab.tsx:857` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{variant.explanation}`

### route /marketing/[brandId]/seo/[siteId]/backlinks/changes

- [ ] `features/marketing/components/backlinks/SerpProspectsTab.tsx:633` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{promoter.summary}`
- [ ] `features/marketing/components/backlinks/SerpProspectsTab.tsx:857` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{variant.explanation}`

### route /marketing/[brandId]/seo/[siteId]/backlinks/competitors

- [ ] `features/marketing/components/backlinks/SerpProspectsTab.tsx:633` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{promoter.summary}`
- [ ] `features/marketing/components/backlinks/SerpProspectsTab.tsx:857` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{variant.explanation}`

### route /marketing/[brandId]/seo/[siteId]/backlinks/coverage

- [ ] `features/marketing/components/backlinks/SerpProspectsTab.tsx:633` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{promoter.summary}`
- [ ] `features/marketing/components/backlinks/SerpProspectsTab.tsx:857` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{variant.explanation}`

### route /marketing/[brandId]/seo/[siteId]/backlinks/domains

- [ ] `features/marketing/components/backlinks/SerpProspectsTab.tsx:633` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{promoter.summary}`
- [ ] `features/marketing/components/backlinks/SerpProspectsTab.tsx:857` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{variant.explanation}`

### route /marketing/[brandId]/seo/[siteId]/backlinks/insights

- [ ] `features/marketing/components/backlinks/SerpProspectsTab.tsx:633` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{promoter.summary}`
- [ ] `features/marketing/components/backlinks/SerpProspectsTab.tsx:857` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{variant.explanation}`

### route /marketing/[brandId]/seo/[siteId]/backlinks/links

- [ ] `features/marketing/components/backlinks/SerpProspectsTab.tsx:633` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{promoter.summary}`
- [ ] `features/marketing/components/backlinks/SerpProspectsTab.tsx:857` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{variant.explanation}`

### route /marketing/[brandId]/seo/[siteId]/backlinks/pages

- [ ] `features/marketing/components/backlinks/SerpProspectsTab.tsx:633` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{promoter.summary}`
- [ ] `features/marketing/components/backlinks/SerpProspectsTab.tsx:857` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{variant.explanation}`

### route /marketing/[brandId]/seo/[siteId]/backlinks/prospects

- [ ] `features/marketing/components/backlinks/SerpProspectsTab.tsx:633` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{promoter.summary}`
- [ ] `features/marketing/components/backlinks/SerpProspectsTab.tsx:857` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{variant.explanation}`

### route /marketing/[brandId]/seo/[siteId]/capabilities

- [ ] `features/marketing/seo/capabilities/SeoCapabilitiesWorkspace.tsx:148` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{copy.description}`
- [ ] `features/marketing/seo/capabilities/SeoCapabilitiesWorkspace.tsx:166` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{capability.description}`

### route /marketing/[brandId]/seo/[siteId]/findings

- [ ] `features/marketing/components/analysis/FindingsTable.tsx:150` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{row.reasoning ?? "Re-run the analysis to capture the explanation."}`

### route /marketing/[brandId]/seo/[siteId]/findings/[findingId]

- [ ] `features/marketing/components/analysis/FindingDetail.tsx:481` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{data.item.description}`
- [ ] `features/marketing/components/analysis/FindingRemedyCard.tsx:154` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{resolved.explanation}`
- [ ] `features/marketing/components/analysis/FindingRemedyCard.tsx:169` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{resolved.remedy.summary}`
- [ ] `features/marketing/components/analysis/FindingRemedyCard.tsx:195` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{resolved.remedy.summary}`

### route /marketing/[brandId]/seo/[siteId]/growth-loop

- [ ] `features/growth-loop/run/components/LoopHistoryFeed.tsx:314` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{quality.reasoning}`

### route /marketing/[brandId]/seo/[siteId]/keywords/research

- [ ] `features/marketing/seo/keyword-research/components/KeywordResearchLauncher.tsx:33` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### route /marketing/[brandId]/seo/[siteId]/keywords/value

- [ ] `features/approvals/ApprovalQueue.tsx:939` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{item.body}`
- [ ] `features/marketing/seo/value-system/workbench/MeaningPanel.tsx:418` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{meta.description ?? "No description yet."}`
- [ ] `features/marketing/seo/value-system/workbench/MeaningPanel.tsx:703` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{value.notes}`
- [ ] `features/marketing/seo/value-system/workbench/session/TrialPanel.tsx:930` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{card.proposal.notes}`

### route /marketing/[brandId]/seo/[siteId]/keywords/value/dimensions

- [ ] `features/marketing/seo/value-system/dimensions/DimensionCard.tsx:253` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{value.description}`
- [ ] `features/marketing/seo/value-system/dimensions/DimensionCard.tsx:602` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{dimension.description}`

### route /marketing/[brandId]/seo/[siteId]/keywords/value/packs

- [ ] `features/marketing/seo/value-system/packs/GeoPlacesStep.tsx:140` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{area.notes}`
- [ ] `features/marketing/seo/value-system/packs/PackReview.tsx:1197` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{band.description}`
- [ ] `features/marketing/seo/value-system/packs/StarterPackCatalog.tsx:398` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{pack.summary}`
- [ ] `features/marketing/seo/value-system/packs/StarterPackCatalog.tsx:403` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{pack.description}`

### route /marketing/[brandId]/seo/[siteId]/keywords/value/rules

- [ ] `features/marketing/seo/value-system/rules/MeaningRulesWorkbench.tsx:322` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{band.description ?? "No description yet."}`

### route /marketing/[brandId]/seo/[siteId]/keywords/value/settings

- [ ] `features/marketing/seo/value-system/settings/AutonomyModesEditor.tsx:191` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{capability.description}`

### route /marketing/[brandId]/seo/[siteId]/performance

- [ ] `components/ui/chart.tsx:88` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: Object.entries(THEMES) .map( ([theme, prefix]) => ' ${…`

### route /marketing/[brandId]/seo/[siteId]/search-console

- [ ] `features/marketing/search-console/components/insights/InsightsTab.tsx:262` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{activeMeta.description}`
- [ ] `features/marketing/search-console/components/new-pages/NewPagesTab.tsx:210` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.tracking.notes}`

### route /marketing/[brandId]/seo/[siteId]/search-console/digs

- [ ] `features/marketing/search-console/components/insights/InsightsTab.tsx:262` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{activeMeta.description}`
- [ ] `features/marketing/search-console/components/new-pages/NewPagesTab.tsx:210` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.tracking.notes}`

### route /marketing/[brandId]/seo/[siteId]/search-console/insights

- [ ] `features/marketing/search-console/components/insights/InsightsTab.tsx:262` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{activeMeta.description}`
- [ ] `features/marketing/search-console/components/new-pages/NewPagesTab.tsx:210` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.tracking.notes}`

### route /marketing/[brandId]/seo/[siteId]/search-console/new-pages

- [ ] `features/marketing/search-console/components/insights/InsightsTab.tsx:262` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{activeMeta.description}`
- [ ] `features/marketing/search-console/components/new-pages/NewPagesTab.tsx:210` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.tracking.notes}`

### route /marketing/[brandId]/seo/[siteId]/search-console/watchlist

- [ ] `features/marketing/search-console/components/insights/InsightsTab.tsx:262` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{activeMeta.description}`
- [ ] `features/marketing/search-console/components/new-pages/NewPagesTab.tsx:210` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.tracking.notes}`

### route /marketing/[brandId]/seo/[siteId]/valuation

- [ ] `features/marketing/link-valuation/components/LinkValuationWorkspace.tsx:247` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{config.description}`
- [ ] `features/marketing/link-valuation/components/TuningPanel.tsx:279` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{group.description}`

### route /marketing/[brandId]/settings

- [ ] `features/marketing/seo/value-system/settings/AutonomyModesEditor.tsx:191` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{capability.description}`

### route /marketing/[brandId]/socials

- [ ] `features/marketing/components/MarketingComingSoon.tsx:167` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{sibling.description}`

### route /marketing/[brandId]/websites/[siteId]

- [ ] `features/marketing/components/site/SiteOverview.tsx:860` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{site.description}`

### route /marketing/[brandId]/websites/[siteId]/crawls/[crawlId]/reports

- [ ] `features/marketing/components/crawls/CrawlReportsIndex.tsx:160` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{report.description}`

### route /marketing/[brandId]/websites/[siteId]/crawls/[crawlId]/reports/[reportKey]

- [ ] `features/marketing/components/crawls/CrawlReportWorkspace.tsx:1167` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{report.description}`

### route /marketing/[brandId]/websites/[siteId]/media

- [ ] `features/marketing/components/media/SiteVideosView.tsx:452` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{meta.description}`

### route /marketing/[brandId]/websites/[siteId]/media/standards

- [ ] `features/marketing/components/media/SiteVideosView.tsx:452` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{meta.description}`

### route /marketing/[brandId]/websites/[siteId]/media/videos

- [ ] `features/marketing/components/media/SiteVideosView.tsx:452` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{meta.description}`

### route /marketing/[brandId]/websites/[siteId]/pages/[pageId]

- [ ] `features/marketing/components/pages/PageContentCard.tsx:21` — **MarkdownPreview** (tracked) — `@/features/files/components/core/FilePreview/previewers/MarkdownPreview`
- [ ] `features/marketing/components/pages/cards/PageBlockedChecksCard.tsx:179` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<li>{check.reasoning || check.itemKey}`
- [ ] `features/marketing/components/pages/cards/PageDraftContentCard.tsx:43` — **BasicContentEditor (split editor)** (BANNED) — `@/components/content-refine/BasicContentEditor`
- [ ] `features/marketing/content-plan/components/NodeStepRail.tsx:237` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{artifact.summary}`
- [ ] `features/marketing/content-plan/components/NodeStepRail.tsx:379` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{current.summary}`
- [ ] `features/marketing/content-plan/components/PageDraftEditor.tsx:615` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.summary}`

### route /marketing/[brandId]/websites/[siteId]/pages/[pageId]/snapshots/[snapshotId]

- [ ] `features/marketing/components/pages/SnapshotArtifacts.tsx:14` — **MarkdownPreview** (tracked) — `@/features/files/components/core/FilePreview/previewers/MarkdownPreview`

### route /marketing/[brandId]/websites/[siteId]/settings

- [ ] `features/marketing/search-console/intake/SiteIntakeWizard.tsx:518` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{group.reasoning}`

### route /marketing/[brandId]/websites/[siteId]/settings/access

- [ ] `features/marketing/search-console/intake/SiteIntakeWizard.tsx:518` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{group.reasoning}`

### route /marketing/[brandId]/websites/[siteId]/settings/intake

- [ ] `features/marketing/search-console/intake/SiteIntakeWizard.tsx:518` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{group.reasoning}`

### route /marketing/[brandId]/websites/[siteId]/settings/integrations

- [ ] `features/marketing/search-console/intake/SiteIntakeWizard.tsx:518` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{group.reasoning}`

### route /marketing/brands/new-website

- [ ] `features/marketing/components/sites/NewSiteForm.tsx:231` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{option.body}`

### route /marketing/operations/approvals

- [ ] `features/approvals/ApprovalQueue.tsx:939` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{item.body}`

### route /marketing/operations/automations

- [ ] `features/marketing/seo/run-console/RunHistoryPanel.tsx:359` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{run.summary}`

### route /marketing/operations/automations/history

- [ ] `features/marketing/seo/run-console/RunHistoryPanel.tsx:359` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{run.summary}`

### route /marketing/operations/automations/proposals

- [ ] `features/marketing/seo/run-console/RunHistoryPanel.tsx:359` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{run.summary}`

### route /marketing/operations/automations/unplaced

- [ ] `features/marketing/seo/run-console/RunHistoryPanel.tsx:359` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{run.summary}`

### route /marketing/operations/capabilities

- [ ] `features/marketing/seo/capabilities/SeoCapabilitiesWorkspace.tsx:148` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{copy.description}`
- [ ] `features/marketing/seo/capabilities/SeoCapabilitiesWorkspace.tsx:166` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{capability.description}`

### route /marketing/reports/search-console

- [ ] `features/marketing/search-console/components/insights/InsightsTab.tsx:262` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{activeMeta.description}`
- [ ] `features/marketing/search-console/components/new-pages/NewPagesTab.tsx:210` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.tracking.notes}`

### route /marketing/reports/search-console/digs

- [ ] `features/marketing/search-console/components/insights/InsightsTab.tsx:262` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{activeMeta.description}`
- [ ] `features/marketing/search-console/components/new-pages/NewPagesTab.tsx:210` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.tracking.notes}`

### route /marketing/reports/search-console/insights

- [ ] `features/marketing/search-console/components/insights/InsightsTab.tsx:262` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{activeMeta.description}`
- [ ] `features/marketing/search-console/components/new-pages/NewPagesTab.tsx:210` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.tracking.notes}`

### route /marketing/reports/search-console/new-pages

- [ ] `features/marketing/search-console/components/insights/InsightsTab.tsx:262` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{activeMeta.description}`
- [ ] `features/marketing/search-console/components/new-pages/NewPagesTab.tsx:210` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.tracking.notes}`

### route /marketing/reports/search-console/watchlist

- [ ] `features/marketing/search-console/components/insights/InsightsTab.tsx:262` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{activeMeta.description}`
- [ ] `features/marketing/search-console/components/new-pages/NewPagesTab.tsx:210` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.tracking.notes}`

### route /marketing/tools/youtube

- [ ] `features/marketing/discovery/youtube/YouTubeDiscovery.tsx:981` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{video.description || "No description supplied."}`
- [ ] `features/marketing/discovery/youtube/YouTubeVideoPreview.tsx:61` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{video.description || "No description supplied."}`

### route /marketing/tools/youtube/videos/[videoId]

- [ ] `features/marketing/discovery/youtube/YouTubeVideoPreview.tsx:61` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{video.description || "No description supplied."}`

### route /marketing/topical-maps/[mapId]

- [ ] `app/(core)/marketing/topical-maps/[mapId]/page.tsx:123` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{map.description}`
- [ ] `components/official/review-deck/ReviewDeck.tsx:223` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{current.body}`
- [ ] `features/marketing/seo/topical-map/proposals/ProposalReview.tsx:128` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{topic.description}`
- [ ] `features/marketing/seo/topical-map/views/HistoryView.tsx:375` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`
- [ ] `features/marketing/seo/topical-map/views/table/columns.tsx:347` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.topic.description}`

### route /masterwork

- [ ] `features/masterwork/home/MasterworkHomePage.tsx:394` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{rb.description}`

### route /masterwork/[id]

- [ ] `components/ui/chart.tsx:88` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: Object.entries(THEMES) .map( ([theme, prefix]) => ' ${…`
- [ ] `features/masterwork/components/detail/RuleMove.tsx:76` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{precondition.summary}`
- [ ] `features/masterwork/components/detail/RulebookDetailPage.tsx:2509` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{rulebook.description}`

### route /masterwork/[id]/masterworks

- [ ] `features/masterwork/components/masterworks/AuditionDialog.tsx:601` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{verdict.summary}`
- [ ] `features/masterwork/components/masterworks/CompareTwoDialog.tsx:355` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{verdict.summary}`
- [ ] `features/masterwork/components/masterworks/CompareTwoDialog.tsx:412` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{arm.reasoning}`
- [ ] `features/masterwork/components/masterworks/MasterworksPage.tsx:549` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{masterwork.description}`

### route /masterwork/[id]/plan

- [ ] `components/ui/chart.tsx:88` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: Object.entries(THEMES) .map( ([theme, prefix]) => ' ${…`

### route /masterwork/[id]/sort

- [ ] `features/masterwork/sorting/SortingTablePage.tsx:1205` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{question.prompt}`

### route /masterwork/[id]/teach-back

- [ ] `features/masterwork/teach-back/TeachBack.tsx:815` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{round.explanation}`

### route /masterwork/[id]/triad

- [ ] `features/masterwork/triad/TriadGamePage.tsx:587` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{card.prompt}`

### route /masterwork/all

- [ ] `features/masterwork/browse/columns.tsx:95` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{row.description}`
- [ ] `features/masterwork/browse/components/MasterworkBrowseRows.tsx:89` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.description}`

### route /masterwork/encore/[id]

- [ ] `features/masterwork/components/masterworks/AuditionDialog.tsx:601` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{verdict.summary}`
- [ ] `features/masterwork/components/masterworks/CompareTwoDialog.tsx:355` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{verdict.summary}`
- [ ] `features/masterwork/components/masterworks/CompareTwoDialog.tsx:412` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{arm.reasoning}`
- [ ] `features/masterwork/components/masterworks/MasterworksPage.tsx:549` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{masterwork.description}`

### route /matrx-extend-demo

- [ ] `app/(public)/matrx-extend-demo/page.tsx:69` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}`

### route /meet/[slug]

- [ ] `features/education/kits/components/KitHub.tsx:805` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{stage.description}`
- [ ] `features/flashcards/components/create/LiveGenerationPreview.tsx:15` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`
- [ ] `features/flashcards/components/set-detail/DeckCardViews.tsx:44` — **CardFaceContent** (tracked) — `@/components/mardown-display/blocks/flashcards/CardFaceContent`
- [ ] `features/flashcards/components/set-detail/IllustrateSetWindow.tsx:139` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{judgment.reasoning}`
- [ ] `features/flashcards/components/set-detail/MergeCardsDialog.tsx:29` — **CardFaceContent** (tracked) — `@/components/mardown-display/blocks/flashcards/CardFaceContent`
- [ ] `features/flashcards/components/set-detail/SetDetailView.tsx:110` — **CardFaceContent** (tracked) — `@/components/mardown-display/blocks/flashcards/CardFaceContent`
- [ ] `features/flashcards/components/set-detail/SetDetailView.tsx:1230` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{m.description}`
- [ ] `features/flashcards/components/set-detail/SetDetailView.tsx:1438` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{data.set.description}`
- [ ] `features/meet/components/record/ActivityLogPanel.tsx:160` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{question.answer}`
- [ ] `features/research/components/init/TemplatePicker.tsx:85` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{template.description}`
- [ ] `features/resource-manager/source-input/components/SourceCard.tsx:190` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{DELIVERY_WORDS.context.summary}`
- [ ] `features/scope-system/components/EditScopeValueSheet.tsx:236` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.description}`
- [ ] `features/scope-system/components/NewScopeInline.tsx:395` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`
- [ ] `features/scope-system/components/ScopeDetailEditor.tsx:357` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{scope.description}`
- [ ] `features/scope-system/components/ScopeFieldInput.tsx:320` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{row.description}`

### route /meetings/[id]

- [ ] `features/meet/components/record/ActivityLogPanel.tsx:160` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{question.answer}`

### route /news

- [ ] `app/(transitional)/news/NewsCard.tsx:80` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{article.description}`

### route /oauth/consent

- [ ] `app/oauth/consent/ConsentClient.tsx:737` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{info.description}`

### route /organizations

- [ ] `app/(core)/organizations/page.tsx:258` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{org.description}`

### route /organizations/[orgId]

- [ ] `features/organizations/components/OrgWorkspace.tsx:424` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{organization.description}`
- [ ] `features/scopes/components/management/NewScopeInline.tsx:352` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`

### route /organizations/[orgId]/context-items

- [ ] `features/scope-system/components/ContextItemsHub.tsx:853` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`

### route /organizations/[orgId]/mandates/[mandateKey]

- [ ] `features/agents/agent-creators/interactive-builder/AgentGenerator.tsx:779` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{mandate.summary}`
- [ ] `features/agents/agent-creators/interactive-builder/AgentJsonDisplay.tsx:317` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{data.description}`
- [ ] `features/bindings/OfferedInventoryColumn.tsx:183` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{value.description}`
- [ ] `features/mandates/admin/MandateDetailPanel.tsx:1652` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{offer.description}`
- [ ] `features/surfaces/components/bind/BindingSuggestionsTab.tsx:408` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{proposal.notes}`

### route /organizations/[orgId]/org-2

- [ ] `features/organizations/components/OrgWorkspace.tsx:424` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{organization.description}`
- [ ] `features/scopes/components/management/NewScopeInline.tsx:352` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`

### route /organizations/[orgId]/performance-reviews

- [ ] `features/employee-performance-reviews/components/PerformanceReviewApp.tsx:585` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: reportHtml }}`
- [ ] `features/employee-performance-reviews/components/PerformanceReviewApp.tsx:890` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: reportHtml }}`
- [ ] `features/employee-performance-reviews/components/PerformanceReviewApp.tsx:846` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{opt.description}`

### route /organizations/[orgId]/resources/[kind]

- [ ] `features/organizations/components/OrgResourceDetail.tsx:340` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`

### route /organizations/[orgId]/scopes

- [ ] `features/scopes/components/management/NewScopeInline.tsx:352` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`

### route /organizations/[orgId]/scopes/[typeId]

- [ ] `features/scope-system/components/NewScopeInline.tsx:395` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`
- [ ] `features/scope-system/components/ScopesList.tsx:325` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{scopeType.description}`
- [ ] `features/scope-system/components/ScopesList.tsx:761` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`

### route /organizations/[orgId]/scopes/[typeId]/[scopeId]

- [ ] `features/scope-system/components/EditScopeValueSheet.tsx:236` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.description}`
- [ ] `features/scope-system/components/ScopeDetailEditor.tsx:357` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{scope.description}`
- [ ] `features/scope-system/components/ScopeFieldInput.tsx:320` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{row.description}`

### route /organizations/[orgId]/scopes/[typeId]/[scopeId]/[itemId]

- [ ] `features/scope-system/components/EditScopeValueSheet.tsx:236` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.description}`
- [ ] `features/scope-system/components/ScopeFieldInput.tsx:320` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{row.description}`
- [ ] `features/scope-system/components/ScopeItemDetail.tsx:203` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`

### route /organizations/[orgId]/scopes/[typeId]/[scopeId]/context-items

- [ ] `features/scope-system/components/EditScopeValueSheet.tsx:236` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.description}`
- [ ] `features/scope-system/components/ScopeFieldInput.tsx:320` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{row.description}`

### route /organizations/[orgId]/scopes/[typeId]/context-items

- [ ] `features/scope-system/components/ContextItemsHub.tsx:853` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`

### route /organizations/[orgId]/scopes/[typeId]/context-items/[itemId]

- [ ] `features/scope-system/components/ContextItemHub.tsx:168` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`
- [ ] `features/scope-system/components/EditScopeValueSheet.tsx:236` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.description}`
- [ ] `features/scope-system/components/ScopeFieldInput.tsx:320` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{row.description}`

### route /organizations/[orgId]/settings

- [ ] `features/organizations/components/TeamManagement.tsx:321` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{team.description}`
- [ ] `features/secrets/components/VaultCreateDialog.tsx:1350` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{loginUrlDef?.description ?? "Where this login is used. Stored as plain, unencrypted m…`
- [ ] `features/secrets/components/VaultCreateDialog.tsx:1790` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{draft.def.description}`
- [ ] `features/secrets/components/VaultCreateDialog.tsx:1939` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{def.description}`
- [ ] `features/secrets/components/VaultHandlingControl.tsx:80` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{presentation.description}`
- [ ] `features/secrets/components/VaultItemDetail.tsx:2517` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{VAULT_LABELS.notes}`

### route /organizations/[orgId]/settings/change-policy

- [ ] `features/change-policy/components/ChangePolicySurface.tsx:373` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.description}`

### route /organizations/[orgId]/settings/keyword-value

- [ ] `features/marketing/seo/value-system/settings/AutonomyModesEditor.tsx:191` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{capability.description}`

### route /organizations/[orgId]/settings/mandates

- [ ] `features/mandates/browse/MandateBrowseCards.tsx:87` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{row.description}`
- [ ] `features/mandates/browse/useCoverageList.tsx:119` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{meta.description}`

### route /organizations/[orgId]/settings/mandates/[mandateKey]

- [ ] `features/agents/agent-creators/interactive-builder/AgentGenerator.tsx:779` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{mandate.summary}`
- [ ] `features/agents/agent-creators/interactive-builder/AgentJsonDisplay.tsx:317` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{data.description}`
- [ ] `features/bindings/OfferedInventoryColumn.tsx:183` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{value.description}`
- [ ] `features/surfaces/components/bind/BindingSuggestionsTab.tsx:408` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{proposal.notes}`

### route /organizations/[orgId]/settings/scopes

- [ ] `features/agent-context/components/scope-admin/ScopeInstancePanel.tsx:283` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{node.description}`

### route /organizations/[orgId]/shortcuts

- [ ] `app/(core)/organizations/[orgId]/shortcuts/page.tsx:183` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tile.description}`

### route /organizations/[orgId]/shortcuts/categories

- [ ] `features/agent-shortcuts/components/CategoryTree.tsx:223` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{node.description}`

### route /organizations/[orgId]/shortcuts/edit/[id]

- [ ] `app/(core)/organizations/[orgId]/shortcuts/edit/[id]/page.tsx:187` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{resolved.description}`
- [ ] `features/agent-shortcuts/components/DefaultContextPolicyValuesEditor.tsx:92` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{slot.description}`

### route /organizations/[orgId]/shortcuts/shortcuts

- [ ] `features/agent-shortcuts/components/DefaultContextPolicyValuesEditor.tsx:92` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{slot.description}`
- [ ] `features/agent-shortcuts/components/ShortcutList.tsx:665` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{shortcut.description}`

### route /p/e/[resourceType]/[id]

- [ ] `components/mardown-display/blocks/memory-aid/MemoryAidBlock.tsx:178` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{controls.editor.content}`
- [ ] `components/mardown-display/blocks/memory-aid/MemoryAidBlock.tsx:225` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{controls.editor.content}`
- [ ] `components/mardown-display/blocks/memory-aid/MemoryAidBlock.tsx:249` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{controls.editor.content}`
- [ ] `components/mardown-display/blocks/memory-aid/MemoryAidBlock.tsx:292` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{controls.editor.content}`
- [ ] `components/mardown-display/blocks/memory-aid/MemoryHintBlock.tsx:89` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{hint.explanation}`
- [ ] `features/education/study/components/BatchReviewBlock.tsx:65` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/education/tutor/components/LiveHelpAnswerBlock.tsx:63` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{result.answer}`
- [ ] `features/flashcards/components/study/study-deck-parts.tsx:20` — **CardFaceContent** (tracked) — `@/components/mardown-display/blocks/flashcards/CardFaceContent`

### route /pick-lists

- [ ] `features/data-tables/pick-lists/components/PickListsIndex.tsx:226` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{list.description}`
- [ ] `features/data-tables/pick-lists/components/PickListsLanding.tsx:112` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{f.description}`

### route /podcast/[slug]

- [ ] `components/mardown-display/blocks/media-chapters/MediaChaptersBlock.tsx:115` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{chapter.summary}`
- [ ] `features/podcasts/components/player/PodcastEpisodePage.tsx:143` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{episode.description}`
- [ ] `features/podcasts/components/player/PodcastShowPage.tsx:127` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{show.description}`
- [ ] `features/podcasts/components/player/PodcastShowPage.tsx:233` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{ep.description}`

### route /podcast/studio/create

- [ ] `features/content-ir/react/actions/KindRequestDialog.tsx:23` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### route /podcast/studio/create-dense

- [ ] `features/content-ir/react/actions/KindRequestDialog.tsx:23` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### route /podcast/studio/create-sharp

- [ ] `features/content-ir/react/actions/KindRequestDialog.tsx:23` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### route /podcast/studio/run-a

- [ ] `app/(core)/podcast/studio/run-a/_components/RunViewA.tsx:183` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{state.description}`

### route /podcast/studio/run-b

- [ ] `app/(core)/podcast/studio/run-b/_components/EpisodeReveal.tsx:57` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{state.description}`

### route /podcast/studio/run-c

- [ ] `app/(core)/podcast/studio/run-c/_components/StreamingResults.tsx:45` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{state.description}`

### route /podcast/studio/run-d

- [ ] `app/(core)/podcast/studio/run-d/_components/AssetStage.tsx:43` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{state.description}`
- [ ] `app/(core)/podcast/studio/run-d/_components/FinishedEpisode.tsx:67` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{state.description}`

### route /podcast/studio/run-dense/[id]

- [ ] `features/files/blocks/image/UnifiedImageBlockRenderer.tsx:760` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{option.description}`
- [ ] `features/files/blocks/image/UnifiedImageBlockRenderer.tsx:786` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{option.description}`
- [ ] `features/podcasts/generator/components/AssetCard.tsx:187` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{slot.prompt || "Preparing…"}`
- [ ] `features/podcasts/generator/components/MetadataHero.tsx:40` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{state.description}`

### route /podcast/studio/run-e

- [ ] `app/(core)/podcast/studio/run-e/_components/FinishedPlayer.tsx:90` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{state.description}`
- [ ] `app/(core)/podcast/studio/run-e/_components/StageMonitor.tsx:179` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{state.description}`

### route /podcast/studio/run-f

- [ ] `app/(core)/podcast/studio/run-f/_components/FinishedEpisode.tsx:57` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{state.description}`
- [ ] `app/(core)/podcast/studio/run-f/_components/FinishedEpisode.tsx:158` — **.split("\n").map(→ JSX) paragraph renderer** (review) — `script.split("\n").filter(Boolean).map((line, i) => { const [speaker, ...rest] = line.spl…`

### route /podcast/studio/run-refine/[id]

- [ ] `app/(core)/podcast/studio/run-refine/[id]/_components/ProductionStage.tsx:216` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{moment.prompt || "A fresh visual for your episode."}`
- [ ] `features/files/blocks/image/UnifiedImageBlockRenderer.tsx:760` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{option.description}`
- [ ] `features/files/blocks/image/UnifiedImageBlockRenderer.tsx:786` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{option.description}`
- [ ] `features/podcasts/generator/components/AssetCard.tsx:187` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{slot.prompt || "Preparing…"}`
- [ ] `features/podcasts/generator/components/MetadataHero.tsx:40` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{state.description}`

### route /podcast/studio/run-reimagine/[id]

- [ ] `features/files/blocks/image/UnifiedImageBlockRenderer.tsx:760` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{option.description}`
- [ ] `features/files/blocks/image/UnifiedImageBlockRenderer.tsx:786` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{option.description}`
- [ ] `features/podcasts/generator/components/AssetCard.tsx:187` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{slot.prompt || "Preparing…"}`
- [ ] `features/podcasts/generator/components/MetadataHero.tsx:40` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{state.description}`

### route /podcast/studio/run-sharp/[id]

- [ ] `features/files/blocks/image/UnifiedImageBlockRenderer.tsx:760` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{option.description}`
- [ ] `features/files/blocks/image/UnifiedImageBlockRenderer.tsx:786` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{option.description}`
- [ ] `features/podcasts/generator/components/AssetCard.tsx:187` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{slot.prompt || "Preparing…"}`
- [ ] `features/podcasts/generator/components/MetadataHero.tsx:40` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{state.description}`

### route /podcast/studio/run/[id]

- [ ] `components/mardown-display/blocks/media-chapters/MediaChaptersBlock.tsx:115` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{chapter.summary}`
- [ ] `features/files/blocks/image/UnifiedImageBlockRenderer.tsx:760` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{option.description}`
- [ ] `features/files/blocks/image/UnifiedImageBlockRenderer.tsx:786` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{option.description}`
- [ ] `features/podcasts/generator/components/AssetCard.tsx:187` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{slot.prompt || "Preparing…"}`
- [ ] `features/podcasts/generator/components/MetadataHero.tsx:40` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{state.description}`

### route /print

- [ ] `features/print/hub/PrintHub.tsx:36` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{group.description}`

### route /print/education

- [ ] `features/print/sections/EducationSection.tsx:85` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{variant.description}`

### route /print/exams

- [ ] `features/print/sections/ExamSection.tsx:70` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{SAMPLE_PRACTICE_TEST.instructions}`
- [ ] `features/print/sections/ExamSection.tsx:76` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{question.prompt}`
- [ ] `features/print/sections/ExamSection.tsx:103` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{variant.description}`
- [ ] `features/print/sections/ExamSection.tsx:145` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{setting.description}`

### route /print/flashcards

- [ ] `features/print/sections/FlashcardsSection.tsx:56` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{variant.description}`

### route /print/order

- [ ] `features/print/order/PricePanel.tsx:324` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{entry.description ?? "Discount"}`

### route /projects

- [ ] `features/projects/components/ProjectsHub.tsx:1816` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{project.description}`

### route /rag

- [ ] `features/rag/components/data-stores/LibraryCatalogPane.tsx:93` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{it.description}`

### route /rag/data-stores

- [ ] `features/rag/components/data-stores/DataStoresPage.tsx:379` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{store.description}`
- [ ] `features/rag/components/data-stores/DataStoresPage.tsx:923` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{s.description}`
- [ ] `features/rag/components/data-stores/DataStoresPage.tsx:1135` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<td>{m.notes ?? "—"}`

### route /rag/library-catalog

- [ ] `features/rag/components/library-catalog/LibraryCatalogPage.tsx:613` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{item.description}`
- [ ] `features/rag/components/library-catalog/LibraryCatalogPage.tsx:694` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`
- [ ] `features/rag/components/library-catalog/PackDetailPanel.tsx:246` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`
- [ ] `features/rag/components/library-catalog/RulebookDetailPanel.tsx:262` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`

### route /rag/search

- [ ] `features/rag/components/search/RagPageReferences.tsx:1069` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{group.description}`

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

- [ ] `features/research/browse/columns.tsx:54` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.description}`

### route /research/topics/[topicId]

- [ ] `app/(core)/research/topics/[topicId]/page.tsx:20` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}`
- [ ] `features/research/components/init/AutonomySelector.tsx:54` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{config.description}`
- [ ] `features/research/components/overview/pipeline-graph/AutonomyControl.tsx:145` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{opt.description}`
- [ ] `features/research/components/overview/pipeline-graph/ProviderControl.tsx:140` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{opt.description}`

### route /research/topics/[topicId]/agents

- [ ] `features/research/components/agents/AgentRoleCard.tsx:206` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{role.description}`

### route /research/topics/[topicId]/context

- [ ] `features/research/components/resources/BundleBar.tsx:105` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{b.description}`

### route /research/topics/[topicId]/keywords

- [ ] `features/research/components/keywords/KeywordManager.tsx:610` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{source.description}`

### route /research/topics/[topicId]/outputs

- [ ] `features/files/blocks/image/UnifiedImageBlockRenderer.tsx:760` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{option.description}`
- [ ] `features/files/blocks/image/UnifiedImageBlockRenderer.tsx:786` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{option.description}`
- [ ] `features/podcasts/generator/components/AssetCard.tsx:187` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{slot.prompt || "Preparing…"}`
- [ ] `features/research/components/outputs/OutputsStudio.tsx:430` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{def.description}`

### route /research/topics/[topicId]/settings

- [ ] `features/research/components/init/AutonomySelector.tsx:54` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{config.description}`

### route /research/topics/[topicId]/sources

- [ ] `features/research/components/sources/SourceList.tsx:599` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{source.description}`
- [ ] `features/research/components/sources/SourceList.tsx:1686` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{source.description}`

### route /research/topics/[topicId]/sources/[sourceId]

- [ ] `features/research/components/sources/ContentViewer.tsx:132` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<pre>{content.content}`
- [ ] `features/research/components/sources/SourceDetail.tsx:1569` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{typedSource.description}`

### route /research/topics/[topicId]/tags

- [ ] `features/research/components/tags/TagManager.tsx:298` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tag.description}`

### route /research/topics/[topicId]/tasks

- [ ] `features/research/components/tasks/TasksView.tsx:682` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{meta.description}`

### route /research/topics/[topicId]/youtube

- [ ] `features/marketing/discovery/youtube/YouTubeDiscovery.tsx:981` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{video.description || "No description supplied."}`
- [ ] `features/marketing/discovery/youtube/YouTubeVideoPreview.tsx:61` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{video.description || "No description supplied."}`
- [ ] `features/research/components/youtube/ResearchYouTubePage.tsx:322` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{video.description || "No description supplied."}`

### route /research/topics/new

- [ ] `features/research/components/init/TemplatePicker.tsx:85` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{template.description}`

### route /s/[token]

- [ ] `components/mardown-display/blocks/comparison/ComparisonTableBlock.tsx:590` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{comparison.description}`
- [ ] `components/mardown-display/blocks/cooking-recipes/cookingRecipeDisplay.tsx:554` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{step.description}`
- [ ] `components/mardown-display/blocks/cooking-recipes/cookingRecipeDisplay.tsx:582` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{recipe.notes}`
- [ ] `components/mardown-display/blocks/decision-tree/DecisionTreeBlock.tsx:399` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{node.description}`
- [ ] `components/mardown-display/blocks/decision-tree/DecisionTreeBlock.tsx:448` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{node.description}`
- [ ] `components/mardown-display/blocks/decision-tree/DecisionTreeBlock.tsx:593` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{decisionTree.description}`
- [ ] `components/mardown-display/blocks/decision-tree/DecisionTreeBlock.tsx:778` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{currentNode.description}`
- [ ] `components/mardown-display/blocks/map/MapCanvas.tsx:133` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{m.description}`
- [ ] `components/mardown-display/blocks/memory-aid/MemoryAidBlock.tsx:178` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{controls.editor.content}`
- [ ] `components/mardown-display/blocks/memory-aid/MemoryAidBlock.tsx:225` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{controls.editor.content}`
- [ ] `components/mardown-display/blocks/memory-aid/MemoryAidBlock.tsx:249` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{controls.editor.content}`
- [ ] `components/mardown-display/blocks/memory-aid/MemoryAidBlock.tsx:292` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{controls.editor.content}`
- [ ] `components/mardown-display/blocks/memory-aid/MemoryHintBlock.tsx:89` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{hint.explanation}`
- [ ] `components/mardown-display/blocks/presentations/PresentationExportMenu.tsx:445` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{capabilities.pdf.description}`
- [ ] `components/mardown-display/blocks/presentations/PresentationExportMenu.tsx:464` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{capabilities.html.description}`
- [ ] `components/mardown-display/blocks/presentations/PresentationExportMenu.tsx:483` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{capabilities.powerpoint.description}`
- [ ] `components/mardown-display/blocks/presentations/PresentationExportMenu.tsx:527` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{capabilities.googleSlides.description}`
- [ ] `components/mardown-display/blocks/presentations/Slideshow.tsx:239` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{p.description}`
- [ ] `components/mardown-display/blocks/progress/ProgressTrackerBlock.tsx:411` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tracker.description}`
- [ ] `components/mardown-display/blocks/research/ResearchBlock.tsx:560` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{theme.description}`
- [ ] `components/mardown-display/blocks/resources/ResourceCollectionBlock.tsx:333` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{collection.description}`
- [ ] `components/mardown-display/blocks/resources/ResourceCollectionBlock.tsx:497` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{resource.description}`
- [ ] `components/mardown-display/blocks/timeline/TimelineBlock.tsx:418` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{event.description}`
- [ ] `components/mardown-display/blocks/troubleshooting/TroubleshootingBlock.tsx:399` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{troubleshooting.description}`
- [ ] `components/mardown-display/blocks/troubleshooting/TroubleshootingBlock.tsx:605` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{step.description}`
- [ ] `features/agents/decision-questions/DecisionQuestionsTranscriptView.tsx:52` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{q.instructions}`
- [ ] `features/education/study/components/BatchReviewBlock.tsx:65` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{review.summary}`
- [ ] `features/education/tutor/components/LiveHelpAnswerBlock.tsx:63` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{result.answer}`
- [ ] `features/flashcards/components/study/study-deck-parts.tsx:20` — **CardFaceContent** (tracked) — `@/components/mardown-display/blocks/flashcards/CardFaceContent`
- [ ] `features/sharing/lenses/file-lens.tsx:254` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{card.body}`

### route /schedules

- [ ] `features/scheduling/components/list/ScheduleRow.tsx:144` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{task.description}`

### route /schedules/[id]

- [ ] `features/scheduling/components/detail/ScheduleDetail.tsx:557` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{task.description}`
- [ ] `features/scheduling/components/detail/SpecCard.tsx:131` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<pre>{task.prompt}`

### route /schedules/[id]/edit

- [ ] `features/scheduling/components/form/ScheduleForm.tsx:521` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{meta.description}`

### route /schedules/new

- [ ] `features/scheduling/components/form/ScheduleForm.tsx:521` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{meta.description}`

### route /scraper

- [ ] `components/image/gallery/desktop/SimpleImageViewer.tsx:306` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{photos[imageIndex]?.description}`
- [ ] `components/image/unsplash/desktop/EnhancedImageViewer.tsx:299` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{photos[imageIndex]?.description || photos[imageIndex]?.alt_description}`
- [ ] `components/image/unsplash/mobile/MobileUnsplashViewer.tsx:203` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{photos[imageIndex]?.description || photos[imageIndex]?.alt_description || "No descrip…`
- [ ] `components/official/PageTemplate.tsx:138` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{tab.content}`
- [ ] `features/scraper/parts/OrganizedContent.tsx:60` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.content}`
- [ ] `features/scraper/parts/SimplifiedView.tsx:105` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.content}`

### route /scraper/quick

- [ ] `components/image/gallery/desktop/SimpleImageViewer.tsx:306` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{photos[imageIndex]?.description}`
- [ ] `components/image/unsplash/desktop/EnhancedImageViewer.tsx:299` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{photos[imageIndex]?.description || photos[imageIndex]?.alt_description}`
- [ ] `components/image/unsplash/mobile/MobileUnsplashViewer.tsx:203` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{photos[imageIndex]?.description || photos[imageIndex]?.alt_description || "No descrip…`
- [ ] `components/official/PageTemplate.tsx:138` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{tab.content}`
- [ ] `features/scraper/parts/OrganizedContent.tsx:60` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.content}`
- [ ] `features/scraper/parts/SimplifiedView.tsx:105` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.content}`

### route /scraper/search-and-scrape

- [ ] `components/image/gallery/desktop/SimpleImageViewer.tsx:306` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{photos[imageIndex]?.description}`
- [ ] `components/image/unsplash/desktop/EnhancedImageViewer.tsx:299` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{photos[imageIndex]?.description || photos[imageIndex]?.alt_description}`
- [ ] `components/image/unsplash/mobile/MobileUnsplashViewer.tsx:203` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{photos[imageIndex]?.description || photos[imageIndex]?.alt_description || "No descrip…`
- [ ] `components/official/PageTemplate.tsx:138` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{tab.content}`
- [ ] `features/scraper/parts/OrganizedContent.tsx:60` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.content}`
- [ ] `features/scraper/parts/SimplifiedView.tsx:105` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.content}`

### route /seo

- [ ] `app/(public)/seo/page.tsx:190` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tool.description}`

### route /seo/robots-tester

- [ ] `features/marketing/seo/public-tools/RobotsTesterTool.tsx:287` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{primaryCheck.explanation}`
- [ ] `features/marketing/seo/public-tools/RobotsTesterTool.tsx:362` — **.split("\n").map(→ JSX) paragraph renderer** (review) — `result.raw_robots_txt.split("\n").map((line, index) => { const lineNumber = index + 1; re…`

### route /shapes/[kind]

- [ ] `features/content-ir/studio/components/ShapeOwnerEditor.tsx:314` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{ SHAPE_WEB_CHOICES.find( (option) => option.value === publishedToWeb, )?.description }`

### route /shapes/[kind]/examples

- [ ] `features/content-ir/studio/components/ShapeOwnerEditor.tsx:314` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{ SHAPE_WEB_CHOICES.find( (option) => option.value === publishedToWeb, )?.description }`

### route /shapes/[kind]/gate

- [ ] `features/content-ir/studio/components/ShapeOwnerEditor.tsx:314` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{ SHAPE_WEB_CHOICES.find( (option) => option.value === publishedToWeb, )?.description }`

### route /shapes/[kind]/inputs

- [ ] `features/content-ir/studio/components/ShapeOwnerEditor.tsx:314` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{ SHAPE_WEB_CHOICES.find( (option) => option.value === publishedToWeb, )?.description }`

### route /shapes/[kind]/instances

- [ ] `features/content-ir/studio/components/ShapeOwnerEditor.tsx:314` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{ SHAPE_WEB_CHOICES.find( (option) => option.value === publishedToWeb, )?.description }`

### route /shapes/[kind]/schema

- [ ] `features/content-ir/studio/components/ShapeOwnerEditor.tsx:314` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{ SHAPE_WEB_CHOICES.find( (option) => option.value === publishedToWeb, )?.description }`

### route /shapes/[kind]/stream

- [ ] `features/content-ir/studio/components/ShapeOwnerEditor.tsx:314` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{ SHAPE_WEB_CHOICES.find( (option) => option.value === publishedToWeb, )?.description }`

### route /shapes/[kind]/table

- [ ] `features/content-ir/studio/components/ShapeOwnerEditor.tsx:314` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{ SHAPE_WEB_CHOICES.find( (option) => option.value === publishedToWeb, )?.description }`

### route /shapes/[kind]/template

- [ ] `features/content-ir/studio/components/ShapeOwnerEditor.tsx:314` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{ SHAPE_WEB_CHOICES.find( (option) => option.value === publishedToWeb, )?.description }`

### route /shapes/[kind]/test

- [ ] `features/content-ir/studio/components/ShapeOwnerEditor.tsx:314` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{ SHAPE_WEB_CHOICES.find( (option) => option.value === publishedToWeb, )?.description }`

### route /shapes/new

- [ ] `features/content-ir/studio/components/NewShapeClient.tsx:164` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{option.description}`
- [ ] `features/content-ir/studio/components/NewShapeClient.tsx:503` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{asset.description}`

### route /spaces/[spaceId]

- [ ] `features/spaces/ai/AskAiMenu.tsx:37` — **MarkdownStream** (tracked) — `@/components/MarkdownStream`

### route /surfaces/[...name]

- [ ] `features/surfaces/components/hub/SurfaceHubDetailPage.tsx:365` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{resolved.role.description}`

### route /templates/[slug]

- [ ] `app/(public)/templates/[slug]/page.tsx:130` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}`
- [ ] `features/templates/components/InstalledTemplate.tsx:244` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{s.body}`

### route /templates/apps

- [ ] `features/marketing/applets/AppletIntroPage.tsx:95` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{applet.description}`
- [ ] `features/templates/components/InstalledTemplate.tsx:244` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{s.body}`

### route /tools/pdf-extractor

- [ ] `features/pdf-extractor/components/CopyPagesOverlay.tsx:773` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{copyAllTier.notes || "—"}`
- [ ] `features/pdf-extractor/components/CopyPagesOverlay.tsx:859` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{tier.notes || "—"}`
- [ ] `features/pdf-extractor/studio/PdfStudioReader.tsx:2145` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<pre>{doc.content ?? "(no extracted text)"}`

### route /tools/product-capture

- [ ] `features/product-capture/components/ItemSwipeRow.tsx:158` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{row.notes}`

### route /tools/product-capture/all

- [ ] `features/product-capture/components/AllItemsTable.tsx:261` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.notes}`
- [ ] `features/product-capture/components/ItemSwipeRow.tsx:158` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{row.notes}`

### route /tools/product-capture/answer

- [ ] `features/product-capture/components/pipeline/AnswerQueue.tsx:287` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{question.prompt}`

### route /tools/product-capture/instant

- [ ] `features/product-capture/components/ItemSwipeRow.tsx:158` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{row.notes}`

### route /tools/product-capture/manage

- [ ] `features/product-capture/components/pipeline/QuestionsPanel.tsx:140` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{question.prompt}`

### route /transcripts

- [ ] `features/transcripts/browse/TranscriptBrowseCards.tsx:88` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{row.description}`
- [ ] `features/transcripts/browse/columns.tsx:334` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{row.description}`

### route /transcripts/new

- [ ] `app/(core)/transcripts/new/page.tsx:119` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{opt.description}`

### route /transcripts/processor

- [ ] `features/transcripts/components/TranscriptViewer.tsx:611` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{activeTranscript.description}`
- [ ] `features/transcripts/components/TranscriptsSidebar.tsx:345` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{transcript.description}`

### route /transcripts/studio

- [ ] `features/transcript-studio/components/columns/ConceptsColumn.tsx:301` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{item.description}`
- [ ] `features/transcript-studio/components/settings/ModulePicker.tsx:56` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{m.description}`

### route /user-settings/[[...path]]

- [ ] `components/official/settings/primitives/SettingsRadioGroup.tsx:78` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{opt.description}`
- [ ] `features/connectors/ConnectorPromptCard.tsx:164` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{provider.prompt.body}`
- [ ] `features/connectors/IntegrationDirectory.tsx:564` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{item.description}`
- [ ] `features/connectors/IntegrationDirectory.tsx:662` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{item.description}`
- [ ] `features/organizations/components/OrganizationCard.tsx:178` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{organization.description}`
- [ ] `features/settings/pages/FeedbackSettingsPage.tsx:596` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{item.description}`
- [ ] `features/settings/pages/IntegrationsSettingsPage.tsx:1179` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{entry.description}`

### route /vault

- [ ] `features/secrets/components/VaultCreateDialog.tsx:1350` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{loginUrlDef?.description ?? "Where this login is used. Stored as plain, unencrypted m…`
- [ ] `features/secrets/components/VaultCreateDialog.tsx:1790` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{draft.def.description}`
- [ ] `features/secrets/components/VaultCreateDialog.tsx:1939` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{def.description}`
- [ ] `features/secrets/components/VaultHandlingControl.tsx:80` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{presentation.description}`
- [ ] `features/secrets/components/VaultItemDetail.tsx:2517` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{VAULT_LABELS.notes}`

### route /vault/[itemId]

- [ ] `features/secrets/components/VaultCreateDialog.tsx:1350` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{loginUrlDef?.description ?? "Where this login is used. Stored as plain, unencrypted m…`
- [ ] `features/secrets/components/VaultCreateDialog.tsx:1790` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{draft.def.description}`
- [ ] `features/secrets/components/VaultCreateDialog.tsx:1939` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{def.description}`
- [ ] `features/secrets/components/VaultHandlingControl.tsx:80` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{presentation.description}`
- [ ] `features/secrets/components/VaultItemDetail.tsx:2517` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{VAULT_LABELS.notes}`

### route /vault/authenticator

- [ ] `features/secrets/components/VaultCreateDialog.tsx:1350` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{loginUrlDef?.description ?? "Where this login is used. Stored as plain, unencrypted m…`
- [ ] `features/secrets/components/VaultCreateDialog.tsx:1790` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{draft.def.description}`
- [ ] `features/secrets/components/VaultCreateDialog.tsx:1939` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{def.description}`
- [ ] `features/secrets/components/VaultHandlingControl.tsx:80` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{presentation.description}`

### route /voice/playground

- [ ] `features/audio/voice/VoicesList.tsx:235` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{voice.description}`
- [ ] `features/audio/voice/components/VoiceSelectionModal.tsx:237` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{voice.description || "No description available"}`

### route /war-room/all

- [ ] `features/war-room/components/all/SessionCard.tsx:154` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{session.description}`

### route /welcome

- [ ] `app/(core)/welcome/WelcomeClient.tsx:175` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{option.description}`

### route /why-ai-matrx

- [ ] `app/(public)/why-ai-matrx/page.tsx:261` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{beat.body}`

### route /work/conversations/[conversationId]

- [ ] `features/ai-work/analysis/ConversationAnalyzePanel.tsx:143` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{kind.description}`
- [ ] `features/ai-work/components/ProviderConversationTranscript.tsx:406` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{conversation.description}`

### route /work/new

- [ ] `features/ai-work/compose/components/DestinationStep.tsx:83` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{destination.summary}`

### route /workbooks

- [ ] `app/(core)/workbooks/page.tsx:601` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{wb.description}`

### route /workflows/bakeoff

- [ ] `app/(core)/workflows/bakeoff/page.tsx:128` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{row.description}`

### route /workflows/battle

- [ ] `features/workflow-comparison/components/ArmSetupCard.tsx:185` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{c.description}`

### route /workflows/runs/analyze

- [ ] `components/official/drill-explorer/DrillExplorerHeadline.tsx:36` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<li>{fact.content}`

## Reached by no surface

No route, overlay or opener imports these (dead code, test-only, or loaded by a string registry the graph cannot see).

- [ ] `app/(admin)/administration/ui/official-components/component-displays/content-editor.tsx:6` — **components/official/content-editor/ContentEditor** (BANNED) — `@/components/official/content-editor/ContentEditor`
- [ ] `app/(admin)/administration/ui/official-components/component-displays/image-asset-uploader.tsx:207` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{PRESETS.find((p) => p.preset === preset)?.description}`
- [ ] `app/(admin)/administration/ui/official-components/parts/ComponentHeader.tsx:146` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{component.description}`
- [ ] `app/(dev)/demos/agent-cards/page.dev.tsx:495` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{entry.summary}`
- [ ] `app/(dev)/demos/api-tests/matrx-ai/conversation-demo/ConversationDemoClient.tsx:160` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{turn.content}`
- [ ] `app/(dev)/demos/api-tests/matrx-ai/conversation-demo/ConversationDemoClient.tsx:187` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{turn.content}`
- [ ] `app/(dev)/demos/api-tests/matrx-ai/tools-demo/ToolsDemoClient.tsx:534` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{selectedTool.description}`
- [ ] `app/(dev)/demos/api-tests/matrx-ai/tools-demo/ToolsDemoClient.tsx:559` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{param.description}`
- [ ] `app/(dev)/demos/api-tests/tool-testing/components/ArgumentForm.tsx:318` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{param.description}`
- [ ] `app/(dev)/demos/api-tests/tool-testing/components/ResultsPanel.tsx:526` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<pre>{finalPayload.output.model_facing_result.content}`
- [ ] `app/(dev)/demos/api-tests/tool-testing/components/ToolListSidebar.tsx:153` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tool.description}`
- [ ] `app/(dev)/demos/canonical-flashcards-reimagine/page.dev.tsx:598` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{presentationCopy[presentation].description}`
- [ ] `app/(dev)/demos/canonical-flashcards/page.dev.tsx:246` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{variant.description}`
- [ ] `app/(dev)/demos/context-menu/_components/ContextMenuHubClient.tsx:154` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{page.description}`
- [ ] `app/(dev)/demos/context-menu/surface-mappings/page.dev.tsx:414` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{group.description}`
- [ ] `app/(dev)/demos/dashboard/components/QuickActions.tsx:54` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{action.description}`
- [ ] `app/(dev)/demos/dashboard/components/RecentActivity.tsx:83` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`
- [ ] `app/(dev)/demos/diff-gallery/page.dev.tsx:101` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{seg.content}`
- [ ] `app/(dev)/demos/general/fetch-react/HtmlDisplay.tsx:40` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: html }}`
- [ ] `app/(dev)/demos/general/voice/debate-assistant/debate-page.tsx:137` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{message.content}`
- [ ] `app/(dev)/demos/glass-lab/_components/VariantPicker.tsx:144` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{v.description}`
- [ ] `app/(dev)/demos/header-demo/HeaderDemoClient.tsx:280` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{v.description}`
- [ ] `app/(dev)/demos/lists-explorer/page.dev.tsx:67` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{route.description}`
- [ ] `app/(dev)/demos/local-tools/page.dev.tsx:252` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{page.description}`
- [ ] `app/(dev)/demos/local-tools/scraper/page.dev.tsx:447` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{r.description}`
- [ ] `app/(dev)/demos/scraper/page.dev.tsx:63` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{demo.description}`
- [ ] `app/(dev)/demos/scraper/search/page.dev.tsx:71` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description || item.snippet}`
- [ ] `app/(dev)/demos/settings-tree/page.dev.tsx:207` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{node.description}`
- [ ] `app/(dev)/demos/tests/extension-bridge/ConnectionPanels.tsx:347` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<pre>{healthResult.body}`
- [ ] `app/(dev)/demos/tests/google-apis/pagespeed/components/CategoryDetails.tsx:92` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{audit.description}`
- [ ] `app/(dev)/demos/tests/google-apis/pagespeed/components/CategoryDetails.tsx:111` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{category.description}`
- [ ] `app/(dev)/demos/tests/google-apis/pagespeed/components/PageSpeedForm.tsx:142` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{category.description}`
- [ ] `app/(dev)/demos/tests/integrations/option-two/BusinessIntegrations.tsx:257` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{integration.description}`
- [ ] `app/(dev)/demos/tests/integrations/simple/IntegrationPortal.tsx:220` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{integration.description}`
- [ ] `app/(dev)/demos/tests/matrx-local/DownloadEndpointCard.tsx:111` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{endpoint.description}`
- [ ] `app/(dev)/demos/tests/matrx-local/EndpointCard.tsx:33` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{endpoint.description}`
- [ ] `app/(dev)/demos/tests/sms/components/ConversationsList.tsx:257` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{msg.body}`
- [ ] `app/(dev)/demos/tests/utility-function-tests/smart-executor-demo/page.dev.tsx:99` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{comp.description}`
- [ ] `app/(dev)/demos/ui-unification/_components/toast-system.tsx:263` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{detail.body}`
- [ ] `app/(dev)/demos/ui-unification/samples/agent-builder/_components/BuilderProposalFrame.tsx:112` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: PREVIEW_CSS }}`
- [ ] `app/(dev)/demos/ui-unification/samples/education-flashcards/_components/FlashcardSetSample.tsx:123` — **CardFaceContent** (tracked) — `@/components/mardown-display/blocks/flashcards/CardFaceContent`
- [ ] `app/(dev)/demos/ui-unification/samples/education-flashcards/_components/FlashcardSetSample.tsx:1141` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: FC_SAMPLE_CSS }}`
- [ ] `app/(dev)/demos/ui-unification/samples/education-flashcards/_components/FlashcardSetSample.tsx:1816` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: FC_SAMPLE_CSS }}`
- [ ] `app/(dev)/demos/ui-unification/samples/education-flashcards/_components/FlashcardSetSample.tsx:1226` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{m.description}`
- [ ] `app/(dev)/demos/ui-unification/samples/education-flashcards/_components/FlashcardSetSample.tsx:1458` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{data.set.description}`
- [ ] `app/(dev)/demos/ui-unification/samples/education-flashcards/_components/FlashcardSetSample.tsx:1797` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{mode.description}`
- [ ] `app/(transitional)/_flash-cards/ai/AiMessaging.tsx:76` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{msg.content}`
- [ ] `components/ai/AiChatModal.tsx:18` — **MarkdownRenderer** (tracked) — `@/components/mardown-display/MarkdownRenderer`
- [ ] `components/ai/AiMessaging.tsx:76` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{msg.content}`
- [ ] `components/animated/demos/feature-sections/simple-feature-with-gradient.tsx:18` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{feature.description}`
- [ ] `components/brokers/output/AnimatedEventComponent.tsx:82` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`
- [ ] `components/brokers/output/EventComponent.tsx:50` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`
- [ ] `components/generic-table/GenericDataTable.tsx:422` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{emptyState.description}`
- [ ] `components/mardown-display/chat-markdown/analyzer/analyzer-options/DynamicViewerTester.tsx:242` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{option.description}`
- [ ] `components/mardown-display/chat-markdown/analyzer/analyzer-options/FlatSectionViewer.tsx:198` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<pre>{selectedSection.content}`
- [ ] `components/mardown-display/chat-markdown/analyzer/analyzer-options/IntelligentViewer.tsx:478` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{recommendation.reasoning}`
- [ ] `components/mardown-display/markdown-classification/usePrepareMarkdownForRendering.ts:27` — **remark-* plugins** (BANNED) — `remark-parse`
- [ ] `components/mardown-display/markdown-classification/usePrepareMarkdownForRendering.ts:28` — **remark-* plugins** (BANNED) — `remark-gfm`
- [ ] `components/markdown.tsx:6` — **MarkdownStream** (tracked) — `./MarkdownStream`
- [ ] `components/matrx/matrx-collapsible/collapsible-group.tsx:70` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{item.content}`
- [ ] `components/matrx/matrx-record-list/basic-record-edit-list.tsx:126` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{item.content}`
- [ ] `components/matrx/matrx-record-list/basic-record-list.tsx:145` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{item.content}`
- [ ] `components/matrx/matrx-record-list/unified-record-list.tsx:170` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{item.content}`
- [ ] `components/message-display/MarkdownWithPlugins.tsx:5` — **react-markdown** (BANNED) — `react-markdown` (type-only)
- [ ] `components/message-display/MessageContentDisplay.tsx:10` — **react-markdown** (BANNED) — `react-markdown` (type-only)
- [ ] `components/official/HelpIcon.tsx:134` — **.split("\n").map(→ JSX) paragraph renderer** (review) — `processedText.split('\n').map((line, index) => ( <React.Fragment key={index}> {index > 0 …`
- [ ] `components/official/content-editor/ContentEditorStack.tsx:5` — **components/official/content-editor/ContentEditor** (BANNED) — `./ContentEditor`
- [ ] `components/official/mobile-action-bar/MobileFilterDrawer.tsx:153` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{field.description}`
- [ ] `components/official/processor-extractor/path-management/BookmarkManager.tsx:167` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{bookmark.description}`
- [ ] `components/rich-text-editor/MarkdownDualDisplay.tsx:155` — **dangerouslySetInnerHTML** (review) — `dangerouslySetInnerHTML={{ __html: html }}`
- [ ] `components/rich-text-editor/MarkdownDualDisplay.tsx:8` — **@remirror/* (installed, unused)** (BANNED) — `@remirror/react`
- [ ] `components/rich-text-editor/RemirrorEditor.tsx:8` — **@remirror/* (installed, unused)** (BANNED) — `@remirror/react`
- [ ] `components/ts-function-registry/AppletBuilder.tsx:320` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{param.description}`
- [ ] `components/ts-function-registry/AppletFunctionPicker.tsx:153` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{param.description}`
- [ ] `components/ts-function-registry/AppletFunctionPicker.tsx:254` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{selectedFunction.metadata.description}`
- [ ] `components/ts-function-registry/AppletRunner.tsx:99` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{step.description}`
- [ ] `components/ts-function-registry/AppletRunner.tsx:139` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{applet.description}`
- [ ] `components/ui/cards/apple-cards-carousel.tsx:241` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{card.content}`
- [ ] `features/agent-settings/components/ToolSelectorPanel.tsx:124` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{tool.description}`
- [ ] `features/agents/components/assignment-demo/AgentAssignmentsDemo.tsx:125` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{mode.description}`
- [ ] `features/audio/voice/VoiceModal.tsx:112` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{voice.description}`
- [ ] `features/content-ir/sandbox/runtime/FrameMarkdown.tsx:27` — **react-markdown** (BANNED) — `react-markdown`
- [ ] `features/content-ir/sandbox/runtime/FrameMarkdown.tsx:28` — **remark-* plugins** (BANNED) — `remark-gfm`
- [ ] `features/cx-dashboard/components/CxDashboardRedirect.tsx:46` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{link.description}`
- [ ] `features/legal/wc/pd-ratings/components/landing/PdRatingsCalculatorLanding.tsx:241` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{tool.description}`
- [ ] `features/legal/wc/pd-ratings/components/landing/PdRatingsCalculatorLanding.tsx:268` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{step.description}`
- [ ] `features/legal/wc/pd-ratings/components/landing/PdRatingsCalculatorLanding.tsx:299` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{item.description}`
- [ ] `features/message-templates/components/SmartInputMessageTemplatePicker.tsx:125` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{template.content}`
- [ ] `features/pricing/components/industry/IndustryUpgrade.tsx:165` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{u.body}`
- [ ] `features/pricing/components/industry/IndustryUpgrade.tsx:180` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{cfg.quote.body}`
- [ ] `features/projects/components/ProjectCard.tsx:143` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{project.description}`
- [ ] `features/rag/components/library/ProcessingProgressDialog.tsx:373` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{s.description}`
- [ ] `features/scope-system/components/ScopeTypeCard.tsx:65` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{scopeType.description}`
- [ ] `features/scraper/parts/tabs/images/SEOImageViewer.tsx:252` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{currentMetadata.description}`
- [ ] `features/surfaces/components/AgentSurfacesPanel.tsx:583` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{surface.description}`
- [ ] `features/surfaces/components/AgentSurfacesPanel.tsx:1172` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<span>{s.description}`
- [ ] `features/surfaces/components/ValueMappingEditor.tsx:521` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{selected.description}`
- [ ] `features/surfaces/components/ValueMappingEditor.tsx:650` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<p>{offered.description}`
- [ ] `features/text-diff/components/DiffHistory.tsx:298` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{version.content}`
- [ ] `lib/field-formats/FieldFormatPicker.tsx:507` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{f.description}`
- [ ] `lib/field-formats/FieldFormatPicker.tsx:525` — **{x.content|body|description|prompt|reasoning|transcript…} inside <p>/<pre>/<span>/<div>/<li>/<td>** (review) — `<div>{f.description}`
