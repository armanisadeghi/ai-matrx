import { Plus, FileCode } from "lucide-react";
import type {
  ContextMenuExtraItem,
  ContextMenuExtraSection,
} from "@/features/context-menu-v3/types";

/**
 * Hub-specific menu items injected into the canonical v3 context menu via
 * `extraSections`. The host (`/cms` route) owns the navigation — this stays
 * a pure description, same pattern as `cmsSiteExtraSections.ts`.
 */
export interface CmsHubExtraSectionsConfig {
  onNewSite: () => void;
  onOpenPublishedPages: () => void;
}

export function createCmsHubExtraSections(
  config: CmsHubExtraSectionsConfig,
): ContextMenuExtraSection[] {
  const { onNewSite, onOpenPublishedPages } = config;

  const items: ContextMenuExtraItem[] = [
    {
      kind: "item",
      id: "new-site",
      label: "New Site",
      icon: Plus,
      onSelect: onNewSite,
    },
    {
      kind: "item",
      id: "open-published-pages",
      label: "Published Pages",
      icon: FileCode,
      onSelect: onOpenPublishedPages,
    },
  ];

  return [{ id: "cms-hub-ops", label: "CMS", anchor: "after-compare", items }];
}
