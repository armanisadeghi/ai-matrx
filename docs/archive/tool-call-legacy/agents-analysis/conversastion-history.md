I now have the full picture. Here's the complete trace:

---

## 1. `fetchConversationHistory` Thunk (cx-chat system)

This is the Tier 3 thunk in `features/cx-chat/redux/thunks.ts`. It queries Supabase **directly from the client** (no API route) and dispatches into the **`instanceConversationHistory`** slice only.

```185:256:features/cx-chat/redux/thunks.ts
export const fetchConversationHistory = createAsyncThunk<
  void,
  { conversationId: string },
  ThunkApi
>("cxConversations/fetchHistory", async ({ conversationId }, { dispatch }) => {
  dispatch(initInstanceHistory({ conversationId, mode: "conversation" }));

  const { data, error } = await supabase
    .from("cx_message")
    .select(
      "agent_id, content, content_history, conversation_id, created_at, deleted_at, id, is_visible_to_model, is_visible_to_user, metadata, position, role, source, status, user_content",
    )
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .order("position", { ascending: true });

  if (error) throw error;

  const rows = data ?? [];

  const turns: ConversationTurn[] = rows
    .filter((row) => row.role === "user" || row.role === "assistant")
    .map((row) => {
      const rawBlocks: Array<Record<string, unknown>> = Array.isArray(
        row.content,
      )
        ? (row.content as unknown[]).filter(
            (b): b is Record<string, unknown> =>
              typeof b === "object" && b !== null && !Array.isArray(b),
          )
        : [];

      const textBlock = rawBlocks.find((b) => b["type"] === "text") as
        | { type: "text"; text: string }
        | undefined;
      const primaryText =
        typeof textBlock?.text === "string" ? textBlock.text : "";

      const richBlocks = rawBlocks.filter((b) => b["type"] !== "text");
      const normalizedBlocks =
        richBlocks.length > 0 ? normalizeContentBlocks(richBlocks) : undefined;

      return {
        turnId: uuidv4(),
        cxMessageId: row.id,
        role: row.role as "user" | "assistant",
        content: primaryText,
        ...(normalizedBlocks && { contentBlocks: normalizedBlocks }),
        timestamp: row.created_at,
        requestId: null,
        conversationId,
        agentId: row.agent_id,
        position: row.position,
        contentHistory: row.content_history,
        deletedAt: row.deleted_at,
        isVisibleToModel: row.is_visible_to_model,
        isVisibleToUser: row.is_visible_to_user,
        messageMetadata: jsonMetadataToRecord(row.metadata),
        source: row.source,
        messageStatus: row.status,
        userContent: row.user_content,
      };
    });

  dispatch(
    loadConversationHistory({
      conversationId,
      turns,
      mode: "conversation",
    }),
  );
});
```

Key facts:
- **Query**: Direct Supabase client `cx_message` table, explicit column select
- **Dispatches to**: `instanceConversationHistory` slice via `initInstanceHistory` then `loadConversationHistory`
- **Does NOT dispatch to**: the `chatConversations` (cx-conversation) slice

---

## 2. How the SSR Chat Route Loads a Conversation

### Route: `app/(dev)/demos/chat/c/[conversationId]/page.tsx`

```1:37:app/(dev)/demos/chat/c/[conversationId]/page.tsx
// app/(dev)/demos/chat/c/[conversationId]/page.tsx — Active conversation view.

import ChatHeaderControls from "@/features/cx-chat/components/ChatHeaderControls";
import { ChatInstanceManager } from "@/features/cx-chat/components/ChatInstanceManager";
import { DEFAULT_AGENT_ID } from "@/features/cx-chat/components/agent/local-agents";
import { BACKEND_URLS, ENDPOINTS } from "@/lib/api/endpoints";

export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ conversationId: string }>;
  searchParams: Promise<{ agent?: string }>;
}) {
  const [{ conversationId }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);

  const agentId = resolvedSearchParams.agent ?? DEFAULT_AGENT_ID;

  fetch(
    `${BACKEND_URLS.production}${ENDPOINTS.ai.conversationWarm(conversationId)}`,
    { method: "POST" },
  ).catch(() => {});

  return (
    <>
      <ChatHeaderControls />
      <ChatInstanceManager
        mode="conversation"
        agentId={agentId}
        conversationId={conversationId}
      />
    </>
  );
}
```

