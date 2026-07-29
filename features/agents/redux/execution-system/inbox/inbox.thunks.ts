/**
 * conversationInbox thunks — the client half of the Turn-Boundary Inbox
 * (docs/TURN_BOUNDARY_INBOX.md; server contract: aidream
 * docs/cx_chat/TURN_BOUNDARY_INBOX.md).
 *
 * SINGLE FUNNEL: every "send while the agent is running" flows through
 * `enqueueInboxMessage` — the routing decision itself lives in
 * `smartExecute` (thunks/smart-execute.thunk.ts), which calls this when the
 * target conversation already has a live run. Do not POST to `/inbox` from
 * anywhere else; bypassing the funnel forfeits the optimistic card +
 * `injection_consumed` delivery handshake.
 *
 * All four calls ride `callApi` (auth, base-url resolution, org/project
 * scope injection, error capture) against the generated endpoint types.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import { callApi } from "@/lib/api/call-api";
import { toast } from "@/lib/toast";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import type { components } from "@/types/python-generated/api-types";
import {
  addInboxItem,
  confirmInboxItem,
  failInboxItem,
  setInboxItemText,
  removeInboxItem,
  hydrateInboxItems,
  type ConversationInboxItem,
  type InboxItemKind,
} from "./inbox.slice";

type InboxEnqueueResponse = components["schemas"]["InboxEnqueueResponse"];
type InboxItemWire = components["schemas"]["InboxItem"];

const localInjectionId = (): string => `inbox_local_${crypto.randomUUID()}`;

export interface EnqueueInboxMessageArgs {
  conversationId: string;
  text: string;
  kind?: InboxItemKind;
  /** Steering instructions may hide from the visible transcript. */
  isVisibleToUser?: boolean;
}

export interface EnqueueInboxMessageResult {
  injectionId: string;
  /** Server's view — false means nothing is running and the item waits. */
  runActive: boolean;
}

/**
 * Queue a message into a running conversation. Optimistic: the card appears
 * immediately as "sending", flips to "pending" on the server ack, and to
 * delivered (removed — the transcript owns it) when the stream's
 * `injection_consumed` names it.
 */
export const enqueueInboxMessage = createAsyncThunk<
  EnqueueInboxMessageResult,
  EnqueueInboxMessageArgs,
  { state: RootState; dispatch: AppDispatch }
>(
  "conversationInbox/enqueue",
  async (
    { conversationId, text, kind = "user_message", isVisibleToUser = true },
    thunkApi,
  ) => {
    const { dispatch } = thunkApi;
    const localId = localInjectionId();
    dispatch(
      addInboxItem({
        injectionId: localId,
        conversationId,
        kind,
        text,
        status: "sending",
        isVisibleToUser,
        queuedAt: new Date().toISOString(),
      }),
    );

    const result = await dispatch(
      callApi({
        path: "/ai/conversations/{conversation_id}/inbox",
        method: "POST",
        pathParams: { conversation_id: conversationId },
        body: {
          kind,
          text,
          is_visible_to_user: isVisibleToUser,
          is_visible_to_model: true,
        },
      }),
    );

    if (result.error) {
      const message =
        result.error.message ?? "The server rejected the queued message.";
      console.error("[inbox] enqueue failed", {
        conversationId,
        error: result.error,
      });
      dispatch(
        failInboxItem({ conversationId, injectionId: localId, error: message }),
      );
      toast.error("Couldn't queue your message", { description: message });
      return thunkApi.rejectWithValue(message) as never;
    }

    const data = result.data as InboxEnqueueResponse;
    dispatch(
      confirmInboxItem({
        conversationId,
        localId,
        injectionId: data.injection_id,
      }),
    );
    return { injectionId: data.injection_id, runActive: data.run_active };
  },
);

/**
 * Retract a still-pending queued message. 409 = it already drained (the
 * agent is answering it) — remove the card and let the transcript take over.
 */
