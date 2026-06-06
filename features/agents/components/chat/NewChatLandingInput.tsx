"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { ArrowUp, CircleStop } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { Button } from "@/components/ui/button";
import { AgentMicrophoneButton } from "@/features/agents/components/inputs/smart-input/AgentMicrophoneButton";
import { LandingPlusMenu } from "./LandingPlusMenu";
import {
  smartExecute,
  cancelExecution,
} from "@/features/agents/redux/execution-system/thunks/smart-execute.thunk";
import { selectIsExecuting } from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import {
  selectUserInputText,
  selectInputCharCount,
  selectSubmissionPhase,
} from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.selectors";
import { setUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import { useAuthGuardedAction } from "@/features/auth/components/useAuthGuardedAction";
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
 * Controls: a single `+` button that opens the unified LandingPlusMenu
 * (Attach + Model + Tools + Sandbox + Settings — same panels the production
 * SmartAgentInputStacked toolbar uses, just folded behind one trigger),
 * voice (AgentMicrophoneButton), and send. No variables, no Creator Panel,
 * no resource-chip strip — this is the pre-first-message surface.
 */
export function NewChatLandingInput({
  conversationId,
  surfaceKey,
}: NewChatLandingInputProps) {
  const dispatch = useAppDispatch();
  const text = useAppSelector(selectUserInputText(conversationId));
  const charCount = useAppSelector(selectInputCharCount(conversationId));
  const submissionPhase = useAppSelector(selectSubmissionPhase(conversationId));
  const isExecuting = useAppSelector(selectIsExecuting(conversationId));
  const canSend = !isExecuting && charCount > 0;

  // Hide the message while a submit is in flight (it moves into the streaming
  // conversation); the text stays in Redux as the non-visual backup.
  const visibleText = submissionPhase === "pending" ? "" : text;

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Once the textarea exceeds a single line we flip the grid layout so the
  // textarea spans the full width and the leading/trailing controls drop to
  // a footer row (ChatGPT-style). Single-line state keeps the inline pill.
  const [isExpanded, setIsExpanded] = useState(false);

  // Auto-resize: grow with content up to MAX_TEXTAREA_HEIGHT, then scroll.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    const next = Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT);
    el.style.height = `${next}px`;
    // Threshold: one line of text-base + leading-relaxed ≈ 28px. Use a small
    // buffer so wrapping kicks in only on a real second line.
    setIsExpanded(next > 36);
  }, [visibleText]);

  const rawSubmit = useCallback(() => {
    if (isExecuting) {
      dispatch(cancelExecution(conversationId));
      return;
    }
    if (charCount === 0) return;
    dispatch(smartExecute({ conversationId, surfaceKey }));
  }, [dispatch, conversationId, surfaceKey, isExecuting, charCount]);

  // Guests can compose freely — sending opens the AuthGate so they sign up
  // exactly where the value lands.
  const submit = useAuthGuardedAction(rawSubmit, {
    featureName: "Chat",
    featureDescription:
      "Send your message, get an agent on it, save the conversation. Free account, 30 seconds, no credit card — your draft is right here when you sign back in.",
  });

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter submits; Shift+Enter inserts a newline (ChatGPT convention).
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div
      onClick={() => textareaRef.current?.focus()}
      className={cn(
        "w-full rounded-[28px] border border-border bg-card cursor-text",
        "shadow-[0_2px_16px_-4px_rgba(0,0,0,0.08)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_1px_2px_0_rgba(0,0,0,0.4)]",
        "p-2.5 grid grid-cols-[auto_1fr_auto] items-center gap-x-1.5",
        // Single-line: [leading] [primary] [trailing]
        // Expanded:    [primary primary primary] / [leading . trailing]
        isExpanded
          ? "[grid-template-areas:'primary_primary_primary''leading_._trailing']"
          : "[grid-template-areas:'leading_primary_trailing']",
        "transition-colors focus-within:border-foreground/25",
      )}
    >
      {/* Leading — unified `+` popover (Attach / Model / Tools / Sandbox / Settings) */}
      <div className="[grid-area:leading]" onClick={(e) => e.stopPropagation()}>
        <LandingPlusMenu conversationId={conversationId} />
      </div>

      {/* Primary — textarea */}
      <textarea
        ref={textareaRef}
        value={visibleText}
        onChange={(e) =>
          dispatch(setUserInputText({ conversationId, text: e.target.value }))
        }
        onKeyDown={handleKeyDown}
        rows={1}
        placeholder="Ask anything"
        autoFocus
        className={cn(
          "[grid-area:primary] w-full min-w-0 resize-none bg-transparent outline-none border-none",
          "px-2 text-base text-foreground placeholder:text-muted-foreground/60",
          "scrollbar-thin leading-7",
        )}
        style={{ maxHeight: MAX_TEXTAREA_HEIGHT }}
      />

      {/* Trailing — mic + send */}
      <div
        className="[grid-area:trailing] flex items-center gap-1"
        onClick={(e) => e.stopPropagation()}
      >
        <AgentMicrophoneButton conversationId={conversationId} size="md" />

        <Button
          onClick={submit}
          disabled={!isExecuting && !canSend}
          className={cn(
            "h-9 w-9 p-0 rounded-full",
            "bg-foreground text-background hover:bg-foreground/90",
            "shadow-[0_1px_0_0_rgba(255,255,255,0.25)_inset,0_1px_2px_0_rgba(0,0,0,0.25)]",
            "disabled:opacity-25 disabled:cursor-not-allowed disabled:shadow-none",
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
