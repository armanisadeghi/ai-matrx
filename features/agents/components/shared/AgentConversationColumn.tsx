"use client";

import { useState, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { ArrowDown } from "lucide-react";
import { AgentConversationDisplay } from "../messages-display/AgentConversationDisplay";
import { SmartAgentInput } from "../inputs/smart-input/SmartAgentInput";
import { OlderMessagesSentinel } from "./OlderMessagesSentinel";

import { cn } from "@/lib/utils";

// CreatorRunPanel renders a <WindowPanel> as styling chrome (admin-gated
// tab panel). Without `dynamic()` it would pull WindowPanel and the
// entire window-panels chunk into every route that statically imports
// AgentConversationColumn (chat, agent run, agent builder).
const CreatorRunPanel = dynamic(
  () =>
    import("../run-controls/CreatorRunPanel").then((m) => ({
      default: m.CreatorRunPanel,
    })),
  { ssr: false, loading: () => null },
);

interface SmartInputForwardProps {
  sendButtonVariant?: "default" | "blue";
  showSubmitOnEnterToggle?: boolean;
  placeholder?: string;
  compact?: boolean;
  extraRightControls?: React.ReactNode;
}

interface AgentConversationColumnProps {
  /**
   * Conversation bound to the smart input / variables panel. In the default
   * case this is also the display id (see below).
   */
  conversationId: string;
  /**
   * Optional — conversation bound to the conversation display / history.
   * Defaults to `conversationId`. Only diverges under the autoclear split
   * flow: the user just submitted and the input has jumped to a freshly-
   * prepped conversation while the display stays on the one streaming.
   */
  displayConversationId?: string;
  surfaceKey: string;
  constrainWidth?: boolean;
  smartInputProps?: SmartInputForwardProps;
}

export function AgentConversationColumn({
  conversationId,
  displayConversationId,
  surfaceKey,
  constrainWidth = false,
  smartInputProps,
}: AgentConversationColumnProps) {
  const displayId = displayConversationId ?? conversationId;
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
    <div
      className={cn(
        "h-full flex flex-col overflow-hidden px-2",
        constrainWidth && "w-full max-w-3xl mx-auto pb-2",
      )}
    >
      <div className="relative flex-1 min-h-0">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="h-full overflow-y-auto pt-12"
        >
          {/* Older-history pagination trigger. Isolated component — */}
          {/* subscribes only to the older-page flags so its re-renders */}
          {/* never reach the message tree below. */}
          <OlderMessagesSentinel
            conversationId={displayId}
            scrollRef={scrollRef}
          />
          <AgentConversationDisplay
            conversationId={displayId}
            surfaceKey={surfaceKey}
          />
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

      <CreatorRunPanel
        conversationId={conversationId}
        displayConversationId={displayId}
        surfaceKey={surfaceKey}
      />

      <SmartAgentInput
        conversationId={conversationId}
        surfaceKey={surfaceKey}
        {...smartInputProps}
      />
    </div>
  );
}
