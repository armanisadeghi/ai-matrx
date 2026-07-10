import { Plus, Settings, Puzzle, ExternalLink } from "lucide-react";
import type {
  ContextMenuExtraItem,
  ContextMenuExtraSection,
} from "@/features/context-menu-v3/types";

/**
 * Site-workspace-specific menu items injected into the canonical v3 context
 * menu via `extraSections`. The host (site dashboard route) owns the
 * navigation — this stays a pure description, same pattern as
 * `cmsPageExtraSections.ts`.
 */
export interface CmsSiteExtraSectionsConfig {
  liveUrl: string;
  onNewPage: () => void;
  onOpenSettings: () => void;
  onOpenComponents: () => void;
  onOpenLive: () => void;
}

export function createCmsSiteExtraSections(
  config: CmsSiteExtraSectionsConfig,
): ContextMenuExtraSection[] {
  const { liveUrl, onNewPage, onOpenSettings, onOpenComponents, onOpenLive } =
    config;

  const items: ContextMenuExtraItem[] = [
    {
      kind: "item",
      id: "new-page",
      label: "New Page",
      icon: Plus,
      onSelect: onNewPage,
    },
    { kind: "separator", id: "site-nav-sep" },
    {
      kind: "item",
      id: "open-components",
      label: "Shared Components",
      icon: Puzzle,
      onSelect: onOpenComponents,
    },
    {
      kind: "item",
      id: "open-settings",
      label: "Site Settings",
      icon: Settings,
      onSelect: onOpenSettings,
    },
    {
      kind: "item",
      id: "open-live",
      label: "Open Live Site",
      icon: ExternalLink,
      disabled: !liveUrl,
      onSelect: onOpenLive,
    },
  ];

  return [
    { id: "cms-site-ops", label: "Site", anchor: "after-compare", items },
  ];
}
