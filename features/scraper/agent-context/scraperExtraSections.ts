import { ExternalLink, Copy, Image as ImageIcon } from "lucide-react";
import type { ContextMenuExtraSection } from "@/features/context-menu-v2/extraSections";

export interface ScraperExtraSectionHandlers {
  /** Open the scraped page in a new browser tab. Omit to hide the item. */
  onOpenInBrowser?: () => void;
  /** Copy the scraped text to the clipboard. Omit to hide the item. */
  onCopyText?: () => void;
  /** Open the page's images in the image viewer. Omit to hide the item. */
  onViewImages?: () => void;
}

/**
 * Scraper-specific menu items injected via `extraSections`. These are the same
 * page operations the workspace toolbar exposes (open / copy / images),
 * surfaced inside the right-click menu on the read-only results region. Each is
 * rendered only when its handler is provided, so the menu adapts to what the
 * current result supports.
 */
export function createScraperExtraSections(
  handlers: ScraperExtraSectionHandlers,
): ContextMenuExtraSection[] {
  const items: ContextMenuExtraSection["items"] = [];

  if (handlers.onOpenInBrowser) {
    items.push({
      kind: "item",
      id: "open-in-browser",
      label: "Open page in browser",
      icon: ExternalLink,
      onSelect: handlers.onOpenInBrowser,
    });
  }
  if (handlers.onCopyText) {
    items.push({
      kind: "item",
      id: "copy-text",
      label: "Copy scraped text",
      icon: Copy,
      onSelect: handlers.onCopyText,
    });
  }
  if (handlers.onViewImages) {
    items.push({
      kind: "item",
      id: "view-images",
      label: "View page images",
      icon: ImageIcon,
      onSelect: handlers.onViewImages,
    });
  }

  if (items.length === 0) return [];

  return [
    {
      id: "scraper-ops",
      label: "Page",
      anchor: "after-compare",
      items,
    },
  ];
}