This **server component** does two things:
1. Fires a fire-and-forget `conversationWarm` POST to the Python backend (pre-warm the conversation server-side)
2. Renders `ChatInstanceManager` with `mode="conversation"` and the `conversationId` from the URL

### `ChatInstanceManager` Orchestrates the Instance + History Load

```60:121:features/cx-chat/components/ChatInstanceManager.tsx
  useEffect(() => {
    const key = `${agentId}::${urlConversationId ?? ""}`;
    if (key === lastKey.current) return;
    lastKey.current = key;

    setResolvedId(null);

    (async () => {
      // 1. For conversation routes: check if a conversation already exists in
      //    Redux (stream started on the welcome screen and the router navigated
      //    here mid-stream or just after). Reuse it directly.
      if (urlConversationId) {
        const existingId = await dispatch(
          (_: unknown, getState: () => RootState) =>
            selectConversationExists(urlConversationId)(getState()),
        );
        if (existingId) {
          conversationByAgentId.current.set(agentId, existingId);
          setResolvedId(existingId);
          return;
        }
      }

      // 2. Ensure agent execution data (variables, context slots) is loaded.
      await dispatch(fetchAgentExecutionMinimal(agentId));

      // 3. Reuse a previously created conversation for this agent if still alive.
      // ...

      // 4. Create a fresh conversation when nothing is reusable.
      if (!newId) {
        const result = await dispatch(createManualInstance({ agentId }));
        if (createManualInstance.fulfilled.match(result)) {
          newId = result.payload;
        }
      }

      // ...

      // 6. Load conversation history from DB (idempotent).
      if (urlConversationId) {
        dispatch(
          fetchConversationHistory({ conversationId: urlConversationId }),
        );
      }

      // 7. Expose the resolved conversationId — triggers re-render.
      setResolvedId(newId);
    })();
  }, [agentId, urlConversationId]);
```

The flow is:
1. **Check Redux** — does the conversation already exist (e.g. from an ongoing stream)?
2. **Load agent definition** via `fetchAgentExecutionMinimal`
3. **Create an execution instance** via `createManualInstance` (this sets up the `executionInstances` and `instanceConversationHistory` slices)
4. **Dispatch `fetchConversationHistory`** — loads history into `instanceConversationHistory`
5. **Render** `ChatConversationClient` which uses `AgentConversationDisplay` reading from `instanceConversationHistory`

---

## 3. Are BOTH Slices Loaded for the Same Conversation?

**No, they are NOT — in the SSR chat route.** The two systems are completely separate:

### SSR Chat Route (`/demos/chat/c/[conversationId]`)
- Uses `ChatInstanceManager` -> `fetchConversationHistory` 
- Dispatches **only** to `instanceConversationHistory` slice
- **Never touches** the `chatConversations` slice

### Public Chat Route (`/p/chat/c/[conversationId]`) and cx-conversation system
- Uses `useConversationSession` -> `loadConversationHistory` (from `features/cx-conversation/redux/thunks/loadConversationHistory.ts`)
- Dispatches **only** to `chatConversations` slice via `chatConversationsActions.loadConversation`
- **Never touches** `instanceConversationHistory`

The `loadConversation` action on the `chatConversations` slice:

