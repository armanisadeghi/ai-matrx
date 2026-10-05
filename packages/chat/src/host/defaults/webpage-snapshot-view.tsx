import { createElement } from "react";
import type { PreFetchedUrl } from "@ai-matrx/agents/generated/stream-events";

/**
 * The package's own view of a webpage snapshot a message carried: the same labelled header
 * (sent / attached, size, when) and the exact saved text, plain. A host with the scraper's
 * pretty renderer registers it over this (`WebpageSnapshotView` in host/ui-slots).
 */
export function DefaultWebpageSnapshotView({
  snapshot,
  variant = "submitted",
}: {
  snapshot: PreFetchedUrl;
  variant?: "content" | "draft" | "submitted";
}) {
  const charCount = snapshot.charCount ?? snapshot.textContent.length;
  const parsed = snapshot.scrapedAt ? new Date(snapshot.scrapedAt) : null;
  const scrapedAt =
    parsed && !Number.isNaN(parsed.getTime())
      ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(parsed)
      : null;
  return createElement(
    "div",
    { className: "flex h-full min-h-0 flex-col bg-background", "data-chat-slot-fallback": "WebpageSnapshotView" },
    variant !== "content"
      ? createElement(
          "div",
          { className: "flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-2 text-[11px] text-muted-foreground" },
          createElement(
            "span",
            { className: "font-medium text-foreground" },
            variant === "submitted" ? "Snapshot sent with this message" : "Snapshot attached to this draft",
          ),
          createElement("span", null, `${charCount.toLocaleString()} characters`),
          scrapedAt ? createElement("span", null, scrapedAt) : null,
        )
      : null,
    createElement(
      "div",
      { className: "min-h-0 flex-1 overflow-auto" },
      snapshot.textContent.trim()
        ? createElement("article", { className: "whitespace-pre-wrap p-4 text-sm", "data-testid": "saved-webpage-text" }, snapshot.textContent)
        : createElement(
            "div",
            { className: "flex h-full items-center justify-center p-6 text-center text-xs italic text-muted-foreground" },
            "This webpage attachment contains no saved text.",
          ),
    ),
  );
}
