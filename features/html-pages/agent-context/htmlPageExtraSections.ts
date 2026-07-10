import { Save, Copy, ExternalLink, ArrowLeft } from "lucide-react";
import type {
  ContextMenuExtraItem,
  ContextMenuExtraSection,
} from "@/features/context-menu-v3/types";

/**
 * Standalone-HTML-page-specific menu items injected into the canonical v3
 * context menu via `extraSections`. The host (`HtmlPageEditor`) owns the
 * handlers + state — this stays a pure description, same pattern as
 * `cmsPageExtraSections.ts`.
 */
export interface HtmlPageExtraSectionsConfig {
  dirty: boolean;
  liveUrl: string;
  onSave: () => void;
  onCopyUrl: () => void;
  onOpenLive: () => void;
  onBackToList: () => void;
}

export function createHtmlPageExtraSections(
  config: HtmlPageExtraSectionsConfig,
): ContextMenuExtraSection[] {
  const { dirty, liveUrl, onSave, onCopyUrl, onOpenLive, onBackToList } =
    config;

  const items: ContextMenuExtraItem[] = [
    {
      kind: "item",
      id: "save-page",
      label: "Save",
      icon: Save,
      disabled: !dirty,
      onSelect: onSave,
    },
    { kind: "separator", id: "urls-sep" },
    {
      kind: "item",
      id: "copy-url",
      label: "Copy Live URL",
      icon: Copy,
      onSelect: onCopyUrl,
    },
    {
      kind: "item",
      id: "open-live",
      label: "Open Live Page",
      icon: ExternalLink,
      disabled: !liveUrl,
      onSelect: onOpenLive,
    },
    { kind: "separator", id: "nav-sep" },
    {
      kind: "item",
      id: "back-to-list",
      label: "Back to Published Pages",
      icon: ArrowLeft,
      onSelect: onBackToList,
    },
  ];

  return [
    { id: "html-page-ops", label: "Page", anchor: "after-compare", items },
  ];
}
