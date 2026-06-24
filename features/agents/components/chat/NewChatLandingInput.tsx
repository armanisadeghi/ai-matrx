"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowUp, CircleStop } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { Button } from "@/components/ui/button";
import { AgentMicrophoneButton } from "@/features/agents/components/inputs/smart-input/AgentMicrophoneButton";
import { RunControlsMenu } from "@/features/agents/components/inputs/smart-input/RunControlsMenu";
import { SmartAgentResourceChips } from "@/features/agents/components/inputs/resources/SmartAgentResourceChips";
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
import { selectInstanceResources } from "@/features/agents/redux/execution-system/instance-resources/instance-resources.selectors";
import { selectAgentIdFromInstance } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import { useAuthGuardedAction } from "@/features/auth/components/useAuthGuardedAction";
import { buildApplicationScopeFromMenuContext } from "@/features/context-menu-v2/utils/build-application-scope";
import {
  buildChatContextData,
  CHAT_CONTEXT_MENU_PROPS,
} from "./agent-context/buildChatContextData";
import { cn } from "@/lib/utils";

// Right-click agent menu over the composer draft. Lazy (ssr:false) — the menu
// pulls the shortcuts/quick-actions machinery that has no business on the
// /chat/new first paint, and it only matters once the user interacts.
const UnifiedAgentContextMenu = dynamic(
  () =>
    import("@/features/context-menu-v2/UnifiedAgentContextMenu").then((m) => ({
      default: m.UnifiedAgentContextMenu,
    })),
  { ssr: false },
);

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
 * Controls: a single `+` button that opens the unified RunControlsMenu
 * (Attach + Model + Tools + Sandbox + Settings — same panels the production
 * SmartAgentInputStacked toolbar uses, just folded behind one trigger),
 * voice (AgentMicrophoneButton), and send. No variables, no Creator Panel —
 * this is the pre-first-message surface.
 *
 * Attachments / inclusions added via the `+` Attach panel (notes, tasks,
 * files, webpages, …) render as `SmartAgentResourceChips` pinned at the top
 * of the pill — the SAME component + Redux source (`instanceResources`) the
 * standard input uses, so a resource attached here is visible here and stays
 * in sync once the conversation promotes to the full surface.
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
  const resources = useAppSelector(selectInstanceResources(conversationId));
  const agentId = useAppSelector(selectAgentIdFromInstance(conversationId));
  const hasResources = resources.length > 0;
  // Sendable with text OR with attachments/inclusions alone (an attached note
  // with no prose is a valid first turn) — mirrors the standard input.
  const canSend = !isExecuting && (charCount > 0 || hasResources);

  // Hide the message while a submit is in flight (it moves into the streaming
  // conversation); the text stays in Redux as the non-visual backup.
  const visibleText = submissionPhase === "pending" ? "" : text;

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Once the textarea exceeds a single line we flip the grid layout so the
  // textarea spans the full width and the leading/trailing controls drop to
  // a footer row (ChatGPT-style). Single-line state keeps the inline pill.
  const [isExpanded, setIsExpanded] = useState(false);

  // Auto-resize: grow with content up to MAX_TEXTAREA_HEIGHT, then scroll.
  //
  // Expansion is STICKY (monotonic): once the content wraps to a second line
  // we expand and never collapse back while there is text. This kills the
  // single↔multi flutter — collapsing back to the inline layout widens the
  // textarea (it moves from the narrow `1fr` grid column to full width), which
  // un-wraps the text, which shrinks the height, which would collapse it
  // again, oscillating on nearly every keystroke. We only reset to single-line
  // when the field is emptied. `isExpanded` is a dep so we re-measure at the
  // NEW width immediately after switching (no stale blank line).
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    const next = Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT);
    el.style.height = `${next}px`;
    if (visibleText.trim().length === 0) {
      setIsExpanded(false);
    } else if (next > 36) {
      // Threshold: one line of text-base + leading-7 ≈ 28px. Small buffer so
      // expansion kicks in only on a real second line.
      setIsExpanded(true);
    }
  }, [visibleText, isExpanded]);

  const rawSubmit = useCallback(() => {
    if (isExecuting) {
      dispatch(cancelExecution(conversationId));
      return;
    }
    if (charCount === 0 && !hasResources) return;
    dispatch(smartExecute({ conversationId, surfaceKey }));
  }, [
    dispatch,
    conversationId,
    surfaceKey,
    isExecuting,
    charCount,
    hasResources,
  ]);

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

  // Live surface scope for the right-click agent menu. Plain function (NOT
  // useCallback — React Compiler memoizes it, and the menu reads the live DOM
  // selection at click time, so a memo would only risk staleness). The draft +
  // active agent ARE the chat surface state here; there's no conversation/
  // transcript yet on /chat/new. Reads selection straight off the textarea ref.
  const getApplicationScope = () => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? 0;
    const end = el?.selectionEnd ?? 0;
    const contextData = buildChatContextData({
      inputDraft: el?.value ?? visibleText,
      selectionStart: start,
      selectionEnd: end,
      agentId,
    });
    return buildApplicationScopeFromMenuContext({
      selectedText:
        start !== end && el
          ? el.value.slice(Math.min(start, end), Math.max(start, end))
          : "",
      selectionRange: el ? { type: "editable", element: el, start, end } : null,
      contextData,
    });
  };

  // Replace / insert handlers route through the SAME Redux slice the textarea
  // is bound to (single source of truth) — never a parallel local value.
  const replaceDraft = (next: string) => {
    dispatch(setUserInputText({ conversationId, text: next }));
  };

  const insertAtCursor = (insert: string, position: "before" | "after") => {
    const el = textareaRef.current;
    const base = el?.value ?? visibleText;
    if (!el) {
      replaceDraft(
        position === "before" ? `${insert}\n\n${base}` : `${base}\n\n${insert}`,
      );
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    if (position === "before") {
      replaceDraft(`${base.slice(0, start)}${insert}\n\n${base.slice(start)}`);
    } else {
      replaceDraft(`${base.slice(0, end)}\n\n${insert}${base.slice(end)}`);
    }
  };

  return (
    <div
      onClick={() => textareaRef.current?.focus()}
      className={cn(
        "w-full rounded-[28px] border border-border bg-card cursor-text",
        "shadow-[0_2px_16px_-4px_rgba(0,0,0,0.08)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_1px_2px_0_rgba(0,0,0,0.4)]",
        "p-2.5 flex flex-col",
        "transition-colors focus-within:border-foreground/25",
      )}
    >
      {/* Attachments / inclusions — pinned at the top, same Redux source as
          the standard input. Renders nothing (no extra height) when empty. */}
      <div onClick={(e) => e.stopPropagation()}>
        <SmartAgentResourceChips conversationId={conversationId} />
      </div>

      {/* Composer row */}
      <div
        className={cn(
          "grid grid-cols-[auto_1fr_auto] items-center gap-x-1.5",
          // Single-line: [leading] [primary] [trailing]
          // Expanded:    [primary primary primary] / [leading . trailing]
          isExpanded
            ? "[grid-template-areas:'primary_primary_primary''leading_._trailing']"
            : "[grid-template-areas:'leading_primary_trailing']",
        )}
      >
        {/* Leading — unified `+` popover (Attach / Model / Tools / Sandbox / Settings) */}
        <div
          className="[grid-area:leading]"
          onClick={(e) => e.stopPropagation()}
        >
          <RunControlsMenu conversationId={conversationId} variant="plus" />
        </div>

        {/* Primary — textarea, wrapped in the chat surface's right-click agent
            menu (matrx-user/chat). `asChild` merges the menu's handlers onto
            the textarea itself — no wrapping DOM node — so the grid layout,
            auto-expand, send-on-enter, and controls are all untouched. The
            floating selection icon is disabled to keep the hero minimal; the
            right-click menu is the affordance, and voice/copy already live in
            the controls. This composer stays a bespoke ChatGPT-style pill
            (NOT ProTextarea) by design — see FEATURE.md. */}
        <UnifiedAgentContextMenu
          {...CHAT_CONTEXT_MENU_PROPS}
          enableFloatingIcon={false}
          getTextarea={() => textareaRef.current}
          getApplicationScope={getApplicationScope}
          onTextReplace={replaceDraft}
          onTextInsertBefore={(t) => insertAtCursor(t, "before")}
          onTextInsertAfter={(t) => insertAtCursor(t, "after")}
          contextData={buildChatContextData({
            inputDraft: visibleText,
            agentId,
          })}
        >
          <textarea
            ref={textareaRef}
            value={visibleText}
            onChange={(e) =>
              dispatch(
                setUserInputText({ conversationId, text: e.target.value }),
              )
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
        </UnifiedAgentContextMenu>

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
    </div>
  );
}
