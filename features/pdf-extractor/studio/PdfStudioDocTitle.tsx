"use client";

/**
 * PdfStudioDocTitle — the toolbar's document identity region.
 *
 * Cloud-file-backed docs render the canonical `PdfNamedSurfaceSwitcher`:
 * ONE glass pill with the PDF icon (doc-switcher dropdown over the studio's
 * document list), the click-to-edit filename (renames the doc + backing
 * cloud file in one gesture), the PDF-everywhere switcher, the full /files
 * `···` + right-click menus, and live find-in-document search (drives the
 * same `findQuery` highlight the Cmd+F bar uses).
 *
 * Non-cloud docs (external URL / legacy) keep the lighter arrangement:
 * editable name + switcher + `buildPdfDocMenu` (open / copy link /
 * delete-from-studio).
 */

import React from "react";
import { EditableLabel } from "@/components/official/item/EditableLabel";
import { ItemMenu } from "@/components/official/item/ItemMenu";
import { MoreHorizontalTapButton } from "@/components/icons/tap-buttons";
import { TapTargetButtonGroup } from "@/components/icons/TapTargetButton";
import { PdfNamedSurfaceSwitcher } from "@/features/pdf/components/PdfNamedSurfaceSwitcher";
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
  /** Studio document list — powers the PDF-icon doc-switcher dropdown. */
  docs?: StudioDocSummary[];
  /** Open another studio document (sidebar-select semantics). */
  onSelectDoc?: (summary: StudioDocSummary) => void;
  /** Live find-in-document — drives the same `findQuery` highlight the
   *  Cmd+F find bar uses (raw + cleaned panes). */
  onFindQueryChange?: (query: string) => void;
  /** Enter in the pill's search — runs the RAG in-document search (ranked
   *  segment hits land in the Segments pane). */
  onFindSubmit?: (query: string) => void;
}

export function PdfStudioDocTitle({
  doc,
  onRename,
  onDeleteDoc,
  docs,
  onSelectDoc,
  onFindQueryChange,
  onFindSubmit,
}: PdfStudioDocTitleProps) {
  const isCloudFile = doc.sourceKind === "cld_file" && !!doc.sourceId;

  if (isCloudFile && doc.sourceId) {
    return (
      <PdfNamedSurfaceSwitcher
        current="extractor-studio"
        fileId={doc.sourceId}
        processedDocumentId={doc.id}
        fileName={doc.name}
        onRename={onRename}
        onDeleted={() => void onDeleteDoc(doc.id)}
        onSearchChange={onFindQueryChange}
        onSearchSubmit={onFindSubmit}
        searchPlaceholder="Find in document"
        documents={
          docs && onSelectDoc
            ? docs.map((d) => ({ id: d.id, name: d.name }))
            : undefined
        }
        activeDocumentId={doc.id}
        onSelectDocument={
          docs && onSelectDoc
            ? (id) => {
                const summary = docs.find((d) => d.id === id);
                if (summary) onSelectDoc(summary);
              }
            : undefined
        }
        nameMaxWidthClassName="max-w-56"
      />
    );
  }

  // Non-cloud docs (external URL / legacy) — lighter studio menu.
  const summary: StudioDocSummary = { ...doc, sourceMissing: false };
  const menu = buildPdfDocMenu({ doc: summary, onDelete: onDeleteDoc });

  return (
    <div className="inline-flex min-w-0 max-w-full items-center gap-0">
      <div className="min-w-0">
        <EditableLabel
          value={doc.name}
          onCommit={onRename}
          activation="click"
          ariaLabel="Document name"
          maxLength={200}
          displayClassName="text-sm font-semibold text-foreground"
          inputClassName="text-sm font-semibold"
        />
      </div>
      <TapTargetButtonGroup>
        <PdfSurfaceSwitcher
          current="extractor-studio"
          fileId={null}
          processedDocumentId={doc.id}
          triggerVariant="group"
        />
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
