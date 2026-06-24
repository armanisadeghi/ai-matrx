/**
 * Instance Client Tools Slice
 *
 * Manages which tools the client will handle (instead of the server)
 * for each instance. When the model calls one of these tools, the server
 * emits a tool_delegated event and HARD-SUSPENDS the loop (the stream ends);
 * it then waits durably for the client's POST /tool_results + /resume.
 *
 * There is NO short client answer deadline — the user may take seconds,
 * minutes, hours, or weeks. The only timeout is a far-future server-side
 * abandonment backstop on cx_tool_call.expires_at (default 30 days, per-tool
 * override via tools.max_client_wait_seconds), and even that is recoverable: a
 * late answer supersedes the swept row and resumes. The server is the single
 * source of truth for this timing — the client never enforces its own.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { destroyInstance } from '../conversations/conversations.slice';
import { createInstanceFull } from '../create-instance-full';

// =============================================================================
// State
// =============================================================================

export interface InstanceClientToolsState {
    byConversationId: Record<string, string[]>;
}

const initialState: InstanceClientToolsState = {
    byConversationId: {},
};

// =============================================================================
// Slice
// =============================================================================

const instanceClientToolsSlice = createSlice({
    name: 'instanceClientTools',
    initialState,
    reducers: {
        initInstanceClientTools(
            state,
            action: PayloadAction<{
                conversationId: string;
                tools?: string[];
            }>,
        ) {
            state.byConversationId[action.payload.conversationId] =
                action.payload.tools ?? [];
        },

        addClientTool(
            state,
            action: PayloadAction<{ conversationId: string; toolName: string }>,
        ) {
            const { conversationId, toolName } = action.payload;
            const tools = state.byConversationId[conversationId];
            if (tools && !tools.includes(toolName)) {
                tools.push(toolName);
            }
        },

        removeClientTool(
            state,
            action: PayloadAction<{ conversationId: string; toolName: string }>,
        ) {
            const { conversationId, toolName } = action.payload;
            const tools = state.byConversationId[conversationId];
            if (tools) {
                state.byConversationId[conversationId] = tools.filter(
                    (t) => t !== toolName,
                );
            }
        },

        setClientTools(
            state,
            action: PayloadAction<{
                conversationId: string;
                tools: string[];
            }>,
        ) {
            state.byConversationId[action.payload.conversationId] = action.payload.tools;
        },

        removeInstanceClientTools(state, action: PayloadAction<string>) {
            delete state.byConversationId[action.payload];
        },
    },

    extraReducers: (builder) => {
        builder.addCase(createInstanceFull, (state, action) => {
            const { conversationId, clientTools } = action.payload;
            state.byConversationId[conversationId] = clientTools?.tools ?? [];
        });

        builder.addCase(destroyInstance, (state, action) => {
            delete state.byConversationId[action.payload];
        });
    },
});

export const {
    initInstanceClientTools,
    addClientTool,
    removeClientTool,
    setClientTools,
    removeInstanceClientTools,
} = instanceClientToolsSlice.actions;

export default instanceClientToolsSlice.reducer;
