"use client";

// features/war-room/components/thread/ThreadAgentTab.tsx
//
// Agent view: the REAL Scribe "Agent+" collaboration panel, embedded. The user
// talks to (and records turns for) an assistant agent while co-editing a working
// document — all bound to the TILE's own studio_sessions row, the SAME session
// the Audio tab records into. So the tile's recordings are the agent's transcript
// context, and the agent's working-document edits land in the doc this tile owns.
//
// This thin shell resolves the tile's session id exactly like ThreadAudioTab
// (hydrate-only — a thread's session/conversation are created ONCE at thread
// provisioning, never automatically here) and then renders the composed panel.
// The panel itself is code-split via next/dynamic (ssr:false) — it pulls the
// whole agent execution + TTS + working-document graph, so loading it lazily
// keeps it out of the War Room bundle and the gallery hydrates fast.

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2, MessageCircle, MessagesSquare, Plus, Sparkles } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { AssociationEntitySelect } from "@/features/scopes/components/associations/AssociationEntitySelect";
import { AgentListDropdown } from "@/features/agents/components/agent-listings/AgentListDropdown";
import { ConversationPickerWindow } from "@/features/agents/components/conversation-history/ConversationPickerWindow";
import { selectAssistantConversationId } from "@/features/transcript-studio/redux/selectors";
import { useAgentSlot } from "@/features/agents/slots/useAgentSlot";
import { SlotAgentPicker } from "@/features/agents/slots/components/SlotAgentPicker";
import { WAR_ROOM_THREAD_AGENT_SLOT } from "@/features/war-room/constants";
import {
  selectActiveAudioSessionId,
  selectActiveConversationId,
  selectContainerAssignmentsLoaded,
  selectConversationIdsForThread,
} from "@/features/war-room/redux/selectors";
import {
  addAudioSessionToThread,
  attachExistingConversationToThread,
  hydrateThreadAssignments,
  pruneThreadPhantomConversations,
  setThreadActiveConversation,
  startThreadConversation,
} from "@/features/war-room/redux/thunks";
import { useThreadConversationSelectAdapter } from "@/features/war-room/hooks/useThreadEntitySelect";
import { traceWarRoomRenderPath } from "@/features/war-room/utils/renderPathTrace";

// Code-split: ThreadAgentPanel pulls the Scribe Agent+ graph (agents execution +
// TTS + working-document). Lazy so it never weighs down the room bundle; it
// loads on demand the first time an Agent tab is opened.
const ThreadAgentPanel = dynamic(
  () =>
    import("./ThreadAgentPanel").then((m) => {
      console.log(
        "[Track War Room] 8b, ThreadAgentTab.tsx — ThreadAgentPanel dynamic chunk loaded",
      );
      return m;
    }),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    ),
  },
);

/**
 * The Chat tab's toolbar row — identical chrome to Notes/Audio: blue chat
 * icon, then the canonical AssociationEntitySelect over the thread's
 * `conversation → thread` edges. The label is the conversation's real title
 * (the server auto-labels seconds after the first turn); a chat that hasn't
 * been submitted yet shows its AGENT's name instead. "+" doesn't name a chat —
 * it opens the canonical AgentListDropdown (the /chat route picker): picking
 * an agent mints a fresh conversation, attaches it to the thread, and binds
 * the panel to it.
 */
function ThreadChatChrome({
  threadId,
  sessionId,
}: {
  threadId: string;
  sessionId: string | null;
}) {
  const dispatch = useAppDispatch();
  const adapter = useThreadConversationSelectAdapter(threadId, sessionId);
  const activeConversationId = useAppSelector(
    selectActiveConversationId(threadId),
  );
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <>
      <AssociationEntitySelect
        token="conversation"
        adapter={adapter}
        align="start"
        emptyLabel="Chat"
        iconClassName="text-primary"
        className="min-w-0 flex-1"
        createSlot={(close) => (
          <div className="flex flex-col">
            {/* Attach an EXISTING chat — the /chat-style picker (replaces the
                old token-generic drawer). */}
            <button
              type="button"
              onClick={() => {
                setPickerOpen(true);
                close();
              }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <MessagesSquare className="size-3.5" />
              Add existing chat
            </button>
            {/* Start a NEW chat by picking an agent. */}
            <AgentListDropdown
              onSelect={(agentId) => {
                if (!sessionId) return;
                void dispatch(
                  startThreadConversation(threadId, sessionId, agentId),
                );
                close();
              }}
              triggerSlot={
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Sparkles className="size-3.5" />
                  New chat with agent
                </button>
              }
            />
          </div>
        )}
      />
      <ConversationPickerWindow
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        scopeId={`war-room-thread-chat:${threadId}`}
        title="Add a chat to this thread"
        activeConversationId={activeConversationId}
        onSelect={(conv) => {
          if (!sessionId) return;
          void dispatch(
            attachExistingConversationToThread(
              threadId,
              sessionId,
              conv.conversationId,
              conv.title,
            ),
          );
        }}
      />
    </>
  );
}

