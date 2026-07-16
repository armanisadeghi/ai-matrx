"use client";

/**
 * ProcessedDocumentTitle — the drawer title bar for an attached PDF/document.
 *
 * Replaces the default icon + plain-name title with the canonical
 * `PdfNamedSurfaceSwitcher` pill: PDF icon (doc-switcher over the OTHER
 * attached documents when there are several), click-to-rename filename
 * (renames the backing cloud file via the real files thunk), the
 * PDF-everywhere surface links, the full /files `···` + right-click menus
 * (incl. Knowledge assets / Knowledge search), and find-in-document search —
 * Enter hands the query to the body (`LibraryPreviewPage`), which runs the
 * same lexical search its own bar used to.
 */

import { toast } from "sonner";
import { useAppDispatch } from "@/lib/redux/hooks";
import { renameFile } from "@/features/files/redux/thunks";
import { useAttachedDocumentDisplayName } from "@/features/agents/components/inputs/resources/attached-documents";
import { PdfNamedSurfaceSwitcher } from "@/features/pdf/components/PdfNamedSurfaceSwitcher";
import type { ContextItemTitleProps } from "../types";

export function ProcessedDocumentTitle({
  item,
  title,
  items,
  onSelectItem,
  onSearchSubmit,
}: ContextItemTitleProps) {
  const dispatch = useAppDispatch();
  const fileId = item.refs.fileId ?? null;
  const processedDocumentId =
    item.refs.processedDocumentId ?? item.refs.documentIds?.[0] ?? null;
  // Store-backed display name (falls back to the drawer-resolved title).
  const displayName = useAttachedDocumentDisplayName(fileId, title);

  // Sibling attached documents — the PDF icon becomes a switcher when the
  // turn has more than one.
  const siblings = items.filter((i) => i.blockType === "processed_document");
  const hasSiblings = siblings.length > 1;

  const handleRename = fileId
    ? async (next: string) => {
        try {
          await dispatch(renameFile({ fileId, newName: next })).unwrap();
        } catch (err) {
          toast.error(
            err instanceof Error
              ? `Rename failed: ${err.message}`
              : "Rename failed",
          );
        }
      }
    : undefined;

  return (
    <PdfNamedSurfaceSwitcher
      fileId={fileId}
      processedDocumentId={processedDocumentId}
      fileName={displayName}
      onRename={handleRename}
      onSearchSubmit={onSearchSubmit}
      searchPlaceholder="Find in document"
      documents={
        hasSiblings
          ? siblings.map((i) => ({ id: i.id, name: i.title }))
          : undefined
      }
      activeDocumentId={item.id}
      onSelectDocument={hasSiblings ? onSelectItem : undefined}
      nameMaxWidthClassName="max-w-48"
    />
  );
}
