"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Radio, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { fetchPageNow } from "@/features/marketing/crawler/direct-client";
import { marketingKeys } from "@/features/marketing/data/hooks";
import { useSiteCommandRun } from "@/features/marketing/data/useSiteCommandRun";
import { extractErrorMessage } from "@/utils/errors";

/**
 * "Fetch now" — capture the freshest version of ONE page on demand, without
 * touching the crawl machinery. Works for pages that have never been captured
 * (the server creates the canonical page + snapshot). On completion the page
 * subtree (workspace, captures, snapshots) and the site's pages lists refetch.
 *
 * The capture streams into the floating run window (fetch, parse, screenshot
 * are real steps the server reports) and its durable session is rejoined after
 * a reload, so the button never becomes a spinner that a refresh throws away.
 */
export function FetchPageButton({
  siteId,
  url,
  pageId,
  size = "sm",
  onDone,
}: {
  siteId: string;
  url: string;
  /** When known, targets the invalidation at this page's subtree. */
  pageId?: string;
  /** "sm" = labeled button (workspace header); "icon" = compact row action. */
  size?: "sm" | "icon";
  onDone?: () => void;
}) {
  const queryClient = useQueryClient();
  const fetchRun = useSiteCommandRun({
    siteId,
    mode: "page_fetch",
    target: url,
    run: (callbacks) => fetchPageNow(siteId, url, callbacks),
    onComplete: () => {
      if (pageId) {
        void queryClient.invalidateQueries({
          queryKey: marketingKeys.page(siteId, pageId),
        });
      }
      void queryClient.invalidateQueries({
        queryKey: [...marketingKeys.site(siteId), "pages"],
      });
      toast.success("Page fetched", {
        description: "The latest version of this page was captured.",
      });
      onDone?.();
    },
    onRemoteFailure: (message) =>
      toast.error("Could not fetch this page", { description: message }),
  });
  const pending = fetchRun.isActive;

  const run = async () => {
    if (pending) {
      fetchRun.openWindow();
      return;
    }
    try {
      await fetchRun.launch();
    } catch (error) {
      // streamCommand already captured the failure to the Error Inspector.
      toast.error("Could not fetch this page", {
        description: extractErrorMessage(error),
      });
    }
  };

  const glyph = pending ? (
    <Radio className="h-3.5 w-3.5 text-primary" />
  ) : (
    <RefreshCw className="h-3.5 w-3.5" />
  );

  if (size === "icon") {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={(event) => {
          event.stopPropagation();
          void run();
        }}
        title={
          pending
            ? "Capturing this page — click to watch it"
            : "Fetch the latest version of this page now"
        }
      >
        {glyph}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-8"
      onClick={() => void run()}
      title={
        pending
          ? "Capturing this page — click to watch it"
          : "Fetch the latest version of this page now"
      }
    >
      {pending ? (
        <Radio className="mr-1.5 h-3.5 w-3.5 text-primary" />
      ) : (
        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
      )}
      {pending ? "Watch progress" : "Fetch now"}
    </Button>
  );
}
