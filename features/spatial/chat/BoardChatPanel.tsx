"use client";

/**
 * BOARD CHAT — the platform's one chat, beside a spatial board.
 *
 * 🚨 IT RENDERS THE EXISTING CHAT, NOT A NEW ONE. `AgentConversationColumn` is
 * the platform's single chat column (the same one /chat, the agent runner and
 * `RecordScopedChat` mount): transcript, composer, streaming, tool cards. This
 * file adds only the board context and the frame.
 *
 * WHO ANSWERS: the `chat.default_new_chat` mandate — exactly what /chat/new
 * resolves (system default → org binding → user binding). No agent id, no
 * prompt in code.
 *
 * HOW THE BOARD REACHES THE AGENT: as ONE named context entry
 * (`spatial_board`, see ./board-context.ts), written with `setContextEntries`
 * — never as user text (THE USER-INPUT LAW). It is refreshed:
 *   1. when the conversation is created;
 *   2. in the CAPTURE phase of every pointerdown / Enter keydown inside the
 *      chat — i.e. before the composer's own send handler runs, so the store
 *      the request is assembled from already holds the board as it is NOW;
 *   3. on composer focus.
 * `setContextEntries` is merge-only, so re-writing the same key replaces the
 * previous snapshot and never accumulates.
 */

import { useEffect, useRef, useState } from "react";
import { LayoutDashboard, RotateCcw } from "lucide-react";
import { AgentConversationColumn } from "@/features/agents/components/shared/AgentConversationColumn";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { DEFAULT_NEW_CHAT_MANDATE_KEY } from "@/features/agents/components/chat/chat-quick-actions.config";
import { setContextEntries } from "@/features/agents/redux/execution-system/instance-context/instance-context.slice";
import { useAppDispatch } from "@/lib/redux/hooks";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type BoardContext, boardContextEntry } from "./board-context";

/**
 * Name the real cause of a failed launch. A thunk `.unwrap()` rejects with a
 * SerializedError or a `rejectWithValue` payload — plain objects, not Errors —
 * so `String(error)` would print "[object Object]".
 */
export function describeLaunchError(error: unknown): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    const nested = record.error;
    const text = [record.user_message, record.userMessage, record.message, record.detail].find(
      (value): value is string => typeof value === "string" && value.trim().length > 0,
    );
    const code = [record.code, record.name].find(
      (value): value is string => typeof value === "string" && value.trim().length > 0,
    );
    if (text) return code && !text.includes(code) ? `${text} (${code})` : text;
    if (nested !== undefined && nested !== error) return describeLaunchError(nested);
    if (code) return `The launch failed with ${code}, and no further detail.`;
    try {
      return `The launch failed: ${JSON.stringify(error).slice(0, 300)}`;
    } catch {
      // fall through to the generic sentence below
    }
  }
  return "The launch failed without saying why.";
}

export type BoardChatConversation =
  | { state: "opening" }
  | { state: "ready"; conversationId: string }
  | { state: "failed"; reason: string; retry: () => void };

/**
 * Opens (once per `surfaceKey`) the board's conversation under the default
 * chat mandate. Lives apart from the panel so a host that unmounts the panel
 * (the mobile drawer) keeps the same conversation.
 */
