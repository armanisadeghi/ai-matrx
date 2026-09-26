"use client";

/**
 * ConversationAttachmentsChip — the chat header's one-glance answer to "what
 * is this chat actually pointed at?".
 *
 * Arman, 2026-09-15: "for github, I should be able to select it and then it
 * should let me choose which repo or repos I want to attach to this particular
 * chat and it should then persist but let me add others later."
 *
 * The composer rail says WHICH SERVICES this chat can reach and carries the
 * chooser door, but it is one 16px line — it can hold a count and no more.
 * After twenty turns the question a person asks is not "is GitHub connected",
 * it is "wait, which repos is this thing looking at?" — and the answer has to
 * be reachable without scrolling back to the composer or opening a panel.
 *
 * Same shape as `ConversationRecordsChip` beside it, deliberately: a trigger
 * with a count, and a popover that NAMES each item and OPENS it (THE DOOR
 * LAW — every attachment here is a real link to the repository or file at the
 * provider, never a `<span>` naming something the reader cannot reach).
 */

import { useState } from "react";
import { AlertTriangle, ExternalLink, Paperclip } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ai-matrx/design-system";
import { attachmentKey } from "@/features/connectors/attachable-resources";
import { useConversationAttachments } from "@/features/connectors/useConversationAttachments";
import { useMcpCatalog } from "@/features/agents/hooks/useMcpTools";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export function ConversationAttachmentsChip({
  conversationId,
}: {
  conversationId: string;
}) {
  const [open, setOpen] = useState(false);
  // The header does not know this chat's own connections, so it asks the
  // account-wide catalog the narrower question the capability gate needs:
  // does ANY connection offer resources to choose from? If none does, the
  // feature is not present and the header stays silent rather than warning
  // every reader about something nobody has.
  const { serverStates } = useMcpCatalog();
  const attachments = useConversationAttachments(conversationId, {
    hasAttachableConnection: serverStates.some(
      (server) => server.attachable.length > 0,
    ),
  });
  const items = attachments.items;

  // Nothing attached and nothing wrong — the header stays quiet rather than
  // spending a control on an empty answer. The doors that ADD an attachment
  // live on the composer rail and in the Tools picker, both one click away, so
  // this is a summary that disappears, never a dead end.
  if (items.length === 0 && attachments.status !== "failed") return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-conversation-attachments-trigger
          aria-label={`Attached to this chat: ${items.length} item${items.length === 1 ? "" : "s"}`}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Paperclip className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Attached</span>
          {items.length > 0 && (
            <span className="rounded-full bg-primary/10 px-1.5 text-[11px] font-semibold text-primary">
              {items.length}
            </span>
          )}
          {attachments.status === "failed" && (
            <AlertTriangle
              className="h-3.5 w-3.5 text-amber-500"
              aria-hidden
            />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent sizing="content" align="end" className="p-3">
        <div className="mb-2 text-sm font-semibold text-foreground">
          Attached to this chat
        </div>

        {attachments.status === "failed" && (
          <p className="mb-2 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {attachments.error}{" "}
              <button
                type="button"
                onClick={attachments.reload}
                className="underline underline-offset-2 hover:text-foreground"
              >
                Try again
              </button>
              <ErrorAlchemyMenu error={attachments.error} />
            </span>
          </p>
        )}

        <ul className="flex flex-col gap-1">
          {items.map((item) => (
            <li key={attachmentKey(item)}>
              {item.link ? (
                <a
                  href={item.link}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Open ${item.display_name}`}
                  className="flex items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-accent"
                >
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                    {item.display_name}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {item.pending ? "attaching" : item.provider}
                  </span>
                  <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                </a>
              ) : (
                <span className="flex items-center gap-2 px-1.5 py-1 text-xs">
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                    {item.display_name}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {item.pending ? "attaching" : item.provider}
                  </span>
                </span>
              )}
            </li>
          ))}
        </ul>

        <p className="mt-2 text-[11px] leading-tight text-muted-foreground">
          Add or remove these from the Connections line under the message box.
        </p>
      </PopoverContent>
    </Popover>
  );
}
