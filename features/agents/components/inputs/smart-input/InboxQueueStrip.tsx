"use client";

/**
 * InboxQueueStrip — the waiting-message cards for the three send modes
 * (/Users/armanisadeghi/code/common-docs/systems/agents/execution-runtime/TURN-BOUNDARY-INBOX.md — Arman's ruling 2026-07-29):
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
import {
  CircleHelp,
  Clock,
  Handshake,
  Pencil,
  RotateCcw,
  X,
  Zap,
} from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import IconButton from "@/components/official/IconButton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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

const queueActionClassName =
  "h-11 w-11 min-h-11 min-w-11 shrink-0 rounded p-0 text-muted-foreground hover:bg-muted hover:text-foreground lg:h-8 lg:w-8 lg:min-h-8 lg:min-w-8";

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
      <div className="flex items-center gap-1 px-0.5 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground/80">Waiting messages</span>
        <span aria-label={`${visible.length} waiting messages`}>
          {visible.length}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="How waiting messages work"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring lg:h-5 lg:w-5"
            >
              <CircleHelp className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            align="start"
            className="max-w-[20rem] space-y-1.5 py-2"
          >
            <p className="font-medium">Messages sent while the agent works</p>
            <p className="text-muted-foreground">
              They wait here in order, are saved across reloads, and send
              automatically after the current run finishes.
            </p>
            <p className="text-muted-foreground">
              Use the lightning bolt to deliver one at the agent&apos;s next
              natural pause. Edit or withdraw it any time before delivery.
            </p>
            <p className="text-muted-foreground">
              Shortcut: Command/Ctrl + Enter delivers at the next pause;
              Command/Ctrl + Shift + Enter stops and redirects the run.
            </p>
          </TooltipContent>
        </Tooltip>
      </div>
      {visible.map((item) => {
        const failed = item.status === "failed";
        const busy = item.status === "sending";
        const collabNote = isCollabNoteItem(item);
        const editable = item.status === "pending" && !collabNote;
        const collabAgent = collabNote ? parseCollabNoteAgent(item.text) : null;
        const Icon = collabNote ? Handshake : Clock;
        const statusHelp = failed
          ? `${item.error ?? "This message could not be queued."} Retry it or dismiss it.`
          : busy
            ? "Saving this message to the waiting queue."
            : collabNote
              ? "A collaborating agent left context for this conversation. It will be added automatically on the next turn."
              : item.mode === "queue"
                ? "This message is saved and waiting in line. It sends automatically after the current run finishes, even if you leave this page."
                : "This message will reach the agent at its next natural pause without stopping the current work.";
        return (
          <div
            key={item.injectionId}
            className={`flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-xs lg:items-center ${
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
            <div className="min-w-0 flex-1 self-center">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    tabIndex={0}
                    className="block truncate rounded-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {collabNote && collabAgent
                      ? `Note from ${collabAgent}`
                      : item.text}
                  </span>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  className="max-w-[24rem] break-words"
                >
                  {item.text}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    tabIndex={0}
                    className={`block truncate rounded-sm text-[11px] leading-4 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring lg:cursor-help ${
                      failed ? "text-destructive" : "text-muted-foreground"
                    }`}
                  >
                    {statusLabel(item)}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[20rem]">
                  {statusHelp}
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="flex shrink-0 items-center self-center">
              {failed && (
                <IconButton
                  type="button"
                  icon={RotateCcw}
                  size="xs"
                  variant="ghost"
                  tooltip="Retry — try saving this message to the queue again."
                  tooltipSide="top"
                  aria-label="Retry queued message"
                  className={queueActionClassName}
                  iconClassName="h-4 w-4"
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
                />
              )}
              {item.mode === "queue" &&
                item.status === "pending" &&
                !collabNote && (
                  <IconButton
                    type="button"
                    icon={Zap}
                    size="xs"
                    variant="ghost"
                    tooltip="Deliver at the next pause — the agent keeps working, but receives this sooner."
                    tooltipSide="top"
                    aria-label="Deliver queued message at the agent's next pause"
                    className={queueActionClassName}
                    iconClassName="h-4 w-4"
                    onClick={() =>
                      dispatch(
                        promoteQueuedToSteer({
                          conversationId,
                          injectionId: item.injectionId,
                        }),
                      )
                    }
                  />
                )}
              {editable && (
                <IconButton
                  type="button"
                  icon={Pencil}
                  size="xs"
                  variant="ghost"
                  tooltip="Edit — change this message before the agent receives it."
                  tooltipSide="top"
                  aria-label="Edit queued message"
                  className={queueActionClassName}
                  iconClassName="h-4 w-4"
                  onClick={() =>
                    setEditing({
                      injectionId: item.injectionId,
                      mode: item.mode,
                      text: item.text,
                    })
                  }
                />
              )}
              {!busy && (
                <IconButton
                  type="button"
                  icon={X}
                  size="xs"
                  variant="ghost"
                  tooltip={
                    failed
                      ? "Dismiss — remove this failed message."
                      : "Withdraw — remove this message before the agent receives it."
                  }
                  tooltipSide="top"
                  aria-label={
                    failed
                      ? "Dismiss failed message"
                      : "Withdraw queued message"
                  }
                  className={queueActionClassName}
                  iconClassName="h-4 w-4"
                  onClick={() =>
                    dispatch(
                      retractInboxItem({
                        conversationId,
                        injectionId: item.injectionId,
                      }),
                    )
                  }
                />
              )}
            </div>
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
