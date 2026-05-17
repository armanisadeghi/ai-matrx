/**
 * features/files/components/core/FilePreview/preview-actions.ts
 *
 * Per-file-type action registry. Given a file, returns the list of buttons
 * the shared <PreviewerActionBar> should render. Action handlers come from
 * `useFileActions` (download, copyShareUrl, etc.) plus a few preview-only
 * helpers passed in by the host.
 */

"use client";

import {
  Copy,
  Download,
  Edit3,
  ExternalLink,
  Maximize2,
  Trash2,
} from "lucide-react";
import type { CloudFileRecord } from "@/features/files/types";
import type { PreviewKind } from "@/features/files/utils/preview-capabilities";
import type { PreviewerAction } from "./PreviewerActionBar/PreviewerActionBar";

export interface BuildPreviewActionsArgs {
  file: CloudFileRecord;
  previewKind: PreviewKind;
  /** Triggers `useFileActions.download`. */
  onDownload: () => void | Promise<void>;
  /** Copies the signed share URL to clipboard. */
  onCopyLink: () => void | Promise<void>;
  /** Routes / opens the canonical full-screen preview. */
  onOpenFullView: () => void | Promise<void>;
  /** Triggers the rename dialog. */
  onRename: () => void;
  /** Triggers the soft-delete confirm flow. */
  onDelete: () => void;
  /** Triggers the in-place editor handoff (Code / Markdown / Text only). */
  onEdit?: () => void | Promise<void>;
  /** Optional handoff to a feature-owned editor route. Comes from the
   *  virtual-source adapter's `openInRoute(node)`. Surfaces as a primary
   *  "Open in <feature>" button when provided. */
  openInRoute?: { label: string; onClick: () => void };
}

// SVG and HTML are editable too — both are markup under the hood. Including
// them surfaces the Edit handoff in the action bar so the user can jump
// straight into the inline Monaco editor instead of having to download +
// re-upload. HTML's previewKind: "html" gets a Rendered/Source toggle in
// the previewer; the Edit tab is where the source is actually mutated.
const EDITABLE_KINDS: ReadonlyArray<PreviewKind> = [
  "code",
  "markdown",
  "text",
  "svg",
  "html",
];

export function buildPreviewActions(
  args: BuildPreviewActionsArgs,
): PreviewerAction[] {
  const {
    file,
    previewKind,
    onDownload,
    onCopyLink,
    onOpenFullView,
    onRename,
    onDelete,
    onEdit,
    openInRoute,
  } = args;

  const isVirtual = file.source.kind === "virtual";

  const actions: PreviewerAction[] = [];

  if (openInRoute) {
    actions.push({
      id: "open-in-route",
      label: openInRoute.label,
      icon: ExternalLink,
      onClick: openInRoute.onClick,
      primary: true,
    });
  }

  // The Edit button opens the generic CloudFileEditor which fetches bytes
  // through the Python `/files/{id}/download` endpoint. Virtual files don't
  // have real S3-backed bytes, so that download 404s. The inline preview IS
  // the editor for virtual files, so we hide the Edit button entirely.
  if (!isVirtual && EDITABLE_KINDS.includes(previewKind)) {
    actions.push({
      id: "edit",
      label: "Edit",
      icon: Edit3,
      onClick: () => onEdit?.(),
      primary: true,
      disabled: !onEdit,
      disabledHint: !onEdit ? "Edit handoff not wired yet" : undefined,
    });
  }

  // Download + Copy link both go through the Python `/files/{id}/url`
  // signed-URL endpoint, which only works for real cloud-files. Virtual
  // files surface those operations through their adapter (or via the "Open
  // in <feature>" route) — hiding them here avoids broken click states.
  if (!isVirtual) {
    actions.push(
      {
        id: "download",
        label: "Download",
        icon: Download,
        onClick: onDownload,
        primary: true,
      },
      {
        id: "copy-link",
        label: "Copy link",
        icon: Copy,
        onClick: onCopyLink,
        primary: true,
      },
      {
        id: "open-full",
        label: "Open full view",
        icon: Maximize2,
        onClick: onOpenFullView,
        primary: false,
      },
    );
  }
  actions.push(
    {
      id: "rename",
      label: "Rename",
      icon: Edit3,
      onClick: onRename,
      primary: false,
    },
    {
      id: "delete",
      label: "Delete",
      icon: Trash2,
      onClick: onDelete,
      primary: false,
    },
  );

  return actions;
}
