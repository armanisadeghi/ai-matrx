"use client";

/**
 * promptForkOutcome — explicit modal prompt after a successful fork.
 *
 * Behavior:
 *   The RPC has already created the new branch by the time we open this.
 *   The user picks one of two non-destructive next steps:
 *     • "Go to new branch" → dispatches `requestSurfaceNavigation` so
 *       whatever surface initiated the fork (page, window, widget)
 *       routes correctly (router.replace for pages, focus push for
 *       window/widget).
 *     • "Stay here"        → no-op. The new branch is reachable from
 *       the conversation sidebar at any time.
 *
 * Why a modal (and not a toast):
 *   Forking has only two sensible follow-ups and the user has just
 *   actively chosen to fork — they want to be asked, not be left
 *   guessing whether something happened. A toast (8s, easy to miss)
 *   was making the action feel like a no-op.
 *
 * Uses the global imperative `confirm()` host so we can await a
 * Promise<boolean> from anywhere (registry callbacks, thunks, etc.)
 * without wiring local React state.
 */

import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import type { AppDispatch } from "@/lib/redux/store";
import { requestSurfaceNavigation } from "@/features/agents/redux/surfaces/request-surface-navigation.thunk";

export interface PromptForkOutcomeArgs {
  dispatch: AppDispatch;
  surfaceKey: string;
  newConversationId: string;
}

export async function promptForkOutcome({
  dispatch,
  surfaceKey,
  newConversationId,
}: PromptForkOutcomeArgs): Promise<void> {
  const goToBranch = await confirm({
    title: "Branch created",
    description:
      "Everything up to this message was duplicated into a new conversation. Open the new branch now, or stay in this one?",
    confirmLabel: "Go to new branch",
    cancelLabel: "Stay here",
  });

  if (!goToBranch) {
    return;
  }

  void dispatch(
    requestSurfaceNavigation({
      surfaceKey,
      conversationId: newConversationId,
      reason: "fork",
    }),
  );
}