```120:154:features/cx-conversation/redux/slice.ts
    loadConversation: (
      state,
      action: PayloadAction<LoadConversationPayload>,
    ) => {
      const {
        sessionId,
        conversationId,
        messages,
        agentId,
        variableDefaults = [],
        toolCallsById = {},
      } = action.payload;

      // Preserve apiMode and chatModeConfig if session already exists
      const existing = state.sessions[sessionId];

      state.sessions[sessionId] = {
        sessionId,
        conversationId,
        agentId,
        apiMode: existing?.apiMode ?? "agent",
        chatModeConfig: existing?.chatModeConfig ?? null,
        status: "ready",
        error: null,
        variableDefaults,
        requiresVariableReplacement: false,
        messages,
        toolCallsById,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      state.currentInputs[sessionId] = "";
      state.resources[sessionId] = [];
      state.uiState[sessionId] = { ...DEFAULT_UI_STATE };
    },
```

The `loadConversationHistory` action on the `instanceConversationHistory` slice:

```306:322:features/agents/redux/execution-system/instance-conversation-history/instance-conversation-history.slice.ts
    loadConversationHistory(
      state,
      action: PayloadAction<{
        conversationId: string;
        turns: ConversationTurn[];
        mode?: ConversationMode;
      }>,
    ) {
      const { conversationId, turns, mode = "conversation" } = action.payload;

      const entry = state.byConversationId[conversationId];
      if (!entry) return;

      entry.turns = turns;
      entry.mode = mode;
      entry.loadedFromHistory = true;
    },
```

**These are two completely independent slices with independent DB query paths. The same conversation data is never loaded into both slices simultaneously.**

---

## 4. `lib/chat-protocol/adapters.ts` — Canonical to Legacy Conversion

This file bridges the **canonical** message format (`CanonicalMessage` with `CanonicalBlock[]`) to legacy formats. It is **not** used in the DB loading path at all — it's for the streaming protocol.

```67:107:lib/chat-protocol/adapters.ts
export function toolCallBlockToLegacy(block: ToolCallBlock): LegacyToolCallObject[] {
    const updates: LegacyToolCallObject[] = [];

    updates.push({
        id:        block.callId,
        type:      'mcp_input',
        mcp_input: {
            name:      block.input.name,
            arguments: block.input.arguments as Record<string, unknown>,
        },
        phase: block.phase,
    });

    for (const p of block.progress) {
        updates.push({
            id:           block.callId,
            type:         'user_message',
            user_message: p.message,
        });
    }

    if (block.output) {
        updates.push({
            id:         block.callId,
            type:       'mcp_output',
            mcp_output: { status: block.output.status, result: block.output.result } as Record<string, unknown>,
        });
    } else if (block.error) {
        updates.push({
            id:        block.callId,
            type:      'mcp_error',
            mcp_error: block.error.message,
        });
    }

    return updates;
}
```

```139:183:lib/chat-protocol/adapters.ts
export function canonicalToLegacy(msg: CanonicalMessage): LegacyChatMessage {
    const textParts:       string[]                 = [];
    const toolUpdates:     LegacyToolCallObject[]   = [];

    for (const block of msg.blocks) {
        switch (block.type) {
            case 'text': {
                textParts.push(block.content);
                break;
            }
            case 'thinking': {
                textParts.push(`<reasoning>\n${block.content}\n</reasoning>`);
                break;
            }
            case 'media': {
                if (block.kind === 'image') {
                    textParts.push(`![image](${block.url})`);
                } else {
                    const label = block.kind.charAt(0).toUpperCase() + block.kind.slice(1);
                    textParts.push(`[${label}](${block.url})`);
                }
                break;
            }
            case 'tool_call': {
                toolUpdates.push(...toolCallBlockToLegacy(block));
                break;
            }
            case 'error': {
                textParts.push(`> ⚠️ ${block.message}`);
                break;
            }
        }
    }

    return {
        id:          msg.id,
        role:        msg.role,
        content:     textParts.join('\n\n'),
        timestamp:   msg.timestamp,
        status:      msg.status === 'streaming' ? 'streaming' : 'complete',
        isCondensed: msg.isCondensed,
        ...(toolUpdates.length > 0 ? { toolUpdates } : {}),
    };
}
```

For DB-loaded content, the actual conversion is **not** in `adapters.ts`. Instead there are **two separate converters** depending on which system loads the data:

