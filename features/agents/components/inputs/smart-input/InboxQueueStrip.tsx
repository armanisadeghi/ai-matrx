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
import { Clock, Pencil, RotateCcw, X, Zap } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { selectInboxItems } from "@/features/agents/redux/execution-system/inbox/inbox.selectors";
import {
  enqueueInboxMessage,
  queueMessage,
  promoteQueuedToSteer,
  retractInboxItem,
  editInboxItem,
} from "@/features/agents/redux/execution-system/inbox/inbox.thunks";
import {
  removeInboxItem,
  setInboxItemText,
  type ConversationInboxItem,
} from "@/features/agents/redux/execution-system/inbox/inbox.slice";

interface InboxQueueStripProps {
  conversationId: string;
}

function statusLabel(item: ConversationInboxItem): string {
  if (item.status === "failed") return item.error ?? "Failed to send";
  if (item.status === "dispatching") return "Sending…";
  if (item.status === "sending") return "Handing to the agent…";
  if (item.status === "pending") {
    return "Steering — delivered at the agent's next pause";
  }
  return "Queued — sends when the agent finishes";
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

  const visible = items.filter((i) => i.isVisibleToUser);
  if (visible.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 px-2 pb-1 shrink-0">
      {visible.map((item) => {
        const failed = item.status === "failed";
        const busy =
          item.status === "sending" || item.status === "dispatching";
        const editable =
          item.status === "queued" || item.status === "pending";
        return (
          <div
            key={item.injectionId}
            className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${
              failed
                ? "border-destructive/40 bg-destructive/5"
                : "border-border bg-muted/40"
            }`}
          >
            <Clock
              className={`h-3.5 w-3.5 shrink-0 ${
                failed
                  ? "text-destructive"
                  : busy
                    ? "text-muted-foreground animate-pulse"
                    : "text-muted-foreground"
              }`}
            />
            <span className="min-w-0 flex-1 truncate text-foreground">
              {item.text}
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
                  if (item.mode === "steer") {
                    dispatch(
                      enqueueInboxMessage({ conversationId, text: item.text }),
                    );
                  } else {
                    dispatch(
                      queueMessage({ conversationId, text: item.text }),
                    );
                  }
                }}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
            {item.status === "queued" && (
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
            if (editing.mode === "queue") {
              // Client-held — a plain local edit.
              dispatch(
                setInboxItemText({
                  conversationId,
                  injectionId: editing.injectionId,
                  text,
                }),
              );
            } else {
              await dispatch(
                editInboxItem({
                  conversationId,
                  injectionId: editing.injectionId,
                  text,
                }),
              );
            }
            setEditing(null);
          } finally {
            setEditBusy(false);
          }
        }}
      />
    </div>
  );
}
