// features/quick-actions/components/QuickChatSheet.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageSquarePlus, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useShortcutTrigger } from "@/features/agents/hooks/useShortcutTrigger";
import { AgentConversationColumn } from "@/features/agents/components/shared/AgentConversationColumn";
import { extractErrorMessage } from "@/utils/errors";

interface QuickChatSheetProps {
  className?: string;
}

// TODO(prompt-to-agent-sweep): The "Matrx Custom Chat" agent shortcut id below
// was discovered by querying `agx_shortcut` for the agent that previously sat
// behind `prompt_builtins['matrix-custom-chat']`. Treating it as a hard-coded
// id keeps us coupled to the migration's 1:1 mapping and bypasses the agent
// system's shortcut discovery flow. When this surface gets its proper rebuild,
// drive the chat from a configurable shortcut/agent reference (e.g.
// `useShortcut()` or a feature-flagged "default chat" lookup) instead of a
// literal uuid.
const MATRX_CUSTOM_CHAT_SHORTCUT_ID = "e9e9639d-2970-4125-870e-09c1e9b7462f";

const SURFACE_KEY = "quick-chat-sheet";
const SOURCE_FEATURE = "quick-chat";

/**
 * QuickChatSheet — pop-over AI chat surface.
 *
 * Hosts a live agent conversation inline using the SAME column the live
 * `/chat` route renders (`AgentConversationColumn` over the execution-system
 * streams) — transcript, smart input, pending-ask cards, and the task-panel
 * chip all behave identically to the full route. The conversation is created
 * by triggering the "Matrx Custom Chat" shortcut in `direct` display mode (no
 * overlay opens); the resulting conversation id is bound to the column.
 *
 * Rendered as bare content. The surrounding chrome (side panel header + close,
 * or the Utilities Hub tab) is supplied by the consumer — see
 * `OverlayController` (`quickChat` → `SidePanelSurface`) and `UtilitiesOverlay`.
 */
export function QuickChatSheet({ className }: QuickChatSheetProps) {
  const trigger = useShortcutTrigger();

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  const initializeChat = useCallback(async () => {
    setIsInitializing(true);
    setInitError(null);
    try {
      await trigger(MATRX_CUSTOM_CHAT_SHORTCUT_ID, {
        sourceFeature: SOURCE_FEATURE,
        surfaceKey: SURFACE_KEY,
        config: { displayMode: "direct" },
        onConversationCreated: (cid) => setConversationId(cid),
      });
    } catch (error) {
      console.error("[QuickChatSheet] Failed to initialize chat:", error);
      setInitError(extractErrorMessage(error));
    } finally {
      setIsInitializing(false);
    }
  }, [trigger]);

  useEffect(() => {
    if (!conversationId && !isInitializing && !initError) {
      initializeChat();
    }
  }, [conversationId, isInitializing, initError, initializeChat]);

  const handleNewChat = useCallback(async () => {
    setConversationId(null);
    setInitError(null);
    await initializeChat();
  }, [initializeChat]);

  const isReady = !!conversationId && !isInitializing;

  return (
    <div className={cn("flex h-full flex-col overflow-hidden", className)}>
      {/* Slim action row — the surrounding surface owns the title + close, so
          this only carries the "New chat" affordance. */}
      <div className="flex h-9 shrink-0 items-center justify-end border-b border-border px-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs"
                onClick={handleNewChat}
                disabled={isInitializing}
              >
                <MessageSquarePlus className="h-3.5 w-3.5" />
                New chat
              </Button>
            </TooltipTrigger>
            <TooltipContent>Start a fresh conversation</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="min-h-0 flex-1">
        {initError ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex max-w-md flex-col items-center gap-3 p-4 text-destructive">
              <AlertCircle className="h-8 w-8" />
              <span className="text-sm font-medium">
                Failed to initialize chat
              </span>
              <span className="break-all text-center text-xs text-muted-foreground">
                {initError}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleNewChat}
                className="mt-2 gap-2"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </Button>
            </div>
          </div>
        ) : isReady && conversationId ? (
          <AgentConversationColumn
            key={conversationId}
            conversationId={conversationId}
            surfaceKey={SURFACE_KEY}
            constrainWidth
            edgeToEdgeScroll
            smartInputProps={{
              sendButtonVariant: "blue",
              showSubmitOnEnterToggle: false,
              compact: true,
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="text-sm">Starting chat...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
