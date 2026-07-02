/**
 * commitInlineContentEdit — bridge between in-flight inline block edits
 * (inline-decision resolve, code-block save, table edit, inline broker
 * update, full-screen save inside the body) and the canonical persistence
 * + display sources of truth.
 *
 * Why this exists
 * ---------------
 * `EnhancedChatMarkdown.replaceBlockContent` fires `onContentChange(full
 * updated string)` from any inline editor. The problem is:
 *
 *   1. Local `editedContent` state in `EnhancedChatMarkdown` overrides
 *      display, but it lives in component state — any remount (parent
 *      regroup, scroll virtualization, conditional rerender) drops it and
 *      the edited section snaps back to the server text.
 *
 *   2. The renderer keeps reading from `activeRequests.byRequestId
 *      [reqId]` for the whole session (see AgentAssistantMessage's
 *      "lifetime rule"), so dispatching `editMessage` alone updates
 *      `messages.byId.content` + the DB, but the visible content does
 *      NOT change until you reload the page.
 *
 *   3. Some inline editors (CodeBlock's Monaco editor especially) fire
 *      `onContentChange` on every keystroke. Calling `cx_message_edit`
 *      per stroke would spam the DB and produce one history entry per
 *      keystroke instead of one per logical edit.
 *
 * This thunk handles all three:
 *
 *   • Immediately patches `activeRequests.editedText` so display syncs
 *     in the current frame (renders through `selectAccumulatedText`).
 *   • Debounces the DB write per `messageId`. The first call after a
 *     pause schedules `editMessage`; rapid follow-up calls reset the
 *     timer and replace the pending payload so only the latest text
 *     hits the wire.
 *   • `cx_message_edit` auto-archives the PRE-edit content into
 *     `content_history` once per debounce window — so one history
 *     entry per editing session, not per keystroke.
 *
 * Callers don't need to await this. Fire-and-forget from React
 * components. Errors surface via toast inside `editMessage`.
 */

import type { AppDispatch, RootState } from "@/lib/redux/store";
import { setRequestEditedText } from "../active-requests/active-requests.slice";
import { updateMessageRecord } from "../messages/messages.slice";
import { editMessage } from "./edit-message.thunk";
import { buildContentBlocksForSave } from "@/features/cx-chat/utils/buildContentBlocksForSave";

/** ms of idle time before the DB write fires. */
const DB_DEBOUNCE_MS = 800;

interface PendingEdit {
  timer: ReturnType<typeof setTimeout>;
  latestText: string;
}

// Module-level debounce map. Keyed by messageId so each message has its
// own coalesce window. Cleared on flush or unmount-safe via timeout fire.
const pendingByMessageId = new Map<string, PendingEdit>();

interface CommitInlineEditArgs {
  conversationId: string;
  /**
   * Server-assigned message id. Required — inline edits only apply to
   * committed messages (the inline UI gates the edit on
   * `!isStreamActive`, which implies the message has committed). Without
   * a messageId there's nothing to persist to.
   */
  messageId: string;
  /**
   * Optional request id for the active-request entry that drives the
   * renderer mid-session. When provided, `editedText` is patched
   * synchronously so the inline edit reflects in the rendered output
   * even after a remount.
   */
  requestId?: string;
  /** The full updated message text after the inline edit. */
  newText: string;
}

/**
 * Plain thunk (not `createAsyncThunk`) because the meaningful work is
 * the debounced side-effect, not a tracked promise lifecycle. React
 * doesn't need to await this.
 */
export const commitInlineContentEdit =
  ({ conversationId, messageId, requestId, newText }: CommitInlineEditArgs) =>
  (dispatch: AppDispatch, getState: () => RootState) => {
    // ── 1. Sync the renderer immediately ────────────────────────────
    if (requestId) {
      dispatch(setRequestEditedText({ requestId, text: newText }));
    }

    // ── 2. Optimistic local content update on the message record ────
    // The block array is preserved (non-text blocks intact) so this is
    // a faithful local view of what the server will store on the next
    // debounce flush.
    const record =
      getState().messages.byConversationId[conversationId]?.byId?.[messageId];
    if (record) {
      const rawContent = Array.isArray(record.content)
        ? (record.content as unknown[])
        : undefined;
      const nextContent = buildContentBlocksForSave(newText, rawContent);
      dispatch(
        updateMessageRecord({
          conversationId,
          messageId,
          patch: { content: nextContent, _clientStatus: "pending" },
        }),
      );
    }

    // ── 3. Schedule the debounced DB write ──────────────────────────
    const existing = pendingByMessageId.get(messageId);
    if (existing) {
      clearTimeout(existing.timer);
    }

    const timer = setTimeout(() => {
      const entry = pendingByMessageId.get(messageId);
      if (!entry) return;
      pendingByMessageId.delete(messageId);

      // Re-read the current message record at flush time so we capture
      // the latest non-text blocks (tool calls, thinking, media) even
      // if they changed between the schedule and the fire.
      const flushRecord =
        getState().messages.byConversationId[conversationId]?.byId?.[messageId];
      const flushRawContent = flushRecord && Array.isArray(flushRecord.content)
        ? (flushRecord.content as unknown[])
        : undefined;
      const flushContent = buildContentBlocksForSave(
        entry.latestText,
        flushRawContent,
      );

      // Fire-and-forget; editMessage already toasts on failure and
      // rolls back the optimistic patch. We don't await because the
      // caller is a React event handler that returned long ago.
      void dispatch(
        editMessage({
          conversationId,
          messageId,
          newContent: flushContent,
        }),
      );
    }, DB_DEBOUNCE_MS);

    pendingByMessageId.set(messageId, { timer, latestText: newText });
  };

/**
 * Flush any pending edits for a message immediately. Used by surfaces
 * that need to guarantee the DB is up-to-date before some other action
 * (e.g. fork, retry, navigate away).
 */
export const flushPendingInlineEdit =
  (messageId: string) => (dispatch: AppDispatch, getState: () => RootState) => {
    const entry = pendingByMessageId.get(messageId);
    if (!entry) return;
    clearTimeout(entry.timer);
    pendingByMessageId.delete(messageId);

    const record = (() => {
      const state = getState();
      for (const conversationId of Object.keys(state.messages.byConversationId)) {
        const rec =
          state.messages.byConversationId[conversationId]?.byId?.[messageId];
        if (rec) return { conversationId, record: rec };
      }
      return null;
    })();
    if (!record) return;

    const rawContent = Array.isArray(record.record.content)
      ? (record.record.content as unknown[])
      : undefined;
    const flushContent = buildContentBlocksForSave(entry.latestText, rawContent);

    void dispatch(
      editMessage({
        conversationId: record.conversationId,
        messageId,
        newContent: flushContent,
      }),
    );
  };
