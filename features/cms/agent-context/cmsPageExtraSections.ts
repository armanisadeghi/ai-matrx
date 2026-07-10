import {
  Save,
  Upload,
  XCircle,
  Globe,
  Eye,
  ArrowLeft,
  RotateCcw,
} from "lucide-react";
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
  /**
   * Restore the most recent non-current version. Drives the same
   * `ConfirmDialog` + rollback path as the Versions tab (never a browser
   * dialog). Rendered only when `canRollback` is true.
   */
  onRollback?: () => void;
  /** False when no restorable version exists yet or the page is unsaved. */
  canRollback?: boolean;
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
    onRollback,
    canRollback,
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

  if (onRollback) {
    items.push({
      kind: "item",
      id: "rollback",
      label: "Restore Previous Version",
      icon: RotateCcw,
      destructive: true,
      disabled: !canRollback,
      onSelect: onRollback,
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
