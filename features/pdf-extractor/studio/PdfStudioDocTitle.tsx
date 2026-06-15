"use client";

/**
 * PdfStudioDocTitle — the toolbar's document identity region.
 *
 * Replaces the old (title + id + provenance breadcrumb) block with the
 * pattern from the `/files` route:
 *   - the filename, click-to-edit in place (renames the doc, and the
 *     backing cloud file, in one gesture);
 *   - a tap-target group with the PDF-everywhere switcher + "…" menu —
 *     for cloud-file-backed docs that's the full files-route action set
 *     (share, visibility, versions, duplicate, delete, RAG actions, PDF
 *     surfaces) reused verbatim; for other docs (external URL / legacy) a
 *     lighter menu (open / copy link / delete-from-studio).
 *   - right-click anywhere on the name opens the same file action set.
 *
 * Cloud-file menus read the row from the files store, so we hydrate it
 * once via `useEnsureCloudFile` — otherwise the menu items that depend on
 * `cld_files` would be hidden.
 */

import React from "react";
import { EditableLabel } from "@/components/official/item/EditableLabel";
import { ItemMenu } from "@/components/official/item/ItemMenu";
import { MoreHorizontalTapButton } from "@/components/icons/tap-buttons";
import { TapTargetButtonGroup } from "@/components/icons/TapTargetButton";
import { FileContextMenu } from "@/features/files/components/core/FileContextMenu/FileContextMenu";
import { FileRightClickMenu } from "@/features/files/components/core/FileContextMenu/FileRightClickMenu";
import { useEnsureCloudFile } from "@/features/files/hooks/useEnsureCloudFile";
import { PdfSurfaceSwitcher } from "@/features/pdf/components/PdfSurfaceSwitcher";
import { buildPdfDocMenu } from "./pdfDocMenu";
import type { StudioDocSummary } from "./hooks/usePdfStudioDocs";
import type { PdfDocument } from "../hooks/usePdfExtractor";

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

  const surfaceSwitcher = (
    <PdfSurfaceSwitcher
      current="extractor-studio"
      fileId={doc.sourceKind === "cld_file" ? doc.sourceId : null}
      processedDocumentId={doc.id}
      triggerVariant="group"
    />
  );

  if (isCloudFile && doc.sourceId) {
    return (
      <div className="inline-flex min-w-0 max-w-full items-center gap-0">
        <FileRightClickMenu
          fileId={doc.sourceId}
          onDeleted={() => onDeleteDoc(doc.id)}
        >
          <div className="min-w-0">{label}</div>
        </FileRightClickMenu>
        <TapTargetButtonGroup>
          {surfaceSwitcher}
          <FileContextMenu
            fileId={doc.sourceId}
            onDeleted={() => onDeleteDoc(doc.id)}
          >
            <MoreHorizontalTapButton
              variant="group"
              ariaLabel="Document actions"
            />
          </FileContextMenu>
        </TapTargetButtonGroup>
      </div>
    );
  }

  // Non-cloud docs (external URL / legacy) — lighter studio menu.
  const summary: StudioDocSummary = { ...doc, sourceMissing: false };
  const menu = buildPdfDocMenu({ doc: summary, onDelete: onDeleteDoc });

  return (
    <div className="inline-flex min-w-0 max-w-full items-center gap-0">
      <div className="min-w-0">{label}</div>
      <TapTargetButtonGroup>
        {surfaceSwitcher}
        <ItemMenu config={menu} align="start">
          <MoreHorizontalTapButton
            variant="group"
            ariaLabel="Document actions"
          />
        </ItemMenu>
      </TapTargetButtonGroup>
    </div>
  );
}