export function ThreadAgentTab({
  threadId,
  compact,
}: {
  threadId: string;
  compact?: boolean;
}) {
  const dispatch = useAppDispatch();
  const sessionId = useAppSelector(selectActiveAudioSessionId(threadId));
  const loaded = useAppSelector(
    selectContainerAssignmentsLoaded("thread", threadId),
  );
  const conversationIds = useAppSelector(
    selectConversationIdsForThread(threadId),
  );
  const activeEdgeConversationId = useAppSelector(
    selectActiveConversationId(threadId),
  );
  const boundConversationId = useAppSelector(
    selectAssistantConversationId(sessionId),
  );

  // The persona a NEW thread chat starts with — the `war_room.thread` slot.
  // Unresolved ⇒ the explicit Start-chat affordances are DISABLED and say why;
  // there is no hardcoded fallback id to quietly start the wrong agent.
  const { slot: threadSlot, error: threadSlotError } = useAgentSlot(
    WAR_ROOM_THREAD_AGENT_SLOT,
  );
  const threadAgentId = threadSlot?.agentId ?? null;

  // Hydrate-only — NEVER creates a session or conversation (that happens
  // exactly once, at thread provisioning). A legacy thread missing either
  // gets the explicit "Set up chat" empty state below.
  useEffect(() => {
    void dispatch(hydrateThreadAssignments(threadId));
  }, [threadId, dispatch]);

  // Bind the panel to the thread's active conversation edge when nothing is
  // bound yet (refresh, legacy thread). A BIND, not a create.
  useEffect(() => {
    if (!sessionId || !loaded) return;
    if (boundConversationId || !activeEdgeConversationId) return;
    void dispatch(
      setThreadActiveConversation(
        threadId,
        sessionId,
        activeEdgeConversationId,
      ),
    );
  }, [
    threadId,
    sessionId,
    loaded,
    boundConversationId,
    activeEdgeConversationId,
    dispatch,
  ]);

  // One-shot cleanup of phantom conversation edges (chats that never existed
  // server-side). Loud — see the thunk. Needs only the hydrated bucket: the
  // session pointer is deliberately NOT consulted, because a broken pointer
  // names exactly the debris we're here to remove.
  useEffect(() => {
    if (!loaded) return;
    void dispatch(pruneThreadPhantomConversations(threadId));
  }, [threadId, loaded, dispatch]);

  useEffect(() => {
    traceWarRoomRenderPath(7, "ThreadAgentTab.tsx", "mount", { threadId });
  }, [threadId]);

  useEffect(() => {
    if (!sessionId) return;
    traceWarRoomRenderPath(8, "ThreadAgentTab.tsx", "studio session ready", {
      threadId,
      studioSessionId: sessionId,
    });
  }, [threadId, sessionId]);

  if (!sessionId) {
    if (!loaded) {
      return (
        <div className="flex h-full items-center justify-center">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      );
    }
    // Legacy thread with no session (pre-provisioning). Explicit setup only.
    return (
      <div className="grid h-full place-items-center">
        <div className="flex flex-col items-center gap-2 text-center">
          <MessageCircle
            className="size-5 text-muted-foreground/60"
            aria-hidden
          />
          <span className="text-xs text-muted-foreground">
            This thread has no chat yet
          </span>
          <button
            type="button"
            disabled={!threadAgentId}
            title={threadSlotError ?? undefined}
            onClick={() => {
              if (!threadAgentId) return;
              void dispatch(addAudioSessionToThread(threadId)).then((sid) => {
                if (sid) {
                  void dispatch(
                    startThreadConversation(threadId, sid, threadAgentId),
                  );
                }
              });
            }}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="size-3.5" />
            Set up chat
          </button>
        </div>
      </div>
    );
  }

  // Session exists but the thread has NO conversation at all (legacy, or
  // provisioning half-failed): explicit start, never an auto-mint.
  if (loaded && !boundConversationId && conversationIds.length === 0) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {!compact ? (
          <div className="flex h-7 shrink-0 items-center gap-1 border-b border-border/60 pl-1.5 pr-1">
            <ThreadChatChrome threadId={threadId} sessionId={sessionId} />
          </div>
        ) : null}
        <div className="grid min-h-0 flex-1 place-items-center">
          <div className="flex flex-col items-center gap-2 text-center">
            <MessageCircle
              className="size-5 text-muted-foreground/60"
              aria-hidden
            />
            <span className="text-xs text-muted-foreground">
              No chat on this thread yet
            </span>
            <button
              type="button"
              disabled={!threadAgentId}
              title={threadSlotError ?? undefined}
              onClick={() => {
                if (!threadAgentId) return;
                void dispatch(
                  startThreadConversation(threadId, sessionId, threadAgentId),
                );
              }}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="size-3.5" />
              Start chat
            </button>
            <SlotAgentPicker slotKey={WAR_ROOM_THREAD_AGENT_SLOT} />
          </div>
        </div>
      </div>
    );
  }

  // Pass the threadId through so the panel can expose the tile's task / notes /
  // files to the assistant as read-only context (ThreadAgentPanel builds those).
  //
  // NO `key={sessionId}` here: a key would force a full remount on every session
  // switch, which unmounts ExperimentalAgentScreen and KILLS in-flight read-aloud
  // (the speaker now lives at app-root, but the screen still publishes/clears its
  // request on mount/unmount). ThreadAgentPanel + ExperimentalAgentScreen re-bind
  // to a changed `sessionId` prop via their own effects, so a remount is both
  // unnecessary and harmful. See providers/AudioOutputHost.
  return (
    <div className="flex h-full min-h-0 flex-col">
      {!compact ? (
        <div className="flex h-7 shrink-0 items-center gap-1 border-b border-border/60 pl-1.5 pr-1">
          <ThreadChatChrome threadId={threadId} sessionId={sessionId} />
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <ThreadAgentPanel
          sessionId={sessionId}
          threadId={threadId}
          compact={compact}
        />
      </div>
    </div>
  );
}
