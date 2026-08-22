"use client";

/**
 * ThreadMessageRow — one message in the reviewer's own conversation.
 *
 * `text` is PROSE, split server-side from the reviewer's structured payload
 * (aidream `services/hindsight/discuss.py`). Never sniff it for JSON — JSON
 * appearing here is a SERVER regression. Bodies render through the canonical
 * markdown pipeline (`MarkdownStream` in persisted mode), never hand-rendered.
 *
 * Shared by the admin `DiscussPanel` and the product `ReviewerChat`.
 */
import MarkdownStream from "@/components/MarkdownStream";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import type { ThreadMessage } from "../types";
import { fmtDate } from "./tokens";

/** What the server withheld, said plainly.
 *
 * The reviewer's own first turn is the review BUNDLE — every example transcript
 * it was given — routinely 40-100K characters. The server caps it (aidream
 * `discuss.py::THREAD_MESSAGE_MAX_CHARS`) because a 101,520-char message
 * rendered through the markdown pipeline froze the tab outright. A cap that
 * does not announce itself is worse than the freeze: it silently misrepresents
 * what the reviewer was given, which is the one thing this panel exists to show.
 */
function TruncationNotice({ message }: { message: ThreadMessage }) {
  if (!message.truncated) return null;
  const shown = (message.text ?? "").length;
  return (
    <p className="mt-1.5 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-400">
      Showing the first {shown.toLocaleString()} of{" "}
      {(message.full_chars ?? 0).toLocaleString()} characters. This turn is the
      review bundle the reviewer was given — evidence, not a chat message.
    </p>
  );
}

export function ThreadMessageRow({
  message,
  /** "chat" right-aligns the human like a messenger; "flat" is the compact admin list. */
  variant = "flat",
}: {
  message: ThreadMessage;
  variant?: "flat" | "chat";
}) {
  const isHuman = message.role === "user";

  if (variant === "chat") {
    return (
      <div className={cn("flex", isHuman ? "justify-end" : "justify-start")}>
        <div
          className={cn(
            "max-w-[85%] rounded-lg border px-3 py-2",
            isHuman
              ? "border-primary/30 bg-primary/5"
              : "border-border bg-card",
          )}
        >
          <div className="mb-0.5 flex items-center gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {isHuman ? "You" : "Reviewer"}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {fmtDate(message.created_at)}
            </span>
          </div>
          <div className="text-sm">
            <MarkdownStream
              content={message.text ?? ""}
              isStreamActive={false}
              hideCopyButton
            />
          </div>
          <TruncationNotice message={message} />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-md border p-2",
        isHuman ? "border-primary/30 bg-primary/5" : "border-border bg-muted/30",
      )}
    >
      <div className="mb-1 flex items-center gap-2">
        <Badge variant="outline" className="text-[10px] uppercase">
          {isHuman ? "you" : message.role}
        </Badge>
        <span className="text-[11px] text-muted-foreground">
          {fmtDate(message.created_at)}
        </span>
      </div>
      <div className="text-sm">
        <MarkdownStream
          content={message.text ?? ""}
          isStreamActive={false}
          hideCopyButton
        />
      </div>
      <TruncationNotice message={message} />
    </div>
  );
}
