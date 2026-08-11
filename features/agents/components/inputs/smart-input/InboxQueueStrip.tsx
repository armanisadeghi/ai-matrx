"use client";

/**
 * InboxQueueStrip — the waiting-message cards for the three send modes
 * (docs/TURN_BOUNDARY_INBOX.md — Arman's ruling 2026-07-29):
 *
 *   QUEUE (default): "waits until the agent is completely done, then sends as
 *     the next turn." Card actions: edit, withdraw, and "Deliver now" (promote
 *     to STEER so it doesn't wait for the run to end).
 *   STEER: "delivered at the agent's next natural pause, mid-run." Card
 *     actions: edit (PATCH), withdraw (DELETE) — until drained.
 *
 * Rendered directly above the composer by every SmartAgentInput variant (and
 * the widget composers), so any surface that can queue can also see, edit,
 * and withdraw what's waiting. Cards disappear when their message officially
 * sends — the transcript owns it from then on.
 *
 * Only requires conversationId — state comes from the conversationInbox
 * slice. Renders nothing when the queue is empty (zero layout cost).
 */

import React, { useState } from "react";
import { Clock, Handshake, Pencil, RotateCcw, X, Zap } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { selectInboxItems } from "@/features/agents/redux/execution-system/inbox/inbox.selectors";
import {
  enqueueInboxMessage,
  promoteQueuedToSteer,
  retractInboxItem,
  editInboxItem,
} from "@/features/agents/redux/execution-system/inbox/inbox.thunks";
import {
  removeInboxItem,
  type ConversationInboxItem,
} from "@/features/agents/redux/execution-system/inbox/inbox.slice";

interface InboxQueueStripProps {
  conversationId: string;
}

function statusLabel(item: ConversationInboxItem): string {
  if (item.status === "failed") return item.error ?? "Failed to send";
  if (item.status === "sending") return "Handing to the agent…";
  if (isCollabNoteItem(item)) {
    return "Collaboration note — this agent sees it next turn";
  }
  return item.mode === "queue"
    ? "Queued — sends when the agent finishes"
    : "Steering — delivered at the agent's next pause";
}

/**
 * A write-back note from a collaboration `agent_call` in ANOTHER conversation
 * (server producer `source='agent_collab'` — see inbox.slice.ts). Not a user
 * message: no edit / "Deliver now" (it belongs to the agent, and turn_end
 * delivery is the contract), but withdraw stays — the user owns their inbox.
 */
function isCollabNoteItem(item: ConversationInboxItem): boolean {
  return item.source === "agent_collab";
}

/**
 * Delivered collab notes are prefixed "[Collaboration note] Agent '<name>' …"
 * server-side; the queued text carries the same prefix. Pull the agent name
 * for the card label so the user sees WHO left the note, not raw plumbing.
 */
export function parseCollabNoteAgent(text: string): string | null {
  const match = /^\[Collaboration note\]\s+Agent\s+'([^']+)'/.exec(text);
  return match?.[1] ?? null;
}

export function InboxQueueStrip({ conversationId }: InboxQueueStripProps) {
  const dispatch = useAppDispatch();
  const items = useAppSelector(selectInboxItems(conversationId));
  const [editing, setEditing] = useState<{
    injectionId: string;
    mode: ConversationInboxItem["mode"];
    text: string;
  } | null>(null);
  const [editBusy, setEditBusy] = useState(false);

  // Collab notes render even when is_visible_to_user=false: the NOTE stays
  // out of the transcript after delivery (the flag's contract), but the fact
  // that one is waiting is the user's to see — a silent steering channel into
  // their own conversation would be worse than the plumbing it hides.
  const visible = items.filter((i) => i.isVisibleToUser || isCollabNoteItem(i));
  if (visible.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 px-2 pb-1 shrink-0">
      {visible.map((item) => {
        const failed = item.status === "failed";
        const busy = item.status === "sending";
        const collabNote = isCollabNoteItem(item);
        const editable = item.status === "pending" && !collabNote;
        const collabAgent = collabNote ? parseCollabNoteAgent(item.text) : null;
        const Icon = collabNote ? Handshake : Clock;
        return (
          <div
            key={item.injectionId}
            className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${
              failed
                ? "border-destructive/40 bg-destructive/5"
                : collabNote
                  ? "border-violet-500/30 bg-violet-500/[0.06]"
                  : "border-border bg-muted/40"
            }`}
          >
            <Icon
              className={`h-3.5 w-3.5 shrink-0 ${
                failed
                  ? "text-destructive"
                  : collabNote
                    ? "text-violet-600 dark:text-violet-400"
                    : busy
                      ? "text-muted-foreground animate-pulse"
                      : "text-muted-foreground"
              }`}
            />
            <span className="min-w-0 flex-1 truncate text-foreground">
              {collabNote && collabAgent
                ? `Note from ${collabAgent}`
                : item.text}
            </span>
            <span
              className={`shrink-0 ${
                failed ? "text-destructive" : "text-muted-foreground"
              }`}
            >
              {statusLabel(item)}
            </span>
            {failed && (
              <button
                type="button"
                title="Retry this message"
                className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => {
                  dispatch(
                    removeInboxItem({
                      conversationId,
                      injectionId: item.injectionId,
                    }),
                  );
                  dispatch(
                    enqueueInboxMessage({
                      conversationId,
                      text: item.text,
                      mode: item.mode,
                    }),
                  );
                }}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
            {item.mode === "queue" && item.status === "pending" && !collabNote && (
              <button
                type="button"
                title="Deliver now — don't wait for the run to end; the agent picks it up at its next pause"
                className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() =>
                  dispatch(
                    promoteQueuedToSteer({
                      conversationId,
                      injectionId: item.injectionId,
                    }),
                  )
                }
              >
                <Zap className="h-3.5 w-3.5" />
              </button>
            )}
            {editable && (
              <button
                type="button"
                title="Edit — this message hasn't been sent yet"
                className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() =>
                  setEditing({
                    injectionId: item.injectionId,
                    mode: item.mode,
                    text: item.text,
                  })
                }
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            {!busy && (
              <button
                type="button"
                title={failed ? "Dismiss" : "Withdraw — don't send this"}
                className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() =>
                  dispatch(
                    retractInboxItem({
                      conversationId,
                      injectionId: item.injectionId,
                    }),
                  )
                }
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        );
      })}

      <TextInputDialog
        open={editing !== null}
        onOpenChange={(o) => {
          if (!o && !editBusy) setEditing(null);
        }}
        title="Edit message"
        description="This message hasn't been sent yet — you can still change it."
        defaultValue={editing?.text ?? ""}
        multiline
        confirmLabel="Save"
        busy={editBusy}
        onConfirm={async (text) => {
          if (!editing) return;
          setEditBusy(true);
          try {
            // Both modes are server-held rows — one PATCH path.
            await dispatch(
              editInboxItem({
                conversationId,
                injectionId: editing.injectionId,
                text,
              }),
            );
            setEditing(null);
          } finally {
            setEditBusy(false);
          }
        }}
      />
    </div>
  );
}
