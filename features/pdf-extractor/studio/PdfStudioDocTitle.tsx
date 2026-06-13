"use client";

/**
 * PdfStudioDocTitle — the toolbar's document identity region.
 *
 * Replaces the old (title + id + provenance breadcrumb) block with the
 * pattern from the `/files` route:
 *   - the filename, click-to-edit in place (renames the doc, and the
 *     backing cloud file, in one gesture);
 *   - a "…" menu that surfaces EVERYTHING — for cloud-file-backed docs
 *     that's the full files-route action set (share, visibility,
 *     versions, duplicate, delete, RAG actions, PDF surfaces) reused
 *     verbatim; for other docs (external URL / legacy) a lighter menu
 *     (open / copy link / delete-from-studio).
 *   - right-click anywhere on the name opens the same file action set.
 *
 * Cloud-file menus read the row from the files store, so we hydrate it
 * once via `useEnsureCloudFile` — otherwise the menu items that depend on
 * `cld_files` would be hidden.
 */

import React from "react";
import { MoreHorizontal } from "lucide-react";
import { EditableLabel } from "@/components/official/item/EditableLabel";
import { ItemMenu } from "@/components/official/item/ItemMenu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { FileContextMenu } from "@/features/files/components/core/FileContextMenu/FileContextMenu";
import { FileRightClickMenu } from "@/features/files/components/core/FileContextMenu/FileRightClickMenu";
import { useEnsureCloudFile } from "@/features/files/hooks/useEnsureCloudFile";
import { buildPdfDocMenu } from "./pdfDocMenu";
import type { StudioDocSummary } from "./hooks/usePdfStudioDocs";
import type { PdfDocument } from "../hooks/usePdfExtractor";

const MORE_BTN =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

export interface PdfStudioDocTitleProps {
  doc: PdfDocument;
  /** Commit a new name (renames the doc + backing cloud file). */
  onRename: (newName: string) => void | Promise<void>;
  /** Archive (soft-delete) the doc from the studio. */
  onDeleteDoc: (id: string) => Promise<void>;
}

export function PdfStudioDocTitle({
  doc,
  onRename,
  onDeleteDoc,
}: PdfStudioDocTitleProps) {
  const isCloudFile = doc.sourceKind === "cld_file" && !!doc.sourceId;
  useEnsureCloudFile(isCloudFile ? doc.sourceId : null);

  const label = (
    <EditableLabel
      value={doc.name}
      onCommit={onRename}
      activation="click"
      ariaLabel="Document name"
      maxLength={200}
      displayClassName="text-sm font-semibold text-foreground"
      inputClassName="text-sm font-semibold"
    />
  );

  if (isCloudFile && doc.sourceId) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <FileRightClickMenu fileId={doc.sourceId}>
          <div className="min-w-0 flex-1">{label}</div>
        </FileRightClickMenu>
        <Tooltip>
          <FileContextMenu fileId={doc.sourceId}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Document actions"
                className={MORE_BTN}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </TooltipTrigger>
          </FileContextMenu>
          <TooltipContent side="bottom" sideOffset={6}>
            Actions — share, versions, delete…
          </TooltipContent>
        </Tooltip>
      </div>
    );
  }

  // Non-cloud docs (external URL / legacy) — lighter studio menu.
  const summary: StudioDocSummary = { ...doc, sourceMissing: false };
  const menu = buildPdfDocMenu({ doc: summary, onDelete: onDeleteDoc });

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <div className="min-w-0 flex-1">{label}</div>
      <Tooltip>
        <ItemMenu config={menu} align="start">
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Document actions"
              className={MORE_BTN}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </TooltipTrigger>
        </ItemMenu>
        <TooltipContent side="bottom" sideOffset={6}>
          Actions
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
