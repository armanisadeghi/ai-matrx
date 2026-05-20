"use client";

import { useCallback, useLayoutEffect, useRef } from "react";
import { ArrowUp, CircleStop, Plus } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { Button } from "@/components/ui/button";
import { AgentMicrophoneButton } from "@/features/agents/components/inputs/smart-input/AgentMicrophoneButton";
import { SmartAgentResourcePickerButton } from "@/features/agents/components/inputs/resources/SmartAgentResourcePickerButton";
import {
  smartExecute,
  cancelExecution,
} from "@/features/agents/redux/execution-system/thunks/smart-execute.thunk";
import { selectIsExecuting } from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import {
  selectUserInputText,
  selectInputCharCount,
} from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.selectors";
import { setUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import { cn } from "@/lib/utils";

interface NewChatLandingInputProps {
  /** Default-agent conversation bound to this input — same Redux state the
   *  standard SmartAgentInput uses, so the two are interchangeable views of
   *  one conversation and stay in sync. */
  conversationId: string;
  surfaceKey: string;
}

const MAX_TEXTAREA_HEIGHT = 220; // px — beyond this the textarea scrolls

/**
 * Hero input for the `/chat/new` landing — purpose-built to match the
 * ChatGPT composer (large, rounded, generous), NOT a reskin of the dense
 * production input. The textarea is bound directly to the same Redux slice
 * (`instanceUserInput`) the standard `SmartAgentInput`/`AgentTextarea` use,
 * so submitting here flows through the identical `smartExecute` path and the
 * conversation is already streaming by the time the URL promotes.
 *
 * Controls, intentionally minimal: upload (Plus → canonical resource
 * picker), voice (AgentMicrophoneButton), send. No variables, no Creator
 * Panel, no resource-chip strip — this is the pre-first-message surface.
 */
export function NewChatLandingInput({
  conversationId,
  surfaceKey,
}: NewChatLandingInputProps) {
  const dispatch = useAppDispatch();
  const text = useAppSelector(selectUserInputText(conversationId));
  const charCount = useAppSelector(selectInputCharCount(conversationId));
  const isExecuting = useAppSelector(selectIsExecuting(conversationId));
  const canSend = !isExecuting && charCount > 0;

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize: grow with content up to MAX_TEXTAREA_HEIGHT, then scroll.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, [text]);

  const submit = useCallback(() => {
    if (isExecuting) {
      dispatch(cancelExecution(conversationId));
      return;
    }
    if (charCount === 0) return;
    dispatch(smartExecute({ conversationId, surfaceKey }));
  }, [dispatch, conversationId, surfaceKey, isExecuting, charCount]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter submits; Shift+Enter inserts a newline (ChatGPT convention).
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div
      className={cn(
        "w-full rounded-[28px] border border-border bg-card",
        "shadow-[0_2px_16px_-4px_rgba(0,0,0,0.08)] dark:shadow-none",
        "px-2.5 pt-3 pb-2 flex flex-col gap-1",
        "transition-colors focus-within:border-foreground/25",
      )}
    >
      {/* Composing surface */}
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) =>
          dispatch(setUserInputText({ conversationId, text: e.target.value }))
        }
        onKeyDown={handleKeyDown}
        rows={1}
        placeholder="Ask anything"
        autoFocus
        className={cn(
          "w-full resize-none bg-transparent outline-none border-none",
          "px-3 pt-1 text-base text-foreground placeholder:text-muted-foreground/60",
          "scrollbar-thin leading-relaxed",
        )}
        style={{ maxHeight: MAX_TEXTAREA_HEIGHT }}
      />

      {/* Tools row */}
      <div className="flex items-center gap-1 px-1">
        <SmartAgentResourcePickerButton
          conversationId={conversationId}
          triggerSlot={
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 p-0 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60"
              tabIndex={-1}
              title="Attach a file"
              aria-label="Attach a file"
            >
              <Plus className="w-5 h-5" />
            </Button>
          }
        />

        <div className="flex-1" />

        <AgentMicrophoneButton conversationId={conversationId} size="md" />

        <Button
          onClick={submit}
          disabled={!isExecuting && !canSend}
          className={cn(
            "h-9 w-9 p-0 rounded-full ml-0.5",
            "bg-foreground text-background hover:bg-foreground/90",
            "disabled:opacity-25 disabled:cursor-not-allowed",
          )}
          title={isExecuting ? "Stop" : "Send"}
          aria-label={isExecuting ? "Stop" : "Send"}
        >
          {isExecuting ? (
            <CircleStop className="w-4 h-4" />
          ) : (
            <ArrowUp className="w-5 h-5" />
          )}
        </Button>
      </div>
    </div>
  );
}
