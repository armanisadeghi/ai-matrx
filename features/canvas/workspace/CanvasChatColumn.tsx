"use client";

/**
 * The chat inside a ChatCanvasWorkspace — the platform's ONE chat column
 * (`AgentConversationColumn`, the same one /chat mounts), plus the canvas
 * context. Rendered in the docked panel, the floating window or the mobile
 * drawer; all three read the SAME conversation from the workspace.
 *
 * HOW THE CANVAS REACHES THE AGENT: as ONE named context entry, written with
 * `setContextEntries` — never as user text (THE USER-INPUT LAW,
 * common-docs/systems/agents/agent-variable-binding/FEATURE.md). Refreshed:
 *   1. when the conversation exists (and again when it changes);
 *   2. in the CAPTURE phase of every pointerdown / Enter keydown inside the
 *      chat — before the composer's own send handler runs, so the request is
 *      assembled from the canvas as it is NOW;
 *   3. on focus inside the chat.
 * `setContextEntries` merges by key, so re-writing replaces the snapshot.
 */

import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { AgentConversationColumn } from "@/features/agents/components/shared/AgentConversationColumn";
import type { AttachedContextRailItem } from "@/features/agents/components/inputs/smart-input/ConversationContextRail";
import { setContextEntries } from "@/features/agents/redux/execution-system/instance-context/instance-context.slice";
import { useAppDispatch } from "@/lib/redux/hooks";
import { Button } from "@/components/ui/button";
import { ErrorNotice } from "@/components/errors/ErrorNotice";
import { cn } from "@/lib/utils";
import type { ContextObjectType } from "@/features/agents/types/agent-api-types";
import type { CanvasWorkspaceConversation } from "./useCanvasWorkspaceConversation";

/** What a host hands the workspace: its canvas as ONE context entry. */
export interface CanvasContextEntry {
  key: string;
  value: unknown;
  /** Usually "json" or "text". */
  type: ContextObjectType;
  label: string;
}

/**
 * 🚧 THE ONE PLACE the workspace's smart-input props are built.
 * The owner is adding a `composer` prop to SmartAgentInput; when it lands,
 * this is the only line that switches to it.
 */
function buildCanvasSmartInputProps(contextChip: AttachedContextRailItem | undefined) {
  return {
    compact: true,
    contextRailAttachedItems: contextChip ? [contextChip] : undefined,
  };
}

/** After this long, a still-pending open says so instead of pulsing forever. */
const SLOW_OPEN_MS = 12_000;

interface CanvasChatColumnProps {
  conversation: CanvasWorkspaceConversation;
  surfaceKey: string;
  getCanvasContext?: () => CanvasContextEntry;
  contextChip?: AttachedContextRailItem;
  className?: string;
}

export function CanvasChatColumn({
  conversation,
  surfaceKey,
  getCanvasContext,
  contextChip,
  className,
}: CanvasChatColumnProps) {
  const dispatch = useAppDispatch();
  const conversationId = conversation.state === "ready" ? conversation.conversationId : null;

  const writeContext = (id: string) => {
    if (!getCanvasContext) return;
    dispatch(setContextEntries({ conversationId: id, entries: [getCanvasContext()] }));
  };

  const refresh = () => {
    if (conversationId) writeContext(conversationId);
  };

  // (1) Seed the moment the conversation exists — and for every new one.
  const seededFor = useRef<string | null>(null);
  useEffect(() => {
    if (!conversationId || seededFor.current === conversationId || !getCanvasContext) return;
    seededFor.current = conversationId;
    dispatch(setContextEntries({ conversationId, entries: [getCanvasContext()] }));
  }, [conversationId, dispatch, getCanvasContext]);

  if (conversation.state === "opening") {
    // Keyed: a fresh "slow" clock for every opening.
    return <OpeningState key={conversation.purpose} purpose={conversation.purpose} className={className} />;
  }

  if (conversation.state === "failed") {
    return (
      <div className={cn("flex h-full min-h-0 flex-col gap-3 p-4", className)}>
        <ErrorNotice
          size="compact"
          title={conversation.purpose === "open" ? "Conversation not opened" : "Chat not started"}
          message={conversation.reason}
          operation={conversation.purpose === "open" ? "Open conversation in canvas workspace" : "Start canvas workspace chat"}
          actions={
            <Button size="sm" variant="outline" onClick={conversation.retry}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Try again
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div
      className={cn("flex h-full min-h-0 flex-col", className)}
      // (2) Capture phase: runs BEFORE the composer's send button / Enter handler.
      onPointerDownCapture={refresh}
      onKeyDownCapture={(e) => {
        if (e.key === "Enter") refresh();
      }}
      // (3) Focus inside the chat refreshes too.
      onFocusCapture={refresh}
    >
      <AgentConversationColumn
        conversationId={conversation.conversationId}
        surfaceKey={surfaceKey}
        smartInputProps={buildCanvasSmartInputProps(contextChip)}
      />
    </div>
  );
}

function OpeningState({ purpose, className }: { purpose: "new" | "open"; className?: string }) {
  // NOTHING FAILS SILENTLY: an open that is still pending after a while says so.
  const [slowOpen, setSlowOpen] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlowOpen(true), SLOW_OPEN_MS);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <div className={cn("flex h-full min-h-0 flex-col gap-3 p-4", className)} aria-busy="true">
      <p className="text-xs text-muted-foreground">
        {purpose === "open" ? "Opening that conversation…" : "Starting a new chat…"}
      </p>
      <div className="h-4 w-40 animate-pulse rounded bg-muted" />
      <div className="h-3 w-64 animate-pulse rounded bg-muted" />
      {slowOpen && (
        <p className="text-xs text-muted-foreground">
          This is taking longer than usual — it is still waiting for the server. The canvas works
          meanwhile.
        </p>
      )}
      <div className="mt-auto h-20 w-full animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
