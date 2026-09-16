"use client";

/**
 * AttachedResourcesSection — the repositories, files and sheets this chat is
 * pointed at, with a remove control on each and a door to add more.
 *
 * The composer rail is one 16px line and may never wrap (that constraint is
 * why it never competes with the message box), so the rail carries the chooser
 * door and a count while the full list lives here, in the Tools panel, where
 * there is room to show every item, its provider, and its own link.
 *
 * NOTHING HERE IS A DEAD END:
 *   - every attached item opens at the provider (THE DOOR LAW);
 *   - every attachable connection carries "Add more" whether or not anything
 *     is attached yet — the empty state is a door, not a shrug;
 *   - a read that failed says so with its remedy instead of rendering as
 *     "nothing attached", and a write that failed keeps the item on screen
 *     with the server's own sentence.
 */

import {
  AlertTriangle,
  ExternalLink,
  Loader2,
  Paperclip,
  Plus,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  attachActionLabel,
  attachmentKey,
  type AttachableResource,
  type DisplayedAttachment,
} from "./attachable-resources";
import { useAttachResourcePicker } from "./useAttachResourcePicker";
import { useConversationAttachments } from "./useConversationAttachments";

export interface AttachableConnectionSummary {
  slug: string;
  name: string;
  attachable: AttachableResource[];
}

export function AttachedResourcesSection({
  conversationId,
  connections,
  className,
}: {
  conversationId: string;
  /** Every connection on this chat; the plain ones are filtered out here. */
  connections: readonly AttachableConnectionSummary[];
  className?: string;
}) {
  const attachments = useConversationAttachments(conversationId);
  const openPicker = useAttachResourcePicker();
  const attachableConnections = connections.filter(
    (connection) => connection.attachable.length > 0,
  );

  // No attachable connection on this chat means there is genuinely nothing to
  // say — and an empty section headed "Attached" would read as a loss.
  if (attachableConnections.length === 0) return null;

  return (
    <div className={cn("shrink-0 border-b border-border px-2.5 py-2", className)}>
      <div className="mb-1 flex items-center gap-1.5">
        <Paperclip className="h-3.5 w-3.5 text-primary" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Attached to this chat
        </span>
      </div>

      {attachments.status === "failed" && (
        <p className="mb-1.5 flex items-start gap-1 text-[11px] leading-tight text-amber-600 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          {attachments.error} — what is listed below may be incomplete.{" "}
          <button
            type="button"
            onClick={attachments.reload}
            className="underline underline-offset-2 hover:text-foreground"
          >
            Try again
          </button>
        </p>
      )}

      {attachments.writeError && (
        <p className="mb-1.5 flex items-start gap-1 text-[11px] leading-tight text-destructive">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          {attachments.writeError}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        {attachableConnections.map((connection) => {
          const items = attachments.items.filter(
            (item) => item.provider === connection.slug,
          );
          const chooserLabel =
            attachActionLabel(connection.attachable) ?? "Choose…";
          return (
            <div key={connection.slug} className="flex flex-col gap-1">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[11px] font-medium text-foreground">
                  {connection.name}
                </span>
                <span className="text-[11px] tabular-nums text-muted-foreground/80">
                  {items.length}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {items.map((item) => (
                  <AttachedChip
                    key={attachmentKey(item)}
                    item={item}
                    busy={attachments.busyKeys.includes(attachmentKey(item))}
                    onRemove={() => void attachments.remove(item)}
                  />
                ))}
                <button
                  type="button"
                  onClick={() =>
                    openPicker({
                      conversationId,
                      provider: connection.slug,
                      providerName: connection.name,
                      attachable: connection.attachable,
                    })
                  }
                  aria-label={
                    items.length > 0
                      ? `Add more from ${connection.name}`
                      : `${chooserLabel} from ${connection.name}`
                  }
                  className="flex h-6 items-center gap-1 rounded-md border border-dashed border-border px-2 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <Plus className="h-3 w-3" aria-hidden />
                  {items.length > 0 ? "Add more" : chooserLabel}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * One attached item. The name is a real door to the resource at the provider,
 * never a `<span>` naming something the reader cannot reach.
 *
 * A pick that has not reached the server yet says so rather than passing for
 * attached — on `/chat/new` that is the honest state until the first send.
 */
function AttachedChip({
  item,
  busy,
  onRemove,
}: {
  item: DisplayedAttachment;
  busy: boolean;
  onRemove: () => void;
}) {
  const body = (
    <>
      <span className="max-w-[10rem] truncate">{item.display_name}</span>
      {item.link && <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-70" />}
    </>
  );
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-md border text-[11px]",
        item.pending
          ? "border-dashed border-primary/40 bg-primary/5 text-primary"
          : "border-border bg-card text-foreground",
      )}
      title={
        item.pending
          ? `${item.display_name} — attaches when this chat is created`
          : item.display_name
      }
    >
      {item.link ? (
        <a
          href={item.link}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${item.display_name}`}
          className="flex min-w-0 items-center gap-1 px-1.5 hover:underline"
        >
          {body}
        </a>
      ) : (
        <span className="flex min-w-0 items-center gap-1 px-1.5">{body}</span>
      )}
      <button
        type="button"
        onClick={onRemove}
        disabled={busy}
        aria-label={`Remove ${item.display_name} from this chat`}
        title={`Remove ${item.display_name} from this chat`}
        className="flex h-6 w-5 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        ) : (
          <X className="h-3 w-3" aria-hidden />
        )}
      </button>
    </span>
  );
}
