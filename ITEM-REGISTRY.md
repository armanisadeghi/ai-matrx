# Item Registry

Central map of major subsystems: **path** + **one-line purpose**. Paths are repo-root relative.

---

## Shell & layout

| Item | Location | What it is |
|------|----------|------------|
| **Overlay controller** | `components/overlays/OverlayController.tsx` | Orchestrates global overlays (modals, panels, instance UIs) from Redux `overlaySlice`. |
| **Window panel system** | `features/window-panels/` | Floating/resizable sidebar windows, registry, URL sync, persistence (`WindowPanel.tsx`, `windows/*`, `lib/redux/slices/windowManagerSlice.ts`). |

---

## Agents

| Item | Location | What it is |
|------|----------|------------|
| **Agents App Router** | `app/(a)/agents/` | Routes: list (`page.tsx`), agent hub (`[id]/`), **build** (`[id]/build/`), **run** (`[id]/run/`, `[id]/latest/`, `[id]/[version]/`). |
| **Agent feature (code)** | `features/agents/` | Types, Redux, services, shared UI. |
| **Agent builder UI** | `features/agents/components/builder/` | Message list, system instructions, model config (`AgentBuilder*.tsx`, `message-builders/`). |
| **Agent run / chat UI** | `features/agents/components/run/` | Conversation, assistant messages, variables, status (`AgentRunPage.tsx`, `AgentAssistantMessage.tsx`, …). |
| **Agent view / route content** | `features/agents/route/` | Client views wired to agent routes (e.g. `AgentViewContent.tsx`). |

---

## Assistant message “More options” menu

Several implementations exist; **prefer the Redux-driven menus** for new work.

| Variant | Location | Notes |
|---------|----------|--------|
| **Redux (CX conversation)** | `features/cx-conversation/MessageOptionsMenu.tsx` | Uses `getMessageActions` from `features/cx-conversation/actions/messageActionRegistry.ts`. |
| **Redux (CX chat)** | `features/cx-chat/components/messages/MessageOptionsMenu.tsx` | Same pattern; `getMessageActions` in `features/cx-chat/actions/messageActionRegistry.ts`. |
| **Legacy (still imported)** | `features/chat/components/response/assistant-message/MessageOptionsMenu.tsx` | Used by e.g. `AssistantMessage.tsx`, `AgentAssistantMessage.tsx`, `PromptAssistantMessage.tsx` — marked deprecated in file header. |
| **Public / no Redux** | `features/public-chat/components/PublicMessageOptionsMenu.tsx` | Public chat & prompt-app surfaces; lazy-loaded from `MessageDisplay.tsx`. |

---

## Context menus

| Item | Location | What it is |
|------|----------|------------|
| **Unified context menu (text / shortcuts)** | `features/context-menu/UnifiedContextMenu.tsx` | App-wide right-click + selection UI: DB-backed shortcuts, content blocks, quick actions (`useUnifiedContextMenu`). |
| **File-system context menu** | `components/file-system/context-menu.tsx` | Separate `UnifiedContextMenu` for bucket/file rows (not the prompt-builtins menu). |

---

## Route groups (App Router)

| Item | Location | What it is |
|------|----------|------------|
| **System admin** | `app/(authenticated)/(admin-auth)/administration/` | Admin-only tools, CX dashboard, DB, MCP tools, schema, feedback, etc. |
| **SSR route group** | `app/(dev)/demos/` | SSR-first area: notes, prompts, chat, context, content sites, dashboards, demos. |
| **Public route group** | `app/(public)/` | Unauthenticated or lightweight bundles. **`p/`** — prompt apps (`p/[slug]/`), public chat/research. **Also:** `demos/`, `free/`, `education/`, `canvas/`, etc. at the same `(public)` level — not only `p/`. |

---

## Things to add:
If anything is placed here, it means it's your job to add them to the list and then remove them from here.
- 