"use client";

/**
 * Reusable v3 `NonEditableContextMenu` wrapper for the standalone-HTML-page
 * LIST route (`/cms/html-pages`). Mounts the `matrx-user/html-page` surface on
 * list chrome and on individual rows/cards so both emit `html_pages_structure`
 * and the same list actions (New / Open / Copy URL / Open Live / Back to hub).
 *
 * `page` omitted → list-level (row actions disabled). `page` set → that row is
 * marked `current="true"` in the framing XML and the row actions target it.
 *
 * Copy / Open Live / Back-to-hub are self-contained here; the host supplies
 * only `onNewPage` and `onOpenPage` (which own list scroll capture + routing).
 */

import React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { HTML_PAGE_CONTEXT_MENU_PROPS } from "../agent-context/htmlPageContextMenuProps";
import { buildHtmlPagesListContextData } from "../agent-context/buildHtmlPagesListContextData";
import { createHtmlPagesListExtraSections } from "../agent-context/htmlPagesListExtraSections";
import type { HtmlPageSummary } from "../types";

interface HtmlPagesContextMenuProps {
  /** Framing list — every published page (typically the filtered list view). */
  pages: readonly HtmlPageSummary[];
  /** The row/card this menu targets; omit for list-level chrome. */
  page?: HtmlPageSummary;
  onNewPage: () => void;
  onOpenPage: (pageId: string) => void;
  /**
   * Off for table rows — the floating-selection icon renders a hidden `<span>`
   * sibling of the trigger, which is invalid DOM directly inside `<tbody>`.
   */
  enableFloatingIcon?: boolean;
  children: React.ReactNode;
}

export function HtmlPagesContextMenu({
  pages,
  page,
  onNewPage,
  onOpenPage,
  enableFloatingIcon = true,
  children,
}: HtmlPagesContextMenuProps) {
  const router = useRouter();

  const extraSections = createHtmlPagesListExtraSections({
    hasSelection: !!page,
    liveUrl: page?.url,
    onNewPage,
    onOpenSelected: () => {
      if (page) onOpenPage(page.id);
    },
    onCopySelectedUrl: async () => {
      if (!page) return;
      try {
        await navigator.clipboard.writeText(page.url);
        toast.success("URL copied");
      } catch {
        toast.error("Failed to copy URL");
      }
    },
    onOpenSelectedLive: () => {
      if (page?.url) window.open(page.url, "_blank", "noopener,noreferrer");
    },
    onBackToHub: () => router.push("/cms"),
  });

  return (
    <NonEditableContextMenu
      {...HTML_PAGE_CONTEXT_MENU_PROPS}
      enableFloatingIcon={enableFloatingIcon}
      extraSections={extraSections}
      contextData={buildHtmlPagesListContextData({
        pages,
        selectedPageId: page?.id,
      })}
    >
      {children}
    </NonEditableContextMenu>
  );
}
