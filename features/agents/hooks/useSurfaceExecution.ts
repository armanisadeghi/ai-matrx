"use client";

/**
 * useSurfaceExecution
 *
 * Resolves the conversation a surface's send button should treat as "running"
 * for its processing / stop affordance.
 *
 * Why this exists: the smart-input toolbar is bound to a surface's INPUT-focus
 * conversation. Under the autoclear "split on submit" flow (Agent Builder), the
 * moment you submit, the input focus jumps to a freshly-prepped conversation
 * while the conversation that's actually streaming becomes the DISPLAY focus.
 * If the button only watched the input conversation it would never flip to
 * "stop" and clicking it would fire a second run instead of cancelling the
 * live one (the build-route regression).
 *
 * Resolution:
 *   - If the input conversation is executing, that's the target (the normal,
 *     non-split case — run/chat where input === display, so this is a no-op).
 *   - Otherwise, if the surface's display conversation differs and is
 *     executing (the autoclear-split case), that's the target.
 *   - Otherwise nothing is executing.
 *
 * This changes no execution/autoclear behavior — it only lets the button
 * reflect and cancel the run that is genuinely in flight on this surface.
 */

import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsExecuting } from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { selectDisplayConversation } from "@/features/agents/redux/execution-system/conversation-focus/conversation-focus.selectors";

interface SurfaceExecution {
  /** True when a run is in flight on this surface (input or display slot). */
  isExecuting: boolean;
  /** The conversation that is executing — the cancel target. Null when idle. */
  executingConversationId: string | null;
}

export function useSurfaceExecution(
  inputConversationId: string,
  surfaceKey?: string,
): SurfaceExecution {
  const inputExecuting = useAppSelector(selectIsExecuting(inputConversationId));

  const displayConversationId = useAppSelector(
    surfaceKey ? selectDisplayConversation(surfaceKey) : () => null,
  );

  const displayDiffers =
    !!displayConversationId && displayConversationId !== inputConversationId;

  const displayExecuting = useAppSelector(
    displayDiffers ? selectIsExecuting(displayConversationId) : () => false,
  );

  if (inputExecuting) {
    return { isExecuting: true, executingConversationId: inputConversationId };
  }
  if (displayDiffers && displayExecuting) {
    return {
      isExecuting: true,
      executingConversationId: displayConversationId,
    };
  }
  return { isExecuting: false, executingConversationId: null };
}
