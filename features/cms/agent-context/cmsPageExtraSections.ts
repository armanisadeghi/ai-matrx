import { Save, Upload, XCircle, Globe, Eye, ArrowLeft } from "lucide-react";
import type {
  ContextMenuExtraItem,
  ContextMenuExtraSection,
} from "@/features/context-menu-v3/types";

/**
 * CMS-page-specific menu items injected into the canonical v3 context menu
 * via `extraSections`. The host (`PageEditor`) owns the handlers + state —
 * this stays a pure description, same pattern as
 * `features/notes/agent-context/notesEditorExtraSections.ts`.
 */
export interface CmsPageExtraSectionsConfig {
  /** True while creating a brand-new (unsaved) page — see `/pages/new`. */
  isNew: boolean;
  hasDraft?: boolean;
  isPublished?: boolean;
  liveUrl?: string;
  previewUrl?: string;
  onSaveDraft: () => void;
  onPublish: () => void;
  onDiscardDraft: () => void;
  onOpenLive: () => void;
  onOpenPreview: () => void;
  onBackToPages: () => void;
}

export function createCmsPageExtraSections(
  config: CmsPageExtraSectionsConfig,
): ContextMenuExtraSection[] {
  const {
    isNew,
    hasDraft,
    isPublished,
    liveUrl,
    previewUrl,
    onSaveDraft,
    onPublish,
    onDiscardDraft,
    onOpenLive,
    onOpenPreview,
    onBackToPages,
  } = config;

  const items: ContextMenuExtraItem[] = [
    {
      kind: "item",
      id: "save-draft",
      label: "Save Draft",
      icon: Save,
      disabled: isNew,
      onSelect: onSaveDraft,
    },
    {
      kind: "item",
      id: "publish",
      label: hasDraft ? "Publish" : "Save & Publish",
      icon: Upload,
      disabled: isNew,
      onSelect: onPublish,
    },
  ];

  if (hasDraft) {
    items.push({
      kind: "item",
      id: "discard-draft",
      label: "Discard Draft",
      icon: XCircle,
      destructive: true,
      onSelect: onDiscardDraft,
    });
  }

  items.push(
    { kind: "separator", id: "urls-sep" },
    {
      kind: "item",
      id: "open-live",
      label: "Open Live Page",
      icon: Globe,
      disabled: !isPublished || !liveUrl,
      onSelect: onOpenLive,
    },
    {
      kind: "item",
      id: "open-preview",
      label: "Open Preview",
      icon: Eye,
      disabled: isNew || !previewUrl,
      onSelect: onOpenPreview,
    },
    { kind: "separator", id: "nav-sep" },
    {
      kind: "item",
      id: "back-to-pages",
      label: "Back to Pages",
      icon: ArrowLeft,
      onSelect: onBackToPages,
    },
  );

  return [
    { id: "cms-page-ops", label: "Page", anchor: "after-compare", items },
  ];
}
