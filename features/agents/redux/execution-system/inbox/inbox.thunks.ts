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
  type InboxItemMode,
} from "./inbox.slice";

type InboxEnqueueResponse = components["schemas"]["InboxEnqueueResponse"];
type InboxItemWire = components["schemas"]["InboxItem"];

const localInjectionId = (): string => `inbox_local_${crypto.randomUUID()}`;

/** mode ↔ wire `delivery` — the server owns the semantics for both. */
const deliveryForMode: Record<InboxItemMode, "turn_end" | "next_boundary"> = {
  queue: "turn_end",
  steer: "next_boundary",
};

const modeForDelivery = (delivery: string | null | undefined): InboxItemMode =>
  delivery === "turn_end" ? "queue" : "steer";

/**
 * Promote a waiting QUEUE item to STEER — "don't wait for the run to end,
 * deliver at the agent's next pause." The server has no delivery-PATCH, so
 * this is retract + re-enqueue; a 409 on the retract means it already
 * delivered (nothing to promote).
 */
export const promoteQueuedToSteer = createAsyncThunk<
  void,
  { conversationId: string; injectionId: string },
  { state: RootState; dispatch: AppDispatch }
>(
  "conversationInbox/promoteQueuedToSteer",
  async ({ conversationId, injectionId }, { dispatch, getState }) => {
    const item = getState().conversationInbox?.byConversationId[
      conversationId
    ]?.find((i) => i.injectionId === injectionId);
    if (!item || item.mode !== "queue" || item.status !== "pending") return;
    const outcome = await dispatch(
      retractInboxItem({ conversationId, injectionId }),
    ).unwrap();
    if (outcome !== "retracted") return; // delivered already, or withdraw failed
    await dispatch(
      enqueueInboxMessage({ conversationId, text: item.text, mode: "steer" }),
    );
  },
);

export interface EnqueueInboxMessageArgs {
  conversationId: string;
  text: string;
  /**
   * QUEUE ("queue" → wire delivery "turn_end"): held until the run is
   * COMPLETELY done, then delivered as the next message — one per turn, FIFO.
   * STEER ("steer" → "next_boundary"): delivered at the agent's next pause
   * mid-run. Both server-held; both answered on the already-open stream.
   */
  mode?: InboxItemMode;
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
 * STEER a running conversation: deliver the message at the agent's next
 * natural pause, mid-run, on the already-open stream (server-held Turn-
 * Boundary Inbox). Optimistic: the card appears immediately as "sending",
 * flips to "pending" on the server ack, and is removed (the transcript owns
 * it) when the stream's `injection_consumed` names it.
 */
export const enqueueInboxMessage = createAsyncThunk<
  EnqueueInboxMessageResult,
  EnqueueInboxMessageArgs,
  { state: RootState; dispatch: AppDispatch }
>(
  "conversationInbox/enqueue",
  async (
    {
      conversationId,
      text,
      mode = "queue",
      kind = "user_message",
      isVisibleToUser = true,
    },
    thunkApi,
  ) => {
    const { dispatch } = thunkApi;
    const localId = localInjectionId();
    dispatch(
      addInboxItem({
        injectionId: localId,
        conversationId,
        mode,
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
          delivery: deliveryForMode[mode],
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
 * Returns the outcome so callers (promoteQueuedToSteer) can distinguish a
 * clean withdrawal from a delivery race.
 */
export const retractInboxItem = createAsyncThunk<
  "retracted" | "already_drained" | "error",
  { conversationId: string; injectionId: string },
  { state: RootState; dispatch: AppDispatch }
>(
  "conversationInbox/retract",
  async ({ conversationId, injectionId }, { dispatch }) => {
    // Local-only cards (failed POST / still sending) just disappear.
    if (injectionId.startsWith("inbox_local_")) {
      dispatch(removeInboxItem({ conversationId, injectionId }));
      return "retracted";
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
      return "already_drained";
    }
    if (result.error && result.error.status !== 404) {
      toast.error("Couldn't withdraw the queued message", {
        description: result.error.message ?? undefined,
      });
      return "error";
    }
    dispatch(removeInboxItem({ conversationId, injectionId }));
    return "retracted";
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
    mode: modeForDelivery(w.delivery),
    kind: (w.kind as InboxItemKind) ?? "user_message",
    text: w.text ?? "",
    status: "pending",
    isVisibleToUser: w.is_visible_to_user ?? true,
    queuedAt: w.queued_at ?? new Date().toISOString(),
  }));
  dispatch(hydrateInboxItems({ conversationId, items }));
});
