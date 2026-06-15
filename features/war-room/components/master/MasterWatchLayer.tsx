"use client";

/**
 * features/war-room/components/master/MasterWatchLayer.tsx
 *
 * The War Room MASTER agent's LIVE-WATCH layer. Renders one inline, draggable,
 * NON-MODAL `WindowPanel` per conversation the master is messaging — each
 * showing the thread agent's conversation streaming in real time, so the user
 * SEES what the master kicked off and can step in.
 *
 * Opened two ways, both dispatching `openWatch(conversationId)`:
 *   1. the `war_room_message_thread` tool, the instant it fires a thread run;
 *   2. the toast's "Watch" action.
 *
 * Mounted once by `WarRoomAllView`. Multiple watch windows coexist (each joins
 * the runtime Window Manager — minimize-all, focus, tray — like any WindowPanel,
 * mirroring `SubtaskWindow`). Closing one dispatches `closeWatch`.
 *
 * Each window guard-hydrates its conversation on mount: a fresh/fork convo the
 * messaging tool just created is already in Redux and streaming (we skip the
 * reload so we never clobber the live stream); a cold convo (e.g. reopened later)
 * is hydrated via `loadConversation`. The body is the canonical
 * `AgentConversationColumn` with `hideInput` — this is a watch surface, not a
 * place to type (the user composes with the master itself; to drive a thread
 * directly they open its tile).
 */

import { useEffect, useRef } from "react";
import { Eye, Loader2 } from "lucide-react";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { AgentConversationColumn } from "@/features/agents/components/shared/AgentConversationColumn";
import { loadConversation } from "@/features/agents/redux/execution-system/thunks/load-conversation.thunk";
import { selectMessageCount } from "@/features/agents/redux/execution-system/messages/messages.selectors";
import { selectConversationTitle } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import {
  closeWatch,
  selectWatchConversationIds,
} from "@/features/war-room/redux/watchSlice";

const WATCH_W = 440;
const WATCH_H = 560;

export function MasterWatchLayer() {
  const conversationIds = useAppSelector(selectWatchConversationIds);

  if (conversationIds.length === 0) return null;

  return (
    <>
      {conversationIds.map((cid, index) => (
        <WatchWindow key={cid} conversationId={cid} index={index} />
      ))}
    </>
  );
}

function WatchWindow({
  conversationId,
  index,
}: {
  conversationId: string;
  index: number;
}) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const title = useAppSelector(selectConversationTitle(conversationId));
  const messageCount = useAppSelector(selectMessageCount(conversationId));
  // Subscribed presence flag — the spinner shows until the instance exists.
  // Derived from Redux (no local setState in the effect — that triggers the
  // cascading-render lint rule and isn't needed: loadConversation populates the
  // instance, which flips this).
  const hasInstance = useAppSelector(
    (s) => !!s.conversations.byConversationId[conversationId],
  );

  // Guard-hydrate cold conversations exactly once. A convo the messaging tool
  // just created is already in Redux with messages (or actively streaming) —
  // skip the reload so we never clobber a live stream. A convo with no instance
  // / no messages (e.g. reopened later) gets a one-shot loadConversation.
  const triedRef = useRef(false);
  useEffect(() => {
    if (triedRef.current) return;
    triedRef.current = true;
    const state = store.getState();
    const instancePresent =
      !!state.conversations.byConversationId[conversationId];
    const hasMessages =
      (state.messages.byConversationId[conversationId]?.orderedIds?.length ??
        0) > 0;
    if (instancePresent || hasMessages) return;
    void dispatch(loadConversation({ conversationId }))
      .unwrap()
      .catch((err) => {
        // The row may not exist yet (id minted, no turn persisted) — non-fatal;
        // the column simply shows empty until the stream lands.
        console.warn(
          `[war-room/master] watch hydrate skipped for ${conversationId}:`,
          err,
        );
      });
  }, [conversationId, dispatch, store]);

  // Stagger windows so a burst of opens doesn't perfectly overlap them.
  const offset = (index % 5) * 30;

  const label = title?.trim() || "Thread agent";

  return (
    <WindowPanel
      id={`war-room-watch-${conversationId}`}
      title={label}
      titleNode={
        <span className="flex items-center gap-1.5 min-w-0">
          <Eye className="size-3.5 shrink-0 text-primary" />
          <span className="truncate">Watching: {label}</span>
        </span>
      }
      onClose={() => dispatch(closeWatch(conversationId))}
      width={WATCH_W}
      height={WATCH_H}
      minWidth={340}
      minHeight={380}
      initialRect={{
        x: Math.max(16, window.innerWidth - WATCH_W - 24 - offset),
        y: Math.max(16, 96 + offset),
      }}
      bodyClassName="p-0"
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        {!hasInstance && messageCount === 0 ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <AgentConversationColumn
            conversationId={conversationId}
            displayConversationId={conversationId}
            surfaceKey={`war-room-watch-${conversationId}`}
            hideInput
            constrainWidth
          />
        )}
      </div>
    </WindowPanel>
  );
}
