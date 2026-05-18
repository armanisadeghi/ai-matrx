# `MarkdownStream` → `onContentChange` propagation

**API name:** The shell exposes **`onContentChange?: (newContent: string) => void`**, not `onUpdate`. Passing `onUpdate` does nothing (wrong prop / types).

**Question:** If `onContentChange` is provided on `MarkdownStream`, does it **fully work** end-to-end for every edit path?

**Answer:** **No** — propagation is **patchy**. The callback is threaded through many layers, but several modes and block types never call it, or only receive **partial** document updates.

> **Update (2026-05-17):** `AgentAssistantMessage` now **does** pass
> `onContentChange` to `MarkdownStream` (it dispatches
> `commitInlineContentEdit`, which patches `activeRequests.editedText`,
> applies an optimistic `updateMessageRecord`, and debounces a
> `cx_message_edit` RPC so `content_history` archives once per edit
> session — not once per keystroke). Recoverable versions are exposed via
> `AssistantActionBar` → "Edit history" → `EditHistoryDialog`. The block
> types still listed as "No" below (CSV cells, nested previews,
> diff/search-replace fallbacks) remain unwired — they don't call
> `replaceBlockContent` at all, so the new top-level wiring doesn't reach
> them.

---

## Propagation table

| Layer / consumer | Prop reaches? | Fully works? | If no — why |
|------------------|---------------|--------------|-------------|
| `MarkdownStream` (shell) | Yes | Yes | Typed as `onContentChange`; forwarded via dynamic import + props spread. |
| `MarkdownStreamImpl` | Yes | Yes | Passes `...restProps` into `StreamAwareChatMarkdown`. |
| `BlockRenderingProvider` | N/A | N/A | No content callback. |
| `StreamAwareChatMarkdown` — **legacy / single stream** (`content` only, or events **without** interleaved tool blocks) | Yes | Yes | Single `EnhancedChatMarkdownInternal` gets `onContentChange` in `restProps`; replacements apply to the **full** `currentContent`. |
| `StreamAwareChatMarkdown` — **event mode + `tool_call` blocks** | Yes (copied to each segment) | **No** | Renders **multiple** `EnhancedChatMarkdownInternal` instances, each with `content={textBlock.content}` only. Each keeps its **own** `editedContent`/`replaceBlockContent` over a **fragment**. `onContentChange(updated)` receives **that fragment**, not the full message + tool layout. |
| `EnhancedChatMarkdownInternal` | Yes | Partial | Calls `onContentChange` from `replaceBlockContent` and `handleSaveEdit`. See rows below for **which** UIs trigger those. |
| Inline `FullScreenMarkdownEditor` (`allowFullScreenEditor === true`) | Partial | Partial | `EnhancedChatMarkdown` passes **`onSave` only**, not `onChange`. Tabs still update **local** `editedContent` via `handleContentChange`, but **`onContentChange` for the parent is only invoked on explicit Save** (`handleSaveEdit`). Keystrokes / tab switches do not sync upstream until save (unless you extend the code to pass `onChange` too). |
| `BlockRenderer` → `replaceBlockContent` paths | Yes | Yes (for those block types) | Code blocks, markdown fenced blocks, tables, brokers, inline decisions call `replaceBlockContent` → `onContentChange?.(fullUpdatedString)` when not streaming. |
| `BasicMarkdownContent` — hover “edit” | Conditional | Partial | `onEditRequest` is only set when **`onContentChange` is truthy**. If the editor opens but **`allowFullScreenEditor` is false**, `FullScreenMarkdownEditor` is **not rendered** — opening the editor does **not** surface a working save path to `onContentChange`. |
| `MarkdownPreviewBlock` — source / `CodeBlock` | Yes | Yes | `onCodeChange` wired to `replaceBlockContent` when stream inactive. |
| `MarkdownPreviewBlock` — preview mode | N/A | N/A | `BasicMarkdownContent` without `onEditRequest`; display-only. |
| `StreamingTableRenderer` | Yes | Partial | `onContentChange` runs from `notifyContentChange` on certain exit/save paths; in-edit cell state is local until those fire. |
| `MatrxBrokerBlock` | Yes | Partial | Updates message via `onUpdate` → `replaceBlockContent`; **also** mutates entity Redux (`directUpdateRecord`) — two sinks unless reconciled elsewhere. |
| `InlineDecisionBlock` | Yes | Yes | `onResolve` → `replaceBlockContent` with chosen text. |
| `CodeBlock` (generic) | Yes | Yes when `onCodeChange` passed from `BlockRenderer` | Without parent `replaceBlockContent`, edits stay inside `CodeBlock`’s local `editedCode`. |
| `CsvBlock` | No | **No** | `BlockRenderer` does **not** pass any updater; cell edits mutate **local** `data` only — **never** serializes back into markdown. |
| `StreamingDiffBlock` / `SearchReplaceBlock` | No | **No** | Fallback `CodeBlock` instances **omit** `onCodeChange`; no `replaceBlockContent` hook. |
| Nested `MarkdownStream` (e.g. `MatrxSplit` preview, `FullScreenMarkdownEditor` preview tab) | Default: no | **No** | Nested instances are **not** given parent `onContentChange`; preview is not wired as an editor for the parent document. |
| `ToolCallVisualization` | N/A | N/A | Not driven by markdown `onContentChange`. |

---

## Short summary

- **Clear chain for a plain markdown string** (one `EnhancedChatMarkdownInternal`, blocks that use `replaceBlockContent`): **mostly yes**, provided you use **`onContentChange`** and **enable** full-screen editing when you rely on the prose pencil + modal flow.
- **Not a single guaranteed chain** for: **event + tool interleaving**, **CSV cell editing**, **diff/search-replace code fallbacks**, **nested markdown previews**, and **full-screen edits until Save** (no live `onChange` from `EnhancedChatMarkdown` today).

---

*Related: [`TASK-MARKDOWN-CONTENT-UPDATE-ANALYSIS.md`](./TASK-MARKDOWN-CONTENT-UPDATE-ANALYSIS.md).*
