## Directory Trees

### `app/(a)/agents/`

```
app/(a)/agents/
├── MODULE_README.md
├── agents-current-status.md
├── agents-route-architecture.md
├── analysis.md
├── plan.md
├── error.tsx
├── layout.tsx                          ← top-level agents layout
├── loading.tsx
├── page.tsx
├── [id]/
│   ├── error.tsx
│   ├── layout.tsx                      ← per-agent layout (SSR, injects AgentHydratorServer)
│   ├── loading.tsx
│   ├── not-found.tsx
│   ├── page.tsx
│   ├── build/
│   │   ├── loading.tsx
│   │   └── page.tsx
│   ├── latest/
│   │   ├── loading.tsx
│   │   └── page.tsx
│   ├── run/
│   │   ├── loading.tsx
│   │   └── page.tsx                    ← thin shell, delegates to AgentRunnerPage
│   └── v/[version]/
│       ├── loading.tsx
│       ├── not-found.tsx
│       └── page.tsx
├── new/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── AutoSubmitForm.tsx
│   ├── builder/
│   │   ├── page.tsx
│   │   ├── customizer/page.tsx
│   │   ├── instant/page.tsx
│   │   └── tabs/page.tsx
│   ├── generate/page.tsx
│   ├── import/page.tsx
│   └── manual/
│       ├── AutoSubmitForm.tsx
│       └── page.tsx
└── templates/
    ├── layout.tsx
    ├── page.tsx
    └── [id]/page.tsx
```

### `features/agents/` (condensed tree)

```
features/agents/
├── AGENT-EXECUTION-GAPS.md
├── AGENT-EXECUTION-SYSTEM-ROADMAP.md
├── FEATURE_STATUS.md
├── agx_rename_mapping.md
├── agent-creators/
│   ├── MODULE_README.md / README.md
│   ├── chatbot-customizer/
│   ├── instant-assistant/
│   ├── interactive-builder/
│   ├── services/
│   ├── tabbed-builder/
│   ├── templates/
│   └── utils/
├── components/
│   ├── agent-listings/
│   │   ├── AgentActionModal.tsx
│   │   ├── AgentCard.tsx
│   │   ├── AgentListDropdown.tsx
│   │   ├── AgentListItem.tsx
│   │   ├── AgentsGrid.tsx
│   │   ├── ComingSoonModal.tsx
│   │   ├── FavoriteAgentButton.tsx
│   │   └── useAgentListCore.ts
│   ├── agent-widgets/
│   │   ├── AgentChatBubble.tsx
│   │   ├── AgentChatHistorySidebar.tsx
│   │   ├── AgentCompactModal.tsx
│   │   ├── AgentFlexiblePanel.tsx
│   │   ├── AgentFloatingChat.tsx
│   │   ├── AgentFullModal.tsx
│   │   ├── AgentInlineOverlay.tsx
│   │   ├── AgentPanelOverlay.tsx
│   │   ├── AgentSidebarOverlay.tsx
│   │   ├── AgentToastOverlay.tsx
│   │   ├── ChatCollapsible.tsx
│   │   ├── chat-assistant/
│   │   └── execution-gates/
│   ├── builder/
│   │   ├── AgentBuilderClient.tsx
│   │   ├── AgentBuilderDesktop.tsx
│   │   ├── AgentBuilderPage.tsx
│   │   ├── ... (many builder files)
│   │   └── message-builders/
│   ├── run/                            ← THE RUN PAGE COMPONENTS
│   │   ├── AgentAssistantMessage.tsx
│   │   ├── AgentConversationDisplay.tsx
│   │   ├── AgentRunHeader.tsx          ← header used in run page
│   │   ├── AgentRunnerPage.tsx         ← top-level run page client component
│   │   ├── AgentStatusIndicator.tsx
│   │   ├── AgentToolDisplay.tsx
│   │   ├── AgentUserMessage.tsx
│   │   ├── AssistantActionBar.tsx
│   │   ├── AssistantError.tsx
│   │   └── run-sidebar/
│   │       ├── AgentRunsSidebar.tsx    ← sidebar (conversation history list)
│   │       └── SidebarHeader.tsx      ← sidebar's header row
│   ├── run-controls/
│   ├── settings-management/
│   └── shared/
│       ├── AgentConversationColumn.tsx
│       ├── AgentEmptyMessageDisplay.tsx
│       ├── AgentHeader.tsx             ← used in OTHER pages (build/view), NOT the run page
│       ├── AgentHeaderMobile.tsx
│       ├── AgentModeController.tsx
│       ├── AgentNewRunButton.tsx
│       ├── AgentOptionsMenu.tsx
│       ├── AgentPlanningIndicator.tsx
│       ├── AgentSaveStatus.tsx
│       ├── AgentSelectorIsland.tsx
│       ├── AgentSharedHeader.tsx
│       └── StreamProfilerOverlay.tsx
├── hooks/
├── redux/
│   ├── agent-conversations/
│   ├── agent-definition/
│   ├── agent-shortcuts/
│   ├── execution-system/
│   │   ├── active-requests/
│   │   ├── conversation-focus/
│   │   ├── execution-instances/
│   │   ├── instance-client-tools/
│   │   ├── instance-context/
│   │   ├── instance-conversation-history/
│   │   ├── instance-model-overrides/
│   │   ├── instance-resources/
│   │   ├── instance-ui-state/
│   │   ├── instance-user-input/
│   │   ├── instance-variable-values/
│   │   ├── sagas/
│   │   ├── selectors/
│   │   ├── thunks/
│   │   └── utils/
│   ├── mcp/
│   └── tools/
├── route/
│   ├── AgentHydrator.tsx
│   ├── AgentHydratorServer.tsx
│   ├── AgentListHydrator.tsx
│   ├── AgentVersionsWorkspace.tsx
│   └── AgentViewContent.tsx
├── services/
├── types/
└── utils/
```

