import { Plus, FolderOpen, Copy, ExternalLink, ArrowLeft } from "lucide-react";
import type {
  ContextMenuExtraItem,
  ContextMenuExtraSection,
} from "@/features/context-menu-v3/types";

/**
 * Menu items for the standalone-HTML-page LIST route (`/cms/html-pages`),
 * injected into the canonical v3 context menu via `extraSections`. Mirrors
 * `cmsHubExtraSections.ts` (the CMS hub's list menu) — a pure description; the
 * host owns the navigation + row handlers.
 *
 * The row-scoped actions (Open / Copy URL / Open Live) are disabled at the
 * list level (`hasSelection === false`) and enabled when the menu is opened on
 * a specific card/row.
 */
export interface HtmlPagesListExtraSectionsConfig {
  /** True when the menu targets a specific page (row/card), not list chrome. */
  hasSelection: boolean;
  liveUrl?: string;
  onNewPage: () => void;
  onOpenSelected: () => void;
  onCopySelectedUrl: () => void;
  onOpenSelectedLive: () => void;
  onBackToHub: () => void;
}

export function createHtmlPagesListExtraSections(
  config: HtmlPagesListExtraSectionsConfig,
): ContextMenuExtraSection[] {
  const {
    hasSelection,
    liveUrl,
    onNewPage,
    onOpenSelected,
    onCopySelectedUrl,
    onOpenSelectedLive,
    onBackToHub,
  } = config;

  const items: ContextMenuExtraItem[] = [
    {
      kind: "item",
      id: "new-page",
      label: "New Page",
      icon: Plus,
      onSelect: onNewPage,
    },
    {
      kind: "item",
      id: "open-page",
      label: "Open Page",
      icon: FolderOpen,
      disabled: !hasSelection,
      onSelect: onOpenSelected,
    },
    { kind: "separator", id: "urls-sep" },
    {
      kind: "item",
      id: "copy-url",
      label: "Copy Live URL",
      icon: Copy,
      disabled: !hasSelection,
      onSelect: onCopySelectedUrl,
    },
    {
      kind: "item",
      id: "open-live",
      label: "Open Live Page",
      icon: ExternalLink,
      disabled: !hasSelection || !liveUrl,
      onSelect: onOpenSelectedLive,
    },
    { kind: "separator", id: "nav-sep" },
    {
      kind: "item",
      id: "back-to-hub",
      label: "Back to Content Manager",
      icon: ArrowLeft,
      onSelect: onBackToHub,
    },
  ];

  return [
    { id: "html-pages-list-ops", label: "Pages", anchor: "after-compare", items },
  ];
}
