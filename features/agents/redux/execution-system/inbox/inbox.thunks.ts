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
import { selectIsExecuting } from "../selectors/aggregate.selectors";
import {
  addInboxItem,
  setInboxItemStatus,
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

// ─── QUEUE mode — hold until the run fully ends, then send as a normal turn ──

export interface QueueMessageArgs {
  conversationId: string;
  text: string;
  /** Re-insert at the head (drain-race requeue keeps FIFO order). */
  front?: boolean;
}

/**
 * QUEUE a message: it waits until the agent is completely done with the
 * current run, then sends as THE NEXT normal turn (FIFO — several queued
 * messages send one per turn, each waiting for the previous answer to
 * finish). Editable/withdrawable until it officially sends. This is the
 * DEFAULT behavior for a send while a run is live (Arman's ruling —
 * docs/TURN_BOUNDARY_INBOX.md "The three send modes").
 */
export const queueMessage = createAsyncThunk<
  void,
  QueueMessageArgs,
  { state: RootState; dispatch: AppDispatch }
>(
  "conversationInbox/queueMessage",
  async ({ conversationId, text, front = false }, { dispatch, getState }) => {
    dispatch(
      addInboxItem({
        injectionId: localInjectionId(),
        conversationId,
        mode: "queue",
        kind: "user_message",
        text,
        status: "queued",
        isVisibleToUser: true,
        queuedAt: new Date().toISOString(),
        front,
      }),
    );
    ensureQueueDrainWatcher(conversationId, dispatch, getState);
  },
);

/**
 * One watcher per conversation drains its QUEUE: wait for the run to end,
 * send the head item as a normal turn (via smartExecute's userTextOverride —
 * the composer's live draft is never touched), wait for THAT run to end,
 * repeat. The watcher dies when the queue is empty and is re-armed by the
 * next queueMessage. Client-held by design — see the durability note in
 * docs/TURN_BOUNDARY_INBOX.md.
 */
const activeQueueWatchers = new Set<string>();

const QUEUE_POLL_MS = 400;

function ensureQueueDrainWatcher(
  conversationId: string,
  dispatch: AppDispatch,
  getState: () => RootState,
): void {
  if (activeQueueWatchers.has(conversationId)) return;
  activeQueueWatchers.add(conversationId);

  void (async () => {
    try {
      for (;;) {
        const items =
          getState().conversationInbox?.byConversationId[conversationId] ?? [];
        const head = items.find(
          (i) => i.mode === "queue" && i.status === "queued",
        );
        if (!head) return;

        if (selectIsExecuting(conversationId)(getState())) {
          await new Promise((r) => setTimeout(r, QUEUE_POLL_MS));
          continue;
        }

        dispatch(
          setInboxItemStatus({
            conversationId,
            injectionId: head.injectionId,
            status: "dispatching",
          }),
        );
        // Dynamic import breaks the cycle: smart-execute routes INTO this
        // module for queue/steer adds; the drain routes back OUT through it
        // so every gate (pending asks, sandbox, scopes) applies to a queued
        // send exactly as to a typed one.
        const { smartExecute } = await import("../thunks/smart-execute.thunk");
        const result = await dispatch(
          smartExecute({ conversationId, textOverride: head.text }),
        );
        if (smartExecute.rejected.match(result)) {
          if (selectIsExecuting(conversationId)(getState())) {
            // Transient loss to a just-started run — keep the item queued and
            // let the loop wait that run out.
            dispatch(
              setInboxItemStatus({
                conversationId,
                injectionId: head.injectionId,
                status: "queued",
              }),
            );
            await new Promise((r) => setTimeout(r, QUEUE_POLL_MS));
            continue;
          }
          dispatch(
            failInboxItem({
              conversationId,
              injectionId: head.injectionId,
              error:
                typeof result.payload === "string"
                  ? result.payload
                  : (result.error.message ?? "Send failed"),
            }),
          );
          continue;
        }
        dispatch(
          removeInboxItem({ conversationId, injectionId: head.injectionId }),
        );
      }
    } finally {
      activeQueueWatchers.delete(conversationId);
    }
  })();
}

/**
 * Promote a waiting QUEUE item to STEER — "don't wait for the run to end,
 * deliver at the agent's next pause." Removes the local item and hands the
 * text to the server inbox.
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
    if (!item || item.mode !== "queue" || item.status !== "queued") return;
    dispatch(removeInboxItem({ conversationId, injectionId }));
    await dispatch(enqueueInboxMessage({ conversationId, text: item.text }));
  },
);

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
    { conversationId, text, kind = "user_message", isVisibleToUser = true },
    thunkApi,
  ) => {
    const { dispatch } = thunkApi;
    const localId = localInjectionId();
    dispatch(
      addInboxItem({
        injectionId: localId,
        conversationId,
        mode: "steer",
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
    mode: "steer",
    kind: (w.kind as InboxItemKind) ?? "user_message",
    text: w.text ?? "",
    status: "pending",
    isVisibleToUser: w.is_visible_to_user ?? true,
    queuedAt: w.queued_at ?? new Date().toISOString(),
  }));
  dispatch(hydrateInboxItems({ conversationId, items }));
});
