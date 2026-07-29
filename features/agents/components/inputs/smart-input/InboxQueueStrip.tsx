"use client";

/**
 * InboxQueueStrip — the "waiting its turn" cards for messages queued into a
 * running conversation via the Turn-Boundary Inbox
 * (docs/TURN_BOUNDARY_INBOX.md).
 *
 * Rendered directly above the composer by every SmartAgentInput variant (and
 * the widget composers), so any surface that can queue can also see, edit,
 * and withdraw what's queued. Cards disappear on delivery — the stream's
 * `injection_consumed` seeds the real transcript bubble and process-stream
 * retires the card.
 *
 * States rendered:
 *   sending → subtle pulse, no actions yet (POST in flight)
 *   pending → "Queued" + edit / withdraw
 *   failed  → error tint + retry / dismiss
 *
 * Only requires conversationId — state comes from the conversationInbox
 * slice. Renders nothing when the queue is empty (zero layout cost).
 */

import React, { useState } from "react";
import { Clock, Pencil, RotateCcw, X } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { selectInboxItems } from "@/features/agents/redux/execution-system/inbox/inbox.selectors";
import {
  enqueueInboxMessage,
  retractInboxItem,
  editInboxItem,
} from "@/features/agents/redux/execution-system/inbox/inbox.thunks";
import { removeInboxItem } from "@/features/agents/redux/execution-system/inbox/inbox.slice";

interface InboxQueueStripProps {
  conversationId: string;
}

export function InboxQueueStrip({ conversationId }: InboxQueueStripProps) {
  const dispatch = useAppDispatch();
  const items = useAppSelector(selectInboxItems(conversationId));
  const [editing, setEditing] = useState<{
    injectionId: string;
    text: string;
  } | null>(null);
  const [editBusy, setEditBusy] = useState(false);

  const visible = items.filter((i) => i.isVisibleToUser);
  if (visible.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 px-2 pb-1 shrink-0">
      {visible.map((item) => {
        const failed = item.status === "failed";
        const sending = item.status === "sending";
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
                  : sending
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
              {failed
                ? (item.error ?? "Failed to queue")
                : sending
                  ? "Queuing…"
                  : "Queued — answered at the agent's next pause"}
            </span>
            {failed && (
              <button
                type="button"
                title="Retry queueing this message"
                className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => {
                  dispatch(
                    removeInboxItem({
                      conversationId,
                      injectionId: item.injectionId,
                    }),
                  );
                  dispatch(
                    enqueueInboxMessage({ conversationId, text: item.text }),
                  );
                }}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
            {item.status === "pending" && (
              <button
                type="button"
                title="Edit the queued message"
                className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() =>
                  setEditing({ injectionId: item.injectionId, text: item.text })
                }
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            {!sending && (
              <button
                type="button"
                title={failed ? "Dismiss" : "Withdraw the queued message"}
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
        title="Edit queued message"
        description="The agent hasn't picked this up yet — you can still change it."
        defaultValue={editing?.text ?? ""}
        multiline
        confirmLabel="Save"
        busy={editBusy}
        onConfirm={async (text) => {
          if (!editing) return;
          setEditBusy(true);
          try {
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
