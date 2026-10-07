# Full-screen markdown / editor overlays — audit

Inventory of components that are **nearly identical** (same shell pattern, overlapping tabs) and how they differ. Generated for refactors and consolidation decisions.

---

## 1. Core pair: both use `FullScreenOverlay` + tabs

| | **FullScreenMarkdownEditor** | **HtmlPreviewFullScreenEditor** |
|---|---|---|
| **File** | `components/mardown-display/chat-markdown/FullScreenMarkdownEditor.tsx` | `features/html-pages/components/HtmlPreviewFullScreenEditor.tsx` |
| **Data model** | `initialContent` string + `setEditedContent` locally | `htmlPreviewState` from `useHtmlPreviewState` (markdown, HTML build, publish, etc.) |
| **Plain text** | Built-in `<textarea>` tab | `MarkdownPlainTextTab` |
| **Matrx Split** | `MatrxSplit` inline | `MatrxSplitTab` |
| **TUI editor** | Tabs `markdown` / `wysiwyg` (`TuiEditorContent`) | First tab `id: "markdown"`, label “Rich Text Editor”, `editMode="markdown"` only (no separate `wysiwyg` tab id) |
| **Preview** | `MarkdownStream` in a centered column | `MarkdownPreviewTab` (“Matrx Preview”) |
| **Extra** | Optional **analysis** tabs when `analysisData` has fields (metadata, classified output, section viewers, …) | **HTML Files**, **Custom Copy**, **Publish** tabs |
| **Close API** | `onCancel` | `onClose` |
| **Save** | `onSave` optional; copy button via `CopyButtons` (alchemy menu) | `onSave` optional; `showSaveButton` prop |

These two are the main “duplicate product” surfaces: same overlay primitive, different state depth (chat vs HTML publishing).

---

## 2. Same *name*, different implementation (easy to confuse)

| Export | File | Shell | What it actually is |
|--------|------|-------|---------------------|
| **FullscreenMarkdownEditor** *(lowercase **screen**)* | `components/mardown-display/markdown-classification/FullscreenMarkdownEditor.tsx` | Custom `fixed` backdrop + header (**not** `FullScreenOverlay`) | **MarkdownClassificationTester** (classification admin). Used from `OverlayController`, socket accordion. |
| **FullScreenEditor** | `features/prompts/components/FullScreenEditor.tsx` | **Radix `Dialog`**, not `FullScreenOverlay` | Prompt builder (messages, variables, tools, model settings). Not a markdown-only overlay. |
| **FullScreenAppletPreview** | `features/applet/builder/previews/FullScreenAppletPreview.tsx` | Custom full-screen preview chrome | Live applet preview, unrelated to markdown editing. |

Naming collision: **`FullScreenMarkdownEditor`** vs **`FullscreenMarkdownEditor`** — different folders, different behavior.

---

## 3. `FullScreenMarkdownEditor` — call-site matrix

One implementation; differences are **props only**.

| Call site | `analysisData` | `messageId` | Save / copy | `tabs` (summary) | `initialTab` |
|-----------|----------------|-------------|-------------|------------------|--------------|
| `../aidream/apps/shared/chat/src/cx-conversation/AssistantMessage.tsx` | — | yes | defaults | `write`, `matrx_split`, `markdown`, `wysiwyg`, `preview` | **`matrx_split`** |
| `features/chat/.../assistant-message/AssistantMessage.tsx` | yes | yes | defaults | *(component defaults — includes many analysis tabs)* | default (`write`) |
| `components/mardown-display/chat-markdown/EnhancedChatMarkdown.tsx` | yes | yes | defaults | defaults | default |
| `components/playground/messages/MessageEditor.tsx` | yes | yes | defaults | defaults | **`preview`** |
| `components/playground/results/panelRegistry.tsx` | yes | — | **no save button** | `write`, `wysiwyg`, `preview` + analysis\* | **`preview`** |
| `components/socket/response/SocketPanelResponse.tsx` | yes | — | **no save button** | `write`, **`rich`**, `preview` + analysis\* | **`preview`** |
| `features/public-chat/.../MessageDisplay.tsx` | — | — | defaults | `write`, `markdown`, `wysiwyg`, `preview` | **`write`** |
| `features/prompts/.../PromptSystemMessage.tsx` | — | — | defaults | `write`, `markdown`, `wysiwyg`, `preview` | **`write`** |
| `features/prompts/.../PromptAssistantMessage.tsx` | — | — | defaults | same as prompts system | **`write`** |
| `components/mardown-display/text-block/NewRichTextEditor.tsx` | — | — | defaults | full defaults | default |

\*Analysis bundle: `analysis`, `metadata`, `config`, `classified_output`, `classified_analyzer`, `classified_analyzer_sidebar`, `section_viewer_v2`, `lines_viewer`, `sections_viewer`, `headers_viewer`, `section_texts_viewer`.

**Likely bug / tech debt:** `SocketPanelResponse` passes a tab id **`"rich"`** with a `@ts-ignore`; **`FullScreenMarkdownEditor`** does not define a `rich` tab — that entry probably does nothing.

---

## 4. `HtmlPreviewFullScreenEditor` — call-site matrix

| Call site | `analysisData` | `messageId` | `onSave` / `showSaveButton` | Title / description notes |
|-----------|----------------|-------------|-----------------------------|---------------------------|
| `../aidream/apps/shared/chat/src/cx-conversation/AssistantMessage.tsx` | — | yes | default off | “HTML Preview & Publishing” |
| `features/chat/.../AssistantMessage.tsx` | yes | yes | default off | same |
| `features/prompts/...` (system + assistant) | — | — | default off | same |
| `features/public-chat/.../HtmlPreviewModal.tsx` | — | — | default off | same |
| `features/applet/runner/.../AppletPostActionButtons.tsx` | — | — | **wired + visible** | “Edit Response” |
| `components/content-editor/ContentManagerMenu.tsx` | — | — | default off | “HTML Content Publisher” |

---

## 5. Implementation quirks worth fixing when consolidating

1. **`HtmlPreviewFullScreenEditor`**: `useState` for active tab is **`"wysiwyg"`**, but tab definitions use ids like **`markdown`**, **`write`**, **`matrx-split`** — there is **no** `id: "wysiwyg"`. Confirm `FullScreenOverlay` fallback behavior on first paint.
2. **`HtmlPreviewFullScreenEditor`**: `handleTabChange` syncs when `activeTab === "wysiwyg"`; with no such tab id, that branch may never run (stale TUI sync risk).
3. **Tab labeling**: `FullScreenMarkdownEditor` labels TUI markdown tab **“Split View Editor”**; `HtmlPreviewFullScreenEditor` labels **`markdown`** tab **“Rich Text Editor”** — same underlying `TuiEditorContent` patterns, different words.
4. **Lazy loading**: cx `AssistantMessage` lazy-loads both full-screen editors; many other routes import them eagerly.

---

## 6. File reference index

| Artifact | Path |
|----------|------|
| Shared shell | `components/official/FullScreenOverlay.tsx` |
| Chat markdown overlay | `components/mardown-display/chat-markdown/FullScreenMarkdownEditor.tsx` |
| HTML publish overlay | `features/html-pages/components/HtmlPreviewFullScreenEditor.tsx` |
| Classification overlay (different shell) | `components/mardown-display/markdown-classification/FullscreenMarkdownEditor.tsx` |
