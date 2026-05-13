# Conversation System — External Dependencies

This document catalogs every import from outside `components/conversation/` and
`lib/redux/chatConversations/`, organized by risk level.

## Legend

- **OWNED** — Code we control, safe to depend on
- **SHARED** — Shared utility, stable interface, low risk
- **FEATURE** — Feature-specific code we may want to internalize
- **EXTERNAL** — Third-party npm package

---

## Tier 1: Core Infrastructure (OWNED / SHARED — keep as-is)

These are stable, project-wide utilities. No action needed.

| Import | Used By | Category |
|--------|---------|----------|
| `@/lib/redux/hooks` (useAppDispatch, useAppSelector) | ConversationInput, MessageList, hooks | OWNED |
| `@/lib/redux/chatConversations/*` | All components | OWNED |
| `@/lib/redux/slices/userSlice` (selectUser, selectAccessToken, selectIsAdmin) | MessageOptionsMenu, sendMessage thunk | OWNED |
| `@/lib/redux/slices/adminPreferencesSlice` (selectIsUsingLocalhost) | sendMessage thunk | OWNED |
| `@/lib/api/stream-parser` (parseNdjsonStream) | sendMessage thunk | OWNED |
| `@/lib/api/endpoints` (ENDPOINTS, BACKEND_URLS) | sendMessage thunk | OWNED |
| `@/lib/chat-protocol` (extractPersistableToolBlocks, buildCanonicalBlocks) | sendMessage thunk, StreamingContentBlocks | OWNED |
| `@/features/tool-call-visualization` (ToolCallVisualization shell, renderer registry, ToolRendererProps) | AssistantMessage, StreamingContentBlocks | OWNED |
| `@/features/agents/types/request.types` (ToolLifecycleEntry) | StreamingContentBlocks (maps ToolCallBlock → ToolLifecycleEntry) | OWNED |
| `@/lib/utils` (cn) | Shared UI | SHARED |
| `@/types/python-generated/stream-events` (TypedStreamEvent, ToolEventPayload) | Multiple | OWNED |
| `@/components/ui/*` (Button, etc.) | Multiple | SHARED |
| `lucide-react` | Multiple | EXTERNAL |
| `uuid` | Multiple | EXTERNAL |
| `sonner` (toast) | ConversationInput | EXTERNAL |

## Tier 2: UI Components (SHARED — keep, but monitor)

Shared UI components with stable interfaces.

| Import | Used By | Purpose |
|--------|---------|---------|
| `@/components/MarkdownStream` | AssistantMessage, StreamingContentBlocks | Markdown renderer with streaming |
| `@/components/official/AdvancedMenu` | MessageOptionsMenu | Context menu component |
| `@/components/dialogs/EmailInputDialog` | MessageOptionsMenu | Email dialog |
| `@/components/dialogs/AuthGateDialog` | MessageOptionsMenu | Auth prompt dialog |
| `@/components/mardown-display/chat-markdown/FullScreenMarkdownEditor` | AssistantMessage (lazy) | Full-screen editor |

## Tier 3: Feature Dependencies (FEATURE — candidates for internalization)

These come from `features/` directories. If the conversation system needs to be
fully self-contained, these are the ones to internalize.

### Audio/TTS
| Import | Used By | Action |
|--------|---------|--------|
| `@/hooks/tts/simple/useCartesiaControls` | ConversationShell, MessageList, AssistantMessage | **Keep** — TTS is cross-cutting, not chat-specific |
| `@/hooks/tts/simple/useCartesiaWithPreferences` | MessageOptionsMenu | **Keep** — same reason |
| `@/features/audio/hooks/useRecordAndTranscribe`, `@/features/audio/components/TranscriptionLoader` | ConversationInput | **Keep** — voice recording is a shared feature |

### Resources & Prompts
| Import | Used By | Action |
|--------|---------|--------|
| `@/features/prompts/types/core` (PromptVariable) | Types, useConversationSession | **Keep** — shared type definition |
| `@/features/prompts/types/resources` (Resource) | Types, ConversationInput | **Keep** — shared type definition |
| `@/features/prompts/components/resource-display` (ResourceChips) | ConversationInput | **Keep** — small display component |
| `@/features/prompts/utils/resource-parsing` | UserMessage | **Consider internalizing** — XML parsing for message resources |
| `@/features/prompts/components/resource-display/ResourceDisplay` | UserMessage | **Keep** — shared component |

### Chat Feature
| Import | Used By | Action |
|--------|---------|--------|
| `@/features/chat/hooks/useDomCapturePrint` | AssistantMessage | **Consider internalizing** — small utility |
| `@/features/chat/utils/markdown-print-utils` | MessageOptionsMenu | **Consider internalizing** — small utility |

### HTML Pages
| Import | Used By | Action |
|--------|---------|--------|
| `@/features/html-pages/hooks/useHtmlPreviewState` | AssistantMessage | **Keep** — HTML preview is cross-cutting |
| `@/features/html-pages/components/HtmlPreviewFullScreenEditor` | AssistantMessage (lazy) | **Keep** — lazy, minimal coupling |
| `@/features/html-pages/css/wordpress-styles` | MessageOptionsMenu | **Keep** — CSS loading utility |

### Canvas
| Import | Used By | Action |
|--------|---------|--------|
| `@/features/canvas/core/ResizableCanvas` | ConversationShell (lazy) | **Keep** — lazy loaded, opt-in via prop |
| `@/features/canvas/core/CanvasRenderer` | ConversationShell (lazy) | **Keep** — lazy loaded, opt-in via prop |

### Notes & Quick Actions
| Import | Used By | Action |
|--------|---------|--------|
| `@/features/notes` (QuickSaveModal, NotesAPI) | MessageOptionsMenu | **Keep** — save-to-notes is auth-gated |
| `@/features/quick-actions/hooks/useQuickActions` | MessageOptionsMenu | **Keep** — quick action is auth-gated |

### File Upload
| Import | Used By | Action |
|--------|---------|--------|
| `@/components/ui/file-upload/useClipboardPaste` | ConversationInput | **Keep** — shared UI hook |
| `@/features/files` → `useFileUpload` | ConversationInput | **Keep** — canonical upload hook |

### Markdown Utils
| Import | Used By | Action |
|--------|---------|--------|
| `@/utils/markdown-processors/parse-markdown-for-speech` | AssistantMessage | **Keep** — small utility |
| `@/components/matrx/buttons/markdown-copy-utils` | MessageOptionsMenu | **Keep** — shared utility |

---

## Tool rendering (delegated)

Tool-call rendering is owned entirely by `@/features/tool-call-visualization`. Conversation surfaces import the `ToolCallVisualization` shell and hand it a `ToolLifecycleEntry` (from `@/features/agents/types/request.types`).

---

## Summary: Internalization Candidates

If the goal is full self-containment, these items are the prime candidates:

1. **`@/features/prompts/utils/resource-parsing`** — Copy the 3 functions
   (`parseResourcesFromMessage`, `extractMessageWithoutResources`, `messageContainsResources`)
   into `components/conversation/utils/resource-parsing.ts`

2. **`@/features/chat/hooks/useDomCapturePrint`** — Copy into
   `components/conversation/hooks/useDomCapturePrint.ts`

Everything else is either a shared UI primitive, a lazy-loaded opt-in feature,
or a project-wide utility that *should* be shared rather than duplicated.
