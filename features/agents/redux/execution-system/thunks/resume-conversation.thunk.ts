"use client";

/**
 * resumeConversation — the IMPERATIVE twin of `useConversationResume`.
 *
 * The hook (`features/agents/hooks/useConversationResume.ts`) is how a mounted
 * surface reopens the conversation it is already pointed at. This thunk is the
 * same five-step sequence for a CLICK: a history row, a "continue this here"
 * menu item — anywhere the conversation to reopen is only known at the moment
 * the person picks it. Read the hook's header for why each step exists; the
 * order here is identical on purpose.
 *
 * `surfaceName` is what makes "pick up this conversation HERE" work. A
 * conversation stamped with a surface name has that surface's LIVE values
 * re-resolved through the agent↔surface binding layers on every send
 * (`refreshSurfaceScope`, called by `smartExecute`). So bringing any
 * conversation onto a page is: resume it, stamp the page's surface, done — the
 * page hands over its context on the next message, exactly as it does for a
 * bound agent launched fresh from the header Agents menu.
 *
 *   - `surfaceName: "<name>"` stamps that surface.
 *   - `surfaceName: null` CLEARS a stamp (the conversation stops receiving
 *     page context — Quick Chat's "Include page context" off).
 *   - omitted leaves whatever the conversation already carries.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import type { SourceFeature } from "@/features/agents/types/instance.types";
import type { ResultDisplayMode } from "@/features/agents/types/instance.types";
import { reconnectServerOperation } from "@/features/agents/runtime-reconnect/reconnect-server-operation.thunk";
import { createManualInstance } from "./create-instance.thunk";
import { loadConversation } from "./load-conversation.thunk";
import { surfaceColdPendingCalls } from "./surface-cold-pending-calls.thunk";
import { setFocus } from "../conversation-focus/conversation-focus.slice";
import { patchConversation } from "../conversations/conversations.slice";

export interface ResumeConversationArgs {
  conversationId: string;
  /** The agent that owns it — needed to build the instance when it is cold. */
  agentId: string;
  /** Surface (focus) key that should end up pointed at this conversation. */
  surfaceKey: string;
  /** See the file header. `undefined` = leave the existing stamp alone. */
  surfaceName?: string | null;
  sourceFeature?: SourceFeature;
  displayMode?: ResultDisplayMode;
  messageLimit?: number;
  signal?: AbortSignal;
}

export interface ResumeConversationResult {
  conversationId: string;
  /** False when the conversation was already live in memory (no re-fetch). */
  hydrated: boolean;
  aborted: boolean;
}

export const resumeConversation = createAsyncThunk<
  ResumeConversationResult,
  ResumeConversationArgs,
  { state: RootState; dispatch: AppDispatch }
>(
  "instances/resumeConversation",
  async (
    {
      conversationId,
      agentId,
      surfaceKey,
      surfaceName,
      sourceFeature,
      displayMode,
      messageLimit,
      signal,
    },
    { dispatch, getState },
  ) => {
    const stampSurface = () => {
      if (surfaceName === undefined) return;
      dispatch(patchConversation({ conversationId, surfaceName }));
    };

    const state = getState();
    const exists = !!state.conversations?.byConversationId?.[conversationId];
    const liveMessageCount =
      state.messages?.byConversationId?.[conversationId]?.orderedIds?.length ??
      0;

    // (1) Live in memory with messages — a re-fetch would clobber an in-flight
    // stream. Re-point focus and stop.
    if (exists && liveMessageCount > 0) {
      dispatch(setFocus({ surfaceKey, conversationId }));
      stampSurface();
      return { conversationId, hydrated: false, aborted: false };
    }

    // (2) Cold — build the instance under the SAME id.
    if (!exists) {
      await dispatch(
        createManualInstance({
          agentId,
          conversationId,
          apiEndpointMode: "agent",
          responseDensity: "compact",
          ...(sourceFeature ? { sourceFeature } : {}),
          ...(displayMode ? { displayMode } : {}),
        }),
      ).unwrap();
    }
    if (signal?.aborted) return { conversationId, hydrated: false, aborted: true };

    // (3) Hydrate everything from the DB. Nothing was in memory for this id,
    // so a bundle with no row is a failed read, never a fresh mint.
    await dispatch(
      loadConversation({
        conversationId,
        surfaceKey,
        ...(messageLimit !== undefined ? { messageLimit } : {}),
        ...(signal ? { signal } : {}),
        expectMaterialized: !exists,
      }),
    ).unwrap();
    if (signal?.aborted) return { conversationId, hydrated: true, aborted: true };

    // Stamped AFTER the hydrate so the DB-shaped record cannot overwrite it.
    stampSurface();

    // (4) + (5) Fire-and-forget resume of anything still in flight.
    void dispatch(surfaceColdPendingCalls(conversationId));
    void dispatch(
      reconnectServerOperation({ conversationId, source: "cold-load" }),
    );

    return { conversationId, hydrated: true, aborted: false };
  },
);
