"use client";

import { CompoundReferenceCopyButton } from "@/features/matrx-envelope/components/CompoundReferenceCopyButton";
import { buildDocumentPageReferenceFence } from "@/features/matrx-envelope/compoundReference";

/**
 * Copies a `document_page` reference. V1 uses page 1 until Univer exposes
 * active-page tracking in the toolbar (see AIDREAM_REFERENCE_IMPLEMENTATION.md).
 */
export function DocumentPageReferenceCopyButton({
  documentId,
  documentName,
  pageIndex = 1,
}: {
  documentId: string;
  documentName?: string;
  pageIndex?: number;
}) {
  return (
    <CompoundReferenceCopyButton
      size="sm"
      title={`Copy reference for page ${pageIndex}`}
      toastLabel={
        documentName
          ? `${documentName} (page ${pageIndex})`
          : `Document page ${pageIndex}`
      }
      buildFence={() =>
        buildDocumentPageReferenceFence({
          documentId,
          pageIndex,
          documentName,
        })
      }
    />
  );
}
