"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { fetchPageNow } from "@/features/marketing/crawler/direct-client";
import { marketingKeys } from "@/features/marketing/data/hooks";
import { extractErrorMessage } from "@/utils/errors";

/**
 * "Fetch now" — capture the freshest version of ONE page on demand, without
 * touching the crawl machinery. Works for pages that have never been captured
 * (the server creates the canonical page + snapshot). On completion the page
 * subtree (workspace, captures, snapshots) and the site's pages lists refetch.
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
  const [pending, setPending] = useState(false);

  const run = async () => {
    if (pending) return;
    setPending(true);
    try {
      await fetchPageNow(siteId, url);
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
    } catch (error) {
      // streamCommand already captured the failure to the Error Inspector.
      toast.error("Could not fetch this page", {
        description: extractErrorMessage(error),
      });
    } finally {
      setPending(false);
    }
  };

  const glyph = pending ? (
    <Loader2 className="h-3.5 w-3.5 animate-spin" />
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
        disabled={pending}
        onClick={(event) => {
          event.stopPropagation();
          void run();
        }}
        title="Fetch the latest version of this page now"
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
      disabled={pending}
      onClick={() => void run()}
      title="Fetch the latest version of this page now"
    >
      {pending ? (
        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
      ) : (
        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
      )}
      {pending ? "Fetching…" : "Fetch now"}
    </Button>
  );
}
