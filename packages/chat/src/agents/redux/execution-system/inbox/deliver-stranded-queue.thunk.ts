/**
 * A QUEUED MESSAGE SENDS WHEN THE TURN ENDS — even one the server can no
 * longer deliver itself (2026-10-01, clone conversation fef0260a…).
 *
 * The server drains a queued row at its run's FINAL boundary. The client keeps
 * a run "running" until the stream's tail arrives, which is after that drain
 * (the server persists, then sends `end`). A message sent in that tail routes
 * to the inbox, lands after the drain, and the server answers
 * `run_active: false` — it holds the row "until the next run", and nothing
 * starts one. The card sat at "Waiting — sends after your next message" while
 * the person waited for an answer that was never going to come.
 *
 * So when a turn completes on this client and the person's own line is still
 * pending, the client delivers it: withdraw the server row first (a 409 means
 * the server took it after all — then it is already answered, never sent
 * twice), then send it as the next normal turn. One line per turn, FIFO — the
 * next completion sends the next. A draft the person is typing is never
 * overwritten or sent with it: the line goes back in ahead of the draft.
 * Collaboration notes are the agent's and stay queued for the server.
 *
 * Triggered by `inbox-turn-end.middleware.ts` on every completion path.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@host/lib/redux/store";
import { toast } from "../../../../host/notify";
import { retractInboxItem } from "./inbox.thunks";
import { isStrandablePersonLine } from "./inbox.selectors";
import { hasAbortController } from "../thunks/abort-registry";
import { isExecutionClaimed } from "../thunks/submit-claims";
import { setUserInputText } from "../instance-user-input/instance-user-input.slice";

const inFlight = new Set<string>();
const IDLE_WAIT_MS = 10_000;

function isLive(state: RootState, conversationId: string): boolean {
  const status = state.conversations?.byConversationId[conversationId]?.status;
  return status === "running" || status === "streaming" || status === "paused";
}

export type StrandedQueueOutcome = "sent" | "returned" | "none";

export const deliverStrandedQueue = createAsyncThunk<
  StrandedQueueOutcome,
  { conversationId: string },
  { state: RootState; dispatch: AppDispatch }
>(
  "conversationInbox/deliverStrandedQueue",
  async ({ conversationId }, { dispatch, getState }) => {
    if (inFlight.has(conversationId)) return "none";
    inFlight.add(conversationId);
    try {
      // The completing stream still owns its abort controller for a moment;
      // a send now would be refused as a concurrent turn.
      const deadline = Date.now() + IDLE_WAIT_MS;
      while (
        (hasAbortController(conversationId) ||
          isExecutionClaimed(conversationId)) &&
        Date.now() < deadline
      ) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      // Still held: a send now would be refused and re-queued — leave the
      // card; the next completion retries.
      if (hasAbortController(conversationId) || isExecutionClaimed(conversationId)) {
        return "none";
      }

      const state = getState();
      // Only a COMPLETED turn strands a line: a live run drains it at its
      // final boundary; Stop and failures have their own honest paths.
      if (state.conversations?.byConversationId[conversationId]?.status !== "complete") {
        return "none";
      }
      const head = (
        state.conversationInbox?.byConversationId[conversationId] ?? []
      ).find(isStrandablePersonLine);
      if (!head) return "none";

      const outcome = await dispatch(
        retractInboxItem({ conversationId, injectionId: head.injectionId }),
      ).unwrap();
      if (outcome !== "retracted") return "none";

      const after = getState();
      const input = after.instanceUserInput?.byConversationId[conversationId];
      const draft = input?.text ?? "";
      // Any attachment in the composer belongs to the next message the person
      // is building — sending the line now would carry it along.
      const hasAttachments =
        Object.keys(
          after.instanceResources?.byConversationId?.[conversationId] ?? {},
        ).length > 0;

      if (draft.trim() || hasAttachments || isLive(after, conversationId)) {
        // Never overwrite or co-send what the person is composing.
        dispatch(
          setUserInputText({
            conversationId,
            text: draft.trim() ? `${head.text}\n\n${draft}` : head.text,
          }),
        );
        toast.info("Queued message moved to your draft");
        return "returned";
      }

      dispatch(setUserInputText({ conversationId, text: head.text }));
      const { smartExecute } = await import("../thunks/smart-execute.thunk");
      await dispatch(smartExecute({ conversationId }));
      return "sent";
    } finally {
      inFlight.delete(conversationId);
    }
  },
);