---

## How the Run Page Renders Header & Sidebar

### Render Chain

```
app/(a)/agents/[id]/run/page.tsx  (Server Component)
  └── <AgentRunnerPage agentId={id} />  (Client Component — "use client")
        ├── Desktop sidebar: <AgentRunsSidebar />       (when sidebarOpen && !isMobile)
        ├── Mobile toolbar: inline History + Test Modes buttons → open Drawers
        ├── <AgentRunHeader />                          (desktop-only — hidden on mobile via CSS)
        │     ├── <SidebarHeader /> (shown only when sidebar is CLOSED)
        │     ├── <AgentModeController />
        │     └── <AgentSaveStatus /> + <AgentOptionsMenu />
        └── <AgentConversationColumn />                 (main chat area)
```

### `AgentRunnerPage` — the orchestrator

- **Client component** (`"use client"`)
- Manages `sidebarOpen` state (starts `!isMobile`)
- Manages `historyDrawerOpen` / `testModesDrawerOpen` for mobile
- On mount: dispatches `fetchAgentExecutionMinimal(agentId)` if Redux not yet populated
- Uses `useAgentLauncher(agentId, ...)` to create/resume an execution instance — returns `conversationId`
- URL sync effect: when `?conversationId=` query param changes, dispatches `createManualInstance` + `fetchConversationHistory` + `setFocus`

### `AgentRunHeader`

- **Not** a `"use client"` directive — but it receives `sidebarOpen`/`onToggleSidebar` as props from the client parent, so it is effectively a client subtree
- Desktop-only (`hidden lg:flex`) — no mobile equivalent rendered here; mobile uses the inline toolbar in `AgentRunnerPage` instead
- Conditionally shows `<SidebarHeader>` only when the sidebar is **closed** (so the sidebar's own header handles that when open)
- Also renders `<AgentModeController>`, `<AgentSaveStatus>`, `<AgentOptionsMenu>`

### `AgentRunsSidebar`

- **Client component** (`"use client"`)
- Renders `<SidebarHeader>` at top (always, when sidebar is open)
- Fetches past conversations via `fetchAgentConversations` thunk (once, when `convStatus === "idle"`)
- Lists `ConversationListRow` entries; clicking one pushes `?conversationId=<id>` to the URL
- Bottom section: `<AgentLauncherSidebarTester>` (for test display modes)

### `SidebarHeader` (run-sidebar)

- No `"use client"` directive — pure server-compatible JSX
- Contains: back link to `/agents`, `<AgentSelectorIsland>` wrapped in `<SearchGroup>`, a `PanelLeftTapButton` (toggle sidebar), and `<AgentNewRunButton>`
- Used **in two places**: inside `<AgentRunsSidebar>` (always visible when sidebar open) AND inside `<AgentRunHeader>` (only when sidebar is closed)

---

## State Management & Redux Usage

| Concern | Slice / Selector |
|---|---|
| Agent data / definition | `agent-definition` slice — `selectAgentById`, `selectAgentName`, `selectAgentVersionNumber`, `selectAgentIsDirty`, `selectAgentIsLoading`, `selectAgentModelMissing`, `selectAgentExecutionPayload` |
| Execution instance creation | `create-instance.thunk` — `createManualInstance`, `startNewConversation` |
| Execution focus (active conversation) | `conversation-focus` slice — `setFocus` action |
| Past conversations list | `agent-conversations` slice — `fetchAgentConversations` thunk, `makeSelectAgentConversations` |
| Latest conversation ID | `aggregate.selectors` — `selectLatestConversationId` |
| Conversation message history | `fetchConversationHistory` from `cx-chat/redux/thunks` |
| Overlay windows (settings, run history, import) | `overlaySlice` — `openAgentSettingsWindow`, `openAgentRunHistoryWindow`, `openAgentImportWindow`, `openAgentContentWindow` |
| Agent launcher (instance bootstrap) | `useAgentLauncher` hook (in `features/agents/hooks/`) |
| Dirty-state guard | `selectAgentIsDirty` — used in `AgentModeController` and `AgentSaveStatus` to prevent unsaved-changes data loss |

### Key architectural notes

1. **`AgentHydratorServer`** in `app/(a)/agents/[id]/layout.tsx` pre-populates Redux with agent data on the server side — the `<PageHeader>` with `<AgentHeader>` is commented out, meaning the run page header is entirely self-contained inside `AgentRunnerPage`.

2. The `[id]/layout.tsx` `<PageHeader>` injection is **commented out**, so there is no shell-level header for the run route. The `AgentRunHeader` renders directly inside `AgentRunnerPage`'s right column, not via `PageHeader`.

3. `AgentSharedHeader` exists as an alternative (more compact) header used in the shell/nav bar context (`AgentListDropdown` + mode pills + save/options) but is **not currently wired** into the run route. `AgentHeader` (for build/view pages) also exists separately and is similarly not used in the run route.

4. The sidebar toggle is pure local React state in `AgentRunnerPage` — no Redux involved for open/closed state.