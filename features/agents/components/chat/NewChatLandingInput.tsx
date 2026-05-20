"use client";

import { useCallback } from "react";
import { ArrowUp, CircleStop, Plus } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { Button } from "@/components/ui/button";
import { AgentTextarea } from "@/features/agents/components/inputs/smart-input/AgentTextarea";
import { AgentMicrophoneButton } from "@/features/agents/components/inputs/smart-input/AgentMicrophoneButton";
import { SmartAgentResourcePickerButton } from "@/features/agents/components/inputs/resources/SmartAgentResourcePickerButton";
import {
  smartExecute,
  cancelExecution,
} from "@/features/agents/redux/execution-system/thunks/smart-execute.thunk";
import { selectIsExecuting } from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { selectInputCharCount } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.selectors";
import { cn } from "@/lib/utils";

interface NewChatLandingInputProps {
  /** The default-agent conversation bound to this input. Same Redux state as
   *  the standard SmartAgentInput would use; they're interchangeable views of
   *  one conversation. */
  conversationId: string;
  surfaceKey: string;
}

/**
 * Minimal pill-shaped input for the `/chat/new` landing — matches the design
 * the user provided (Plus / textarea / mic / send), nothing else.
 *
 * Reuses the production Redux-bound pieces wherever possible:
 *   - `AgentTextarea` for the composing surface (autoresize, paste, undo)
 *   - `AgentMicrophoneButton` for voice-to-text into the same conversation
 *   - `SmartAgentResourcePickerButton` rendered behind a Plus trigger for
 *     uploads (we override only the trigger icon; the picker itself is the
 *     canonical one used everywhere else in the app).
 *
 * Deliberately omitted vs the standard SmartAgentInput: variable panel,
 * Creator Panel, debug toggle, resource chips strip. The landing surface is
 * pre-submit; none of that is useful here. Once the user submits, the URL
 * promotes to `/chat/[cid]` and the full SmartAgentInput takes over.
 */
export function NewChatLandingInput({
  conversationId,
  surfaceKey,
}: NewChatLandingInputProps) {
  const dispatch = useAppDispatch();
  const isExecuting = useAppSelector(selectIsExecuting(conversationId));
  const charCount = useAppSelector(selectInputCharCount(conversationId));
  const canSend = !isExecuting && charCount > 0;

  const handleSubmit = useCallback(() => {
    if (isExecuting) {
      dispatch(cancelExecution(conversationId));
      return;
    }
    if (charCount === 0) return;
    dispatch(smartExecute({ conversationId, surfaceKey }));
  }, [dispatch, conversationId, surfaceKey, isExecuting, charCount]);

  return (
    <div
      className={cn(
        "w-full max-w-2xl mx-auto",
        "flex items-end gap-2 px-3 py-2",
        "rounded-3xl border border-border bg-card shadow-sm",
        "focus-within:border-foreground/30 transition-colors",
      )}
    >
      {/* Upload — canonical resource picker with a Plus-styled trigger */}
      <div className="shrink-0 pb-0.5">
        <SmartAgentResourcePickerButton
          conversationId={conversationId}
          triggerSlot={
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60"
              tabIndex={-1}
              title="Attach a file"
              aria-label="Attach a file"
            >
              <Plus className="w-4 h-4" />
            </Button>
          }
        />
      </div>

      {/* Composing surface — autoresizes, redux-bound */}
      <div className="flex-1 min-w-0 self-center">
        <AgentTextarea conversationId={conversationId} surfaceKey={surfaceKey} />
      </div>

      {/* Voice — appends transcript to the same input */}
      <div className="shrink-0 pb-0.5">
        <AgentMicrophoneButton conversationId={conversationId} size="sm" />
      </div>

      {/* Send */}
      <div className="shrink-0 pb-0.5">
        <Button
          onClick={handleSubmit}
          disabled={!isExecuting && !canSend}
          className={cn(
            "h-9 w-9 p-0 rounded-full",
            "bg-foreground text-background hover:bg-foreground/90",
            "disabled:opacity-30",
          )}
          title={isExecuting ? "Stop" : "Send"}
          aria-label={isExecuting ? "Stop" : "Send"}
        >
          {isExecuting ? (
            <CircleStop className="w-4 h-4" />
          ) : (
            <ArrowUp className="w-4 h-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
