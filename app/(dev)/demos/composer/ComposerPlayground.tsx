"use client";

/**
 * /demos/composer — the three-mode, three-size composer on a REAL
 * conversation (the default chat job, `chat.default_new_chat`), so every
 * control can be exercised end to end before it is plugged into a route.
 * Switching agents here relaunches the conversation with that agent, which is
 * what "switch agent" means on a surface that owns its own conversation.
 */

import { useEffect, useRef, useState } from "react";
import { Building2, RotateCcw } from "lucide-react";
import { AgentConversationColumn } from "@/features/agents/components/shared/AgentConversationColumn";
import { useCanvasWorkspaceConversation } from "@/features/canvas/workspace/useCanvasWorkspaceConversation";
import { SmartAgentInput } from "@/features/agents/components/inputs/smart-input/SmartAgentInput";
import { ComposerModeSwitch } from "@/features/agents/components/inputs/smart-input/composer/ComposerModeSwitch";
import { useComposerMode } from "@/features/agents/components/inputs/smart-input/composer/useComposerMode";
import {
  ComposerGreeting,
  ComposerQuickActions,
} from "@/features/agents/components/inputs/smart-input/composer/ComposerSplash";
import { COMPOSER_KNOBS } from "@/features/agents/components/inputs/smart-input/composer/composer-mode-cookie";
import type {
  ComposerMode,
  ComposerSize,
} from "@/features/agents/components/inputs/smart-input/composer/composer-types";
import { useSessionKnob } from "@/lib/scoped-config/sessionKnob";
import { cn } from "@/lib/utils";
import { ErrorNotice } from "@/components/errors/ErrorNotice";

const SIZES: ComposerSize[] = ["splash", "page", "compact"];
const SURFACE_KEY = "demo:composer";

export function ComposerPlayground({ initialMode }: { initialMode: ComposerMode | null }) {
  // The SAME surface-owned conversation the canvas workspace uses: waits for
  // an active organization (offering the chooser when none is set), starts
  // fresh under the default-chat job, and switches agents with startWith.
  const chat = useCanvasWorkspaceConversation(SURFACE_KEY);
  const { mode } = useComposerMode(initialMode);
  const [size, setSize] = useState<ComposerSize>("page");
  const compactPanelRef = useRef<HTMLDivElement>(null);
  const [panelHeight, setPanelHeight] = useState(0);
  const pctKnob = useSessionKnob(COMPOSER_KNOBS.compactInputMaxHeightPct);
  const pct = typeof pctKnob === "number" ? pctKnob : 50;
  const conversationId = chat.conversationId;

  useEffect(() => {
    const el = compactPanelRef.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(() => setPanelHeight(el.clientHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, [size]);

  const composer = {
    size,
    mode,
    agent: { onSelectAgent: chat.startWith },
    placeholder: size === "compact" ? "Reply" : "How can I help you today?",
    maxInputHeightPx: size === "compact" && panelHeight > 0 ? Math.round((panelHeight * pct) / 100) : undefined,
  };

  return (
    <div className="flex h-[calc(100dvh-var(--shell-header-h,2.75rem))] min-h-0 flex-col bg-background pt-[var(--shell-header-h,2.75rem)]">
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-3 border-b border-border px-4 py-2.5">
        <ComposerModeSwitch initialMode={initialMode} />
        <div role="tablist" aria-label="Composer size" className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
          {SIZES.map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={value === size}
              onClick={() => setSize(value)}
              className={cn(
                "h-7 whitespace-nowrap rounded-md px-3 text-sm font-medium capitalize",
                value === size ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 justify-center overflow-hidden">
        {chat.conversation.state === "failed" ? (
          <ErrorNotice
            className="m-auto max-w-md"
            title="The demo conversation could not be opened"
            message={chat.conversation.reason}
            operation="Open the demo conversation"
            actions={
              <button
                type="button"
                onClick={chat.conversation.retry}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-sm hover:bg-accent"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Try again
              </button>
            }
          />
        ) : chat.conversation.state === "needs-organization" ? (
          <div className="m-auto flex max-w-sm flex-col items-start gap-2 p-6">
            <p className="text-sm text-foreground">Choose the organization this chat belongs to.</p>
            <button
              type="button"
              onClick={chat.conversation.choose}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-sm hover:bg-accent"
            >
              <Building2 className="h-3.5 w-3.5" /> Choose organization
            </button>
          </div>
        ) : !conversationId ? (
          <div className="m-auto flex w-full max-w-[720px] flex-col gap-3 p-6" aria-busy="true" aria-label="Opening the conversation">
            <div className="mx-auto h-10 w-72 animate-pulse rounded-lg bg-muted" />
            <div className="h-32 w-full animate-pulse rounded-[22px] bg-muted" />
          </div>
        ) : size === "splash" ? (
          <div className="flex w-full max-w-[760px] flex-col items-center justify-center gap-4 overflow-y-auto px-4 py-10">
            <ComposerGreeting className="mb-4" />
            <SmartAgentInput conversationId={conversationId} surfaceKey={SURFACE_KEY} composer={composer} />
            <ComposerQuickActions
              className="w-full max-w-[720px]"
              onLaunchAgent={(agentId) => chat.startWith(agentId)}
            />
          </div>
        ) : size === "page" ? (
          <div className="flex min-h-0 w-full flex-col">
            <AgentConversationColumn
              conversationId={conversationId}
              surfaceKey={SURFACE_KEY}
              constrainWidth
              edgeToEdgeScroll
              smartInputProps={{ composer }}
            />
          </div>
        ) : (
          <div ref={compactPanelRef} className="flex h-full min-h-0 w-[440px] shrink-0 flex-col border-x border-border bg-card/40">
            <AgentConversationColumn
              conversationId={conversationId}
              surfaceKey={SURFACE_KEY}
              smartInputProps={{ composer }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
