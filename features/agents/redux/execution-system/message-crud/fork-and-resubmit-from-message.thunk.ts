/**
 * forkAndResubmitFromMessage — the ONE canonical "branch here and get an
 * answer" flow, shared by every surface that forks a conversation at a
 * message and wants a live continuation (never a dead-end branch).
 *
 * Semantics:
 *   1. Fork at the message's OWN position — the branch INCLUDES this message
 *      (everything up to and including it; whatever came after is excluded).
 *   2. If `newContent` is provided, edit the forked copy of the message in
 *      place (preserving its non-text blocks via `mergeEditedText`).
 *   3. Navigate the initiating surface to the fork (so the streamed answer
 *      lands in view), or toast when there's no registered surface.
 *   4. Re-RUN the pending turn via `executeInstance({ retry: true })`.
 *
 * Why retry (not re-send `user_input`): after the fork the message is already
 * the branch's last, unanswered turn. `retry: true` regenerates its reply —
 * the same primitive the manual Retry button uses. Re-sending `user_input`
 * would (a) duplicate the message and (b) depend on the input slice surviving
 * the navigation above, which the remount clears (that was the "Invalid
 * conversation ID: Provide user_input, or set retry=true" bug).
 *
 * This is why "Fork at this message" on a USER message is no longer a
 * dead-end: forking a question with no reply after it USED to leave you
 * staring at your own message with no answer. Now it always regenerates one
 * on the branch. Callers that fork an ASSISTANT message (which already ends
 * in a reply) should NOT use this — they want a fork with no re-run.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import { forkConversation } from "./fork-conversation.thunk";
import { mergeEditedText } from "./content-blocks.util";

interface ForkAndResubmitArgs {
  conversationId: string;
  /** The message to fork at — its position is read from the store. */
  messageId: string;
  /**
   * Optional edited text. When present the forked copy of the message is
   * rewritten before the re-run; when omitted the message is re-run verbatim
   * (a plain "branch and regenerate").
   */
  newContent?: string;
  /** Surface key for post-fork navigation. Omit to skip navigation. */
  surfaceKey?: string | null;
}

interface ForkAndResubmitResult {
  conversationId: string;
}

interface ThunkApi {
  dispatch: AppDispatch;
  state: RootState;
  rejectValue: { message: string };
}

export const forkAndResubmitFromMessage = createAsyncThunk<
  ForkAndResubmitResult,
  ForkAndResubmitArgs,
  ThunkApi
>(
  "messages/forkAndResubmitFromMessage",
  async (
    { conversationId, messageId, newContent, surfaceKey },
    { dispatch, getState, rejectWithValue },
  ) => {
    const sourceEntry = getState().messages.byConversationId[conversationId];
    const sourceMessage = sourceEntry?.byId?.[messageId];
    if (!sourceMessage) {
      return rejectWithValue({
        message: `Message ${messageId} not found in conversation ${conversationId}`,
      });
    }
    const forkPosition = sourceMessage.position ?? 0;

    // 1. Fork at the message's position (INCLUSIVE).
    const forkResult = await dispatch(
      forkConversation({ conversationId, atPosition: forkPosition }),
    ).unwrap();
    const newConversationId = forkResult.conversationId;

    // 2. Find the duplicated message on the fork (same position, fresh id) and,
    //    if we were given edited text, rewrite it in place.
    if (typeof newContent === "string") {
      const forkedEntry =
        getState().messages.byConversationId[newConversationId];
      const editedId = forkedEntry
        ? (Object.values(forkedEntry.byId).find(
            (m) => m.position === forkPosition,
          )?.id ?? null)
        : null;
      if (typeof editedId !== "string") {
        return rejectWithValue({
          message: "Couldn't find the edited message on the new fork",
        });
      }
      const { editMessage } = await import("./edit-message.thunk");
      const existing =
        getState().messages.byConversationId[newConversationId]?.byId?.[editedId]
          ?.content;
      await dispatch(
        editMessage({
          conversationId: newConversationId,
          messageId: editedId,
          newContent: mergeEditedText(existing, newContent),
        }),
      ).unwrap();
    }

    // 3. Surface the branch BEFORE firing the turn so the streaming bubble
    //    lands in the right place.
    if (surfaceKey) {
      const { requestSurfaceNavigation } =
        await import("../../surfaces/request-surface-navigation.thunk");
      await dispatch(
        requestSurfaceNavigation({
          surfaceKey,
          conversationId: newConversationId,
          reason: "fork",
        }),
      );
    } else {
      const { toast } = await import("sonner");
      toast.success("Branch created — open it from the conversation sidebar");
    }

    // 4. Re-run the pending turn on the branch.
    const { executeInstance } = await import("../thunks/execute-instance.thunk");
    void dispatch(
      executeInstance({ conversationId: newConversationId, retry: true }),
    );

    return { conversationId: newConversationId };
  },
);