export function useBoardChatConversation(surfaceKey: string): BoardChatConversation {
  const { launchMandate } = useAgentLauncher();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const openedFor = useRef<string | null>(null);

  useEffect(() => {
    const key = `${surfaceKey}#${attempt}`;
    if (openedFor.current === key) return;
    openedFor.current = key;
    let cancelled = false;
    setFailure(null);
    launchMandate(DEFAULT_NEW_CHAT_MANDATE_KEY, {
      surfaceKey,
      // A REGISTERED feature, never a new string: this surface IS the chat.
      sourceFeature: "chat",
    }).then(
      (result) => {
        if (!cancelled) setConversationId(result.conversationId);
      },
      (error: unknown) => {
        const reason = describeLaunchError(error);
        console.error("[spatial/chat] could not open the board conversation", error);
        if (!cancelled) setFailure(reason);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [surfaceKey, attempt, launchMandate]);

  if (conversationId) return { state: "ready", conversationId };
  if (failure) {
    return {
      state: "failed",
      reason: failure,
      retry: () => {
        openedFor.current = null;
        setAttempt((n) => n + 1);
      },
    };
  }
  return { state: "opening" };
}

/** After this long, a still-pending open says so instead of pulsing forever. */
const SLOW_OPEN_MS = 12_000;

export interface BoardChatPanelProps {
  conversation: BoardChatConversation;
  surfaceKey: string;
  /** Read the board as it is right now. Called at send time — keep it cheap. */
  getBoardContext: () => BoardContext;
  className?: string;
}

export function BoardChatPanel({ conversation, surfaceKey, getBoardContext, className }: BoardChatPanelProps) {
  const dispatch = useAppDispatch();
  const [lastSnapshot, setLastSnapshot] = useState<BoardContext | null>(null);
  const [showSnapshot, setShowSnapshot] = useState(false);
  const conversationId = conversation.state === "ready" ? conversation.conversationId : null;

  const refresh = () => {
    if (!conversationId) return;
    const snapshot = getBoardContext();
    dispatch(setContextEntries({ conversationId, entries: [boardContextEntry(snapshot)] }));
    setLastSnapshot(snapshot);
  };

  // (1) Seed the context the moment the conversation exists.
  const seededFor = useRef<string | null>(null);
  useEffect(() => {
    if (!conversationId || seededFor.current === conversationId) return;
    seededFor.current = conversationId;
    const snapshot = getBoardContext();
    dispatch(setContextEntries({ conversationId, entries: [boardContextEntry(snapshot)] }));
    setLastSnapshot(snapshot);
  }, [conversationId, dispatch, getBoardContext]);

  // NOTHING FAILS SILENTLY: an open that is still pending after a while says so.
  const [slowOpen, setSlowOpen] = useState(false);
  const opening = conversation.state === "opening";
  useEffect(() => {
    if (!opening) return;
    const timer = window.setTimeout(() => setSlowOpen(true), SLOW_OPEN_MS);
    return () => window.clearTimeout(timer);
  }, [opening]);

  if (conversation.state === "opening") {
    return (
      <div className={cn("flex h-full min-h-0 flex-col gap-3 p-4", className)} aria-busy="true">
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        <div className="h-3 w-64 animate-pulse rounded bg-muted" />
        {slowOpen && (
          <p className="text-xs text-muted-foreground">
            The chat is taking longer than usual to open — it is still waiting for the server to
            say which agent answers here. The board works meanwhile.
          </p>
        )}
        <div className="mt-auto h-24 w-full animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (conversation.state === "failed") {
    return (
      <div className={cn("flex h-full min-h-0 flex-col items-start gap-3 p-4", className)}>
        <p className="text-sm text-foreground">The chat for this board could not be opened.</p>
        <p className="text-xs text-muted-foreground">{conversation.reason}</p>
        <Button size="sm" variant="outline" onClick={conversation.retry}>
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          Try again
        </Button>
      </div>
    );
  }

  const tileCount = lastSnapshot?.tileCount ?? 0;

  return (
    <div
      className={cn("flex h-full min-h-0 flex-col", className)}
      // (2) Capture phase: runs BEFORE the composer's send button / Enter handler.
      onPointerDownCapture={refresh}
      onKeyDownCapture={(e) => {
        if (e.key === "Enter") refresh();
      }}
      // (3) Focusing the composer refreshes too (cheap, and keeps the preview honest).
      onFocusCapture={refresh}
    >
      <AgentConversationColumn
        conversationId={conversation.conversationId}
        surfaceKey={surfaceKey}
        smartInputProps={{
          compact: true,
          placeholder: "Ask about this board…",
          contextRailAttachedItems: [
            {
              id: "spatial-board",
              icon: LayoutDashboard,
              label: lastSnapshot ? `Board: ${lastSnapshot.boardTitle}` : "Board",
              word: "Board",
              detail: `${tileCount} tile${tileCount === 1 ? "" : "s"}`,
              hint: "The agent sees this board on every message. Click to see exactly what it is sent.",
              onOpen: () => setShowSnapshot((open) => !open),
            },
          ],
        }}
        aboveInput={
          showSnapshot && lastSnapshot ? <BoardSnapshotPreview snapshot={lastSnapshot} /> : undefined
        }
      />
    </div>
  );
}

/** What the agent is sent, in plain words — the door behind the "Board" pill. */
function BoardSnapshotPreview({ snapshot }: { snapshot: BoardContext }) {
  return (
    <div className="mx-3 mb-2 max-h-48 overflow-y-auto rounded-lg border border-border bg-card p-2 text-xs">
      <p className="mb-1 font-medium text-foreground">
        The agent sees {snapshot.tiles.length} of {snapshot.tileCount} tiles
        {snapshot.omittedTileCount > 0 ? ` (${snapshot.omittedTileCount} left out to keep it short)` : ""}
      </p>
      <ul className="space-y-0.5">
        {snapshot.tiles.map((tile) => (
          <li key={tile.id} className="flex items-center gap-2 text-muted-foreground">
            <span className="min-w-0 flex-1 truncate text-foreground">{tile.title}</span>
            {tile.selected && <span className="text-primary">selected</span>}
            {tile.inView && <span>in view</span>}
            <span className="shrink-0 tabular-nums">{tile.excerpt.length} chars</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