- **SSR chat (agent execution system)**: `normalizeContentBlocks` in `features/agents/redux/execution-system/utils/normalize-content-blocks.ts` — converts raw DB `CxContentBlock` objects into `ContentBlockPayload[]` (the streaming protocol shape)
- **Public chat / cx-conversation system**: `processDbMessagesForDisplay` in `features/public-chat/utils/cx-content-converter.ts` — converts raw `CxMessage[]` + `CxToolCall[]` into `ProcessedChatMessage[]` with flat markdown `content` + `ToolCallObject[]` tool updates

---

## 5. Shared Service vs Independent Query Paths

**Each system has its own independent DB query path.** There is no shared conversation loading service.

| System | DB Query | Runs on | Target Slice |
|---|---|---|---|
| **SSR Chat** (`fetchConversationHistory`) | Direct Supabase client: `cx_message` only, explicit column select | Client-side | `instanceConversationHistory` |
| **cx-conversation** (`loadConversationHistory`) | `fetch('/api/cx-chat/request?id=...')` -> server-side `loadFullConversation` -> `cx_conversation` + `cx_message` + `cx_tool_call` (3 tables) | Server API route | `chatConversations` |
| **Public chat** (`ChatLayoutShell`) | `useChatPersistence().loadConversation` (uses same `/api/cx-chat/request` route) | Client -> API route -> server | React Context (DEPRECATED-ChatContext) |

The SSR chat system does a **lean query** (messages only, specific columns), while the cx-conversation system does a **full query** (conversation metadata + all message columns + tool calls, via the API route).

---

## 6. What Kicks Off the DB Fetch When Clicking a Conversation in the Sidebar

### SSR Chat Sidebar (`ChatSidebarClient.tsx`)

When you click a conversation in the sidebar:

```180:189:features/cx-chat/components/ChatSidebarClient.tsx
  const handleSelectChat = useCallback(
    (id: string) => {
      closeMobilePanel();
      const url = agentIdFromUrl
        ? `/demos/chat/c/${id}?agent=${agentIdFromUrl}`
        : `/demos/chat/c/${id}`;
      router.push(url);
    },
    [router, agentIdFromUrl],
  );
```

This triggers a **Next.js router navigation** to `/demos/chat/c/[conversationId]`. The orchestration flow is:

1. **`router.push`** navigates to the conversation page
2. **Server component** `ConversationPage` renders `<ChatInstanceManager mode="conversation" conversationId={...} />`
3. **`ChatInstanceManager`** mounts, its `useEffect` fires:
   - Checks if the conversation already exists in Redux
   - Loads agent definition via `fetchAgentExecutionMinimal`
   - Creates an execution instance via `createManualInstance`
   - **Dispatches `fetchConversationHistory({ conversationId })`** — this is what hits the DB
4. **`fetchConversationHistory`** queries `cx_message` via Supabase client and dispatches `loadConversationHistory` into `instanceConversationHistory`
5. **`ChatConversationClient`** renders `AgentConversationDisplay` which reads from `instanceConversationHistory` via selectors

There is also a **parallel path** via `useInstanceBootstrap` (used by the older layout), which does essentially the same thing but parses the URL directly via regex matching on `/demos/chat/c/[conversationId]` and dispatches the same `fetchConversationHistory` thunk.

---

## Summary

The conversation loading architecture has **two completely separate systems** that share the same DB tables but never load into each other's Redux slices:

1. **Agent Execution System (SSR chat)**: `fetchConversationHistory` -> direct Supabase client query on `cx_message` -> `instanceConversationHistory` slice -> renders via `AgentConversationDisplay`

2. **cx-conversation System (public chat / legacy)**: `loadConversationHistory` -> `/api/cx-chat/request` API route -> server-side `loadFullConversation` (3 tables) -> `chatConversations` slice -> renders via `ConversationShell`

There is no dual-loading of the same data into both slices. The orchestrator for the SSR route is `ChatInstanceManager`, which is mounted by the server component page at `app/(dev)/demos/chat/c/[conversationId]/page.tsx`.