"use client";

/**
 * userEditActions — the ONE definition of what editing a USER message can do,
 * plus the router that runs the chosen outcome. Shared by every surface that
 * edits a user message (the inline `UserActionBar` pencil / paper-plane and the
 * options-menu "Edit & resubmit" item) so they can never drift.
 *
 * There are exactly THREE outcomes. There is no fourth: a fork that does NOT
 * re-run leaves the branch ending on an unanswered question (a dead-end), so
 * every fork here re-runs. See `fork-and-resubmit-from-message.thunk.ts`.
 *
 *   • save     — edit in place, DON'T re-run (fix a typo in the transcript)
 *   • resubmit — overwrite this turn and re-run in THIS chat
 *   • fork     — branch here with the edit and re-run; original untouched
 */

import type { EditorPrimaryAction } from "@/components/mardown-display/chat-markdown/FullScreenMarkdownEditor";
import type { AppDispatch } from "@/lib/redux/store";
import { toast } from "sonner";

export const USER_EDIT_ACTIONS: EditorPrimaryAction[] = [
  { id: "save", label: "Save only", variant: "secondary" },
  { id: "resubmit", label: "Save & resubmit" },
  { id: "fork", label: "Fork & resubmit" },
];

export interface RouteUserEditActionArgs {
  actionId: string;
  conversationId: string;
  messageId: string;
  newContent: string;
  /** Surface key for the fork's post-navigation. Omit outside a registered surface. */
  surfaceKey?: string | null;
}

/**
 * Run the chosen edit outcome. Owns its own error toasting so callers just
 * fire-and-forget. Unknown action ids are ignored (defensive).
 */
export async function routeUserEditAction(
  dispatch: AppDispatch,
  { actionId, conversationId, messageId, newContent, surfaceKey }: RouteUserEditActionArgs,
): Promise<void> {
  try {
    if (actionId === "save") {
      const { editMessageText } =
        await import("@/features/agents/redux/execution-system/message-crud/edit-message-text.thunk");
      await dispatch(
        editMessageText({ conversationId, messageId, newContent }),
      ).unwrap();
      toast.success("Message saved");
    } else if (actionId === "resubmit") {
      const { overwriteAndResend } =
        await import("@/features/agents/redux/execution-system/message-crud/overwrite-and-resend.thunk");
      await dispatch(
        overwriteAndResend({ conversationId, messageId, newContent }),
      ).unwrap();
    } else if (actionId === "fork") {
      const { forkAndResubmitFromMessage } =
        await import("@/features/agents/redux/execution-system/message-crud/fork-and-resubmit-from-message.thunk");
      await dispatch(
        forkAndResubmitFromMessage({
          conversationId,
          messageId,
          newContent,
          surfaceKey,
        }),
      ).unwrap();
    }
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "object" &&
            err &&
            "message" in err &&
            typeof (err as { message?: unknown }).message === "string"
          ? (err as { message: string }).message
          : "Edit failed";
    console.error(`[routeUserEditAction] "${actionId}" failed`, err);
    toast.error(message);
  }
}