export const retractInboxItem = createAsyncThunk<
  void,
  { conversationId: string; injectionId: string },
  { state: RootState; dispatch: AppDispatch }
>(
  "conversationInbox/retract",
  async ({ conversationId, injectionId }, { dispatch }) => {
    // Local-only cards (failed POST / still sending) just disappear.
    if (injectionId.startsWith("inbox_local_")) {
      dispatch(removeInboxItem({ conversationId, injectionId }));
      return;
    }

    const result = await dispatch(
      callApi({
        path: "/ai/conversations/{conversation_id}/inbox/{injection_id}",
        method: "DELETE",
        pathParams: {
          conversation_id: conversationId,
          injection_id: injectionId,
        },
      }),
    );

    if (result.error && result.error.status === 409) {
      // Already drained — delivery won the race. Not an error.
      dispatch(removeInboxItem({ conversationId, injectionId }));
      toast.info("Already delivered", {
        description: "The agent picked this message up before it could be withdrawn.",
      });
      return;
    }
    if (result.error && result.error.status !== 404) {
      toast.error("Couldn't withdraw the queued message", {
        description: result.error.message ?? undefined,
      });
      return;
    }
    dispatch(removeInboxItem({ conversationId, injectionId }));
  },
);

/** Edit a still-pending queued message's text. 409 = already drained. */
export const editInboxItem = createAsyncThunk<
  void,
  { conversationId: string; injectionId: string; text: string },
  { state: RootState; dispatch: AppDispatch }
>(
  "conversationInbox/edit",
  async ({ conversationId, injectionId, text }, { dispatch }) => {
    if (injectionId.startsWith("inbox_local_")) {
      // Not on the server yet — edit locally; the in-flight POST carries the
      // old text, but confirm/fail only touch id/status, so this is safe.
      dispatch(setInboxItemText({ conversationId, injectionId, text }));
      return;
    }

    const result = await dispatch(
      callApi({
        path: "/ai/conversations/{conversation_id}/inbox/{injection_id}",
        method: "PATCH",
        pathParams: {
          conversation_id: conversationId,
          injection_id: injectionId,
        },
        body: { text },
      }),
    );

    if (result.error && result.error.status === 409) {
      dispatch(removeInboxItem({ conversationId, injectionId }));
      toast.info("Already delivered", {
        description: "The agent picked this message up before the edit landed.",
      });
      return;
    }
    if (result.error) {
      toast.error("Couldn't edit the queued message", {
        description: result.error.message ?? undefined,
      });
      return;
    }
    dispatch(setInboxItemText({ conversationId, injectionId, text }));
  },
);

/**
 * Rebuild the "waiting its turn" cards from the server — reopen-mid-run, or
 * reconciling after a cancelled run left items pending. Quiet on failure
 * (best-effort hydration; a miss just means no cards until the next event).
 */
export const hydrateInbox = createAsyncThunk<
  void,
  { conversationId: string },
  { state: RootState; dispatch: AppDispatch }
>("conversationInbox/hydrate", async ({ conversationId }, { dispatch }) => {
  const result = await dispatch(
    callApi({
      path: "/ai/conversations/{conversation_id}/inbox",
      method: "GET",
      pathParams: { conversation_id: conversationId },
      queryParams: { status: "pending" },
    }),
  );
  if (result.error) {
    console.warn("[inbox] hydrate failed (best-effort)", {
      conversationId,
      error: result.error,
    });
    return;
  }
  const wire = (result.data ?? []) as InboxItemWire[];
  const items: ConversationInboxItem[] = wire.map((w) => ({
    injectionId: w.injection_id,
    conversationId,
    kind: (w.kind as InboxItemKind) ?? "user_message",
    text: w.text ?? "",
    status: "pending",
    isVisibleToUser: w.is_visible_to_user ?? true,
    queuedAt: w.queued_at ?? new Date().toISOString(),
  }));
  dispatch(hydrateInboxItems({ conversationId, items }));
});
