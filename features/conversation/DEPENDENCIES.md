# Conversation Feature — External Dependencies

> **Last updated:** 2026-03-17
>
> Catalogs every import from outside `features/conversation/`, `components/conversation/`,
> and `lib/redux/chatConversations/`. Use this to assess coupling and plan internalization.

---

## Internalized (no longer external)

These were previously external but have been copied into `features/conversation/`:

| What | Original Location | New Location |
|------|-------------------|--------------|
| `parseResourcesFromMessage`, `messageContainsResources`, `extractMessageWithoutResources` | `@/features/prompts/utils/resource-parsing` | `features/conversation/utils/resource-parsing.ts` |
| `printMarkdownContent` | `@/features/chat/utils/markdown-print-utils` | `features/conversation/utils/markdown-print.ts` |
| `useDomCapturePrint` | `@/features/chat/hooks/useDomCapturePrint` | `features/conversation/hooks/useDomCapturePrint.ts` |

---

## Tool rendering (delegated)

Tool-call rendering is **not owned by this feature**. `ToolCallVisualization`, the renderer registry, the `ToolRendererProps` contract, dynamic/DB-stored renderers, and the admin UI all live in `@/features/tool-call-visualization`. Conversation consumers import the shell component and hand it a `ToolLifecycleEntry` from the Redux `active-requests` slice (plus optional raw `ToolEventPayload[]`).

---

## Tier 1: Core Infrastructure (stable, keep as-is)

Project-wide utilities with stable interfaces. No action needed.

| Import | Used By | Source |
|--------|---------|--------|
| `useAppDispatch`, `useAppSelector` | ConversationInput, MessageList, AssistantMessage, useConversationSession | `@/lib/redux/hooks` |
| `chatConversationsActions`, selectors, thunks | All components | `@/lib/redux/chatConversations/*` |
| `selectUser`, `selectAccessToken`, `selectIsAdmin` | MessageOptionsMenu, sendMessage thunk | `@/lib/redux/slices/userSlice` |
| `selectIsUsingLocalhost` | sendMessage thunk | `@/lib/redux/slices/adminPreferencesSlice` |
| `parseNdjsonStream` | sendMessage thunk | `@/lib/api/stream-parser` |
| `ENDPOINTS`, `BACKEND_URLS` | sendMessage thunk | `@/lib/api/endpoints` |
| `buildCanonicalBlocks`, `extractPersistableToolBlocks` | sendMessage thunk, StreamingContentBlocks | `@/lib/chat-protocol` |
| `ToolCallVisualization`, renderer registry, `ToolRendererProps` | StreamingContentBlocks, AssistantMessage | `@/features/tool-call-visualization` |
| `ToolLifecycleEntry` type | StreamingContentBlocks (mapping from `ToolCallBlock`) | `@/features/agents/types/request.types` |
| `cn` | shared UI | `@/lib/utils` |
| `StreamEvent` / `ToolEventPayload` types | StreamingContentBlocks, sendMessage thunk | `@/types/python-generated/stream-events` |
| `Button`, `Textarea`, etc. | Multiple | `@/components/ui/*` |
| `lucide-react` icons | Multiple | npm |
| `uuid` | useConversationSession | npm |
| `sonner` (toast) | ConversationInput, MessageOptionsMenu | npm |

---

## Tier 2: Shared UI Components (stable, keep as-is)

| Import | Used By | Loading | Notes |
|--------|---------|---------|-------|
| `MarkdownStream` | AssistantMessage, StreamingContentBlocks | **Eager** | Core markdown renderer; can't lazy-load without flash |
| `AdvancedMenu` | MessageOptionsMenu | Eager | Context menu primitive |
| `EmailInputDialog` | MessageOptionsMenu | Eager | Email share dialog |
| `AuthGateDialog` | MessageOptionsMenu | Eager | Auth prompt for public routes |
| `FullScreenMarkdownEditor` | AssistantMessage | **Lazy** | `React.lazy()` import |
| `copyToClipboard` | MessageOptionsMenu | Eager | Small utility function |

---

## Tier 3: Feature Dependencies (cross-cutting, keep but document)

### Audio / TTS
| Import | Used By | Loading |
|--------|---------|---------|
| `useCartesiaControls` | ConversationShell | Eager |
| `CartesiaControls` type | AssistantMessage, MessageList | Type-only |
| `useCartesiaWithPreferences` | MessageOptionsMenu | Eager |
| `useRecordAndTranscribe` | ConversationInput | Eager |
| `TranscriptionLoader` | ConversationInput | Eager |

> TTS and audio recording are cross-cutting concerns shared with other features. Keep as external.

### Resources & Prompts
| Import | Used By | Loading |
|--------|---------|---------|
| `PromptVariable` type | UnifiedChatWrapper, useConversationSession | Type-only |
| `Resource` type | ConversationInput, UserMessage | Type-only |
| `ResourceChips` | ConversationInput | Eager |
| `ResourcesContainer` | UserMessage | Eager |

> Type imports have zero bundle cost. `ResourceChips` and `ResourcesContainer` are small display components shared with the prompts feature.

### HTML Pages
| Import | Used By | Loading |
|--------|---------|---------|
| `useHtmlPreviewState` | AssistantMessage | Eager |
| `HtmlPreviewFullScreenEditor` | AssistantMessage | **Lazy** |
| `loadWordPressCSS` | MessageOptionsMenu | Eager |

### Canvas
| Import | Used By | Loading |
|--------|---------|---------|
| `ResizableCanvas` | ConversationShell | **Lazy** |
| `CanvasRenderer` | ConversationShell | **Lazy** |

### Notes & Quick Actions
| Import | Used By | Loading |
|--------|---------|---------|
| `QuickSaveModal` | MessageOptionsMenu | Eager |
| `NotesAPI` | MessageOptionsMenu | Eager |
| `useQuickActions` | MessageOptionsMenu | Eager |

> Auth-gated features only rendered for authenticated users.

### File Upload
| Import | Used By | Loading |
|--------|---------|---------|
| `useClipboardPaste` | ConversationInput | Eager |
| `useFileUpload` (from `@/features/files`) | ConversationInput | Eager |

### Markdown Utils
| Import | Used By | Loading |
|--------|---------|---------|
| `parseMarkdownToText` | AssistantMessage | Eager |

---

## Summary: Coupling by Feature

| External Feature | # Imports | Risk |
|------------------|-----------|------|
| `@/lib/redux/*` (core infra) | 15+ | None — project standard |
| `@/lib/chat-protocol` | 2 | None — pure helper library |
| `@/features/tool-call-visualization` | 1 | None — owned rendering surface |
| `@/components/ui/*` | 4 | None — design system |
| `@/hooks/tts/*` | 3 | Low — cross-cutting |
| `@/features/prompts/types/*` | 2 | None — type-only |
| `@/features/prompts/components/*` | 2 | Low — small display |
| `@/features/html-pages/*` | 3 | Low — lazy loaded |
| `@/features/audio/*` | 2 | Low — cross-cutting |
| `@/features/canvas/*` | 2 | None — lazy loaded |
| `@/features/notes/*` | 2 | Low — auth-gated |
| `@/features/quick-actions/*` | 1 | Low — auth-gated |
| npm packages | 3 | None — lucide, uuid, sonner |

**Internalized so far:** 3 utilities. Remaining deps are shared libraries, type-only, or lazy-loaded cross-cutting features.
