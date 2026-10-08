"use client";

import { toast } from "@/lib/toast";
import { pagePrintUrl, resolvePrintablePageUrl, type PrintablePageInput } from "./publishedPage";

/**
 * Prints a published HTML page exactly as its author made it: opens
 * `/p/<id>?print=1` top-level and the page prints itself once loaded (vector
 * text, backgrounds kept). The tab opens INSIDE the click — the person's
 * activation is spent on it — and is pointed at the page once it is known.
 */
export function printPublishedPage(input: PrintablePageInput): void {
  const tab = window.open("about:blank", "_blank");
  void resolvePrintablePageUrl(input).then(
    (pageUrl) => {
      if (!pageUrl) {
        tab?.close();
        toast.error("This page is not published yet. Try again once it shows.");
        return;
      }
      const target = pagePrintUrl(pageUrl);
      if (tab && !tab.closed) {
        tab.opener = null;
        tab.location.href = target;
      } else {
        toast.error("The print tab was blocked. Allow pop-ups for this site and try again.");
      }
    },
    (error: unknown) => {
      tab?.close();
      console.error("[print] the page to print could not be found", error);
      toast.error("The page could not be opened for print.");
    },
  );
}
