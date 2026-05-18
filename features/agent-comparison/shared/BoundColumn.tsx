"use client";

/**
 * BoundColumn
 *
 * The single per-conversation rendering surface used by every comparison
 * mode. Composes:
 *
 *   AgentConversationDisplay        — message transcript (streaming-aware)
 *   ResponseFeedbackBar             — multi-metric rating, inside scroll
 *                                     so it appears right after the last
 *                                     assistant message
 *   CreatorRunPanel                 — engineer-facing tabs (debug, settings,
 *                                     telemetry, etc.) — dynamically imported
 *                                     to keep the page bundle small
 *   SmartAgentInput                 — variables + user message + send
 *
 * Modes only differ in what surrounds this — the column HEADER (what's
 * varied per column) and the page TOP (what's locked across columns).
 * BoundColumn itself is mode-agnostic: hand it a conversation id and it
 * renders.
 */

import { useCallback, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowDown } from "lucide-react";
import { AgentConversationDisplay } from "@/features/agents/components/messages-display/AgentConversationDisplay";
import { SmartAgentInput } from "@/features/agents/components/inputs/smart-input/SmartAgentInput";
import { OlderMessagesSentinel } from "@/features/agents/components/shared/OlderMessagesSentinel";
import { cn } from "@/lib/utils";
import { ResponseFeedbackBar } from "../components/ResponseFeedbackBar";

const CreatorRunPanel = dynamic(
  () =>
    import(
      "@/features/agents/components/run-controls/CreatorRunPanel"
    ).then((m) => ({ default: m.CreatorRunPanel })),
  { ssr: false, loading: () => null },
);

export interface BoundColumnProps {
  conversationId: string;
  surfaceKey: string;
  /**
   * When true, hide the SmartAgentInput. Useful for locked-input modes
   * (Settings, Tools, etc.) where the page-level top section owns the
   * input and the per-column area is read-only.
   */
  hideInput?: boolean;
  /**
   * When true, hide the CreatorRunPanel chrome. Locked-input modes typically
   * keep it visible for telemetry; some focused modes may want a cleaner
   * column body.
   */
  hideCreatorPanel?: boolean;
}

export function BoundColumn({
  conversationId,
  surfaceKey,
  hideInput = false,
  hideCreatorPanel = false,
}: BoundColumnProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollDown(distanceFromBottom > 120);
  }, []);

  const scrollToBottom = useCallback(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, []);

  return (
    <div className="h-full flex flex-col overflow-hidden px-2 w-full max-w-3xl mx-auto pb-2">
      <div className="relative flex-1 min-h-0">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="h-full overflow-y-auto pt-12"
        >
          <OlderMessagesSentinel
            conversationId={conversationId}
            scrollRef={scrollRef}
          />
          <AgentConversationDisplay
            conversationId={conversationId}
            surfaceKey={surfaceKey}
          />
          <ResponseFeedbackBar conversationId={conversationId} />
        </div>
        <div
          className="pointer-events-none absolute bottom-0 left-0 right-0 h-3"
          style={{
            background:
              "linear-gradient(to bottom, transparent, var(--background))",
          }}
        />
        {showScrollDown && (
          <button
            type="button"
            onClick={scrollToBottom}
            className={cn(
              "absolute bottom-4 right-4 z-10 flex items-center justify-center w-8 h-8 rounded-full",
              "matrx-glass-thin-border shadow-lg text-muted-foreground hover:text-foreground",
              "transition-all duration-200 ease-out animate-in fade-in slide-in-from-bottom-2",
            )}
            title="Scroll to bottom"
          >
            <ArrowDown className="w-4 h-4" />
          </button>
        )}
      </div>

      {!hideCreatorPanel && (
        <CreatorRunPanel
          conversationId={conversationId}
          displayConversationId={conversationId}
          surfaceKey={surfaceKey}
        />
      )}

      {!hideInput && (
        <SmartAgentInput
          conversationId={conversationId}
          surfaceKey={surfaceKey}
          sendButtonVariant="blue"
          showSubmitOnEnterToggle
        />
      )}
    </div>
  );
}
